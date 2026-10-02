import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { questionsRepository } from '../questions/questions.repository.js';

/**
 * Caderno de erros.
 *
 * No legado o "caderno" era um filtro sobre as respostas erradas. Aqui ele é
 * uma entidade própria, para que o aluno possa anotar, resolver e refazer
 * sem que uma nova resposta apague o histórico.
 */

export async function list(userId, { page = 1, limit = 20, subjectId, onlyPending = true } = {}) {
  const where = {
    userId,
    ...(subjectId ? { subjectId } : {}),
    ...(onlyPending ? { resolvedAt: null } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.errorNotebookItem.count({ where }),
    prisma.errorNotebookItem.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ lastErrorAt: 'desc' }, { createdAt: 'desc' }],
      include: { question: { include: { options: { orderBy: { order: 'asc' } } } } },
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      ...questionsRepository.toDto(row.question, { includeSolution: true }),
      notebook: {
        id: row.id,
        note: row.note,
        errorCount: row.errorCount,
        reviewCount: row.reviewCount,
        lastErrorAt: row.lastErrorAt,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
      },
    })),
    total,
    page,
    limit,
  };
}

export async function add(userId, questionId, note = null) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, subjectId: true },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');

  const existing = await prisma.errorNotebookItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (existing) {
    const updated = await prisma.errorNotebookItem.update({
      where: { id: existing.id },
      data: {
        resolvedAt: null,
        ...(note !== null ? { note } : {}),
      },
    });
    return { item: updated, created: false };
  }

  const item = await prisma.errorNotebookItem.create({
    data: { userId, questionId, subjectId: question.subjectId, note, errorCount: 1 },
  });
  return { item, created: true };
}

export async function updateNote(userId, questionId, note) {
  const item = await prisma.errorNotebookItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
  if (!item) throw ApiError.notFound('Questão não está no caderno de erros.');
  return prisma.errorNotebookItem.update({ where: { id: item.id }, data: { note } });
}

export async function remove(userId, questionId) {
  const item = await prisma.errorNotebookItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
  if (!item) throw ApiError.notFound('Questão não está no caderno de erros.');
  await prisma.errorNotebookItem.delete({ where: { id: item.id } });
  return { removed: true };
}

/** Marca como resolvida (sai da lista padrão, mas o histórico permanece). */
export async function setResolved(userId, questionId, resolved = true) {
  const item = await prisma.errorNotebookItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
  if (!item) throw ApiError.notFound('Questão não está no caderno de erros.');

  return prisma.errorNotebookItem.update({
    where: { id: item.id },
    data: {
      resolvedAt: resolved ? new Date() : null,
      reviewCount: { increment: resolved ? 1 : 0 },
    },
  });
}

export async function clearResolved(userId) {
  const result = await prisma.errorNotebookItem.deleteMany({
    where: { userId, resolvedAt: { not: null } },
  });
  return { removed: result.count };
}

/** Ids para "gerar simulado com meus erros". */
export async function pickForSimulado(userId, { count = 20, subjectIds } = {}) {
  const items = await prisma.errorNotebookItem.findMany({
    where: {
      userId,
      resolvedAt: null,
      ...(subjectIds?.length ? { subjectId: { in: subjectIds } } : {}),
    },
    orderBy: [{ errorCount: 'desc' }, { lastErrorAt: 'desc' }],
    select: { questionId: true },
    take: count * 3,
  });

  return items
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((i) => i.questionId);
}

export async function stats(userId) {
  const [pending, resolved, bySubject] = await Promise.all([
    prisma.errorNotebookItem.count({ where: { userId, resolvedAt: null } }),
    prisma.errorNotebookItem.count({ where: { userId, resolvedAt: { not: null } } }),
    prisma.errorNotebookItem.groupBy({
      by: ['subjectId'],
      where: { userId, resolvedAt: null },
      _count: { _all: true },
    }),
  ]);

  const subjectIds = bySubject.map((b) => b.subjectId).filter(Boolean);
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, code: true, name: true, color: true },
      })
    : [];
  const map = new Map(subjects.map((s) => [s.id, s]));

  return {
    pending,
    resolved,
    bySubject: bySubject.map((b) => ({
      subject: map.get(b.subjectId) || null,
      total: b._count._all,
    })),
  };
}

export default { list, add, updateNote, remove, setResolved, clearResolved, pickForSimulado, stats };
