import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Prepara o schema do banco de testes antes de rodar a suíte.
 * Usamos `db push` porque o schema de teste é descartável — não precisamos
 * do histórico de migrations, apenas da estrutura atual.
 */
export async function setup() {
  // O .env vive na raiz do monorepo.
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'Defina DATABASE_URL_TEST no .env para rodar os testes (banco separado do de desenvolvimento).',
    );
  }

  process.env.DATABASE_URL = url;
  process.env.LOG_LEVEL = 'silent';
  process.env.PASSWORD_RESET_LOG_LINK = 'true';

  const run = (command) =>
    execSync(command, { cwd: ROOT, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });

  // Estrutura (descartável) + seed estrutural (roles, permissões, provedores).
  run('npx prisma db push --skip-generate --accept-data-loss');
  run('node prisma/seed/index.js');
}

export async function teardown() {}
