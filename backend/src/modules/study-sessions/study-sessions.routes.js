import { Router } from 'express';
import * as controller from './study-sessions.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const idSchema = z.object({ id: z.string().uuid('Id inválido.') });

router.get('/', controller.list);

router.post(
  '/',
  validate({
    body: z.object({
      title: z.string().trim().max(120).optional(),
      kind: z.enum(['TRAINING', 'GENERATOR', 'REVIEW', 'ERROR_BOOK', 'FAVORITES']).default('TRAINING'),
      totalQuestions: z.number().int().min(0).max(500).optional(),
      metadata: z.record(z.any()).optional(),
    }),
  }),
  controller.start,
);

router.get('/:id', validate({ params: idSchema }), controller.getById);

router.post(
  '/:id/finish',
  validate({
    params: idSchema,
    body: z.object({
      answeredCount: z.number().int().min(0).optional(),
      correctCount: z.number().int().min(0).optional(),
    }),
  }),
  controller.finish,
);

router.delete('/:id', validate({ params: idSchema }), controller.remove);

export default router;
