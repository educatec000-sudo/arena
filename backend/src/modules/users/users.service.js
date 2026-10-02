import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { parsePagination, buildSearch } from '../../shared/pagination.js';
import { hashPassword } from '../../shared/password.js';

/** Domínio de usuários (consulta e manutenção pelo próprio usuário). */

export function sanitize(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role?.name || null,
    isActive: user.isActive,
    blockedAt: user.blockedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    setting: user.setting || null,
  };
}

export async function findById(id) {
  const user = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    include: { role: true, setting: true },
  });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');
  return sanitize(user);
}

/** Painel resumido do próprio usuário. */
export async function getProfileSummary(userId) {
  const [user, answers, favorites, errors, simulados, studySeconds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, setting: true },
    }),
    prisma.answer.count({ where: { userId } }),
    prisma.favorite.count({ where: { userId } }),
    prisma.errorNotebookItem.count({ where: { userId, resolvedAt: null } }),
    prisma.simulado.count({ where: { userId, status: 'FINISHED' } }),
    prisma.dailyStat.aggregate({ where: { userId }, _sum: { minutes: true } }),
  ]);

  if (!user) throw ApiError.notFound('Usuário não encontrado.');

  return {
    ...sanitize(user),
    counters: {
      answers,
      favorites,
      errors,
      simulados,
      minutesStudied: Math.round(Number(studySeconds._sum.minutes || 0)),
    },
  };
}

export async function list(query) {
  const { page, limit, skip } = parsePagination(query, { limit: 20, maxLimit: 100, sort: ['createdAt', 'name', 'email'] });

  const where = { deletedAt: null };
  if (query.search) Object.assign(where, buildSearch(query.search, ['name', 'email']));
  if (query.role) where.role = { name: query.role };
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [query.sort || 'createdAt']: query.order || 'desc' },
      include: { role: true, setting: true },
    }),
  ]);

  return { rows: rows.map(sanitize), total, page, limit };
}

export async function updateSelf(userId, payload) {
  const data = {};
  if (payload.name) data.name = payload.name.trim();

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    include: { role: true, setting: true },
  });
  return sanitize(user);
}

export async function createUser(actorId, payload) {
  const email = String(payload.email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { emailNormalized: email } });
  if (existing) throw ApiError.conflict('Já existe um usuário com este e-mail.');

  const role = await prisma.role.findUnique({ where: { name: payload.role || 'ALUNO' } });
  if (!role) throw ApiError.badRequest('Perfil inválido.');

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email,
      emailNormalized: email,
      passwordHash: await hashPassword(payload.password),
      roleId: role.id,
      createdById: actorId,
      setting: { create: { examDate: new Date('2026-12-13T00:00:00.000Z') } },
    },
    include: { role: true, setting: true },
  });

  return sanitize(user);
}

export async function softDelete(id) {
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  return { id, deleted: true };
}

export default { findById, getProfileSummary, list, updateSelf, createUser, softDelete, sanitize };
