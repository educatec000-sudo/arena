import { Router } from 'express';
import * as controller from './users.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/me', controller.me);
router.get('/me/export', controller.exportData);
router.patch(
  '/me',
  validate({ body: z.object({ name: z.string().trim().min(2).max(120).optional() }) }),
  controller.updateSelf,
);

// Gestão de usuários: apenas ADMIN
router.get('/', requireRole('ADMIN'), controller.list);
router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(128),
      role: z.enum(['ADMIN', 'EDITOR', 'ALUNO']).default('ALUNO'),
    }),
  }),
  controller.create,
);
router.get('/:id', requireRole('ADMIN'), controller.findById);
router.delete('/:id', requireRole('ADMIN'), controller.softDelete);

export default router;
