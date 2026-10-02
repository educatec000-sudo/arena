import { Router } from 'express';
import * as controller from './study-tracks.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createItemSchema,
  createTrackSchema,
  idParamSchema,
  itemParamSchema,
  slugParamSchema,
  toggleItemSchema,
  updateTrackSchema,
} from './study-tracks.validators.js';

const router = Router();

// ------------------------------------------------------------------ aluno ----
router.get('/', authenticate, controller.list);
router.get('/:slug', authenticate, controller.getBySlug);
router.post(
  '/:slug/items/:itemId/complete',
  authenticate,
  validate({ params: itemParamSchema, body: toggleItemSchema }),
  controller.toggleItem,
);
router.post(
  '/:slug/reset',
  authenticate,
  validate({ params: slugParamSchema }),
  controller.resetProgress,
);

// ------------------------------------------------------------ admin/editor ---
const editor = requireRole('ADMIN', 'EDITOR');

router.post('/', authenticate, editor, validate({ body: createTrackSchema }), controller.createTrack);

router.patch(
  '/:id',
  authenticate,
  editor,
  validate({ params: idParamSchema, body: updateTrackSchema }),
  controller.updateTrack,
);
router.delete('/:id', authenticate, editor, validate({ params: idParamSchema }), controller.removeTrack);
router.post(
  '/:id/items',
  authenticate,
  editor,
  validate({ params: idParamSchema, body: createItemSchema }),
  controller.addItem,
);
router.delete(
  '/:id/items/:itemId',
  authenticate,
  editor,
  validate({ params: itemParamSchema.omit({ slug: true }).extend({ id: idParamSchema.shape.id }) }),
  controller.removeItem,
);

export default router;
