/**
 * Padronização das respostas da API.
 * Sucesso  -> { success: true, data, meta? }
 * Erro     -> { success: false, error: { message, code, details? } }
 */
export function ok(res, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

export function created(res, data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(201).json(body);
}

export function noContent(res) {
  return res.status(204).send();
}

/** Converte { rows, total, page, limit } em meta de paginação. */
export function paginationMeta({ total, page, limit }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
