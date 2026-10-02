import { Prisma } from '@prisma/client';
import ApiError from '../shared/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/** Erros do Prisma -> HTTP amigável (nunca vaza SQL nem detalhe de constraint). */
function translatePrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = err.meta?.target || [];
        return ApiError.conflict('Já existe um registro com esses dados.', { fields });
      }
      case 'P2025':
        return ApiError.notFound('Registro não encontrado.');
      case 'P2003':
        return ApiError.badRequest('Operação inválida: registro relacionado não existe.');
      case 'P2014':
        return ApiError.badRequest('Esta alteração quebraria um vínculo existente.');
      default:
        return null;
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest('Dados enviados são inválidos.');
  }
  return null;
}

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const translated = translatePrismaError(error);
    error = translated || error;
  }
  if (!(error instanceof ApiError)) {
    error = new ApiError(500, env.isProduction ? 'Erro interno do servidor.' : error.message);
  }

  const isServerError = error.statusCode >= 500;
  const logPayload = {
    err: { message: error.message, stack: error.stack },
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id || null,
  };

  if (isServerError) logger.error(logPayload, 'Erro não tratado');
  else logger.warn({ ...logPayload, status: error.statusCode }, 'Erro de requisição');

  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.name || 'Error',
      ...(error.details ? { details: error.details } : {}),
      // Stack só em desenvolvimento: em produção nunca expomos internals.
      ...(env.isDevelopment && isServerError ? { stack: error.stack } : {}),
      requestId: req.id,
    },
  });
}

export default errorHandler;
