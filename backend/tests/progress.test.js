import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, createQuestion, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;
let token;
let userId;
let questionA; // gabarito "A"
let questionB; // gabarito "B"

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  const res = await request(app).post('/api/auth/register').send({
    name: 'Aluno Progresso', email: 'progresso@arena.test', password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  token = res.body.data.tokens.accessToken;
  userId = res.body.data.user.id;

  const subject = await createSubject('PG');
  questionA = await createQuestion(subject.id, 0);
  questionB = await createQuestion(subject.id, 1);
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Respostas e progresso', () => {
  it('registra uma resposta correta e devolve o gabarito', async () => {
    const res = await request(app)
      .post('/api/progress/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({
        questionId: questionA.id,
        chosenOptionId: questionA.options[0].id,
        timeSpentSeconds: 30,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.isCorrect).toBe(true);
    expect(res.body.data.correctLabel).toBe('A');
  });

  it('registra resposta errada e joga a questão no caderno de erros', async () => {
    const res = await request(app)
      .post('/api/progress/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId: questionB.id, chosenLabel: 'A', timeSpentSeconds: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.isCorrect).toBe(false);

    const entry = await prisma.errorNotebookItem.findFirst({
      where: { userId, questionId: questionB.id },
    });
    expect(entry).toBeTruthy();
  });

  it('recusa alternativa que não pertence à questão', async () => {
    const res = await request(app)
      .post('/api/progress/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId: questionA.id, chosenOptionId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
  });

  it('calcula o desempenho: 1 acerto em 2 = 50%', async () => {
    const res = await request(app).get('/api/progress/report').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.overview.totalAnswered).toBe(2);
    expect(res.body.data.overview.accuracy).toBeCloseTo(50, 1);
  });

  it('agrupa o desempenho por dificuldade', async () => {
    const res = await request(app).get('/api/progress/by-difficulty').set('Authorization', `Bearer ${token}`);
    const media = res.body.data.find((item) => item.difficulty === 'MEDIA');
    expect(media.answered).toBe(2);
    expect(media.correct).toBe(1);
  });

  it('o dashboard devolve contadores e fila de revisão', async () => {
    const res = await request(app).get('/api/progress/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.overview.totalAnswered).toBe(2);
    expect(res.body.data.counters.pendingReviews).toBeGreaterThan(0);
    expect(res.body.data.counters.errorNotebook).toBe(1);
  });

  it('a fila de revisão devolve os ids priorizados', async () => {
    const res = await request(app).get('/api/progress/review-queue').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questionIds.length).toBeGreaterThan(0);
    expect(res.body.data.questionIds).toContain(questionB.id);
  });

  it('permite marcar o erro como resolvido', async () => {
    const res = await request(app)
      .patch(`/api/error-notebook/${questionB.id}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ resolved: true });
    expect(res.status).toBe(200);

    const after = await prisma.errorNotebookItem.findFirst({
      where: { userId, questionId: questionB.id },
    });
    expect(after.resolvedAt).toBeTruthy();
  });

  it('favoritar duas vezes alterna o estado (toggle)', async () => {
    const first = await request(app)
      .post(`/api/favorites/${questionA.id}/toggle`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);

    const list = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    const ids = (list.body.data.items ?? list.body.data).map((item) => item.questionId ?? item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agenda as revisões no esquema Leitner (errada hoje, certa amanhã)', async () => {
    const res = await request(app)
      .get('/api/progress/review-schedule')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const schedule = res.body.data;
    expect(schedule.scheduled).toBe(2); // as duas questões respondidas
    expect(schedule.byBox.length).toBeGreaterThan(0);

    // A questão errada volta para a caixa 0 → revisar hoje.
    expect(schedule.dueToday).toBeGreaterThanOrEqual(1);
    expect(schedule.questionIds).toContain(questionB.id);

    const box0 = schedule.byBox.find((item) => item.box === 0);
    expect(box0?.intervalDays).toBe(0);
  });

  it('não permite responder em nome de outro usuário', async () => {
    const other = await request(app).post('/api/auth/register').send({
      name: 'Outro Aluno', email: 'outro.aluno@arena.test', password: 'Senha@123', confirmPassword: 'Senha@123',
    });
    const res = await request(app)
      .get('/api/progress/report')
      .set('Authorization', `Bearer ${other.body.data.tokens.accessToken}`);
    expect(res.body.data.overview.totalAnswered).toBe(0);
  });
});
