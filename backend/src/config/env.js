import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/src/config  ->  ../../.. = raiz do monorepo
export const ROOT_DIR = path.resolve(here, '../../..');

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Carrega .env na ordem de precedência (o primeiro que existir ganha):
 *   .env.{NODE_ENV}.local > .env.{NODE_ENV} > .env.local > .env
 * Em produção as variáveis reais vêm do orquestrador/host — o .env é só comodidade.
 */
const candidates = [
  path.join(ROOT_DIR, `.env.${NODE_ENV}.local`),
  path.join(ROOT_DIR, `.env.${NODE_ENV}`),
  path.join(ROOT_DIR, '.env.local'),
  path.join(ROOT_DIR, '.env'),
];
for (const file of candidates) {
  dotenv.config({ path: file, quiet: true });
}

const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`[config] Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

/** Segredos fracos derrubam a API em produção — falha cedo, nunca em silêncio. */
function assertStrongSecret(value, name) {
  if (!isProduction) return value;
  if (!value || value.length < 32 || /troque|change|secret$/i.test(value)) {
    throw new Error(
      `[config] ${name} é fraco ou é o valor de exemplo. ` +
      'Gere um com: openssl rand -base64 48',
    );
  }
  return value;
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(value, fallback) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');
  return raw;
}

const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'];

const dbUrl = required(
  isTest
    ? process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
    : process.env.DATABASE_URL,
  isTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL',
);

export const env = {
  NODE_ENV,
  isProduction,
  isTest,
  isDevelopment: NODE_ENV === 'development',

  server: {
    port: Number(process.env.PORT || 4000),
    apiPrefix: normalizeUrl(process.env.API_PREFIX, '/api'),
    webUrl: normalizeUrl(process.env.APP_WEB_URL, 'http://localhost:5173'),
  },

  database: {
    url: dbUrl,
    /**
     * Detecta o pooler de TRANSAÇÃO do Supabase (porta 6543).
     * Nele o Prisma precisa de `?pgbouncer=true`, não aceita transações
     * interativas e as migrações devem rodar pela conexão direta (5432).
     */
    isTransactionPooler: /:6543(?:[/?#]|$)/.test(dbUrl) || /pgbouncer=true/.test(dbUrl),
    /** Número de tentativas ao esperar o banco subir (containers / cold start). */
    connectRetries: Number(process.env.DB_CONNECT_RETRIES || 10),
    connectRetryDelayMs: Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 2000),
  },

  security: {
    jwtAccessSecret: assertStrongSecret(
      required(process.env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'),
      'JWT_ACCESS_SECRET',
    ),
    jwtRefreshSecret: assertStrongSecret(
      required(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'),
      'JWT_REFRESH_SECRET',
    ),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'arena_rt',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    // none | lax | strict. Em produção o padrão é 'none': é o que permite o
    // cookie de sessão viajar entre dois domínios (frontend na Vercel,
    // API no Render). Se tudo estiver no mesmo domínio, use 'strict'.
    cookieSameSite: (process.env.COOKIE_SAMESITE || '').toLowerCase() || undefined,
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    // AES-256 exige 32 bytes em hexadecimal (64 caractéres)
    encryptionKey: required(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY'),
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
    authLockMinutes: Number(process.env.AUTH_RATE_LOCK_MINUTES || 15),
  },

  cors: {
    origins: parseList(process.env.CORS_ORIGINS).length
      ? parseList(process.env.CORS_ORIGINS)
      : defaultOrigins,
  },

  log: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Arena Estudos <no-reply@arenaestudos.local>',
    passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60),
    // Em produção o link NUNCA deve vazar em log.
    logResetLink: (process.env.PASSWORD_RESET_LOG_LINK || 'true') === 'true' && !isProduction,
  },

  ai: {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'groq',
    defaultModel: process.env.AI_DEFAULT_MODEL || '',
    maxTokens: Number(process.env.AI_MAX_TOKENS || 1500),
    temperature: Number(process.env.AI_TEMPERATURE || 0.6),
    timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000),
    /** Teto de tempo para a fila inteira de provedores (fallback). */
    totalBudgetMs: Number(process.env.AI_TOTAL_BUDGET_MS || 0),
    keys: {
      openai: process.env.OPENAI_API_KEY || '',
      gemini: process.env.GEMINI_API_KEY || '',
      groq: process.env.GROQ_API_KEY || '',
      huggingface: process.env.HF_TOKEN || '',
      deepseek: process.env.DEEPSEEK_API_KEY || '',
      mistral: process.env.MISTRAL_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || '',
      xai: process.env.XAI_API_KEY || '',
      ollama: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1/chat/completions',
    },
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@arenaestudos.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    adminName: process.env.SEED_ADMIN_NAME || 'Administrador',
  },
};

export default env;
