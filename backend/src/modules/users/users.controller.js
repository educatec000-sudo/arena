import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok, paginationMeta } from '../../shared/response.js';
import { prisma } from '../../database/prisma.js';
import * as service from './users.service.js';
import { audit } from '../../shared/audit.js';

export const me = asyncHandler(async (req, res) => {
  return ok(res, await service.getProfileSummary(req.user.id));
});

export const findById = asyncHandler(async (req, res) => {
  return ok(res, await service.findById(req.params.id));
});

export const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.list({ ...req.query, page, limit });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const updateSelf = asyncHandler(async (req, res) => {
  return ok(res, await service.updateSelf(req.user.id, req.body), { message: 'Perfil atualizado.' });
});

export const create = asyncHandler(async (req, res) => {
  const user = await service.createUser(req.user.id, req.body);
  await audit({
    actorId: req.user.id,
    action: 'user.created',
    entity: 'user',
    entityId: user.id,
    targetId: user.id,
    metadata: { role: user.role },
    req,
  });
  return created(res, user, { message: 'Usuário criado.' });
});

export const softDelete = asyncHandler(async (req, res) => {
  const result = await service.softDelete(req.params.id);
  await audit({
    actorId: req.user.id,
    action: 'user.deleted',
    entity: 'user',
    entityId: req.params.id,
    targetId: req.params.id,
    req,
  });
  return ok(res, result, { message: 'Usuário removido.' });
});

/** Exportação dos dados do usuário (LGPD). */
export const exportData = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [user, progress, answers, favorites, errors, simulados, sessions, conversations] =
    await Promise.all([
      service.findById(userId),
      prisma.userProgress.findMany({ where: { userId } }),
      prisma.answer.findMany({ where: { userId }, take: 5000, orderBy: { createdAt: 'desc' } }),
      prisma.favorite.findMany({ where: { userId } }),
      prisma.errorNotebookItem.findMany({ where: { userId } }),
      prisma.simulado.findMany({ where: { userId } }),
      prisma.studySession.findMany({ where: { userId } }),
      prisma.aiConversation.findMany({ where: { userId }, include: { messages: true } }),
    ]);

  return ok(res, {
    exportedAt: new Date().toISOString(),
    user,
    totals: {
      progress: progress.length,
      answers: answers.length,
      favorites: favorites.length,
      errors: errors.length,
      simulados: simulados.length,
      sessions: sessions.length,
      conversations: conversations.length,
    },
    data: { progress, answers, favorites, errors, simulados, sessions, conversations },
  });
});
