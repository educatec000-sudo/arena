import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, uniqueEmail, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;
let adminToken;
let alunoToken;
let alunoId;
let subject;
let track;
let firstItemId;

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.tokens.accessToken;
}

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  subject = await createSubject('TRK');

  // Promovemos um usuário de teste a ADMIN (o seed é apagado pelo cleanDatabase).
  const adminEmail = uniqueEmail();
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Admin Trilhas', email: adminEmail, password: 'Senha@123', confirmPassword: 'Senha@123' });
  await prisma.user.update({
    where: { email: adminEmail },
    data: { role: { connect: { name: 'ADMIN' } } },
  });
  adminToken = await login(adminEmail, 'Senha@123');

  const alunoEmail = uniqueEmail();
  const alunoRes = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Aluno Trilhas', email: alunoEmail, password: 'Senha@123', confirmPassword: 'Senha@123' });
  alunoToken = alunoRes.body.data.tokens.accessToken;
  alunoId = alunoRes.body.data.user.id;

  // O seed cria trilhas; como os testes limpam o banco, recriamos uma aqui.
  const created = await request(app)
    .post('/api/study-tracks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: 'trilha-base-alepa',
      title: 'Trilha base — ALEPA',
      description: 'Ordem sugerida para iniciantes.',
    });
  track = created.body.data;
});

afterAll(async () => {
  await teardown();
});

describe('Trilhas de estudo (aluno)', () => {
  it('lista as trilhas com o progresso do usuário', async () => {
    const res = await request(app)
      .get('/api/study-tracks')
      .set('Authorization', `Bearer ${alunoToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((item) => item.slug === 'trilha-base-alepa');
    expect(found).toBeDefined();
    expect(found.progress).toMatchObject({
      total: expect.any(Number),
      completed: 0,
      percent: 0,
    });
  });

  it('impede que um aluno crie trilhas', async () => {
    const res = await request(app)
      .post('/api/study-tracks')
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({ slug: 'nao-autorizado', title: 'Não autorizado' });
    expect(res.status).toBe(403);
  });

  it('conclui e desmarca uma etapa, refletindo no progresso', async () => {
    const item = await request(app)
      .post(`/api/study-tracks/${track.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subjectId: subject.id, title: 'Língua Portuguesa — base', kind: 'SUBJECT' });
    expect(item.status).toBe(201);
    firstItemId = item.body.data.id;

    const complete = await request(app)
      .post(`/api/study-tracks/trilha-base-alepa/items/${firstItemId}/complete`)
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({ done: true });
    expect(complete.status).toBe(200);
    expect(complete.body.data.done).toBe(true);

    const list = await request(app)
      .get('/api/study-tracks')
      .set('Authorization', `Bearer ${alunoToken}`);
    const found = list.body.data.find((t) => t.slug === 'trilha-base-alepa');
    expect(found.progress.completed).toBe(1);
    expect(found.progress.percent).toBe(100);

    const uncheck = await request(app)
      .post(`/api/study-tracks/trilha-base-alepa/items/${firstItemId}/complete`)
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({ done: false });
    expect(uncheck.status).toBe(200);
    expect(uncheck.body.data.done).toBe(false);
  });

  it('abre os detalhes de uma trilha pelo slug', async () => {
    const res = await request(app)
      .get('/api/study-tracks/trilha-base-alepa')
      .set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('trilha-base-alepa');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('devolve 404 para slug inexistente', async () => {
    const res = await request(app)
      .get('/api/study-tracks/nao-existe')
      .set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(404);
  });

  it('grava o progresso uma única vez por etapa (idempotente)', async () => {
    await request(app)
      .post(`/api/study-tracks/trilha-base-alepa/items/${firstItemId}/complete`)
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({ done: true });
    await request(app)
      .post(`/api/study-tracks/trilha-base-alepa/items/${firstItemId}/complete`)
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({ done: true });

    const rows = await prisma.studyTrackProgress.findMany({ where: { userId: alunoId } });
    expect(rows.length).toBeLessThanOrEqual(1);
  });
});

describe('Trilhas de estudo (admin)', () => {
  it('valida o payload na criação', async () => {
    const res = await request(app)
      .post('/api/study-tracks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: '' });
    expect(res.status).toBe(422);
  });

  it('remove a trilha criada', async () => {
    const res = await request(app)
      .delete(`/api/study-tracks/${track.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
