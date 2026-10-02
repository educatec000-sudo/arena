import { Router } from 'express';
import * as controller from './favorites.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/count', controller.count);
router.post(
  '/:questionId/toggle',
  validate({ params: z.object({ questionId: z.string().uuid('Questão inválida.') }) }),
  controller.toggle,
);

export default router;
