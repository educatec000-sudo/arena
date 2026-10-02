import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, createQuestion, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';

let app;
let editorToken;
let alunoToken;

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();

  const emailEditor = 'editor@arena.test';
  const emailAluno = 'aluno@arena.test';

  const editorRes = await request(app).post('/api/auth/register').send({
    name: 'Editor', email: emailEditor, password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  editorToken = editorRes.body.data.tokens.accessToken;

  const alunoRes = await request(app).post('/api/auth/register').send({
    name: 'Aluno', email: emailAluno, password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  alunoToken = alunoRes.body.data.tokens.accessToken;

  // Promove o editor (o seed já garante a role EDITOR).
  await prisma.user.update({
    where: { email: emailEditor },
    data: { role: { connect: { name: 'EDITOR' } } },
  });

  const subject = await createSubject('QQ');
  for (let i = 0; i < 4; i += 1) {
    await createQuestion(subject.id, i % 4);
  }
});

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Banco de questões', () => {
  it('lista questões paginadas', async () => {
    const res = await request(app).get('/api/questions?page=1&limit=3').set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('sorteia questões sem repetir e sem vazar o gabarito antes da resposta', async () => {
    const res = await request(app)
      .get('/api/questions/session?limit=4')
      .set('Authorization', `Bearer ${alunoToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(res.body.data)).not.toContain('"isCorrect":true');
  });

  it('filtra por matéria e dificuldade', async () => {
    const res = await request(app)
      .get('/api/questions?subject=QQ&difficulty=dificil&limit=50')
      .set('Authorization', `Bearer ${alunoToken}`);
    expect(res.status).toBe(200);
  });

  it('permite que EDITOR crie questão', async () => {
    const subject = await prisma.subject.findFirstOrThrow();
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        subjectId: subject.id,
        prompt: 'Questão criada por editor com mais de dez caracteres?',
        difficulty: 'FACIL',
        options: [
          { label: 'A', text: 'Correta', isCorrect: true },
          { label: 'B', text: 'Errada', isCorrect: false },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.options.length).toBe(2);
  });

  it('impede que ALUNO crie questão', async () => {
    const subject = await prisma.subject.findFirstOrThrow();
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${alunoToken}`)
      .send({
        subjectId: subject.id,
        prompt: 'Questão de aluno com mais de dez caracteres?',
        difficulty: 'FACIL',
        options: [{ label: 'A', text: 'A', isCorrect: true }],
      });
    expect(res.status).toBe(403);
  });

  it('valida questão sem alternativa correta', async () => {
    const subject = await prisma.subject.findFirstOrThrow();
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        subjectId: subject.id,
        prompt: 'Enunciado válido com mais de dez caracteres?',
        options: [
          { label: 'A', text: 'A', isCorrect: false },
          { label: 'B', text: 'B', isCorrect: false },
        ],
      });
    expect(res.status).toBe(422);
  });
});
