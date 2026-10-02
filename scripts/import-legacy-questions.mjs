#!/usr/bin/env node
/**
 * Importa o banco de questões do projeto legado (index.html) para o PostgreSQL.
 *
 * O app antigo embutia tudo em `window.__BANCO__`, `window.__EDITAL__` e
 * `window.__TEORIA__` dentro de um único HTML de ~2 MB. Este script:
 *   1. lê o HTML (ou um JSON já extraído);
 *   2. cria matérias (subjects) e assuntos (topics) conforme o edital;
 *   3. importa as questões e suas alternativas;
 *   4. importa a teoria de bolso.
 *
 * É IDEMPOTENTE: usa o `externalId` da questão e a sigla da matéria como
 * chaves naturais, então pode rodar quantas vezes quiser sem duplicar.
 *
 * Uso:
 *   npm run db:seed:questions
 *   node scripts/import-legacy-questions.mjs --file ../backup-legado/index.html
 *   node scripts/import-legacy-questions.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const prisma = new PrismaClient();

// ------------------------------------------------------------------ CLI ------
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const DRY_RUN = args.includes('--dry-run');
const HTML_FILE = path.resolve(getArg('file', path.join(ROOT, '..', 'backup-legado', 'index.html')));
const BATCH_SIZE = Number(getArg('batch', 200));

// -------------------------------------------------------------- extração ----

/** Lê os três objetos globais do HTML legado sem precisar de navegador. */
function extractLegacyData(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  // Linhas onde ficam os dados embutidos (descobertas na análise do projeto).
  const lines = html.split('\n');
  const targets = ['__EDITAL__', '__BANCO__', '__TEORIA__'];
  const sandbox = { window: {} };

  let found = 0;
  const code = lines
    .filter((line) => {
      const hit = targets.some((t) => line.startsWith(`window.${t} =`));
      if (hit) found += 1;
      return hit;
    })
    .join('\n');

  if (found !== 3) {
    throw new Error(
      `Esperava 3 blocos de dados no HTML e encontrei ${found}. ` +
        'Verifique se o arquivo é o index.html original do Arena Estudos.',
    );
  }

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return {
    edital: sandbox.window.__EDITAL__,
    banco: sandbox.window.__BANCO__ || [],
    teoria: sandbox.window.__TEORIA__ || {},
  };
}

const DIFFICULTY_MAP = {
  facil: 'FACIL',
  media: 'MEDIA',
  média: 'MEDIA',
  dificil: 'DIFICIL',
  difícil: 'DIFICIL',
};

const ORIGIN_MAP = {
  gerada: 'GENERATED',
  importada: 'IMPORTED',
  ia: 'AI',
};

const LEGACY_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];

/** Mesmo algoritmo usado em topics.service.js (slug do assunto). */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ------------------------------------------------------------------ import ---

async function importSubjectsAndTopics(edital) {
  const subjectByCode = new Map();

  for (const [index, materia] of (edital.materias || []).entries()) {
    const code = String(materia.id).toUpperCase();

    const subject = await prisma.subject.upsert({
      where: { code },
      create: {
        code,
        name: materia.nome,
        groupName: materia.grupo || null,
        color: materia.cor || '#4f7dfb',
        order: index,
      },
      update: {
        name: materia.nome,
        groupName: materia.grupo || null,
        color: materia.cor || '#4f7dfb',
        order: index,
      },
    });
    subjectByCode.set(code, subject);

    // Assuntos do edital
    for (const [topicIndex, topicName] of (materia.topicos || []).entries()) {
      const name = String(topicName).trim();
      if (!name) continue;
      const existing = await prisma.topic.findFirst({ where: { subjectId: subject.id, name } });
      if (!existing) {
        await prisma.topic.create({
          data: { subjectId: subject.id, name, slug: slugify(name), order: topicIndex },
        });
      }
    }
  }

  console.log(`   ✓ ${subjectByCode.size} matérias importadas`);
  return subjectByCode;
}

/** Garante que o assunto citado pela questão exista (mesmo fora do edital). */
async function ensureTopic(subjectId, name, cache) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  const key = `${subjectId}::${clean.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  const existing = await prisma.topic.findFirst({ where: { subjectId, name: clean } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const maxOrder = await prisma.topic.aggregate({ where: { subjectId }, _max: { order: true } });
  const created = await prisma.topic.create({
    data: { subjectId, name: clean, slug: slugify(clean), order: (maxOrder._max.order ?? 0) + 1 },
  });
  cache.set(key, created.id);
  return created.id;
}

async function importQuestions(banco, subjectByCode) {
  const topicCache = new Map();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < banco.length; i += BATCH_SIZE) {
    const batch = banco.slice(i, i + BATCH_SIZE);

    for (const q of batch) {
      const code = String(q.materia || '').toUpperCase();
      const subject = subjectByCode.get(code);
      if (!subject) {
        skipped += 1;
        continue;
      }

      const topicId = await ensureTopic(subject.id, q.topico, topicCache);
      const difficulty = DIFFICULTY_MAP[String(q.dif || '').toLowerCase()] || 'MEDIA';
      const origin = ORIGIN_MAP[String(q.origem || '').toLowerCase()] || 'CURATED';

      const options = (q.alternativas || []).filter((text) => String(text || '').trim() !== '');
      if (options.length < 2) {
        skipped += 1;
        continue;
      }

      const correctIndex = Number.isInteger(q.correta)
        ? Math.min(Math.max(q.correta, 0), options.length - 1)
        : 0;

      const payload = {
        subjectId: subject.id,
        topicId,
        prompt: String(q.enunciado || '').trim(),
        difficulty,
        year: Number(q.ano) || null,
        source: q.banca || 'Fundação CETAP',
        legalBasis: q.ref || null,
        explanation: q.comentario || null,
        analysis: q.analise || null,
        origin,
        status: 'PUBLISHED',
      };

      if (DRY_RUN) {
        created += 1;
        continue;
      }

      const existing = q.id
        ? await prisma.question.findUnique({ where: { externalId: String(q.id) } })
        : null;

      if (existing) {
        await prisma.question.update({ where: { id: existing.id }, data: payload });
        await prisma.questionOption.deleteMany({ where: { questionId: existing.id } });
        await prisma.questionOption.createMany({
          data: options.map((text, index) => ({
            questionId: existing.id,
            label: LEGACY_OPTION_LABELS[index] || String(index),
            text: String(text).trim(),
            isCorrect: index === correctIndex,
            order: index,
          })),
        });
        updated += 1;
      } else {
        const createdQuestion = await prisma.question.create({
          data: {
            ...payload,
            externalId: q.id ? String(q.id) : null,
            options: {
              create: options.map((text, index) => ({
                label: LEGACY_OPTION_LABELS[index] || String(index),
                text: String(text).trim(),
                isCorrect: index === correctIndex,
                order: index,
              })),
            },
          },
        });
        created += 1;
        void createdQuestion;
      }
    }

    process.stdout.write(`   · ${Math.min(i + BATCH_SIZE, banco.length)}/${banco.length} questões processadas\r`);
  }

  console.log(`   ✓ questões: ${created} novas, ${updated} atualizadas, ${skipped} ignoradas`);
  return { created, updated, skipped };
}

async function importTheory(teoria, subjectByCode) {
  let count = 0;

  for (const [code, items] of Object.entries(teoria || {})) {
    const subject = subjectByCode.get(String(code).toUpperCase());
    if (!subject) continue;

    for (const [title, content] of Object.entries(items || {})) {
      const cleanTitle = String(title).trim();
      if (!cleanTitle) continue;

      const existing = await prisma.theoryItem.findFirst({
        where: { subjectId: subject.id, title: cleanTitle },
      });

      if (existing) {
        await prisma.theoryItem.update({
          where: { id: existing.id },
          data: { content: String(content) },
        });
      } else {
        // Tenta associar ao assunto de mesmo nome, quando existir.
        const topic = await prisma.topic.findFirst({
          where: { subjectId: subject.id, name: cleanTitle },
        });
        await prisma.theoryItem.create({
          data: {
            subjectId: subject.id,
            topicId: topic?.id || null,
            title: cleanTitle,
            content: String(content),
          },
        });
        count += 1;
      }
    }
  }

  console.log(`   ✓ ${count} conteúdos de teoria importados`);
}

// -------------------------------------------------------------------- main ---

async function main() {
  console.log('📦 Importação do banco legado → PostgreSQL');
  console.log(`   origem: ${HTML_FILE}`);
  if (DRY_RUN) console.log('   modo: DRY-RUN (nada será gravado)\n');

  if (!fs.existsSync(HTML_FILE)) {
    console.error(`\n❌ Arquivo não encontrado: ${HTML_FILE}`);
    console.error('   Dica: node scripts/import-legacy-questions.mjs --file /caminho/para/index.html');
    process.exit(1);
  }

  const { edital, banco, teoria } = extractLegacyData(HTML_FILE);
  console.log(`   encontradas ${banco.length} questões no HTML legado\n`);

  const subjectByCode = new Map();
  const existingSubjects = await prisma.subject.findMany();
  existingSubjects.forEach((s) => subjectByCode.set(s.code, s));

  if (!DRY_RUN) {
    const imported = await importSubjectsAndTopics(edital);
    imported.forEach((value, key) => subjectByCode.set(key, value));
  }

  if (DRY_RUN) {
    console.log(`   [dry-run] ${(edital.materias || []).length} matérias seriam criadas`);
    console.log(`   [dry-run] ${banco.length} questões seriam importadas`);
    return;
  }

  await importQuestions(banco, subjectByCode);
  await importTheory(teoria, subjectByCode);

  const total = await prisma.question.count();
  console.log(`\n✅ Importação concluída. Total de questões no banco: ${total}`);
}

main()
  .catch((err) => {
    console.error('\n❌ Falha na importação:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
