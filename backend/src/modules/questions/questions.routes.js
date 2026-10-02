import { Router } from 'express';
import * as controller from './questions.controller.js';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createQuestionSchema,
  idParamSchema,
  listQuerySchema,
  pickRandomSchema,
  updateQuestionSchema,
} from './questions.validators.js';

const router = Router();

// Leitura liberada para visitantes (permite mostrar o tamanho do banco na
// landing page); os modos personalizados exigem login.
router.get('/', optionalAuth, validate({ query: listQuerySchema }), controller.list);
router.get('/stats', controller.stats);
router.get('/counts', controller.counts);
router.post('/random', optionalAuth, validate({ body: pickRandomSchema }), controller.random);

router.use(authenticate);

router.get('/session', validate({ query: listQuerySchema }), controller.session);
router.get('/:id', validate({ params: idParamSchema }), controller.findOne);

// Escrita: apenas EDITOR e ADMIN.
router.post('/', requireRole('ADMIN', 'EDITOR'), validate({ body: createQuestionSchema }), controller.create);
router.patch(
  '/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: idParamSchema, body: updateQuestionSchema }),
  controller.update,
);
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), validate({ params: idParamSchema }), controller.remove);
router.delete(
  '/:id/hard',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  controller.hardDelete,
);

export default router;
