/**
 * Encaminha rejeições de promise para o errorHandler do Express.
 * Evita try/catch repetido em todos os controllers.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
