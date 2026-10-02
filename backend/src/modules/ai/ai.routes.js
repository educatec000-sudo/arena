import { Router } from 'express';
import * as controller from './ai.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { aiLimiter, heavyLimiter } from '../../middleware/rateLimiters.js';
import { z } from 'zod';
import {
  chatSchema,
  credentialSchema,
  explainQuestionSchema,
  generateQuestionsSchema,
  generateSimuladoSchema,
  idParamSchema,
  listConversationsQuery,
  studyHelpSchema,
  summarizeSchema,
} from './ai.validators.js';

/**
 * Rotas de IA.
 * Tudo passa pelo backend — o frontend nunca vê chave de API.
 */
const router = Router();
router.use(authenticate);

router.get('/providers', controller.listProviders);

router.get('/conversations', validate({ query: listConversationsQuery }), controller.listConversations);
router.get('/conversations/:id', validate({ params: idParamSchema }), controller.getConversation);
router.delete('/conversations/:id', validate({ params: idParamSchema }), controller.deleteConversation);

router.post('/chat', aiLimiter, validate({ body: chatSchema }), controller.chat);
router.post('/study-help', aiLimiter, validate({ body: studyHelpSchema }), controller.studyHelp);
router.get('/suggest-review', aiLimiter, controller.suggestReview);
router.post('/summarize', aiLimiter, validate({ body: summarizeSchema }), controller.summarize);

router.post(
  '/questions/:questionId/explain',
  aiLimiter,
  validate({ params: z.object({ questionId: z.string().uuid() }), body: explainQuestionSchema }),
  controller.explainQuestion,
);

router.post(
  '/errors/:questionId/explain',
  aiLimiter,
  validate({ params: z.object({ questionId: z.string().uuid() }), body: explainQuestionSchema }),
  controller.explainError,
);

router.post(
  '/generate-questions',
  heavyLimiter,
  validate({ body: generateQuestionsSchema }),
  controller.generateQuestions,
);

router.post(
  '/generate-simulado',
  heavyLimiter,
  validate({ body: generateSimuladoSchema }),
  controller.generateSimulado,
);

// Configuração de chaves do próprio usuário
router.get('/credentials', controller.listCredentials);
router.post('/credentials', validate({ body: credentialSchema }), controller.saveCredential);
router.get('/credentials/:provider/models', controller.listModels);
router.post('/credentials/:provider/test', controller.testCredential);
router.delete('/credentials/:provider', controller.deleteCredential);

export default router;
