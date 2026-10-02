import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma, disconnectPrisma, waitForDatabase, warnAboutPoolerOnce } from './database/prisma.js';

const app = createApp();

/**
 * Só passa a receber requisições depois de confirmar que o banco responde.
 * Isso evita 500 intermináveis quando o container sobe antes do Postgres
 * (ou quando o projeto Supabase está acordando).
 */
async function start() {
  warnAboutPoolerOnce();
  await waitForDatabase();

  const server = app.listen(env.server.port, '0.0.0.0', () => {
    logger.info(
      {
        port: env.server.port,
        env: env.NODE_ENV,
        api: `http://0.0.0.0:${env.server.port}${env.server.apiPrefix}`,
        web: env.server.webUrl,
      },
      '🚀 Arena Estudos API no ar',
    );
  });

  server.on('error', (err) => {
    logger.error({ err }, 'Falha ao subir o servidor HTTP');
    process.exit(1);
  });

  return server;
}

let server;
try {
  server = await start();
} catch (err) {
  logger.fatal({ reason: err?.message }, '❌ Não foi possível iniciar a API');
  await disconnectPrisma().catch(() => {});
  process.exit(1);
}

/**
 * Encerramento gracioso: para de receber requisições, fecha conexões
 * HTTP e desconecta o Prisma. Evita perder dados em deploy.
 */
function shutdown(signal) {
  logger.info({ signal }, 'Encerrando servidor...');
  server.close(async () => {
    await disconnectPrisma().catch(() => {});
    logger.info('Conexões fechadas. Até logo!');
    process.exit(0);
  });

  // Se alguma requisição travar, não ficamos presos para sempre.
  setTimeout(() => process.exit(1), 15000).unref();
}

['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promise rejeitada sem tratamento');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Exceção não capturada — encerrando');
  shutdown('uncaughtException');
});

// Mantém a conexão viva para healthchecks de orquestradores.
void prisma;

export { app, server };
