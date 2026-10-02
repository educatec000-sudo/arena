import { asyncHandler } from '../../shared/asyncHandler.js';
import { ok } from '../../shared/response.js';
import * as service from './gamification.service.js';

/**
 * Gamificação e ranking.
 * Os controllers só traduzem HTTP: toda a regra está no service.
 */
export const me = asyncHandler(async (req, res) => {
  return ok(res, await service.getGamification(req.user.id));
});

export const ranking = asyncHandler(async (req, res) => {
  const period = ['7d', '30d', 'all'].includes(req.query.period) ? req.query.period : '30d';
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  return ok(res, await service.getRanking({ period, limit }));
});
