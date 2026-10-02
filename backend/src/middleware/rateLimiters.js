import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import ApiError from '../shared/errors.js';

/**
 * Como identificamos quem está chamando.
 *
 * Em serverless (Vercel) o `req.ip` pode não existir no primeiro instante e o
 * express-rate-limit ABORTA a requisição com ERR_ERL_UNDEFINED_IP_ADDRESS.
 * Aqui caímos para o cabeçalho do proxy e, na pior hipótese, para um balde
 * único — melhor limitar tudo junto do que derrubar a API.
 */
export function clientKey(req) {
  return (
    req.ip ||
    String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'global'
  );
}

const standardHandler = (_req, _res, next) =>
  next(ApiError.tooManyRequests('Muitas requisições. Aguarde alguns instantes.'));

/** Limite global: protege a API de abuso e de loops do frontend. */
export const globalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler,
  skip: () => env.isTest,
});

/**
 * Anti brute force em login/registro/recuperação.
 * Conta por IP + e-mail e responde 429 (o serviço de auth também bloqueia
 * a conta por N tentativas — defesa em camadas).
 */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(ApiError.tooManyRequests('Muitas tentativas. Tente novamente mais tarde.')),
  skip: () => env.isTest,
});

/** IA é caro: limite bem mais baixo. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20),
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(ApiError.tooManyRequests('Muitas perguntas à IA em pouco tempo. Respire e tente em instantes.')),
  skip: () => env.isTest,
});

/** Geração em lote (simulados, importações) — limite por minuto. */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.HEAVY_RATE_LIMIT_PER_MINUTE || 10),
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  handler: standardHandler,
  skip: () => env.isTest,
});
