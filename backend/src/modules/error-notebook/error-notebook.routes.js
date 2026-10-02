import { Router } from 'express';
import * as controller from './error-notebook.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { heavyLimiter } from '../../middleware/rateLimiters.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const questionParam = z.object({ questionId: z.string().uuid('Questão inválida.') });

router.get('/', controller.list);
router.get('/stats', controller.stats);

// Rotas literais precisam vir ANTES de `/:questionId`, senão o Express
// interpreta "generate-simulado" como um id de questão.
router.post(
  '/generate-simulado',
  heavyLimiter,
  validate({
    body: z.object({
      count: z.number().int().min(1).max(60).default(20),
      subjectIds: z.array(z.string().uuid()).max(20).optional(),
      durationMinutes: z.number().int().min(5).max(600).default(120),
      shuffleOptions: z.boolean().default(false),
      feedbackMode: z.enum(['final', 'imediato']).default('final'),
    }),
  }),
  controller.generateSimulado,
);

router.delete('/resolved/all', controller.clearResolved);

router.post(
  '/:questionId',
  validate({ params: questionParam, body: z.object({ note: z.string().max(5000).optional() }) }),
  controller.add,
);
router.patch(
  '/:questionId/note',
  validate({ params: questionParam, body: z.object({ note: z.string().max(5000) }) }),
  controller.updateNote,
);
router.patch(
  '/:questionId/resolve',
  validate({ params: questionParam, body: z.object({ resolved: z.boolean().optional() }) }),
  controller.resolve,
);
router.delete('/:questionId', validate({ params: questionParam }), controller.remove);

export default router;
