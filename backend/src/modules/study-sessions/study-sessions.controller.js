import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok, paginationMeta } from '../../shared/response.js';
import * as service from './study-sessions.service.js';

export const start = asyncHandler(async (req, res) => {
  return created(res, await service.start(req.user.id, req.body));
});

export const finish = asyncHandler(async (req, res) => {
  const session = await service.finish(req.user.id, req.params.id, req.body);
  return ok(res, session, { message: 'Sessão finalizada. Progresso registrado.' });
});

export const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.list(req.user.id, { page, limit });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getById(req.user.id, req.params.id));
});

export const remove = asyncHandler(async (req, res) => {
  return ok(res, await service.remove(req.user.id, req.params.id), { message: 'Sessão excluída.' });
});
