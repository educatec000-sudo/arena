import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

/** Cria o app Express uma única vez por suíte. */
export function buildApp() {
  return createApp();
}

/** Fecha a conexão do Prisma ao final dos testes. */
export async function teardown() {
  await prisma.$disconnect();
}
