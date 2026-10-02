import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { corsMiddleware, helmetMiddleware } from './config/security.js';
import { httpLogger, requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { prisma } from './database/prisma.js';

// --------------------------------------------------------------- módulos -----
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import subjectsRoutes from './modules/subjects/subjects.routes.js';
import topicsRoutes from './modules/topics/topics.routes.js';
import questionsRoutes from './modules/questions/questions.routes.js';
import simuladosRoutes from './modules/simulados/simulados.routes.js';
import progressRoutes from './modules/progress/progress.routes.js';
import favoritesRoutes from './modules/favorites/favorites.routes.js';
import errorNotebookRoutes from './modules/error-notebook/error-notebook.routes.js';
import studySessionsRoutes from './modules/study-sessions/study-sessions.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import gamificationRoutes from './modules/gamification/gamification.routes.js';
import studyTracksRoutes from './modules/study-tracks/study-tracks.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

/**
 * Monta a aplicação Express.
 * Ficou separado do server.js para que os testes possam importar o app
 * sem abrir porta.
 */
export function createApp() {
  const app = express();

  /**
   * Confia apenas no ÚLTIMO salto do proxy (nginx/Railway/Render) para que
   * `req.ip` seja o IP real do cliente.
   * Nunca usamos `true`: isso permite forjar o cabeçalho X-Forwarded-For e
   * burlar o rate limiting por IP (o express-rate-limit recusa essa config).
   */
  app.set('trust proxy', env.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestContext);
  app.use(httpLogger);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  // ------------------------------------------------------------- saúde -------
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      service: 'arena-estudos-api',
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Health check "de verdade": confirma que o banco responde.
   * É o que o orquestrador (Docker/Render/Railway) usa como readiness probe.
   */
  app.get(`${env.server.apiPrefix}/health`, async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    const payload = {
      success: true,
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'arena-estudos-api',
      env: env.NODE_ENV,
      database,
      timestamp: new Date().toISOString(),
    };

    res.status(database === 'ok' ? 200 : 503).json(payload);
  });

  // -------------------------------------------------------------- rotas ------
  const routes = [
    ['/auth', authRoutes],
    ['/users', usersRoutes],
    ['/subjects', subjectsRoutes],
    ['/topics', topicsRoutes],
    ['/questions', questionsRoutes],
    ['/simulados', simuladosRoutes],
    ['/progress', progressRoutes],
    ['/favorites', favoritesRoutes],
    ['/error-notebook', errorNotebookRoutes],
    ['/study-sessions', studySessionsRoutes],
    ['/ai', aiRoutes],
  ['/gamification', gamificationRoutes],
  ['/study-tracks', studyTracksRoutes],
    ['/admin', adminRoutes],
  ];

  routes.forEach(([path, router]) => app.use(`${env.server.apiPrefix}${path}`, router));

  // --------------------------------------------------------------- erros -----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
