import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';

/** Domínio de matérias (subjects). */

export async function list({ includeTopics = false, includeCounts = true } = {}) {
  return prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: {
      topics: includeTopics ? { where: { isActive: true }, orderBy: { order: 'asc' } } : false,
      _count: includeCounts ? { select: { questions: { where: { status: 'PUBLISHED' } } } } : false,
    },
  });
}

export async function findById(id) {
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: { topics: { where: { isActive: true }, orderBy: { order: 'asc' } } },
  });
  if (!subject) throw ApiError.notFound('Matéria não encontrada.');
  return subject;
}

export async function findByCode(code) {
  const subject = await prisma.subject.findUnique({
    where: { code: String(code).toUpperCase() },
    include: { topics: { where: { isActive: true }, orderBy: { order: 'asc' } } },
  });
  if (!subject) throw ApiError.notFound('Matéria não encontrada.');
  return subject;
}

export async function create(payload) {
  const code = String(payload.code).toUpperCase();
  const exists = await prisma.subject.findUnique({ where: { code } });
  if (exists) throw ApiError.conflict('Já existe uma matéria com esta sigla.');

  const maxOrder = await prisma.subject.aggregate({ _max: { order: true } });

  return prisma.subject.create({
    data: {
      code,
      name: payload.name.trim(),
      groupName: payload.groupName || null,
      color: payload.color || '#4f7dfb',
      order: payload.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export async function update(id, payload) {
  await findById(id);
  const data = {};
  if (payload.name) data.name = payload.name.trim();
  if (payload.groupName !== undefined) data.groupName = payload.groupName;
  if (payload.color) data.color = payload.color;
  if (payload.order !== undefined) data.order = payload.order;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  return prisma.subject.update({ where: { id }, data });
}

/** Só arquiva: excluir matéria apagaria questões e histórico dos alunos. */
export async function remove(id) {
  await findById(id);
  await prisma.subject.update({ where: { id }, data: { isActive: false } });
  return { id, archived: true };
}

export default { list, findById, findByCode, create, update, remove };
