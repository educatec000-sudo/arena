import { Router } from 'express';
import * as controller from './subjects.controller.js';
import { optionalAuth, authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(2).max(80),
  groupName: z.string().trim().max(60).optional().nullable(),
  color: z.string().regex(/^#([0-9a-f]{6})$/i, 'Cor deve estar no formato #rrggbb.').optional(),
  order: z.number().int().min(0).optional(),
});

const idSchema = z.object({ id: z.string().uuid('Id inválido.') });

router.get('/', optionalAuth, controller.list);
router.get('/stats', optionalAuth, controller.stats);
router.get('/code/:code', optionalAuth, controller.findByCode);
router.get('/:id', optionalAuth, validate({ params: idSchema }), controller.findOne);

router.use(authenticate, requireRole('ADMIN', 'EDITOR'));
router.post('/', validate({ body: createSchema }), controller.create);
router.patch('/:id', validate({ params: idSchema, body: createSchema.partial() }), controller.update);
router.delete('/:id', validate({ params: idSchema }), controller.remove);

export default router;
