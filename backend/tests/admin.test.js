import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, uniqueEmail, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;
let adminToken;
let alunoToken;

async function register(name, email) {
  const res = await request(app).post('/api/auth/register').send({
    name, email, password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  return res.body.data;
}

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  // O seed cria o ADMIN; aqui promovemos um usuário de teste.
  const admin = await register('Admin Teste', 'admin.teste@arena.test');
  await prisma.user.update({
    where: { id: admin.user.id },
    data: { role: { connect: { name: 'ADMIN' } } },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin.teste@arena.test', password: 'Senha@123' });
  adminToken = login.body.data.tokens.accessToken;

  alunoToken = (await register('Aluno Simples', 'simples@arena.test')).tokens.accessToken;
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Permissões e administração', () => {
  it('ALUNO não acessa o painel administrativo', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(403);
  });

  it('ADMIN acessa o painel administrativo', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users.total).toBeGreaterThan(0);
  });

  it('ADMIN lista e filtra usuários', async () => {
    const res = await request(app).get('/api/admin/users?limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('ADMIN promove usuário a EDITOR', async () => {
    const aluno = await prisma.user.findUniqueOrThrow({ where: { email: 'simples@arena.test' } });
    const res = await request(app)
      .patch(`/api/admin/users/${aluno.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'EDITOR' });
    expect(res.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: aluno.id }, include: { role: true } });
    expect(after.role.name).toBe('EDITOR');
  });

  it('ADMIN bloqueia usuário e revoga sessões', async () => {
    const aluno = await prisma.user.findUniqueOrThrow({ where: { email: 'simples@arena.test' } });
    const res = await request(app)
      .post(`/api/admin/users/${aluno.id}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'teste' });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'simples@arena.test', password: 'Senha@123' });
    expect(login.status).toBe(403);
  });

  it('ADMIN desbloqueia usuário', async () => {
    const aluno = await prisma.user.findUniqueOrThrow({ where: { email: 'simples@arena.test' } });
    const res = await request(app)
      .post(`/api/admin/users/${aluno.id}/unblock`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'simples@arena.test', password: 'Senha@123' });
    expect(login.status).toBe(200);
  });

  it('registra auditoria em cada ação administrativa', async () => {
    const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: 'admin.user.' } } });
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });

  it('ADMIN remove usuário (soft delete)', async () => {
    const email = uniqueEmail();
    const created = await register('Removível', email);
    const res = await request(app)
      .delete(`/api/admin/users/${created.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: created.user.id } });
    expect(after.isActive).toBe(false);
  });

  it('ADMIN não pode remover a si mesmo', async () => {
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app)
      .delete(`/api/admin/users/${me.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('endpoints de admin exigem autenticação', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});
