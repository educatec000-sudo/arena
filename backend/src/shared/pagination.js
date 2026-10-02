/**
 * Normaliza query de paginação/ordenação.
 * Limites duros evitam que um cliente peça 1 milhão de registros por vez.
 */
export function parsePagination(query, defaults = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || defaults.page || 1);
  const rawLimit = Number.parseInt(query.limit, 10) || defaults.limit || 20;
  const limit = Math.min(Math.max(1, rawLimit), defaults.maxLimit || 100);
  const skip = (page - 1) * limit;

  const allowedSort = defaults.sort || ['createdAt'];
  const sort = allowedSort.includes(query.sort) ? query.sort : allowedSort[0];
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  return { page, limit, skip, sort, order, take: limit };
}

/**
 * Busca textual simples e segura: apenas `contains` com case-insensitive.
 * (Prisma parametriza os valores — não há concatenação de SQL.)
 */
export function buildSearch(term, fields) {
  if (!term || !fields?.length) return undefined;
  const cleaned = String(term).trim().slice(0, 120);
  if (!cleaned) return undefined;
  return {
    OR: fields.map((field) => ({ [field]: { contains: cleaned, mode: 'insensitive' } })),
  };
}
