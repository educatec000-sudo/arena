import { asyncHandler } from '../../shared/asyncHandler.js';
import { ok, paginationMeta } from '../../shared/response.js';
import * as service from './ai.service.js';
import { listProvidersForClient } from './providers/index.js';

/**
 * Controllers de IA.
 * Nenhuma chave é devolvida ao cliente — só "tem chave configurada: boolean".
 */

export const chat = asyncHandler(async (req, res) => {
  return ok(res, await service.chat(req.user.id, req.body));
});

export const explainQuestion = asyncHandler(async (req, res) => {
  return ok(res, await service.explainQuestion(req.user.id, req.params.questionId, req.body));
});

export const explainError = asyncHandler(async (req, res) => {
  return ok(res, await service.explainError(req.user.id, req.params.questionId, req.body));
});

export const summarize = asyncHandler(async (req, res) => {
  return ok(res, await service.summarizeContent(req.user.id, req.body));
});

export const generateQuestions = asyncHandler(async (req, res) => {
  return ok(res, await service.generateQuestions(req.user.id, req.body), {
    message: 'Questões geradas e adicionadas ao seu banco.',
  });
});

export const generateSimulado = asyncHandler(async (req, res) => {
  return ok(res, await service.generateSimulado(req.user.id, req.body), {
    message: 'Simulado criado com questões geradas por IA.',
  });
});

export const studyHelp = asyncHandler(async (req, res) => {
  return ok(res, await service.studyHelp(req.user.id, req.body));
});

export const suggestReview = asyncHandler(async (req, res) => {
  return ok(res, await service.suggestReview(req.user.id, req.body));
});

// -------------------------------------------------------------- histórico ---

export const listConversations = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const { rows, total } = await service.listConversations(req.user.id, { page, limit });
  return ok(res, rows, paginationMeta({ total, page, limit }));
});

export const getConversation = asyncHandler(async (req, res) => {
  return ok(res, await service.getConversation(req.user.id, req.params.id));
});

export const deleteConversation = asyncHandler(async (req, res) => {
  return ok(res, await service.deleteConversation(req.user.id, req.params.id), {
    message: 'Conversa excluída.',
  });
});

// ----------------------------------------------------------- configuração ---

export const listProviders = asyncHandler(async (_req, res) => {
  return ok(res, listProvidersForClient());
});

export const listCredentials = asyncHandler(async (req, res) => {
  return ok(res, await service.listCredentials(req.user.id));
});

export const saveCredential = asyncHandler(async (req, res) => {
  const result = await service.saveCredential(req.user.id, req.body);
  return ok(res, result, { message: 'Configuração de IA salva.' });
});

export const deleteCredential = asyncHandler(async (req, res) => {
  return ok(res, await service.deleteCredential(req.user.id, req.params.provider), {
    message: 'Chave removida.',
  });
});

export const listModels = asyncHandler(async (req, res) => {
  return ok(res, await service.listModels(req.user.id, req.params.provider));
});

export const testCredential = asyncHandler(async (req, res) => {
  return ok(res, await service.testCredential(req.user.id, req.params.provider));
});
