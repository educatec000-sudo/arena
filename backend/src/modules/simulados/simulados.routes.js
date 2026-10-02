import { Router } from 'express';
import * as controller from './simulados.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { heavyLimiter } from '../../middleware/rateLimiters.js';
import {
  answerSchema,
  createSimuladoSchema,
  idParamSchema,
  listQuerySchema,
} from './simulados.validators.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listQuerySchema }), controller.list);
router.get('/stats', controller.stats);

router.post('/', heavyLimiter, validate({ body: createSimuladoSchema }), controller.create);

router.get('/:id', validate({ params: idParamSchema }), controller.getById);
router.post(
  '/:id/answer',
  validate({ params: idParamSchema, body: answerSchema }),
  controller.answer,
);
router.post('/:id/finish', validate({ params: idParamSchema }), controller.finish);
router.post('/:id/abandon', validate({ params: idParamSchema }), controller.abandon);
router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

export default router;
