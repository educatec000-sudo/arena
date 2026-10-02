import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';

/**
 * Trilhas de estudo guiadas.
 *
 * Uma trilha é uma sequência de etapas (ex.: "Regimento Interno — 60 questões").
 * O aluno marca a etapa como concluída; o progresso fica no servidor, então
 * continua de onde parou em qualquer aparelho.
 */

const trackInclude = {
  items: {
    orderBy: { order: 'asc' },
    include: {
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
    },
  },
};

/** Lista as trilhas ativas com o progresso do usuário. */
export async function list(userId) {
  const tracks = await prisma.studyTrack.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: trackInclude,
  });

  const progress = userId
    ? await prisma.studyTrackProgress.findMany({ where: { userId } })
    : [];
  const done = new Set(progress.map((item) => `${item.trackId}:${item.itemId ?? 'track'}`));

  return tracks.map((track) => {
    const items = track.items.map((item) => ({ ...item, done: done.has(`${track.id}:${item.id}`) }));
    const completed = items.filter((item) => item.done).length;
    return {
      id: track.id,
      slug: track.slug,
      title: track.title,
      description: track.description,
      level: track.level,
      order: track.order,
      items,
      progress: {
        completed,
        total: items.length,
        percent: items.length ? Number(((completed / items.length) * 100).toFixed(1)) : 0,
        goalQuestions: items.reduce((sum, item) => sum + item.goalQuestions, 0),
      },
    };
  });
}

export async function getBySlug(userId, slug) {
  const track = await prisma.studyTrack.findFirst({
    where: { slug, isActive: true },
    include: trackInclude,
  });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');

  const progress = userId
    ? await prisma.studyTrackProgress.findMany({ where: { userId, trackId: track.id } })
    : [];
  const done = new Set(progress.map((item) => item.itemId ?? 'track'));

  return {
    ...track,
    items: track.items.map((item) => ({ ...item, done: done.has(item.id) })),
  };
}

/** Marca (ou desmarca) uma etapa como concluída. */
export async function toggleItem(userId, slug, itemId, done = true) {
  const track = await prisma.studyTrack.findFirst({ where: { slug, isActive: true } });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');

  const item = await prisma.studyTrackItem.findFirst({ where: { id: itemId, trackId: track.id } });
  if (!item) throw ApiError.notFound('Etapa não encontrada nesta trilha.');

  if (!done) {
    await prisma.studyTrackProgress.deleteMany({ where: { userId, trackId: track.id, itemId } });
    return { done: false, itemId };
  }

  await prisma.studyTrackProgress.upsert({
    where: { userId_trackId_itemId: { userId, trackId: track.id, itemId } },
    create: { userId, trackId: track.id, itemId },
    update: {},
  });
  return { done: true, itemId };
}

/** Zera o progresso do usuário na trilha (para recomeçar). */
export async function resetProgress(userId, slug) {
  const track = await prisma.studyTrack.findFirst({ where: { slug } });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');

  const { count } = await prisma.studyTrackProgress.deleteMany({
    where: { userId, trackId: track.id },
  });
  return { reset: true, removed: count };
}

// ------------------------------------------------------------- admin/editor --

export async function createTrack(payload) {
  return prisma.studyTrack.create({
    data: {
      slug: payload.slug,
      title: payload.title,
      description: payload.description ?? null,
      level: payload.level || 'iniciante',
      order: payload.order ?? 0,
    },
    include: trackInclude,
  });
}

export async function updateTrack(id, payload) {
  const track = await prisma.studyTrack.findUnique({ where: { id } });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');
  return prisma.studyTrack.update({ where: { id }, data: payload, include: trackInclude });
}

export async function removeTrack(id) {
  const track = await prisma.studyTrack.findUnique({ where: { id } });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');
  await prisma.studyTrack.delete({ where: { id } });
  return { removed: true };
}

export async function addItem(trackId, payload) {
  const track = await prisma.studyTrack.findUnique({ where: { id: trackId } });
  if (!track) throw ApiError.notFound('Trilha não encontrada.');
  if (payload.subjectId) await ensureExists('subject', payload.subjectId, 'Matéria inválida.');
  if (payload.topicId) await ensureExists('topic', payload.topicId, 'Assunto inválido.');

  return prisma.studyTrackItem.create({
    data: {
      trackId,
      title: payload.title,
      description: payload.description ?? null,
      goalQuestions: payload.goalQuestions ?? 20,
      subjectId: payload.subjectId ?? null,
      topicId: payload.topicId ?? null,
      order: payload.order ?? 0,
    },
  });
}

export async function removeItem(itemId) {
  const item = await prisma.studyTrackItem.findUnique({ where: { id: itemId } });
  if (!item) throw ApiError.notFound('Etapa não encontrada.');
  await prisma.studyTrackItem.delete({ where: { id: itemId } });
  return { removed: true };
}

async function ensureExists(model, id, message) {
  const found = await prisma[model].findUnique({ where: { id } });
  if (!found) throw ApiError.badRequest(message);
  return found;
}

export default {
  list,
  getBySlug,
  toggleItem,
  resetProgress,
  createTrack,
  updateTrack,
  removeTrack,
  addItem,
  removeItem,
};
