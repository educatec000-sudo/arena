import { asyncHandler } from '../../shared/asyncHandler.js';
import { ok, paginationMeta } from '../../shared/response.js';
import * as service from './error-notebook.service.js';
import * as simuladosService from '../simulados/simulados.service.js';

export const list = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.list(req.user.id, {
    page,
    limit,
    subjectId: req.query.subjectId,
    onlyPending: req.query.onlyPending !== 'false',
  });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const stats = asyncHandler(async (req, res) => {
  return ok(res, await service.stats(req.user.id));
});

export const add = asyncHandler(async (req, res) => {
  const result = await service.add(req.user.id, req.params.questionId, req.body.note || null);
  return ok(res, result, { message: 'Questão adicionada ao caderno de erros.' });
});

export const updateNote = asyncHandler(async (req, res) => {
  const item = await service.updateNote(req.user.id, req.params.questionId, req.body.note);
  return ok(res, item, { message: 'Anotação salva.' });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.user.id, req.params.questionId);
  return ok(res, result, { message: 'Removida do caderno de erros.' });
});

export const resolve = asyncHandler(async (req, res) => {
  const item = await service.setResolved(req.user.id, req.params.questionId, req.body.resolved !== false);
  return ok(res, item, {
    message: item.resolvedAt ? 'Erro marcado como resolvido ✅' : 'Erro reaberto para revisão.',
  });
});

export const clearResolved = asyncHandler(async (req, res) => {
  return ok(res, await service.clearResolved(req.user.id), { message: 'Resolvidos removidos.' });
});

/**
 * "Gerar simulado com meus erros".
 * Cria o simulado já com status IN_PROGRESS e devolve as questões.
 */
export const generateSimulado = asyncHandler(async (req, res) => {
  const simulado = await simuladosService.createFromErrors(req.user.id, req.body);
  return ok(res, simulado, { message: 'Simulado dos seus erros criado. Bom treino!' });
});
