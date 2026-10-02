import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, createQuestion, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';
import simuladosService from '../src/modules/simulados/simulados.service.js';

let app;
let token;
let userId;

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  const res = await request(app).post('/api/auth/register').send({
    name: 'Simulado', email: 'simulado@arena.test', password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  token = res.body.data.tokens.accessToken;
  userId = res.body.data.user.id;

  const subject = await createSubject('SIM');
  for (let i = 0; i < 6; i += 1) await createQuestion(subject.id, i % 4);
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Simulados', () => {
  it('cria simulado com questões sorteadas', async () => {
    const res = await request(app)
      .post('/api/simulados')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Simulado de teste',
        mode: 'RANDOM',
        questionCount: 5,
        durationMinutes: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.questions.length).toBe(5);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('não entrega o gabarito junto com o simulado', async () => {
    const { body } = await request(app)
      .post('/api/simulados')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'RANDOM', questionCount: 3, durationMinutes: 10 });
    expect(JSON.stringify(body)).not.toContain('"isCorrect":true');
  });

  it('salva respostas sem revelar se estão certas (modo final)', async () => {
    const simulado = await prisma.simulado.findFirstOrThrow({
      where: { userId },
      include: { questions: true },
    });

    const res = await request(app)
      .post(`/api/simulados/${simulado.id}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId: simulado.questions[0].questionId, chosenLabel: 'A' });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('isCorrect');
  });

  it('corrige o simulado, calcula a nota e encerra', async () => {
    const simulado = await prisma.simulado.findFirstOrThrow({
      where: { userId },
      include: { questions: { include: { question: { include: { options: true } } } } },
    });

    // Acerta tudo: o servidor guarda o gabarito no snapshot (nem que as
    // alternativas tenham sido embaralhadas).
    for (const item of simulado.questions) {
      const source = item.optionsSnapshot?.length ? item.optionsSnapshot : item.question.options;
      const correct = source.find((option) => option.isCorrect);
      const response = await request(app)
        .post(`/api/simulados/${simulado.id}/answer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId: item.questionId, chosenLabel: correct.label });
      expect(response.status).toBe(200);
    }

    const finish = await request(app)
      .post(`/api/simulados/${simulado.id}/finish`)
      .set('Authorization', `Bearer ${token}`);

    expect(finish.status).toBe(200);
    expect(finish.body.data.status).toBe('FINISHED');
    expect(finish.body.data.result.correct).toBe(simulado.questions.length);
    expect(finish.body.data.result.percent).toBe(100);
  });

  it('impede responder simulado já concluído', async () => {
    const simulado = await prisma.simulado.findFirstOrThrow({
      where: { userId, status: 'FINISHED' },
      include: { questions: true },
    });
    const res = await request(app)
      .post(`/api/simulados/${simulado.id}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId: simulado.questions[0].questionId, chosenLabel: 'A' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('lista o histórico com o resultado', async () => {
    const res = await request(app)
      .get('/api/simulados?status=FINISHED')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('gera simulado a partir dos erros do aluno', async () => {
    const question = await prisma.question.findFirstOrThrow();
    await prisma.errorNotebookItem.create({
      data: { userId, questionId: question.id },
    });

    const generated = await simuladosService.createFromErrors(userId, {
      questionCount: 1,
      durationMinutes: 10,
    });
    expect(generated.questions.length).toBeGreaterThan(0);
  });

  it('impede que outro usuário acesse simulado alheio', async () => {
    const other = await request(app).post('/api/auth/register').send({
      name: 'Outro', email: 'outro@arena.test', password: 'Senha@123', confirmPassword: 'Senha@123',
    });
    const simulado = await prisma.simulado.findFirstOrThrow({ where: { userId } });
    const res = await request(app)
      .get(`/api/simulados/${simulado.id}`)
      .set('Authorization', `Bearer ${other.body.data.tokens.accessToken}`);
    expect(res.status).toBe(404);
  });
});
