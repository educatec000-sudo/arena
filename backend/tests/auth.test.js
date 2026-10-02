import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, uniqueEmail, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Autenticação', () => {
  it('cadastra um novo usuário e devolve tokens', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({
      name: 'Aluno Teste',
      email,
      password: 'Senha@123',
      confirmPassword: 'Senha@123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.headers['set-cookie'].join('|')).toContain('HttpOnly');
  });

  it('rejeita e-mail duplicado', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      name: 'Primeiro', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Segundo', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    expect(res.status).toBe(409);
  });

  it('rejeita senha fraca', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Fraco', email: uniqueEmail(), password: '123', confirmPassword: '123',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('faz login e acessa rota protegida', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      name: 'Login Teste', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
    expect(login.status).toBe(200);
    const { accessToken } = login.body.data.tokens;

    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });

  it('bloqueia acesso sem token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('recusa senha errada', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      name: 'Erro', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    const res = await request(app).post('/api/auth/login').send({ email, password: 'Errada@123' });
    expect(res.status).toBe(401);
  });

  it('renova o access token com o refresh token', async () => {
    const email = uniqueEmail();
    const registered = await request(app).post('/api/auth/register').send({
      name: 'Refresh', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    const cookie = (registered.headers['set-cookie'] || []).find((item) => item.startsWith('arena_rt'));
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.tokens.accessToken).toBeTruthy();
  });

  it('faz logout e invalida o refresh token', async () => {
    const email = uniqueEmail();
    const registered = await request(app).post('/api/auth/register').send({
      name: 'Logout', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });
    const cookie = (registered.headers['set-cookie'] || []).find((item) => item.startsWith('arena_rt'));
    const token = registered.body.data.tokens.accessToken;

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie.split(';')[0]);
    expect(logout.status).toBe(200);

    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]);
    expect(reuse.status).toBe(401);
  });

  it('gera token de recuperação de senha e a redefinição funciona', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({
      name: 'Recupera', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200); // nunca revela se o e-mail existe

    // Fora de produção o link volta na resposta (em produção, só por e-mail).
    const link = forgot.body.data.devLink;
    expect(link).toBeTruthy();
    const token = new URL(link).searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NovaSenha@123',
      confirmPassword: 'NovaSenha@123',
    });
    expect(reset.status).toBe(200);

    const reuse = await request(app).post('/api/auth/reset-password').send({
      token, password: 'Outra@123', confirmPassword: 'Outra@123',
    });
    expect(reuse.status).toBe(400); // link de uso único

    const login = await request(app).post('/api/auth/login').send({ email, password: 'NovaSenha@123' });
    expect(login.status).toBe(200);

    const old = await request(app).post('/api/auth/login').send({ email, password: 'Senha@123' });
    expect(old.status).toBe(401);
  });

  it('não aceita e-mail inexistente na recuperação sem vazar a informação', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nao-existe@arena.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.devLink).toBeUndefined();
  });

  it('não devolve o hash da senha em nenhuma resposta', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({
      name: 'Seguro', email, password: 'Senha@123', confirmPassword: 'Senha@123',
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
