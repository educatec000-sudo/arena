import { prisma } from '../database/prisma.js';
import ApiError from '../shared/errors.js';
import { verifyAccessToken } from '../shared/tokens.js';
import { env } from '../config/env.js';

/** Extrai o Bearer token do header Authorization. */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies?.access_token) return req.cookies.access_token;
  return null;
}

/**
 * Exige autenticação. Carrega o usuário (com papel) uma vez por requisição.
 * Rejeita contas inativas/bloqueadas mesmo com token válido.
 */
export async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('Token de acesso não informado.');

    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') throw ApiError.unauthorized('Token inválido.');

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, setting: true },
    });

    if (!user || user.deletedAt) throw ApiError.unauthorized('Usuário não encontrado.');
    if (!user.isActive) throw ApiError.forbidden('Sua conta está desativada.');
    if (user.blockedAt) {
      throw ApiError.forbidden(
        user.blockedReason
          ? `Sua conta está bloqueada: ${user.blockedReason}`
          : 'Sua conta está bloqueada.',
      );
    }
    // Troca de senha invalida tokens emitidos antes dela.
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      throw ApiError.unauthorized('Sessão expirada. Entre novamente.');
    }

    req.user = user;
    req.userRole = user.role?.name || 'ALUNO';
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Sessão expirada ou inválida.'));
    }
    next(err);
  }
}

/** Autentica se houver token, mas não bloqueia rotas públicas. */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, setting: true },
    });
    if (user && !user.deletedAt && user.isActive && !user.blockedAt) {
      req.user = user;
      req.userRole = user.role?.name || 'ALUNO';
    }
  } catch {
    /* token inválido em rota pública: segue como anônimo */
  }
  next();
}

/** Helper para rotas de cookie: confirma o ambiente esperado. */
export function assertCookieAuthEnabled() {
  return env.isProduction;
}
