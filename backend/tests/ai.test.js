import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp, teardown } from './helpers/api.js';
import { cleanDatabase, createSubject, createQuestion, prisma } from './helpers/db.js';
import { request } from './helpers/http.js';
import { encrypt } from '../src/shared/crypto.js';
import { buildProviderChain, marcarRepouso, limparRepouso } from '../src/modules/ai/ai.service.js';

let app;
let token;
let userId;
let subject;

/** Resposta falsa no formato da API da OpenAI (usada por vários provedores). */
function fakeChatResponse(text) {
  return {
    id: 'chatcmpl-test',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** Grava uma chave cifrada de teste (como o app faria pela tela de IA). */
async function saveFakeKey(providerKey, apiKey = 'sk-teste-local-1234567890') {
  const provider = await prisma.aiProvider.findUniqueOrThrow({ where: { key: providerKey } });
  await prisma.aiUserCredential.upsert({
    where: { userId_providerId: { userId, providerId: provider.id } },
    create: { userId, providerId: provider.id, apiKeyEnc: encrypt(apiKey), model: 'mock-model', isEnabled: true },
    update: { apiKeyEnc: encrypt(apiKey), model: 'mock-model', isEnabled: true },
  });
}

beforeAll(async () => {
  app = buildApp();
  await cleanDatabase();
  const res = await request(app).post('/api/auth/register').send({
    name: 'IA', email: 'ia@arena.test', password: 'Senha@123', confirmPassword: 'Senha@123',
  });
  token = res.body.data.tokens.accessToken;
  userId = res.body.data.user.id;

  subject = await createSubject('AIA');
});

  /** Cria um usuário novo (para não misturar com as credenciais dos outros testes). */
  async function novoUsuario(nome) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: nome, email: `${nome}@arena.test`, password: 'Senha@123', confirmPassword: 'Senha@123' });
    return res.body.data.tokens.accessToken;
  }

  async function salvarChave(token, providerKey) {
    await request(app)
      .post('/api/ai/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: providerKey, apiKey: 'sk-teste-local-1234567890' });
  }

/**
 * Resposta da IA com N questões no formato pedido pelo gerador.
 * O `tag` existe para os enunciados não se repetirem entre os testes:
 * o gerador descarta o que já está no banco (filtro anti-duplicidade).
 */
/**
 * Enunciados falsos por lote. Cada lote usa frases próprias: se dois lotes
 * compartilhassem o texto (mudando só o assunto no final), o filtro
 * anti-duplicidade os consideraria repetidos — e estaria certo.
 */
const LOTE_A = [
  'O controle externo é exercido pelo Poder Legislativo com o auxílio do Tribunal de Contas.',
  'A crase ocorre na fusão da preposição com o artigo feminino.',
  'A licitação na modalidade pregão admite lances verbais e sucessivos dos participantes.',
];
const LOTE_B = [
  'O Regimento Interno disciplina o funcionamento das comissões permanentes da Casa.',
  'O ato administrativo vinculado não deixa margem de conveniência para o gestor público.',
];
const LOTE_D = [
  'A improbidade administrativa pode gerar a suspensão dos direitos políticos do agente.',
  'A despesa pública depende de autorização legislativa prévia na lei orçamentária anual.',
  'O servidor estável só perde o cargo por sentença judicial transitada em julgado.',
  'A moralidade administrativa é princípio expresso no caput do artigo 37 da Constituição.',
];
const LOTE_E = [
  'O pregão eletrônico é modalidade de licitação destinada a bens e serviços comuns.',
  'A dispensa de licitação por emergência exige motivação formalizada no processo.',
];
const LOTE_G = [
  'O princípio da publicidade exige divulgação oficial dos atos administrativos.',
  'A responsabilidade civil do Estado por omissão é subjetiva na jurisprudência.',
];
const LOTE_F = [
  'O poder de polícia limita direitos individuais em favor do interesse público primário.',
];

function fakeQuestionsJson(count, frases = LOTE_A) {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      enunciado: `${frases[i % frases.length]} Assinale a alternativa correta.`,
      alternativas: ['Alt A', 'Alt B', 'Alt C', 'Alt D', 'Alt E'],
      correta: 2,
      comentario: 'Comentário',
      analise: 'Análise',
      ref: 'Art. 1º',
    })),
  );
}

afterAll(async () => {
  await cleanDatabase();
  await teardown();
});

describe('Módulo de IA (sempre chamado pelo backend)', () => {
  it('lista os provedores sem expor nenhuma chave', async () => {
    const res = await request(app).get('/api/ai/providers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(JSON.stringify(res.body)).not.toContain('apiKeyEnc');
  });

  it('responde o chat usando o provedor e grava o histórico', async () => {
    await saveFakeKey('openai');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse('Resposta simulada do provedor.')),
      }),
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'Explique a CF/88' }], provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toContain('simulada');

    const history = await request(app).get('/api/ai/conversations').set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it('traduz erro do provedor em 502 padronizado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'chave inválida' } }),
      }),
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'oi' }], provider: 'openai' });

    expect(res.status).toBe(502);
    expect(res.body.error.message).toContain('chave inválida');

    vi.unstubAllGlobals();
  });

  it('recusa usar IA quando nenhum provedor tem chave configurada', async () => {
    // Usuário novo, sem credencial nenhuma: não há para quem cair.
    const tokenSemChave = await novoUsuario('semchave');
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${tokenSemChave}`)
      .send({ messages: [{ role: 'user', content: 'Olá' }], provider: 'anthropic' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/chave de IA/i);
  });

  it('exige autenticação para usar IA', async () => {
    const res = await request(app).post('/api/ai/chat').send({ messages: [] });
    expect(res.status).toBe(401);
  });

  it('valida o payload do chat', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'role-invalido', content: 'oi' }] });
    expect(res.status).toBe(422);
  });

  it('gera questões com IA, grava no banco e marca a alternativa correta', async () => {
    await saveFakeKey('openai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse(fakeQuestionsJson(3, LOTE_A))),
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 3, difficulty: 'MEDIA', provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(3);

    const bank = await prisma.question.count({ where: { origin: 'AI' } });
    expect(bank).toBe(3);

    const saved = await prisma.question.findFirst({
      where: { origin: 'AI' },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    expect(saved.options).toHaveLength(5);
    expect(saved.options.filter((o) => o.isCorrect)).toHaveLength(1);
    expect(saved.options.find((o) => o.isCorrect).label).toBe('C');

    vi.unstubAllGlobals();
  });

  it('aceita JSON envolvido em ```json ou com texto em volta', async () => {
    await saveFakeKey('openai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(fakeChatResponse(`Claro!\n\n\`\`\`json\n${fakeQuestionsJson(2, LOTE_B)}\n\`\`\`\n\nEspero ajudar.`)),
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 2, provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);

    vi.unstubAllGlobals();
  });

  it('devolve 502 quando a IA não responde em JSON', async () => {
    await saveFakeKey('openai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse('Desculpe, não consegui gerar.')),
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 2, provider: 'openai' });

    expect(res.status).toBe(502);

    vi.unstubAllGlobals();
  });

  it('monta o simulado com AS questões que a IA acabou de gerar', async () => {
    await saveFakeKey('openai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse(fakeQuestionsJson(4, LOTE_D))),
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-simulado')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectIds: [subject.id], count: 4, durationMinutes: 20, provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.questionCount).toBe(4);
    expect(res.body.data.mode).toBe('AI');

    // As questões da prova precisam ser exatamente as geradas (origem AI).
    const detail = await request(app)
      .get(`/api/simulados/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.questions).toHaveLength(4);
    expect(detail.body.data.questions.every((q) => q.origin === 'AI')).toBe(true);

    vi.unstubAllGlobals();
  });

  // ------------------------------------------------- anti-duplicidade -------

  it('não grava no banco uma questão que a IA repetiu', async () => {
    await saveFakeKey('openai');

    // 1 repetida (já criada no teste "lote-a") + 2 novas
    const repetida = JSON.parse(fakeQuestionsJson(1, LOTE_A))[0];
    const novas = JSON.parse(fakeQuestionsJson(2, LOTE_E));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse(JSON.stringify([repetida, ...novas]))),
      }),
    );

    const antes = await prisma.question.count({ where: { origin: 'AI' } });

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 3, provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.duplicates).toHaveLength(1);
    // só as 2 novas entraram no banco
    expect(await prisma.question.count({ where: { origin: 'AI' } })).toBe(antes + 2);

    vi.unstubAllGlobals();
  });

  it('devolve 409 quando a IA só repete o que já existe', async () => {
    await saveFakeKey('openai');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse(fakeQuestionsJson(2, LOTE_A))),
      }),
    );

    const antes = await prisma.question.count({ where: { origin: 'AI' } });

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 2, provider: 'openai' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/já existem no seu banco/i);
    // nada foi gravado
    expect(await prisma.question.count({ where: { origin: 'AI' } })).toBe(antes);

    vi.unstubAllGlobals();
  });

  it('descarta repetidas dentro do mesmo lote', async () => {
    await saveFakeKey('openai');
    const unica = JSON.parse(fakeQuestionsJson(1, LOTE_F))[0];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeChatResponse(JSON.stringify([unica, unica, unica]))),
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 3, provider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.skipped).toBe(2);

    vi.unstubAllGlobals();
  });

  it('troca sozinho o modelo quando o provedor aposenta o dele', async () => {
    await saveFakeKey('gemini');

    /*
     * Simula o caso real de 2026: o Google tirou o gemini-2.0-flash do ar.
     * O app deve perguntar quais modelos existem hoje e repetir a chamada.
     */
    const chamadas = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const alvo = String(url);
        chamadas.push(alvo);

        if (alvo.includes('/models?')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [
                { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
              ],
            }),
            text: async () => '{}',
          };
        }

        if (alvo.includes('gemini-2.0-flash')) {
          return {
            ok: false,
            status: 404,
            text: async () =>
              JSON.stringify({
                error: {
                  message:
                    'This model models/gemini-2.0-flash is no longer available. ' +
                    'Please update your code to use models/gemini-3.8-flash.',
                },
              }),
          };
        }

        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Resposta nova.' }] } }] }),
        };
      }),
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'Oi' }], provider: 'gemini', model: 'gemini-2.0-flash' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Resposta nova.');
    // consultou a lista de modelos e refez a chamada com o mais novo
    expect(chamadas.some((u) => u.includes('/models?'))).toBe(true);
    expect(chamadas.some((u) => u.includes('gemini-3.8-flash') && !u.includes('tts'))).toBe(true);

    // e grava o novo padrão para não precisar descobrir de novo
    const providerRecord = await prisma.aiProvider.findUnique({ where: { key: 'gemini' } });
    expect(providerRecord.defaultModel).toBe('gemini-3.8-flash');

    vi.unstubAllGlobals();
  });

  // ------------------------------------------------- rodízio de provedores --

  it('monta a fila de provedores: o pedido primeiro, os outros depois', async () => {
    const token = await novoUsuario('fila');
    const user = (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.data;
    await salvarChave(token, 'gemini');
    await salvarChave(token, 'groq');
    await salvarChave(token, 'huggingface');

    const filaGemini = await buildProviderChain(user.id, 'gemini');
    expect(filaGemini[0]).toBe('gemini');
    expect(filaGemini).toEqual(expect.arrayContaining(['gemini', 'groq', 'huggingface']));

    const filaGroq = await buildProviderChain(user.id, 'groq');
    expect(filaGroq[0]).toBe('groq');
    // o provedor local (Ollama) nunca entra sozinho na fila
    expect(filaGroq).not.toContain('ollama');
  });

  it('manda o provedor que acabou de falhar para o fim da fila', async () => {
    const token = await novoUsuario('repouso');
    const user = (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body.data;
    await salvarChave(token, 'gemini');
    await salvarChave(token, 'groq');

    try {
      expect((await buildProviderChain(user.id, 'gemini'))[0]).toBe('gemini');
      marcarRepouso('gemini'); // acabou de dar "high demand"
      const fila = await buildProviderChain(user.id, 'gemini');
      expect(fila[0]).toBe('groq'); // vai direto para quem está saudável
      expect(fila[fila.length - 1]).toBe('gemini'); // mas não é esquecido
    } finally {
      limparRepouso('gemini');
    }
  });

  it('troca de provedor sozinho quando o escolhido está sobrecarregado', async () => {
    const token = await novoUsuario('failover');
    await salvarChave(token, 'gemini');
    await salvarChave(token, 'groq');

    const chamadas = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const alvo = String(url);
        chamadas.push(alvo);

        // Gemini responde "high demand" (o erro real que o usuário teve).
        if (alvo.includes('generativelanguage')) {
          return {
            ok: false,
            status: 429,
            text: async () =>
              JSON.stringify({
                error: {
                  message:
                    'This model is currently experiencing high demand. ' +
                    'Spikes in demand are usually temporary. Please try again later.',
                },
              }),
          };
        }

        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(fakeChatResponse('Resposta do Groq.')),
        };
      }),
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'Oi' }], provider: 'gemini' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Resposta do Groq.');
    expect(res.body.data.provider).toBe('groq');
    expect(res.body.data.fallback.from).toBe('gemini');
    expect(res.body.data.fallback.attempts[0].provider).toBe('gemini');
    expect(chamadas.some((u) => u.includes('generativelanguage'))).toBe(true);
    expect(chamadas.some((u) => u.includes('api.groq.com'))).toBe(true);

    vi.unstubAllGlobals();
  });

  it('avisa quando TODOS os provedores falham, listando o que foi tentado', async () => {
    const token = await novoUsuario('tudosfalham');
    await salvarChave(token, 'gemini');
    await salvarChave(token, 'groq');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'Service unavailable' } }),
      })),
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'Oi' }], provider: 'gemini' });

    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/Tentei todos os provedores/i);
    expect(res.body.error.details.attempts.length).toBeGreaterThanOrEqual(2);

    vi.unstubAllGlobals();
  });

  it('o rodízio também vale para gerar questões', async () => {
    const token = await novoUsuario('gerar');
    await salvarChave(token, 'gemini');
    await salvarChave(token, 'groq');

    let groqChamado = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('generativelanguage')) {
          return {
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: { message: 'Resource exhausted.' } }),
          };
        }
        groqChamado += 1;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(fakeChatResponse(fakeQuestionsJson(2, LOTE_G))),
        };
      }),
    );

    const res = await request(app)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ subjectId: subject.id, count: 2, provider: 'gemini' });

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.provider).toBe('groq');
    expect(groqChamado).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it('nunca devolve a chave salva para o frontend', async () => {
    await saveFakeKey('openai', 'sk-super-secreta-1234567890');
    const res = await request(app).get('/api/ai/providers').set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(res.body)).not.toContain('sk-super-secreta-1234567890');
    expect(JSON.stringify(res.body)).not.toContain('apiKeyEnc');
  });
});
