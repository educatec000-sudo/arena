import helmet from 'helmet';
import cors from 'cors';
import { env } from './env.js';

/**
 * CSP: em produção permitimos apenas o próprio domínio (o app não usa CDNs
 * nem fontes externas; os gráficos são SVG inline).
 */
export const helmetOptions = {
  contentSecurityPolicy: env.isProduction
    ? {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      }
    : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: env.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  frameguard: { action: 'deny' },
};

export const corsOptions = {
  origin(origin, callback) {
    // Requisições sem Origin (curl, mobile nativo, healthcheck) são liberadas.
    if (!origin) return callback(null, true);
    if (env.cors.origins.includes(origin)) return callback(null, true);
    if (env.isDevelopment) return callback(null, true);
    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
};

export const helmetMiddleware = helmet(helmetOptions);
export const corsMiddleware = cors(corsOptions);
