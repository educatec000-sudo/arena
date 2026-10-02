import { Router } from 'express';
import * as controller from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.validators.js';
import { z } from 'zod';

/**
 * Rotas públicas de autenticação.
 * O rate limit agressivo aqui é a primeira barreira contra brute force.
 */
const router = Router();

const deviceInfo = (req, _res, next) => {
  req.deviceInfo = {
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || null,
  };
  next();
};

router.use(deviceInfo);

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  controller.register,
);

router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);

router.post('/refresh', controller.refresh);

router.post('/logout', controller.logout);

router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.requestPasswordReset);

router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);

// ------------------------------- autenticadas -------------------------------

router.get('/me', authenticate, controller.me);

router.patch(
  '/profile',
  authenticate,
  validate({ body: updateProfileSchema }),
  controller.updateProfile,
);

router.patch(
  '/settings',
  authenticate,
  validate({
    body: z.object({
      dailyGoal: z.number().int().min(1).max(500).optional(),
      totalGoal: z.number().int().min(1).max(200000).optional(),
      examDate: z.string().datetime().nullable().optional(),
      examTimeMinutes: z.number().int().min(10).max(600).optional(),
      theme: z.enum(['dark', 'light']).optional(),
      onboardingDone: z.boolean().optional(),
    }),
  }),
  controller.updateSettings,
);

router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

router.post('/logout-all', authenticate, controller.logoutAll);

router.get('/sessions', authenticate, controller.listSessions);

router.delete('/sessions/:id', authenticate, controller.revokeSession);

export default router;
