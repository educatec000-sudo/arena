process.env.NODE_ENV = 'development';
const { prisma, disconnectPrisma } = await import('./src/database/prisma.js');
const user = await prisma.user.findFirstOrThrow();
const service = await import('./src/modules/gamification/gamification.service.js');
try {
  const data = await service.getGamification(user.id);
  console.log('OK', JSON.stringify(data).slice(0, 200));
} catch (err) {
  console.log('ERRO:', err.constructor.name);
  console.log(err.message.slice(0, 1200));
}
await disconnectPrisma();
process.exit(0);
