import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok, paginationMeta } from '../../shared/response.js';
import * as service from './simulados.service.js';

export const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.list(req.user.id, { page, limit, status: req.query.status });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const create = asyncHandler(async (req, res) => {
  const simulado = await service.create(req.user.id, req.body);
  return created(res, simulado, {
    message: `Simulado criado com ${simulado.questionCount} questões. Bom prova!`,
  });
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getById(req.user.id, req.params.id));
});

export const answer = asyncHandler(async (req, res) => {
  const result = await service.answerQuestion(req.user.id, req.params.id, req.body);
  return ok(res, result);
});

export const finish = asyncHandler(async (req, res) => {
  const simulado = await service.finish(req.user.id, req.params.id);
  return ok(res, simulado, { message: 'Prova corrigida. Veja seu desempenho abaixo.' });
});

export const abandon = asyncHandler(async (req, res) => {
  return ok(res, await service.abandon(req.user.id, req.params.id), { message: 'Simulado abandonado.' });
});

export const remove = asyncHandler(async (req, res) => {
  return ok(res, await service.remove(req.user.id, req.params.id), { message: 'Simulado excluído.' });
});

export const stats = asyncHandler(async (req, res) => {
  return ok(res, await service.stats(req.user.id));
});
