import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { buildSearch, parsePagination } from '../../shared/pagination.js';
import { toDto } from './questions.repository.js';

/**
 * Domínio de questões.
 *
 * Regra importante de segurança: por padrão a alternativa correta e o
 * comentário NÃO saem da API para o aluno (isso permitiria "ver o gabarito"
 * pelo network). Eles só são enviados quando `includeSolution=true`,
 * usado depois de responder ou por quem tem permissão de edição.
 */

const OPTION_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Converte sigla (LP) ou uuid em subjectId. */
async function resolveSubjectId({ subjectId, subject }) {
  if (subjectId) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(subjectId);
    if (isUuid) return subjectId;
    const found = await prisma.subject.findUnique({ where: { code: subjectId.toUpperCase() } });
    if (!found) throw ApiError.badRequest(`Matéria desconhecida: ${subjectId}`);
    return found.id;
  }
  if (subject) {
    const found = await prisma.subject.findUnique({ where: { code: subject.toUpperCase() } });
    if (!found) throw ApiError.badRequest(`Matéria desconhecida: ${subject}`);
    return found.id;
  }
  return undefined;
}

function buildWhere({ userId, query }) {
  const where = { status: 'PUBLISHED' };
  if (query.subjectIdResolved) where.subjectId = query.subjectIdResolved;
  if (query.topicId) where.topicId = query.topicId;
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.origin) where.origin = query.origin;
  if (query.originNot && !query.origin) where.origin = { not: query.originNot };
  if (query.year) where.year = query.year;

  const search = buildSearch(query.search, ['prompt', 'explanation', 'legalBasis']);
  if (search) Object.assign(where, search);
  if (query.tag) where.tags = { some: { tag: { name: { equals: query.tag } } } };

  // Modos de estudo dependem do progresso do usuário.
  if (query.mode === 'novas') where.progress = { none: { userId } };
  if (query.mode === 'erradas') {
    where.errorItems = { some: { userId, resolvedAt: null } };
  }
  if (query.mode === 'pendentes') {
    where.progress = { some: { userId, nextReviewAt: { lte: new Date() } } };
  }
  if (query.mode === 'favoritas') where.favorites = { some: { userId } };

  return where;
}

// `toDto` vive em questions.repository.js para que outros domínios
// (favoritos, caderno de erros, simulados) serializem questões igual.
export { toDto };

// ------------------------------------------------------------------ leitura --

export async function list(userId, query) {
  const { page, limit, skip } = parsePagination(query, { limit: 20, maxLimit: 100 });
  const subjectIdResolved = await resolveSubjectId(query);
  const where = buildWhere({ userId, query: { ...query, subjectIdResolved } });

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: 'asc' },
      include: {
        options: { orderBy: { order: 'asc' } },
        subject: { select: { id: true, code: true, name: true, color: true } },
        topic: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        favorites: userId ? { where: { userId }, select: { id: true } } : false,
        errorItems: userId ? { where: { userId, resolvedAt: null }, select: { id: true } } : false,
      },
    }),
  ]);

  const includeSolution = Boolean(query.includeSolution);
  return {
    rows: rows.map((q) => ({
      ...toDto(q, { includeSolution }),
      ...(userId
        ? { isFavorite: (q.favorites || []).length > 0, inErrorNotebook: (q.errorItems || []).length > 0 }
        : {}),
    })),
    total,
    page,
    limit,
  };
}

/**
 * Sorteia questões para uma sessão de treino.
 * Usa `ORDER BY random()` limitado — simples e suficiente para bancos
 * deste porte (a versão com TABLESAMPLE fica para quando passar de 100k).
 */
export async function pickRandom(userId, { count, subjectIds, topicIds, difficulty, excludeIds = [] }) {
  const where = { status: 'PUBLISHED' };
  if (subjectIds?.length) where.subjectId = { in: subjectIds };
  if (topicIds?.length) where.topicId = { in: topicIds };
  if (difficulty) where.difficulty = difficulty;
  if (excludeIds.length) where.id = { notIn: excludeIds };

  const rows = await prisma.question.findMany({
    where,
    take: Math.min(count * 40, 4000),
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  // Embaralha em memória sobre um recorte limitado (evita full scan ordenado).
  const shuffled = rows.sort(() => Math.random() - 0.5).slice(0, count);
  const ids = shuffled.map((r) => r.id);
  if (!ids.length) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
    },
  });
  return questions.map((q) => toDto(q));
}

export async function findById(id, { includeSolution = false } = {}) {
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
    },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');
  return toDto(question, { includeSolution });
}

/** Espelha o `selecionarQuestoes()` do legado, agora no servidor. */
export async function selectForSession(userId, query) {
  const count = Number(query.limit || 20);
  // Reaproveita os mesmos filtros da listagem (matéria, assunto, busca,
  // origem, modo de estudo) para que a sessão respeite o que a tela mostrou.
  const subjectIdResolved = await resolveSubjectId(query);
  const where = buildWhere({ userId, query: { ...query, subjectIdResolved } });

  const rows = await prisma.question.findMany({
    where,
    take: Math.min(count * 40, 4000),
    select: { id: true },
  });

  const ids = rows.sort(() => Math.random() - 0.5).slice(0, count).map((r) => r.id);
  if (!ids.length) return { questions: [], total: 0 };

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
    },
  });

  return { questions: questions.map((q) => toDto(q)), total: questions.length };
}

// ----------------------------------------------------------------- escrita ---

async function upsertTags(questionId, tags) {
  if (!tags?.length) return;
  const records = await Promise.all(
    [...new Set(tags)].map((name) =>
      prisma.tag.upsert({ where: { name }, create: { name }, update: {} }),
    ),
  );
  await prisma.questionTag.createMany({
    data: records.map((tag) => ({ questionId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

export async function create(userId, payload) {
  const { options, tags, ...data } = payload;

  const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
  if (!subject) throw ApiError.badRequest('Matéria inválida.');
  if (data.topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: data.topicId } });
    if (!topic || topic.subjectId !== data.subjectId) {
      throw ApiError.badRequest('O assunto não pertence a esta matéria.');
    }
  }

  const question = await prisma.question.create({
    data: {
      ...data,
      createdById: userId,
      options: {
        create: options.map((o, index) => ({
          label: o.label,
          text: o.text,
          isCorrect: Boolean(o.isCorrect),
          order: OPTION_ORDER[o.label] ?? index,
        })),
      },
    },
    include: { options: true },
  });

  await upsertTags(question.id, tags);
  return findById(question.id, { includeSolution: true });
}

export async function update(id, payload) {
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Questão não encontrada.');

  const { options, tags, ...data } = payload;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({ where: { id }, data });

    if (options) {
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionOption.createMany({
        data: options.map((o, index) => ({
          questionId: id,
          label: o.label,
          text: o.text,
          isCorrect: Boolean(o.isCorrect),
          order: OPTION_ORDER[o.label] ?? index,
        })),
      });
    }

    if (tags) {
      await tx.questionTag.deleteMany({ where: { questionId: id } });
    }
  });

  if (tags) await upsertTags(id, tags);
  return findById(id, { includeSolution: true });
}

/** Exclusão lógica: preserva simulados e histórico já respondidos. */
export async function remove(id) {
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('Questão não encontrada.');
  await prisma.question.update({ where: { id }, data: { status: 'ARCHIVED' } });
  return { id, archived: true };
}

export async function hardDelete(id) {
  await prisma.question.delete({ where: { id } });
  return { id, deleted: true };
}

/** Contagem por matéria (usada nos selects de filtro do frontend). */
export async function countsBySubject() {
  const rows = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: { _count: { select: { questions: { where: { status: 'PUBLISHED' } } } } },
  });
  return rows.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    color: s.color,
    count: s._count.questions,
  }));
}

/** Contagem global (para o card "banco com N questões" do painel). */
export async function bankStats() {
  const [total, byOrigin] = await Promise.all([
    prisma.question.count({ where: { status: 'PUBLISHED' } }),
    prisma.question.groupBy({
      by: ['origin'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    }),
  ]);
  return {
    total,
    byOrigin: byOrigin.reduce((acc, row) => ({ ...acc, [row.origin]: row._count._all }), {}),
  };
}

export default {
  list,
  pickRandom,
  findById,
  selectForSession,
  create,
  update,
  remove,
  hardDelete,
  countsBySubject,
  bankStats,
  toDto,
};
