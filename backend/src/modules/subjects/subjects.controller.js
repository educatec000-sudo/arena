import { asyncHandler } from '../../shared/asyncHandler.js';
import { created, ok } from '../../shared/response.js';
import * as service from './subjects.service.js';
import { audit } from '../../shared/audit.js';
import { prisma } from '../../database/prisma.js';

export const list = asyncHandler(async (req, res) => {
  const subjects = await service.list({
    includeTopics: req.query.includeTopics === 'true',
  });
  return ok(res, subjects);
});

export const findOne = asyncHandler(async (req, res) => {
  return ok(res, await service.findById(req.params.id));
});

export const findByCode = asyncHandler(async (req, res) => {
  return ok(res, await service.findByCode(req.params.code));
});

export const create = asyncHandler(async (req, res) => {
  const subject = await service.create(req.body);
  await audit({ actorId: req.user.id, action: 'subject.created', entity: 'subject', entityId: subject.id, req });
  return created(res, subject, { message: 'Matéria criada.' });
});

export const update = asyncHandler(async (req, res) => {
  const subject = await service.update(req.params.id, req.body);
  await audit({ actorId: req.user.id, action: 'subject.updated', entity: 'subject', entityId: subject.id, req });
  return ok(res, subject, { message: 'Matéria atualizada.' });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id);
  await audit({ actorId: req.user.id, action: 'subject.archived', entity: 'subject', entityId: req.params.id, req });
  return ok(res, result, { message: 'Matéria arquivada.' });
});

/** Quantidade de questões e assuntos por matéria (usado na tela de treino). */
export const stats = asyncHandler(async (_req, res) => {
  const rows = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: {
      _count: {
        select: { questions: { where: { status: 'PUBLISHED' } }, topics: { where: { isActive: true } } },
      },
    },
  });
  return ok(
    res,
    rows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      groupName: s.groupName,
      color: s.color,
      questions: s._count.questions,
      topics: s._count.topics,
    })),
  );
});
