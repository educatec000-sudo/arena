import { asyncHandler } from '../../shared/asyncHandler.js';
import { ok, paginationMeta } from '../../shared/response.js';
import * as service from './favorites.service.js';

export const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.list(req.user.id, {
    page,
    limit,
    subjectId: req.query.subjectId,
  });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const toggle = asyncHandler(async (req, res) => {
  const result = await service.toggle(req.user.id, req.params.questionId);
  return ok(res, result, {
    message: result.favorited ? 'Adicionada às favoritas ⭐' : 'Removida das favoritas.',
  });
});

export const count = asyncHandler(async (req, res) => {
  return ok(res, { total: await service.count(req.user.id) });
});
