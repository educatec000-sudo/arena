import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok, paginationMeta } from '../../shared/response.js';
import * as service from './questions.service.js';
import { audit } from '../../shared/audit.js';
import { requireRole } from '../../middleware/rbac.js';

/**
 * Controllers de questões.
 * Regras de negócio ficam no service; aqui só adaptamos HTTP.
 */

export const list = asyncHandler(async (req, res) => {
  const { rows, total, page, limit } = await service.list(req.user?.id || null, req.query);
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const findOne = asyncHandler(async (req, res) => {
  const includeSolution =
    req.query.includeSolution === 'true' || ['ADMIN', 'EDITOR'].includes(req.userRole);
  const question = await service.findById(req.params.id, { includeSolution });
  return ok(res, question);
});

export const random = asyncHandler(async (req, res) => {
  const questions = await service.pickRandom(req.user?.id || null, req.body);
  return ok(res, questions, { total: questions.length });
});

/** Monta uma sessão de treino aplicando os filtros/modos do legado. */
export const session = asyncHandler(async (req, res) => {
  const { questions, total } = await service.selectForSession(req.user.id, req.query);
  return ok(res, questions, { total });
});

export const counts = asyncHandler(async (_req, res) => {
  return ok(res, await service.countsBySubject());
});

export const stats = asyncHandler(async (_req, res) => {
  return ok(res, await service.bankStats());
});

// -------------------------------------------------------------- escrita ------

export const create = asyncHandler(async (req, res) => {
  const question = await service.create(req.user.id, req.body);
  await audit({
    actorId: req.user.id,
    action: 'question.created',
    entity: 'question',
    entityId: question.id,
    req,
  });
  return created(res, question, { message: 'Questão cadastrada.' });
});

export const update = asyncHandler(async (req, res) => {
  const question = await service.update(req.params.id, req.body);
  await audit({
    actorId: req.user.id,
    action: 'question.updated',
    entity: 'question',
    entityId: question.id,
    req,
  });
  return ok(res, question, { message: 'Questão atualizada.' });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id);
  await audit({
    actorId: req.user.id,
    action: 'question.archived',
    entity: 'question',
    entityId: req.params.id,
    req,
  });
  return ok(res, result, { message: 'Questão arquivada.' });
});

export const hardDelete = asyncHandler(async (req, res) => {
  const result = await service.hardDelete(req.params.id);
  await audit({
    actorId: req.user.id,
    action: 'question.deleted',
    entity: 'question',
    entityId: req.params.id,
    req,
  });
  return ok(res, result, { message: 'Questão excluída definitivamente.' });
});

export const canEdit = [requireRole('ADMIN', 'EDITOR')];
