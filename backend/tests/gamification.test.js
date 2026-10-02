import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, createQuestion, uniqueEmail, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;
let alunoToken;
let alunoId;
let subject;
let question;

async function registerAluno(name) {
  const email = uniqueEmail();
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Senha@123', confirmPassword: 'Senha@123' });
  return { token: res.body.data.tokens.accessToken, userId: res.body.data.user.id };
}

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  const aluno = await registerAluno('Ana Gama');
  alunoToken = aluno.token;
  alunoId = aluno.userId;

  subject = await createSubject('GAM');
  question = await createQuestion(subject.id, 0);

  // Marca uma conquista manualmente para testar o payload de /me
  const achievement = await prisma.achievement.findFirstOrThrow({ where: { code: 'first-steps' } });
  await prisma.userAchievement.create({
    data: { userId: alunoId, achievementId: achievement.id },
  });
});

afterAll(async () => {
  await teardown();
});

describe('Gamificação', () => {
  it('exige autenticação em /gamification/me', async () => {
    const res = await request(app).get('/api/gamification/me');
    expect(res.status).toBe(401);
  });

  it('devolve XP, nível, contadores e conquistas do usuário', async () => {
    const res = await request(app)
      .get('/api/gamification/me')
      .set('Authorization', `Bearer ${alunoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      xp: expect.any(Number),
      level: expect.any(Number),
      nextLevel: expect.objectContaining({ need: expect.any(Number) }),
      counters: expect.objectContaining({ answers: 0, correct: 0, streak: expect.any(Number) }),
    });
    expect(Array.isArray(res.body.data.achievements)).toBe(true);
    expect(res.body.data.achievements.length).toBeGreaterThan(0);
    const unlockable = res.body.data.achievements.find((a) => a.code === 'first-steps');
    expect(unlockable.unlocked).toBe(true);
    expect(unlockable.unlockedAt).toBeTruthy();
  });

  it('responde corretas e gera XP ao responder questões', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post('/api/progress/answer')
        .set('Authorization', `Bearer ${alunoToken}`)
        .send({ questionId: question.id, chosenLabel: 'A', timeSpentSeconds: 12 });
      expect(res.status).toBe(200);
    }

    const res = await request(app)
      .get('/api/gamification/me')
      .set('Authorization', `Bearer ${alunoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.counters.answers).toBe(3);
    expect(res.body.data.counters.correct).toBe(3);
    expect(res.body.data.xp).toBeGreaterThan(0);
  });
});

describe('Ranking', () => {
  it('lista o ranking mascarando o nome dos participantes', async () => {
    const outro = await registerAluno('Beatriz Camargo');
    await request(app)
      .post('/api/progress/answer')
      .set('Authorization', `Bearer ${outro.token}`)
      .send({ questionId: question.id, chosenLabel: 'A', timeSpentSeconds: 8 });

    const res = await request(app)
      .get('/api/gamification/ranking?period=30d&limit=10')
      .set('Authorization', `Bearer ${alunoToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe('30d');
    expect(res.body.data.ranking.length).toBeGreaterThanOrEqual(2);

    const [first] = res.body.data.ranking;
    expect(first.position).toBe(1);
    expect(first.xp).toBeGreaterThan(0);
    expect(first).not.toHaveProperty('email');
    // nome mascarado: "Ana S." / "Beatriz C."
    expect(first.name).toMatch(/^[^ ]+ [A-Z]\.$/);
  });

  it('rejeita período inválido', async () => {
    const res = await request(app)
      .get('/api/gamification/ranking?period=10y')
      .set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(422);
  });
});
