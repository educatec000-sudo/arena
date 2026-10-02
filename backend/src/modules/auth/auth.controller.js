import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok } from '../../shared/response.js';
import * as service from './auth.service.js';
import { env } from '../../config/env.js';
import { sha256 } from '../../shared/password.js';

/**
 * Controllers do módulo de autenticação.
 * Responsabilidade única: traduzir HTTP <-> serviço.
 * Nenhuma regra de negócio vive aqui.
 */

export const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.body, req, res);
  return created(res, result, { message: 'Conta criada com sucesso. Bem-vindo(a) à Arena!' });
});

export const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.body, req, res);
  return ok(res, result, { message: `Bem-vindo(a) de volta, ${result.user.name}!` });
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await service.refresh(req, res);
  return ok(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  await service.logout(req, res);
  return ok(res, { loggedOut: true }, { message: 'Sessão encerrada.' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await service.logoutAll(req, res);
  return ok(res, { loggedOut: true }, { message: 'Todas as sessões foram encerradas.' });
});

export const me = asyncHandler(async (req, res) => {
  const user = await service.me(req.user.id);
  return ok(res, user);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await service.updateProfile(req.user.id, req.body);
  return ok(res, user, { message: 'Perfil atualizado.' });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const setting = await service.updateSettings(req.user.id, req.body);
  return ok(res, setting, { message: 'Preferências salvas.' });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await service.requestPasswordReset(req.body.email, req);
  // A resposta é sempre idêntica (evita enumeração de contas). Fora de produção
  // o link também volta no corpo para permitir testar o fluxo sem SMTP.
  return ok(res, result, {
    message: 'Se o e-mail existir, enviaremos um link de redefinição em instantes.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await service.resetPassword(req.body, req);
  return ok(res, { reset: true }, { message: 'Senha redefinida. Faça login com a nova senha.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  await service.changePassword(req.user.id, req.body, req);
  return ok(res, { changed: true }, {
    message: 'Senha alterada. Por segurança, entre novamente.',
  });
});

export const listSessions = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[env.security.refreshCookieName];
  const sessions = await service.listSessions(req.user.id, raw ? await sha256(raw) : null);
  return ok(res, sessions);
});

export const revokeSession = asyncHandler(async (req, res) => {
  await service.revokeSession(req.user.id, req.params.id, req);
  return ok(res, { revoked: true }, { message: 'Sessão encerrada.' });
});
