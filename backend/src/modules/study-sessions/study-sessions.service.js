import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { addStudyMinutes } from '../progress/progress.service.js';

/**
 * Sessões de estudo.
 *
 * Uma sessão agrupa respostas de um treino livre, revisão ou gerador.
 * Serve para o aluno retomar de onde parou e para o sistema medir ritmo.
 */

export async function start(userId, payload) {
  return prisma.studySession.create({
    data: {
      userId,
      title: payload.title || 'Treino',
      kind: payload.kind || 'TRAINING',
      totalQuestions: payload.totalQuestions || 0,
      metadata: payload.metadata ?? undefined,
    },
  });
}

export async function finish(userId, sessionId, { answeredCount, correctCount } = {}) {
  const session = await prisma.studySession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw ApiError.notFound('Sessão não encontrada.');

  const finishedAt = new Date();
  const durationSeconds = Math.round((finishedAt.getTime() - session.startedAt.getTime()) / 1000);

  const counts = await prisma.answer.groupBy({
    by: ['isCorrect'],
    where: { studySessionId: sessionId },
    _count: { _all: true },
  });
  const computedAnswered = counts.reduce((sum, c) => sum + c._count._all, 0);
  const computedCorrect = counts.find((c) => c.isCorrect)?._count._all || 0;

  const updated = await prisma.studySession.update({
    where: { id: sessionId },
    data: {
      finishedAt,
      durationSeconds,
      answeredCount: answeredCount ?? computedAnswered,
      correctCount: correctCount ?? computedCorrect,
    },
  });

  await addStudyMinutes(userId, durationSeconds);
  return updated;
}

export async function list(userId, { page = 1, limit = 20 } = {}) {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.studySession.count({ where }),
    prisma.studySession.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startedAt: 'desc' },
    }),
  ]);
  return { rows, total, page, limit };
}

export async function getById(userId, sessionId) {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    include: {
      answers: {
        orderBy: { createdAt: 'asc' },
        include: {
          question: {
            select: { id: true, prompt: true, subjectId: true, difficulty: true },
          },
        },
      },
    },
  });
  if (!session) throw ApiError.notFound('Sessão não encontrada.');
  return session;
}

export async function remove(userId, sessionId) {
  const session = await prisma.studySession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw ApiError.notFound('Sessão não encontrada.');
  await prisma.studySession.delete({ where: { id: sessionId } });
  return { id: sessionId, deleted: true };
}

export default { start, finish, list, getById, remove };
