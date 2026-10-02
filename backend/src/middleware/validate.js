import { ZodError } from 'zod';
import ApiError from '../shared/errors.js';

/**
 * Validação de entrada com zod.
 * Valida body, query, params e cookies — tudo antes de chegar no serviço.
 * Nada de `req.body.x` sem schema: é a primeira barreira contra SQL Injection
 * e contra payload malformado.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) req.query = schemas.query.parse(req.query ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      if (schemas.cookies) req.cookies = schemas.cookies.parse(req.cookies ?? {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.') || '_root',
          message: issue.message,
        }));
        return next(ApiError.unprocessable('Dados inválidos.', details));
      }
      next(err);
    }
  };
}

/** Remove chaves com string vazia ou null para não sobrescrever com lixo. */
export function stripEmpty(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}
