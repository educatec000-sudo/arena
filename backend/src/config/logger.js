import pino from 'pino';
import { env } from './env.js';

/**
 * Logger estruturado (JSON em produção, legível em desenvolvimento).
 * Nunca loga corpo de requisição com senha/token — ver `redact`.
 */
export const logger = pino({
  level: env.log.level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.token',
      'req.body.apiKey',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'arena-estudos-api', env: env.NODE_ENV },
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
});

export default logger;
