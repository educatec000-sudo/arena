import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// A raiz tem que ser esta pasta. Sem isso o Vitest sobe até a raiz do monorepo
// e, por causa do symlink node_modules/@arena/frontend, acaba coletando os
// testes do frontend também (que precisam de jsdom e quebram no ambiente node).
const aqui = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: aqui,
  // ...mas o .env continua sendo o da raiz do monorepo.
  envDir: resolve(aqui, '..'),
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    environment: 'node',
    globals: true,
    globalSetup: ['./tests/global-setup.js'],
    // Um banco por vez: os testes compartilham o schema de teste.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/config/**'],
    },
  },
});
