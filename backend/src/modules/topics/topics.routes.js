import { Router } from 'express';
import * as controller from './topics.controller.js';
import { optionalAuth, authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

const router = Router();

const idSchema = z.object({ id: z.string().uuid('Id inválido.') });

const createSchema = z.object({
  subjectId: z.string().uuid('Matéria inválida.'),
  name: z.string().trim().min(2).max(160),
  order: z.number().int().min(0).optional(),
});

const theorySchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(10),
  order: z.number().int().min(0).optional(),
});

// Leitura pública (o frontend mostra a árvore de assuntos nos filtros).
router.get('/', optionalAuth, controller.list);

/**
 * Rotas literais precisam vir ANTES de `/:id`, senão o Express trata "theory"
 * como um id de assunto.
 */
router.get('/theory', authenticate, controller.listTheory);
router.post(
  '/theory/:id/read',
  authenticate,
  validate({ params: idSchema, body: z.object({ done: z.boolean().optional() }) }),
  controller.toggleTheory,
);

router.get('/:id', optionalAuth, validate({ params: idSchema }), controller.findOne);

router.use(authenticate, requireRole('ADMIN', 'EDITOR'));
router.post('/', validate({ body: createSchema }), controller.create);
router.patch('/:id', validate({ params: idSchema, body: createSchema.partial() }), controller.update);
router.delete('/:id', validate({ params: idSchema }), controller.remove);
router.post('/theory', validate({ body: theorySchema }), controller.createTheory);

export default router;
