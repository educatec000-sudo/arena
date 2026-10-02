import { asyncHandler } from '../../shared/asyncHandler.js';
import { ok } from '../../shared/response.js';
import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import * as service from './progress.service.js';

/**
 * Progresso/estatísticas do aluno autenticado.
 * Nada aqui recebe userId pela URL: sempre vem do token (evita vazar
 * dados de outro usuário por manipulação de rota).
 */

export const answer = asyncHandler(async (req, res) => {
  const question = await prisma.question.findUnique({
    where: { id: req.body.questionId },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');

  let chosenOptionId = req.body.chosenOptionId || null;
  const chosenLabel = req.body.chosenLabel || null;

  if (!chosenOptionId && chosenLabel) {
    chosenOptionId = question.options.find((o) => o.label === chosenLabel)?.id || null;
  }
  if (!chosenOptionId && !chosenLabel) {
    throw ApiError.badRequest('Informe a alternativa escolhida.');
  }

  const correctOption = question.options.find((o) => o.isCorrect);
  const isCorrect = Boolean(correctOption && chosenOptionId === correctOption.id);

  const result = await service.registerAnswer({
    ...req.body,
    userId: req.user.id,
    chosenOptionId,
    chosenLabel,
    isCorrect,
  });

  return ok(
    res,
    {
      ...result,
      correctLabel: correctOption?.label || null,
      explanation: question.explanation,
      analysis: question.analysis,
    },
    { message: isCorrect ? 'Resposta correta!' : 'Você errou — ela foi para o caderno de erros.' },
  );
});

export const addStudyTime = asyncHandler(async (req, res) => {
  await service.addStudyMinutes(req.user.id, req.body.seconds);
  return ok(res, { added: true });
});

export const overview = asyncHandler(async (req, res) => {
  const data = await service.getOverview(req.user.id);
  return ok(res, data);
});

export const evolution = asyncHandler(async (req, res) => {
  const data = await service.getEvolution(req.user.id, req.query.days);
  return ok(res, data);
});

export const bySubject = asyncHandler(async (req, res) => {
  const data = await service.getBySubject(req.user.id);
  return ok(res, data);
});

export const byTopic = asyncHandler(async (req, res) => {
  const data = await service.getByTopic(req.user.id, req.query.subjectId);
  return ok(res, data);
});

export const byDifficulty = asyncHandler(async (req, res) => {
  const data = await service.getByDifficulty(req.user.id);
  return ok(res, data);
});

export const timing = asyncHandler(async (req, res) => {
  const data = await service.getTiming(req.user.id);
  return ok(res, data);
});

export const reviewQueue = asyncHandler(async (req, res) => {
  const ids = await service.getReviewQueue(req.user.id, {
    limit: req.query.limit,
    subjectId: req.query.subjectId,
  });
  return ok(res, { questionIds: ids, total: ids.length });
});

/** Agenda de revisão espaçada: o que revisar hoje, amanhã e nos próximos 7 dias. */
export const reviewSchedule = asyncHandler(async (req, res) => {
  const data = await service.getReviewSchedule(req.user.id, { limit: Number(req.query.limit) || 60 });
  return ok(res, data);
});

export const simuladoHistory = asyncHandler(async (req, res) => {
  const data = await service.getSimuladoHistory(req.user.id, 20);
  return ok(res, data);
});

/** Painel completo em uma chamada (usado na tela de Progresso). */
export const fullReport = asyncHandler(async (req, res) => {
  const [overview, evolution, bySubject, byTopic, byDifficulty, timing] = await Promise.all([
    service.getOverview(req.user.id),
    service.getEvolution(req.user.id, 35),
    service.getBySubject(req.user.id),
    service.getByTopic(req.user.id),
    service.getByDifficulty(req.user.id),
    service.getTiming(req.user.id),
  ]);
  return ok(res, { overview, evolution, bySubject, byTopic, byDifficulty, timing });
});

/** Dashboard do aluno: tudo que a tela inicial precisa, em uma requisição. */
export const dashboard = asyncHandler(async (req, res) => {
  const [
    overview,
    evolution,
    bySubject,
    history,
    pendingReviews,
    errorCount,
    favoriteCount,
    simuladoCount,
  ] = await Promise.all([
    service.getOverview(req.user.id),
    service.getEvolution(req.user.id, 35),
    service.getBySubject(req.user.id),
    service.getSimuladoHistory(req.user.id, 5),
    service.getReviewQueue(req.user.id, { limit: 60 }),
    prisma.errorNotebookItem.count({ where: { userId: req.user.id, resolvedAt: null } }),
    prisma.favorite.count({ where: { userId: req.user.id } }),
    prisma.simulado.count({ where: { userId: req.user.id, status: 'FINISHED' } }),
  ]);

  return ok(res, {
    overview,
    evolution,
    bySubject,
    recentSimulados: history,
    counters: {
      pendingReviews: pendingReviews.length,
      errorNotebook: errorCount,
      favorites: favoriteCount,
      simulados: simuladoCount,
    },
  });
});
