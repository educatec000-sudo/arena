import { asyncHandler } from '../../shared/asyncHandler.js';
import ApiError from '../../shared/errors.js';
import { ok, paginationMeta } from '../../shared/response.js';
import * as service from './admin.service.js';
import { audit } from '../../shared/audit.js';

/**
 * Controllers administrativos.
 * Toda mutação relevante grava auditoria (quem fez, quando, de onde).
 */

export const dashboard = asyncHandler(async (_req, res) => {
  return ok(res, await service.getDashboard());
});

// ------------------------------------------------------------------ usuários --

export const listUsers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.listUsers({ ...req.query, page, limit });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const getUser = asyncHandler(async (req, res) => {
  return ok(res, await service.getUser(req.params.id));
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await service.updateUser(req.params.id, req.body);
  await audit({
    actorId: req.user.id,
    action: 'admin.user.updated',
    entity: 'user',
    entityId: user.id,
    targetId: user.id,
    metadata: { changes: Object.keys(req.body) },
    req,
  });
  return ok(res, user, { message: 'Usuário atualizado.' });
});

export const blockUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('Você não pode bloquear a sua própria conta.');
  }

  const user = await service.blockUser(req.params.id, req.body.reason || null);
  await audit({
    actorId: req.user.id,
    action: 'admin.user.blocked',
    entity: 'user',
    entityId: user.id,
    targetId: user.id,
    metadata: { reason: req.body.reason || null },
    req,
  });
  return ok(res, user, { message: 'Usuário bloqueado.' });
});

export const unblockUser = asyncHandler(async (req, res) => {
  const user = await service.unblockUser(req.params.id);
  await audit({
    actorId: req.user.id,
    action: 'admin.user.unblocked',
    entity: 'user',
    entityId: user.id,
    targetId: user.id,
    req,
  });
  return ok(res, user, { message: 'Usuário desbloqueado.' });
});

export const changeRole = asyncHandler(async (req, res) => {
  const user = await service.changeRole(req.params.id, req.body.role);
  await audit({
    actorId: req.user.id,
    action: 'admin.user.role_changed',
    entity: 'user',
    entityId: user.id,
    targetId: user.id,
    metadata: { role: req.body.role },
    req,
  });
  return ok(res, user, { message: `Perfil alterado para ${req.body.role}.` });
});

export const deleteUser = asyncHandler(async (req, res) => {
  // Ninguém apaga a própria conta: travaria o próprio acesso à administração.
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('Você não pode remover a sua própria conta.');
  }

  const result = await service.deleteUser(req.params.id);
  await audit({
    actorId: req.user.id,
    action: 'admin.user.deleted',
    entity: 'user',
    entityId: req.params.id,
    targetId: req.params.id,
    req,
  });
  return ok(res, result, { message: 'Usuário removido.' });
});

// --------------------------------------------------------------------- logs --

export const listAuditLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 30), 200);
  const { rows, total } = await service.listAuditLogs({ ...req.query, page, limit });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const listRoles = asyncHandler(async (_req, res) => {
  return ok(res, await service.listRoles());
});

// ----------------------------------------------------------------- conteúdo --

export const contentStats = asyncHandler(async (_req, res) => {
  return ok(res, await service.getContentStats());
});

export const hardestQuestions = asyncHandler(async (req, res) => {
  return ok(res, await service.getHardestQuestions({ limit: Number(req.query.limit || 20) }));
});
