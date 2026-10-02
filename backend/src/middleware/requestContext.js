import crypto from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';

/** Request id em todas as respostas — essencial para rastrear um erro em produção. */
export function requestContext(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.requestId = req.id;
  next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/api/health',
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
  },
});
