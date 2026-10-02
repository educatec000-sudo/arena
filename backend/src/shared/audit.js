import { prisma } from '../database/prisma.js';
import { logger } from '../config/logger.js';

/**
 * Registra uma ação administrativa na trilha de auditoria.
 * Nunca derruba a requisição se o log falhar — auditoria não pode
 * impedir a operação principal, mas precisa ficar registrada.
 */
export async function audit({ actorId, action, entity, entityId, targetId, metadata, req }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action,
        entity,
        entityId: entityId ? String(entityId) : null,
        targetId: targetId || null,
        metadata: metadata ?? undefined,
        ip: req?.ip || null,
        userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
      },
    });
  } catch (err) {
    logger.error({ err, action, entity, entityId }, 'Falha ao gravar auditoria');
  }
}

/** Atalho para ações administrativas já com o req na mão. */
export function auditFromReq(req) {
  return (action, entity, entityId, metadata, targetId) =>
    audit({
      actorId: req.user?.id,
      action,
      entity,
      entityId,
      targetId,
      metadata,
      req,
    });
}
