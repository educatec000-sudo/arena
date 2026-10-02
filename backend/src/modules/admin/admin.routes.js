import { Router } from 'express';
import * as controller from './admin.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

/**
 * Área administrativa.
 * Separada do domínio de usuários: aqui ficam as ações que exigem ADMIN
 * e que precisam gerar trilha de auditoria.
 */
const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/dashboard', controller.dashboard);

router.get('/users', controller.listUsers);
router.get('/users/:id', controller.getUser);
router.patch(
  '/users/:id',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      role: z.enum(['ADMIN', 'EDITOR', 'ALUNO']).optional(),
      isActive: z.boolean().optional(),
      password: z.string().min(8).max(128).optional(),
    }),
  }),
  controller.updateUser,
);
router.post(
  '/users/:id/block',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().trim().max(300).optional() }),
  }),
  controller.blockUser,
);
router.post('/users/:id/unblock', validate({ params: z.object({ id: z.string().uuid() }) }), controller.unblockUser);
router.patch(
  '/users/:id/role',
  validate({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ role: z.enum(['ADMIN', 'EDITOR', 'ALUNO']) }),
  }),
  controller.changeRole,
);
router.delete('/users/:id', validate({ params: z.object({ id: z.string().uuid() }) }), controller.deleteUser);

router.get('/logs', controller.listAuditLogs);
router.get('/roles', controller.listRoles);
router.get('/content-stats', controller.contentStats);
router.get('/hardest-questions', controller.hardestQuestions);

export default router;
