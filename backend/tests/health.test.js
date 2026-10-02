import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { request } from './helpers/http.js';
import { cleanDatabase } from './helpers/db.js';

let app;

beforeAll(() => {
  app = buildApp();
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Respostas padronizadas e saúde da API', () => {
  it('responde /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responde /api/health com o status do banco', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });

  it('devolve 404 padronizado para rota inexistente', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty('code');
  });

  it('aplica headers de segurança (Helmet)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
