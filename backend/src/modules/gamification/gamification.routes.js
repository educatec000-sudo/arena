import { Router } from 'express';
import * as controller from './gamification.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { rankingQuerySchema } from './gamification.validators.js';

const router = Router();
router.use(authenticate);

router.get('/me', controller.me);
router.get('/ranking', validate({ query: rankingQuerySchema }), controller.ranking);

export default router;
