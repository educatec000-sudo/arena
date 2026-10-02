import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { questionsRepository } from '../questions/questions.repository.js';

/** Favoritos do aluno (era o S.fav do legado). */

export async function list(userId, { page = 1, limit = 20, subjectId } = {}) {
  const where = { userId, ...(subjectId ? { subjectId } : {}) };
  const [total, rows] = await Promise.all([
    prisma.favorite.count({ where }),
    prisma.favorite.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { question: { include: { options: { orderBy: { order: 'asc' } } } } },
    }),
  ]);

  return {
    rows: rows.map((row) => questionsRepository.toDto(row.question, { includeSolution: true })),
    total,
    page,
    limit,
  };
}

/** Alterna o estado de favorita e devolve o novo estado. */
export async function toggle(userId, questionId) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, subjectId: true },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');

  const existing = await prisma.favorite.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return { favorited: false };
  }

  await prisma.favorite.create({
    data: { userId, questionId, subjectId: question.subjectId },
  });
  return { favorited: true };
}

export async function count(userId) {
  return prisma.favorite.count({ where: { userId } });
}

export default { list, toggle, count };
