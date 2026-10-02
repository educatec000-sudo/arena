import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Access token: JWT curto (15m) com o mínimo necessário para autorizar.
 * Refresh token: opaco, guardado como hash no banco e enviado em cookie httpOnly.
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role?.name || user.roleName,
      email: user.email,
      type: 'access',
    },
    env.security.jwtAccessSecret,
    { expiresIn: env.security.jwtAccessExpiresIn, issuer: 'arena-estudos' },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.security.jwtAccessSecret, { issuer: 'arena-estudos' });
}

/** Opções do cookie do refresh token (httpOnly + SameSite + Secure em produção). */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    path: `${env.server.apiPrefix}/auth`,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    domain: env.security.cookieDomain,
  };
}

export function clearRefreshCookie(res) {
  res.clearCookie(env.security.refreshCookieName, {
    ...refreshCookieOptions(),
    maxAge: undefined,
  });
}

export function setRefreshCookie(res, token) {
  res.cookie(env.security.refreshCookieName, token, refreshCookieOptions());
}
