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

/**
 * Uma origem da lista pode ter curinga, ex.: `https://*.vercel.app`.
 * Isso existe porque os deploys de PR da Vercel ganham um endereço novo a
 * cada branch — sem o curinga cada preview precisaria de um redeploy da API.
 */
function originAllowed(origin) {
  return env.cors.origins.some((permitida) => {
    if (permitida === origin) return true;
    if (!permitida.includes('*')) return false;
    const pattern = permitida
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(origin);
  });
}

export const corsOptions = {
  origin(origin, callback) {
    // Requisições sem Origin (curl, mobile nativo, healthcheck) são liberadas.
    if (!origin) return callback(null, true);
    if (originAllowed(origin)) return callback(null, true);
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
