import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok } from '../../shared/response.js';
import * as service from './topics.service.js';
import { audit } from '../../shared/audit.js';

export const list = asyncHandler(async (req, res) => {
  return ok(res, await service.list({ subjectId: req.query.subjectId }));
});

export const findOne = asyncHandler(async (req, res) => {
  return ok(res, await service.findById(req.params.id));
});

/** Teoria de bolso — marcada como lida por usuário. */
export const listTheory = asyncHandler(async (req, res) => {
  return ok(res, await service.listTheory({ subjectId: req.query.subjectId, userId: req.user.id }));
});

export const toggleTheory = asyncHandler(async (req, res) => {
  const done = req.body.done !== false;
  const result = await service.markTheoryRead(req.user.id, req.params.id, done);
  return ok(res, result, { message: done ? 'Conteúdo marcado como visto.' : 'Marca removida.' });
});

export const create = asyncHandler(async (req, res) => {
  const topic = await service.create(req.body);
  await audit({ actorId: req.user.id, action: 'topic.created', entity: 'topic', entityId: topic.id, req });
  return created(res, topic, { message: 'Assunto criado.' });
});

export const update = asyncHandler(async (req, res) => {
  const topic = await service.update(req.params.id, req.body);
  await audit({ actorId: req.user.id, action: 'topic.updated', entity: 'topic', entityId: topic.id, req });
  return ok(res, topic, { message: 'Assunto atualizado.' });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id);
  await audit({ actorId: req.user.id, action: 'topic.archived', entity: 'topic', entityId: req.params.id, req });
  return ok(res, result, { message: 'Assunto arquivado.' });
});

export const createTheory = asyncHandler(async (req, res) => {
  const item = await service.createTheory(req.body);
  await audit({ actorId: req.user.id, action: 'theory.created', entity: 'theoryItem', entityId: item.id, req });
  return created(res, item, { message: 'Conteúdo de teoria criado.' });
});
