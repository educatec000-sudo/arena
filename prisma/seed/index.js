/**
 * Seed base do Arena Estudos.
 *
 * Cria apenas o que é estrutural: perfis (roles), permissões e o primeiro
 * ADMIN. O conteúdo (matérias, assuntos, questões e teoria) vem do
 * importador do legado: `npm run db:seed:questions`.
 *
 * Rodar: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

const prisma = new PrismaClient();

/**
 * O Prisma Client é gerado a partir do schema. Se alguém atualizar o projeto
 * (git pull) e esquecer de rodar `prisma generate`, os modelos novos simplesmente
 * não existem no client e o erro aparece como um `TypeError` sem sentido lá na
 * frente. Aqui avisamos exatamente o que fazer.
 */
const REQUIRED_MODELS = [
  'achievement',
  'userAchievement',
  'studyTrack',
  'studyTrackItem',
  'studyTrackProgress',
];

function assertClientUpdated() {
  const missing = REQUIRED_MODELS.filter((model) => !prisma[model]);
  if (!missing.length) return;

  console.error(`
❌ O Prisma Client desta máquina está desatualizado.
   Modelos que não existem no client: ${missing.join(', ')}

   Rode, na RAIZ do projeto (onde está o prisma/schema.prisma):

     npx prisma generate
     npm run db:migrate:deploy
     npm run db:seed

   (no Windows/PowerShell os mesmos comandos valem; se o "npx prisma" falhar,
    use: node_modules\.bin\prisma generate)
`);
  process.exit(1);
}

const ROLES = [
  {
    name: 'ADMIN',
    label: 'Administrador',
    description: 'Acesso total: gestão de usuários, conteúdo, estatísticas e logs.',
    isSystem: true,
  },
  {
    name: 'EDITOR',
    label: 'Editor de conteúdo',
    description: 'Cadastra e revisa questões, matérias e assuntos.',
    isSystem: true,
  },
  {
    name: 'ALUNO',
    label: 'Aluno',
    description: 'Estuda, responde questões, faz simulados e usa a IA.',
    isSystem: true,
  },
];

const PERMISSIONS = [
  { key: 'users:read', module: 'users', description: 'Listar usuários' },
  { key: 'users:create', module: 'users', description: 'Criar usuários' },
  { key: 'users:update', module: 'users', description: 'Editar usuários' },
  { key: 'users:delete', module: 'users', description: 'Remover usuários' },
  { key: 'users:block', module: 'users', description: 'Bloquear/desbloquear usuários' },

  { key: 'questions:read', module: 'questions', description: 'Ver questões' },
  { key: 'questions:create', module: 'questions', description: 'Cadastrar questões' },
  { key: 'questions:update', module: 'questions', description: 'Editar questões' },
  { key: 'questions:delete', module: 'questions', description: 'Excluir questões' },

  { key: 'subjects:manage', module: 'subjects', description: 'Gerenciar matérias' },
  { key: 'topics:manage', module: 'topics', description: 'Gerenciar assuntos' },

  { key: 'simulados:read', module: 'simulados', description: 'Ver simulados' },
  { key: 'simulados:create', module: 'simulados', description: 'Criar simulados' },
  { key: 'simulados:delete', module: 'simulados', description: 'Excluir simulados' },

  { key: 'progress:read', module: 'progress', description: 'Ver o próprio progresso' },
  { key: 'progress:read_all', module: 'progress', description: 'Ver progresso de qualquer aluno' },

  { key: 'ai:use', module: 'ai', description: 'Usar o tutor de IA' },
  { key: 'ai:configure', module: 'ai', description: 'Configurar as próprias chaves de IA' },

  { key: 'admin:access', module: 'admin', description: 'Acessar o painel administrativo' },
  { key: 'admin:logs:read', module: 'admin', description: 'Ver trilha de auditoria' },
  { key: 'admin:stats:read', module: 'admin', description: 'Ver estatísticas globais' },
];

const ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS.map((p) => p.key),
  EDITOR: [
    'questions:read',
    'questions:create',
    'questions:update',
    'questions:delete',
    'subjects:manage',
    'topics:manage',
    'simulados:read',
    'simulados:create',
    'simulados:delete',
    'progress:read',
    'ai:use',
    'ai:configure',
  ],
  ALUNO: [
    'questions:read',
    'simulados:read',
    'simulados:create',
    'simulados:delete',
    'progress:read',
    'ai:use',
    'ai:configure',
  ],
};


// ------------------------------------------------------------ conquistas ----
/**
 * Catálogo de conquistas (gamificação).
 * `criteria` é o campo avaliado em runtime pelo serviço de gamificação:
 *  answers | correct | streak | simulados | accuracy | favorites | errorBook | minutes
 */
const ACHIEVEMENTS = [
  { code: 'first-steps', name: 'Primeiros passos', description: 'Responda a sua primeira questão.', icon: '👟', criteria: 'answers', target: 1, xp: 5, order: 1 },
  { code: 'warm-up', name: 'Aquecimento', description: ' Responda 50 questões.', icon: '🔥', criteria: 'answers', target: 50, xp: 15, order: 2 },
  { code: 'century', name: 'Centenário', description: 'Chegue a 100 questões respondidas.', icon: '💯', criteria: 'answers', target: 100, xp: 25, order: 3 },
  { code: 'marathon', name: 'Maratona', description: 'Responda 500 questões.', icon: '🏃', criteria: 'answers', target: 500, xp: 60, order: 4 },
  { code: 'legend', name: 'Lenda da Arena', description: 'Responda 1.500 questões.', icon: '🏆', criteria: 'answers', target: 1500, xp: 150, order: 5 },
  { code: 'sharp', name: 'Certeiro', description: 'Acerte 50 questões.', icon: '🎯', criteria: 'correct', target: 50, xp: 20, order: 6 },
  { code: 'sniper', name: 'Atirador de elite', description: 'Acerte 300 questões.', icon: '🥇', criteria: 'correct', target: 300, xp: 50, order: 7 },
  { code: 'streak-3', name: 'Constante', description: 'Estude 3 dias seguidos.', icon: '📅', criteria: 'streak', target: 3, xp: 15, order: 8 },
  { code: 'streak-7', name: 'Semana inteira', description: 'Estude 7 dias seguidos.', icon: '🗓️', criteria: 'streak', target: 7, xp: 40, order: 9 },
  { code: 'streak-30', name: 'Sem folga', description: 'Estude 30 dias seguidos.', icon: '💪', criteria: 'streak', target: 30, xp: 120, order: 10 },
  { code: 'first-sim', name: 'Hora da prova', description: 'Conclua o seu primeiro simulado.', icon: '⏱️', criteria: 'simulados', target: 1, xp: 20, order: 11 },
  { code: 'sim-master', name: 'Veterano de simulados', description: 'Conclua 10 simulados.', icon: '📝', criteria: 'simulados', target: 10, xp: 60, order: 12 },
  { code: 'sixty-percent', name: 'Acima da média', description: 'Mantenha 60% de aproveitamento (mín. 50 questões).', icon: '📈', criteria: 'accuracy', target: 60, xp: 30, order: 13 },
  { code: 'eighty-percent', name: 'Quase lá', description: 'Alcance 80% de aproveitamento (mín. 100 questões).', icon: '🚀', criteria: 'accuracy', target: 80, xp: 80, order: 14 },
  { code: 'collector', name: 'Colecionador', description: 'Favorite 30 questões.', icon: '⭐', criteria: 'favorites', target: 30, xp: 20, order: 15 },
  { code: 'error-hunter', name: 'Caçador de erros', description: 'Resolva 25 questões do caderno de erros.', icon: '📕', criteria: 'errorBook', target: 25, xp: 45, order: 16 },
  { code: 'focused', name: 'Foco total', description: 'Acumule 10 horas de estudo cronometrado.', icon: '🧠', criteria: 'minutes', target: 600, xp: 50, order: 17 },
];

// ------------------------------------------------------- trilhas de estudo --
/** Trilha sugerida (pode ser editada pelo admin pela área administrativa). */
const STUDY_TRACKS = [
  {
    slug: 'trilha-base-alepa',
    title: 'Trilha base — ALEPA 002/2026',
    description: 'Ordem sugerida para quem está começando agora: primeiro a base, depois o edital específico.',
    level: 'iniciante',
    order: 1,
    items: [
      { title: 'Regimento Interno da ALEPA', description: 'O coração da prova deste cargo. Estude com o Regimento aberto.', goalQuestions: 60, order: 1, subjectCode: 'RL' },
      { title: 'Língua Portuguesa — interpretação', description: 'A matéria com maior peso em número de questões.', goalQuestions: 80, order: 2, subjectCode: 'LP' },
      { title: 'Direito Administrativo', description: 'Princípios, atos administrativos e licitações.', goalQuestions: 70, order: 3, subjectCode: 'DA' },
      { title: 'Direito Constitucional', description: 'Foco em Poder Legislativo e processo legislativo.', goalQuestions: 70, order: 4, subjectCode: 'DC' },
      { title: 'Legislação e Ética no Serviço Público', description: 'Lei 8.112/90 e ética.', goalQuestions: 60, order: 5, subjectCode: 'LE' },
      { title: 'Informática', description: 'Pacote Office, redes e segurança.', goalQuestions: 50, order: 6, subjectCode: 'INFO' },
      { title: 'Simulado final + revisão do caderno de erros', description: 'Feche a semana com um simulado completo.', goalQuestions: 50, order: 7 },
    ],
  },
  {
    slug: 'trilha-reta-final',
    title: 'Reta final (últimos 30 dias)',
    description: 'Revisão pesada: caderno de erros, simulados e teoria de bolso.',
    level: 'avancado',
    order: 2,
    items: [
      { title: 'Zerar o caderno de erros', description: 'Resolva todas as pendências do caderno.', goalQuestions: 40, order: 1 },
      { title: 'Simulados de provas anteriores', description: 'Dois simulados por semana, corrigidos no mesmo dia.', goalQuestions: 60, order: 2 },
      { title: 'Teoria de bolso diária', description: '20 minutos por dia de leitura dos resumos.', goalQuestions: 30, order: 3 },
    ],
  },
];

async function seedAchievements() {
  for (const item of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: item.code },
      create: item,
      update: { ...item },
    });
  }
  console.log(`   ✓ ${ACHIEVEMENTS.length} conquistas`);
}

async function seedStudyTracks() {
  for (const track of STUDY_TRACKS) {
    const { items, ...data } = track;
    const created = await prisma.studyTrack.upsert({
      where: { slug: track.slug },
      create: data,
      update: data,
    });

    for (const item of items) {
      const subject = item.subjectCode
        ? await prisma.subject.findUnique({ where: { code: item.subjectCode } })
        : null;

      const existing = await prisma.studyTrackItem.findFirst({
        where: { trackId: created.id, title: item.title },
      });

      const payload = {
        trackId: created.id,
        title: item.title,
        description: item.description ?? null,
        goalQuestions: item.goalQuestions,
        order: item.order,
        subjectId: subject?.id ?? null,
      };

      if (existing) await prisma.studyTrackItem.update({ where: { id: existing.id }, data: payload });
      else await prisma.studyTrackItem.create({ data: payload });
    }
  }
  console.log(`   ✓ ${STUDY_TRACKS.length} trilhas de estudo`);
}

async function main() {
  assertClientUpdated();

  console.log('🌱 Iniciando seed...');

  // ------------------------------------------------------------- permissões --
  const permissionByKey = new Map();
  for (const permission of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description, module: permission.module },
    });
    permissionByKey.set(record.key, record);
  }
  console.log(`   ✓ ${PERMISSIONS.length} permissões`);

  // ------------------------------------------------------------------ papéis --
  const roleByName = new Map();
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { label: role.label, description: role.description },
    });
    roleByName.set(record.name, record);
  }
  console.log(`   ✓ ${ROLES.length} perfis`);

  // --------------------------------------------------------- papel x permissão
  for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByName.get(roleName);
    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
  console.log('   ✓ vínculos perfil ↔ permissão');

  // --------------------------------------------------------- catálogo de IA --
  const providers = [
    { key: 'huggingface', name: 'Hugging Face', kind: 'openai', defaultModel: 'openai/gpt-oss-120b', isFree: true },
    { key: 'groq', name: 'Groq', kind: 'openai', defaultModel: 'llama-3.3-70b-versatile', isFree: true },
    { key: 'gemini', name: 'Google Gemini', kind: 'gemini', defaultModel: 'gemini-3.8-flash', isFree: true },
    { key: 'openai', name: 'ChatGPT (OpenAI)', kind: 'openai', defaultModel: 'gpt-4o-mini' },
    { key: 'anthropic', name: 'Claude (Anthropic)', kind: 'anthropic', defaultModel: 'claude-3-5-sonnet-latest' },
    { key: 'openrouter', name: 'OpenRouter', kind: 'openai', defaultModel: 'meta-llama/llama-3.3-70b-instruct' },
    { key: 'mistral', name: 'Mistral', kind: 'openai', defaultModel: 'mistral-small-latest' },
    { key: 'deepseek', name: 'DeepSeek', kind: 'openai', defaultModel: 'deepseek-chat' },
    { key: 'xai', name: 'Grok (xAI)', kind: 'openai', defaultModel: 'grok-3-mini' },
    { key: 'ollama', name: 'IA local (Ollama / LM Studio)', kind: 'openai', defaultModel: 'llama3.2' },
    { key: 'custom', name: 'Outra IA (compatível com OpenAI)', kind: 'openai', defaultModel: '' },
  ];

  for (const provider of providers) {
    await prisma.aiProvider.upsert({
      where: { key: provider.key },
      create: provider,
      update: { name: provider.name, defaultModel: provider.defaultModel, isFree: provider.isFree },
    });
  }
  console.log(`   ✓ ${providers.length} provedores de IA`);

  // ---------------------------------------------------------- usuário admin --
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@arenaestudos.local').toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const adminRole = roleByName.get('ADMIN');

  const passwordHash = await bcrypt.hash(adminPassword, Number(process.env.BCRYPT_ROUNDS || 12));

  const existing = await prisma.user.findUnique({ where: { emailNormalized: adminEmail } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { roleId: adminRole.id, isActive: true, blockedAt: null },
    });
    console.log(`   ✓ admin já existia (${adminEmail}) — perfil garantido`);
  } else {
    await prisma.user.create({
      data: {
        name: process.env.SEED_ADMIN_NAME || 'Administrador',
        email: adminEmail,
        emailNormalized: adminEmail,
        passwordHash,
        roleId: adminRole.id,
        setting: {
          create: {
            examDate: new Date('2026-12-13T00:00:00.000Z'),
            dailyGoal: 41,
            totalGoal: 3000,
          },
        },
      },
    });
    console.log(`   ✓ admin criado: ${adminEmail} / ${adminPassword}`);
    console.log('     ⚠️  TROQUE A SENHA DO ADMIN APÓS O PRIMEIRO LOGIN.');
  }

  await seedAchievements();
  await seedStudyTracks();

  console.log('\n✅ Seed concluído.');
}

main()
  .catch((err) => {
    console.error('❌ Erro no seed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
