import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok } from '../../shared/response.js';
import * as service from './study-tracks.service.js';

/** Trilhas do ponto de vista do aluno (leitura é pública p/ usuários ativos). */
export const list = asyncHandler(async (req, res) => {
  return ok(res, await service.list(req.user?.id ?? null));
});

export const getBySlug = asyncHandler(async (req, res) => {
  return ok(res, await service.getBySlug(req.user?.id ?? null, req.params.slug));
});

/** Marca/desmarca uma etapa como concluída. */
export const toggleItem = asyncHandler(async (req, res) => {
  const result = await service.toggleItem(
    req.user.id,
    req.params.slug,
    req.params.itemId,
    req.body.done,
  );
  return ok(res, result, {
    message: result.done ? 'Etapa concluída! 🎉' : 'Etapa reaberta.',
  });
});

export const resetProgress = asyncHandler(async (req, res) => {
  return ok(res, await service.resetProgress(req.user.id, req.params.slug), {
    message: 'Progresso da trilha zerado.',
  });
});

// ------------------------------------------------------------ ADMIN/EDITOR ---

export const createTrack = asyncHandler(async (req, res) => {
  return created(res, await service.createTrack(req.body), { message: 'Trilha criada.' });
});

export const updateTrack = asyncHandler(async (req, res) => {
  return ok(res, await service.updateTrack(req.params.id, req.body), { message: 'Trilha atualizada.' });
});

export const removeTrack = asyncHandler(async (req, res) => {
  return ok(res, await service.removeTrack(req.params.id), { message: 'Trilha removida.' });
});

export const addItem = asyncHandler(async (req, res) => {
  return created(res, await service.addItem(req.params.id, req.body), { message: 'Etapa criada.' });
});

export const removeItem = asyncHandler(async (req, res) => {
  return ok(res, await service.removeItem(req.params.itemId), { message: 'Etapa removida.' });
});
