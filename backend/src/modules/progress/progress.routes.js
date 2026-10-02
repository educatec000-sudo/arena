import { Router } from 'express';
import * as controller from './progress.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  answerSchema,
  evolutionQuerySchema,
  reviewQuerySchema,
  studyTimeSchema,
} from './progress.validators.js';

const router = Router();
router.use(authenticate);

router.get('/dashboard', controller.dashboard);
router.get('/report', controller.fullReport);
router.get('/overview', controller.overview);
router.get('/evolution', validate({ query: evolutionQuerySchema }), controller.evolution);
router.get('/by-subject', controller.bySubject);
router.get('/by-topic', controller.byTopic);
router.get('/by-difficulty', controller.byDifficulty);
router.get('/timing', controller.timing);
router.get('/review-queue', validate({ query: reviewQuerySchema }), controller.reviewQueue);
router.get('/review-schedule', controller.reviewSchedule);
router.get('/simulados', controller.simuladoHistory);

router.post('/answer', validate({ body: answerSchema }), controller.answer);
router.post('/study-time', validate({ body: studyTimeSchema }), controller.addStudyTime);

export default router;
