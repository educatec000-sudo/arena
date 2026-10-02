import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';

/** Domínio de assuntos (topics) — sempre filhos de uma matéria. */

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function list({ subjectId } = {}) {
  return prisma.topic.findMany({
    where: { isActive: true, ...(subjectId ? { subjectId } : {}) },
    orderBy: [{ subjectId: 'asc' }, { order: 'asc' }],
    include: { subject: { select: { id: true, code: true, name: true, color: true } } },
  });
}

export async function findById(id) {
  const topic = await prisma.topic.findUnique({
    where: { id },
    include: { subject: { select: { id: true, code: true, name: true } } },
  });
  if (!topic) throw ApiError.notFound('Assunto não encontrado.');
  return topic;
}

export async function create(payload) {
  const subject = await prisma.subject.findUnique({ where: { id: payload.subjectId } });
  if (!subject) throw ApiError.badRequest('Matéria inválida.');

  const existing = await prisma.topic.findUnique({
    where: { subjectId_name: { subjectId: payload.subjectId, name: payload.name.trim() } },
  });
  if (existing) throw ApiError.conflict('Este assunto já existe nesta matéria.');

  const maxOrder = await prisma.topic.aggregate({
    where: { subjectId: payload.subjectId },
    _max: { order: true },
  });

  return prisma.topic.create({
    data: {
      subjectId: payload.subjectId,
      name: payload.name.trim(),
      slug: slugify(payload.name),
      order: payload.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export async function update(id, payload) {
  await findById(id);
  const data = {};
  if (payload.name) {
    data.name = payload.name.trim();
    data.slug = slugify(payload.name);
  }
  if (payload.order !== undefined) data.order = payload.order;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;

  return prisma.topic.update({ where: { id }, data });
}

export async function remove(id) {
  await findById(id);
  await prisma.topic.update({ where: { id }, data: { isActive: false } });
  return { id, archived: true };
}

/** Teoria de bolso de uma matéria (window.__TEORIA__ migrado para o banco). */
export async function listTheory({ subjectId, userId }) {
  const items = await prisma.theoryItem.findMany({
    where: { ...(subjectId ? { subjectId } : {}) },
    orderBy: [{ subjectId: 'asc' }, { order: 'asc' }],
    include: {
      subject: { select: { id: true, code: true, name: true, color: true } },
      ...(userId
        ? { progress: { where: { userId }, select: { done: true, readAt: true } } }
        : {}),
    },
  });

  return items.map((item) => ({
    id: item.id,
    subjectId: item.subjectId,
    subject: item.subject,
    title: item.title,
    content: item.content,
    order: item.order,
    done: userId ? item.progress?.[0]?.done || false : false,
  }));
}

export async function markTheoryRead(userId, theoryItemId, done = true) {
  const item = await prisma.theoryItem.findUnique({ where: { id: theoryItemId } });
  if (!item) throw ApiError.notFound('Conteúdo de teoria não encontrado.');

  return prisma.theoryProgress.upsert({
    where: { userId_theoryItemId: { userId, theoryItemId } },
    create: { userId, theoryItemId, done, readAt: done ? new Date() : null },
    update: { done, readAt: done ? new Date() : null },
  });
}

export async function createTheory(payload) {
  const item = await prisma.theoryItem.create({
    data: {
      subjectId: payload.subjectId,
      topicId: payload.topicId || null,
      title: payload.title.trim(),
      content: payload.content,
      order: payload.order || 0,
    },
  });
  return item;
}

export default { list, findById, create, update, remove, listTheory, markTheoryRead, createTheory, slugify };
