/**
 * Erros tipados da aplicação.
 * Todo erro lançado pelos serviços vira uma resposta HTTP previsível
 * (ver `middleware/errorHandler.js`) — o controller nunca inventa status.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Requisição inválida.', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Não autenticado.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Você não tem permissão para esta ação.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Recurso não encontrado.') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflito de dados.', details = null) {
    return new ApiError(409, message, details);
  }

  static unprocessable(message = 'Dados inválidos.', details = null) {
    return new ApiError(422, message, details);
  }

  static tooManyRequests(message = 'Muitas requisições. Tente novamente em instantes.') {
    return new ApiError(429, message);
  }

  static serviceUnavailable(message = 'Serviço temporariamente indisponível.', details = null) {
    return new ApiError(503, message, details);
  }

  static internal(message = 'Erro interno do servidor.') {
    return new ApiError(500, message);
  }
}

export default ApiError;
