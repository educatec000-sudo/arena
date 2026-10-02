import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Instância única do Prisma (evita abrir N conexões em dev com hot-reload).
 * Em desenvolvimento logamos as queries lentas para detectar N+1 cedo.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    datasources: { db: { url: env.database.url } },
    log: env.isProduction
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
  });

prisma.$on?.('error', (event) => logger.error({ err: event }, 'Prisma error'));
if (!env.isProduction) {
  prisma.$on?.('warn', (event) => logger.warn({ msg: event.message }, 'Prisma warn'));
}

if (!env.isProduction) globalForPrisma.__prisma = prisma;

/** Encerramento gracioso (usado nos testes e no shutdown do servidor). */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

/** Traduz os erros mais comuns de conexão (Supabase, containers, rede). */
function explainDatabaseError(err) {
  const code = err?.code;
  const messages = {
    P1000: 'Falha de autenticação no banco. Confira usuário, senha (URL-encode!) e o ?sslmode=require.',
    P1001: 'Não foi possível alcançar o banco. Verifique host, porta e se o projeto Supabase está ativo.',
    P1002: 'O banco demorou para responder (timeout). Tente novamente — projetos Supabase podem estar "frios".',
    P1003: 'Banco não encontrado. Confira o nome do database na string de conexão.',
    P1010: 'Acesso negado: o usuário do banco não tem permissão nesta operação.',
    P1017: 'A conexão foi fechada pelo servidor (comum no pooler do Supabase após inatividade).',
  };
  return messages[code] || err?.message || 'Erro desconhecido ao conectar no banco.';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Espera o banco ficar disponível antes de subir a API.
 * Evita o clássico "API sobe, banco ainda está subindo" em Docker/CI e
 * absorve o cold start do Supabase.
 */
export async function waitForDatabase({
  retries = env.database.connectRetries,
  delayMs = env.database.connectRetryDelayMs,
} = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) {
        throw new Error(
          `Não consegui conectar no banco depois de ${retries} tentativas. ` +
            `${explainDatabaseError(err)}`,
        );
      }
      logger.warn(
        { attempt, retries, code: err?.code },
        `Banco indisponível (${explainDatabaseError(err)}) — tentando de novo em ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
  return false;
}

/** Avisa quando a URL aponta para o pooler de transação (limitações conhecidas). */
export function warnAboutPoolerOnce() {
  if (!env.database.isTransactionPooler) return;
  logger.warn(
    'DATABASE_URL parece usar o pooler de TRANSAÇÃO (porta 6543/pgbouncer). ' +
      'Use ?pgbouncer=true, rode as migrações pela conexão direta (5432) e ' +
      'evite transações longas — o app usa transações interativas na correção de simulados.',
  );
}

export default prisma;
