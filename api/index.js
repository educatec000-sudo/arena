/**
 * Entrada da API na Vercel (função serverless).
 *
 * Aqui não existe `app.listen`: o próprio Express já é uma função `(req, res)`,
 * e é exatamente isso que o runtime Node da Vercel entrega. Então a "tomada"
 * serverless é só repassar a chamada — sem adaptador nenhum.
 *
 * (Não usamos `serverless-http` de propósito: ele é para o formato de evento da
 * AWS. Na Vercel ele só atrapalharia.)
 *
 * Rotas: ver `vercel.json` — tudo que vem de /api/* cai aqui.
 */
import { createApp } from '../backend/src/app.js';
import { prisma } from '../backend/src/database/prisma.js';
import { logger } from '../backend/src/config/logger.js';

/**
 * A instância da função é reaproveitada entre requisições (função quente),
 * então o app é montado uma única vez por cold start.
 */
let appPromise = null;

async function buildApp() {
  // Aquece o pool do Postgres no cold start. Se falhar, não bloqueia:
  // o Prisma reconecta sozinho na próxima query.
  await prisma.$queryRaw`SELECT 1`.catch(() => {});
  return createApp();
}

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      appPromise = null; // permite tentar de novo na próxima invocação
      logger.error({ err: err?.message }, 'Falha ao preparar a API na Vercel');
      throw err;
    });
  }

  const app = await appPromise;
  return app(req, res);
}
