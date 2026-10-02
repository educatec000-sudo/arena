import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { decrypt, encrypt } from '../../shared/crypto.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getProvider, FREE_PROVIDERS, PROVIDER_KEYS } from './providers/index.js';
import { filterDuplicates } from './question-dedupe.js';

/**
 * Serviço de IA — o único ponto que fala com provedores externos.
 *
 * Regras de segurança:
 *  - chaves NUNCA saem do servidor; o frontend só vê "tem chave: true/false";
 *  - a chave do usuário fica cifrada (AES-256-GCM) no banco;
 *  - se o usuário não cadastrou chave, usamos a chave do servidor (opcional);
 *  - respostas e erros são registrados em ai_messages para auditoria.
 */

const TIMEOUT_MS = env.ai.timeoutMs;

/** Persona migrada do app legado (IAPERSONA). */
const SYSTEM_PERSONA = `Você é um professor de cursinho especialista em concursos públicos brasileiros, focado na banca Fundação CETAP e no concurso da Assembleia Legislativa do Estado do Pará (ALEPA 002/2026), cargo de Analista Legislativo – Assistência Legislativa (cargo 15).
Regras: responda em português do Brasil, direto e didático, com base na legislação vigente (CF/88, Constituição do Pará, Leis 14.133/2021, 8.429/1992, LC 101/2000, LC 95/1998, LGPD, Lei 5.810/1994, Regimento Interno da ALEPA). Cite o dispositivo quando souber; se não tiver certeza de um artigo, diga que não tem certeza em vez de inventar.
Formatação: use markdown simples e legível — títulos curtos (### Título), listas com marcadores e **negrito** nos pontos-chave. Nada de tabelas com mais de 3 colunas nem blocos enormes.`;

/** Resumo do edital usado como contexto (equivalente ao editalResumo do legado). */
async function buildExamContext() {
  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: { topics: { where: { isActive: true }, orderBy: { order: 'asc' } } },
  });
  if (!subjects.length) return '';

  const linhas = subjects.map((m) => {
    const tops = m.topics.map((t) => t.name);
    return `• ${m.name}: ${tops.slice(0, 12).join('; ')}${tops.length > 12 ? ' …' : ''}`;
  });

  return (
    'Concurso ALEPA 002/2026 — banca Fundação CETAP, cargo 15 (Analista Legislativo – Assistência Legislativa).\n' +
    'Matérias e tópicos do Anexo II:\n' +
    linhas.join('\n')
  );
}

// ---------------------------------------------------------- credenciais -----

/**
 * Resolve qual chave usar: a do usuário tem prioridade sobre a do servidor.
 * @returns {{provider: object, apiKey: string, model: string, baseUrl: string, source: string}}
 */
export async function resolveCredentials(userId, providerKey) {
  const key = String(providerKey || env.ai.defaultProvider).toLowerCase();
  const provider = getProvider(key);
  if (!provider) throw ApiError.badRequest(`Provedor de IA desconhecido: ${providerKey}`);

  let credential = null;
  if (userId) {
    credential = await prisma.aiUserCredential.findFirst({
      where: { userId, provider: { key }, isEnabled: true },
    });
  }

  const userKey = credential?.apiKeyEnc ? decrypt(credential.apiKeyEnc) : null;
  const serverKey = env.ai.keys[key] || '';

  const apiKey = userKey || serverKey || '';
  const model = credential?.model || provider.defaultModel || env.ai.defaultModel || '';
  const baseUrl = credential?.baseUrl || provider.baseUrl || '';

  if (provider.requiresKey && !apiKey) {
    throw ApiError.badRequest(
      `Configure uma chave de IA (${provider.name}) em Configurações → Inteligência Artificial, ` +
      'ou peça ao administrador para habilitar a chave do servidor.',
    );
  }
  if (!model) throw ApiError.badRequest('Nenhum modelo configurado para este provedor.');

  return { provider, apiKey, model, baseUrl, source: userKey ? 'user' : 'server' };
}

// ------------------------------------------------------------- provedor -----

/**
 * Rodízio de provedores.
 *
 * Um provedor sozinho não dá conta: o Gemini entra em "high demand", a Groq
 * descontinua modelo, o Hugging Face oscila. Então, quando um falha, a gente
 * tenta o próximo que tenha chave configurada — e assim por diante.
 */
const FALLBACK_ORDER = [
  'groq',
  'gemini',
  'huggingface',
  'openrouter',
  'mistral',
  'deepseek',
  'openai',
  'anthropic',
  'xai',
];

/**
 * Estes só entram se o usuário escolher na mão: dependem da máquina dele
 * (Ollama) ou de uma URL que ele cadastrou (compatível com OpenAI).
 */
const MANUAL_ONLY = new Set(['ollama', 'custom']);

/**
 * Provedor que acabou de falhar fica "descansando" por um minuto.
 *
 * Motivo prático: uma chamada que cai em "high demand" leva ~15 s para falhar.
 * Sem isso, cada nova pergunta do aluno pagaria esses 15 s de novo antes de
 * cair no provedor que funciona. Descansando, a próxima chamada já vai direto
 * para um provedor saudável (e o que falhou entra no fim da fila de novo).
 */
const COOLDOWN_MS = 60_000;
const repousoAte = new Map();

/** Marca o provedor como indisponível por alguns instantes. */
export function marcarRepouso(key) {
  repousoAte.set(String(key), Date.now() + COOLDOWN_MS);
}

/** Provedor recuperado: volta para o topo da fila. */
export function limparRepouso(key) {
  repousoAte.delete(String(key));
}

export function estaEmRepouso(key) {
  return (repousoAte.get(String(key)) || 0) > Date.now();
}

/** Quais provedores têm chave (do usuário ou do servidor) neste momento. */
export async function providersWithKey(userId) {
  const disponiveis = [];

  for (const key of PROVIDER_KEYS) {
    const provider = getProvider(key);
    if (!provider) continue;

    if (provider.requiresKey === false) {
      // Sem chave, mas utilizável (Ollama) — só entra se for pedido.
      disponiveis.push({ key, manual: true });
      continue;
    }

    let temChaveDoUsuario = false;
    if (userId) {
      const credencial = await prisma.aiUserCredential.findFirst({
        where: { userId, provider: { key }, isEnabled: true },
        select: { apiKeyEnc: true },
      });
      temChaveDoUsuario = Boolean(credencial?.apiKeyEnc);
    }
    if (temChaveDoUsuario || Boolean(env.ai.keys[key])) disponiveis.push({ key, manual: false });
  }

  return disponiveis;
}

/**
 * Monta a fila de provedores para uma chamada:
 * o pedido primeiro (se tiver chave), depois os outros na ordem de preferência.
 */
export async function buildProviderChain(userId, requested) {
  const disponiveis = await providersWithKey(userId);
  const pedido = String(requested || env.ai.defaultProvider || '').toLowerCase();
  const temChave = (key) => disponiveis.some((item) => item.key === key);

  const fila = [];

  // 1º: o provedor pedido (se não estiver descansando)
  if (temChave(pedido) && !estaEmRepouso(pedido)) fila.push(pedido);

  // 2º: os demais, na ordem de preferência, pulando os que descansam
  for (const key of FALLBACK_ORDER) {
    if (MANUAL_ONLY.has(key) || !temChave(key) || fila.includes(key) || estaEmRepouso(key)) continue;
    fila.push(key);
  }

  // 3º: quem está descansando entra no fim — ainda é tentado se os outros falharem
  if (temChave(pedido) && !fila.includes(pedido)) fila.push(pedido);
  for (const key of FALLBACK_ORDER) {
    if (MANUAL_ONLY.has(key) || !temChave(key) || fila.includes(key)) continue;
    fila.push(key);
  }

  return fila;
}

/**
 * O provedor aposentou o modelo?
 * Google fez isso com o gemini-2.0-flash ("is no longer available") e fará de
 * novo com outros. Em vez de quebrar o app, a gente detecta e troca sozinho.
 */
const MODEL_GONE_RE =
  /(no longer available|not found for api version|is not supported for generatecontent|model .*not found|does not exist|unknown model|invalid model|has been deprecated|is deprecated)/i;

export function isModelGoneError(status, message) {
  if (![400, 403, 404, 410].includes(Number(status))) return false;
  return MODEL_GONE_RE.test(String(message || ''));
}

/** Lista os modelos que o provedor oferece agora (mesma lógica do /models). */
async function fetchProviderModels(provider, { apiKey, baseUrl }) {
  const request = provider.buildModelsRequest?.({ apiKey, baseUrl });
  if (!request) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(request.url, { headers: request.headers, signal: controller.signal });
    if (!response.ok) return [];
    const json = await response.json().catch(() => null);
    return provider.parseModels?.(json) || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Tira da lista o que não serve para conversar/gerar questões. */
const NOT_CHAT = /(tts|live|image|imagen|veo|vision|embedding|embed|audio|robotics|nano|banana|aqa|gemma|code_gecko|text-)/i;

/**
 * Escolhe o melhor modelo de texto da lista: prefere "flash" (rápido e
 * barato), do mais novo para o mais antigo.
 */
export function pickChatModel(models) {
  const usable = (models || []).filter((m) => m?.id && !NOT_CHAT.test(m.id));
  if (!usable.length) return null;

  const version = (id) => {
    const match = String(id).match(/(\d+)\.(\d+)/);
    return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
  };
  // Empate na versão: prefere o modelo estável ao "preview/experimental".
  const score = (id) =>
    (/-flash-lite/.test(id) ? 1 : /-flash/.test(id) ? 2 : /-pro/.test(id) ? 1 : 0) -
    (/-(preview|exp|alpha|beta)/.test(id) ? 0.5 : 0);

  return usable
    .slice()
    .sort((a, b) => version(b.id) - version(a.id) || score(b.id) - score(a.id))
    .map((m) => m.id)[0];
}

async function callProvider(
  provider,
  { messages, model, maxTokens, temperature, apiKey, baseUrl, timeoutMs },
  alreadyRetried = false,
) {
  const { url, headers, body } = provider.buildRequest({
    messages,
    model,
    maxTokens: maxTokens || env.ai.maxTokens,
    temperature: temperature ?? env.ai.temperature,
    apiKey,
    baseUrl,
  });

  if (!url) {
    throw ApiError.badRequest(
      `Informe o endereço da API do provedor ${provider.name}. ` +
        'Ex.: https://meu-servidor.com/v1/chat/completions (para o provedor ' +
        '"Outra IA", o campo "Endereço da API" é obrigatório).',
    );
  }

  const controller = new AbortController();
  const limite = timeoutMs || TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), limite);

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* resposta não-JSON (HTML de erro, proxy etc.) */
    }

    if (!response.ok) {
      const message =
        json?.error?.message ||
        json?.error ||
        json?.message ||
        raw.slice(0, 300) ||
        `HTTP ${response.status}`;

      /*
       * Modelo aposentado (ex.: gemini-2.0-flash): em vez de devolver 502,
       * perguntamos ao provedor quais modelos existem HOJE e tentamos de novo
       * uma vez com o mais novo. Se funcionar, o modelo é salvo para as
       * próximas chamadas (ver `rememberWorkingModel`).
       */
      if (isModelGoneError(response.status, message) && !alreadyRetried) {
        const models = await fetchProviderModels(provider, { apiKey, baseUrl });
        const replacement = pickChatModel(models);
        if (replacement && replacement !== model) {
          logger.warn(
            { provider: provider.key, from: model, to: replacement },
            'modelo do provedor foi descontinuado — trocando automaticamente',
          );
          clearTimeout(timer);
          return callProvider(
            provider,
            { messages, model: replacement, maxTokens, temperature, apiKey, baseUrl, timeoutMs: limite },
            true,
          );
        }
      }

      const hint = isModelGoneError(response.status, message)
        ? ' O modelo configurado não existe mais neste provedor: abra Configurações → Inteligência Artificial e escolha outro da lista.'
        : '';
      throw new ApiError(502, `A IA respondeu com erro: ${message}${hint}`);
    }

    const content = provider.parseResponse(json);
    if (!content) throw new ApiError(502, 'A IA respondeu sem texto. Tente novamente.');

    return {
      content,
      model,
      providerKey: provider.key,
      latencyMs: Date.now() - startedAt,
      usage: json?.usage || null,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(504, 'A IA demorou demais para responder. Tente novamente.');
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, `Não consegui falar com a IA: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ persistência --

async function ensureConversation({ userId, conversationId, feature, providerKey, model, questionId, title }) {
  if (conversationId) {
    const existing = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
    if (!existing) throw ApiError.notFound('Conversa não encontrada.');
    return existing;
  }

  const providerRecord = await prisma.aiProvider.findUnique({ where: { key: providerKey } });
  return prisma.aiConversation.create({
    data: {
      userId,
      title: title || null,
      feature,
      model,
      questionId: questionId || null,
      providerId: providerRecord?.id || null,
    },
  });
}

async function persistMessages(conversationId, messages) {
  await prisma.aiMessage.createMany({ data: messages });
}

// ---------------------------------------------------------------- recursos --

/**
 * Conversa livre com a IA.
 * @param {object} params
 * @param {string} params.userId
 * @param {Array<{role:string, content:string}>} params.messages
 */
/**
 * Guarda o modelo que funcionou depois de um modelo descontinuado.
 * Atualiza o padrão do provedor e, quando a chave é do usuário, a preferência
 * dele também. Nunca derruba a chamada se falhar: é só uma economia de tempo.
 */
async function rememberWorkingModel({ userId, provider, model, source }) {
  try {
    await prisma.aiProvider.upsert({
      where: { key: provider.key },
      create: { key: provider.key, name: provider.name, kind: provider.kind, defaultModel: model },
      update: { defaultModel: model },
    });

    if (userId && source === 'user') {
      const providerRecord = await prisma.aiProvider.findUnique({ where: { key: provider.key } });
      if (providerRecord) {
        await prisma.aiUserCredential.updateMany({
          where: { userId, providerId: providerRecord.id },
          data: { model },
        });
      }
    }

    logger.info({ provider: provider.key, model }, 'modelo atualizado automaticamente');
  } catch (error) {
    logger.warn({ error: error.message }, 'não consegui gravar o novo modelo');
  }
}

/**
 * Conversa com a IA — com rodízio de provedores.
 *
 * Se o provedor escolhido falhar (sobrecarga, cota, chave inválida, modelo
 * aposentado, timeout), tentamos o próximo que tenha chave, na ordem de
 * `buildProviderChain`, respeitando um teto de tempo para a chamada inteira não
 * estourar o timeout do navegador.
 */
export async function chat(userId, params) {
  const {
    messages = [],
    provider: providerKey,
    model,
    feature = 'CHAT',
    conversationId = null,
    questionId = null,
    title = null,
    maxTokens,
    temperature,
    saveHistory = true,
    systemExtra = '',
  } = params;

  if (!messages.length) throw ApiError.badRequest('Envie ao menos uma mensagem.');

  const examContext = await buildExamContext();
  const systemContent = [SYSTEM_PERSONA, examContext, systemExtra].filter(Boolean).join('\n\n');
  const fullMessages = [{ role: 'system', content: systemContent }, ...messages];

  const fila = await buildProviderChain(userId, providerKey);

  /**
   * Nenhuma chave configurada em lugar nenhum: cai no caminho antigo, que
   * devolve a mensagem certa ("configure uma chave em Configurações → IA").
   */
  if (!fila.length) {
    const { provider, apiKey, model: resolvedModel, baseUrl } = await resolveCredentials(
      userId,
      providerKey,
    );
    const result = await callProvider(provider, {
      messages: fullMessages,
      model: model || resolvedModel,
      maxTokens,
      temperature,
      apiKey,
      baseUrl,
    });
    return {
      conversationId: null,
      content: result.content,
      provider: result.providerKey,
      model: result.model,
      source: 'user',
      latencyMs: result.latencyMs,
    };
  }

  const orcamento = env.ai.totalBudgetMs > 0 ? env.ai.totalBudgetMs : TIMEOUT_MS;
  const deadline = Date.now() + orcamento;
  const tentativas = [];
  let ultimoErro = null;

  for (const key of fila) {
    const restante = deadline - Date.now();
    // Menos de 5 s: não vale a pena começar outra chamada.
    if (restante < 5_000) {
      tentativas.push({ provider: key, error: 'tempo esgotado antes de tentar' });
      continue;
    }

    let credenciais;
    try {
      credenciais = await resolveCredentials(userId, key);
    } catch (err) {
      ultimoErro = err;
      tentativas.push({ provider: key, error: err.message });
      continue;
    }

    const modelo = model || credenciais.model;
    try {
      const result = await callProvider(credenciais.provider, {
        messages: fullMessages,
        model: modelo,
        maxTokens,
        temperature,
        apiKey: credenciais.apiKey,
        baseUrl: credenciais.baseUrl,
        timeoutMs: restante,
      });

      // O provedor trocou o modelo sozinho? Grava para não redescobrir.
      if (result.model && result.model !== modelo) {
        await rememberWorkingModel({
          userId,
          provider: credenciais.provider,
          model: result.model,
          source: credenciais.source,
        });
      }

      limparRepouso(result.providerKey);

      if (tentativas.length) {
        logger.info(
          { de: providerKey || env.ai.defaultProvider, para: result.providerKey, tentativas },
          'provedor substituído após falha — chamada atendida por outro',
        );
      }

      let conversation = null;
      if (saveHistory) {
        conversation = await ensureConversation({
          userId,
          conversationId,
          feature,
          providerKey: result.providerKey,
          model: result.model,
          questionId,
          title: title || (messages[0]?.content || '').slice(0, 80),
        });

        await persistMessages(conversation.id, [
          ...messages.map((m) => ({
            conversationId: conversation.id,
            role: m.role === 'user' ? 'USER' : 'ASSISTANT',
            content: m.content,
          })),
          {
            conversationId: conversation.id,
            role: 'ASSISTANT',
            content: result.content,
            providerKey: result.providerKey,
            model: result.model,
            latencyMs: result.latencyMs,
            promptTokens: result.usage?.prompt_tokens || null,
            completionTokens: result.usage?.completion_tokens || null,
          },
        ]);
      }

      return {
        conversationId: conversation?.id || null,
        content: result.content,
        provider: result.providerKey,
        model: result.model,
        source: credenciais.source,
        latencyMs: result.latencyMs,
        // Só vem preenchido quando houve troca — o frontend avisa o aluno.
        fallback: tentativas.length
          ? { from: providerKey || env.ai.defaultProvider, attempts: tentativas }
          : null,
      };
    } catch (err) {
      ultimoErro = err;
      marcarRepouso(key); // evita pagar o tempo da falha de novo na próxima
      tentativas.push({ provider: key, model: modelo, error: err.message });
      logger.warn(
        { provider: key, model: modelo, err: err.message },
        'provedor falhou — tentando o próximo da fila',
      );
    }
  }

  const status = ultimoErro?.statusCode || 502;
  const tentados = tentativas.map((t) => `${t.provider}: ${t.error}`).join(' | ');
  const mensagem = fila.length > 1
    ? `${ultimoErro?.message || 'Falha na IA.'} — Tentei todos os provedores com chave (${fila.join(', ')}) e todos falharam.`
    : ultimoErro?.message || 'Falha na IA.';

  const erro = new ApiError(status, mensagem);
  erro.details = { attempts: tentativas, detalhes: tentados };
  throw erro;
}

/** Explica uma questão (com ou sem a alternativa que o aluno marcou). */
export async function explainQuestion(userId, questionId, { provider, model, chosenLabel } = {}) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: true,
      topic: true,
    },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');

  const correctLabel = question.options.find((o) => o.isCorrect)?.label || '?';

  const prompt = [
    `Explique a questão abaixo como se eu fosse um aluno de cursinho.`,
    ``,
    `Matéria: ${question.subject?.name || ''}`,
    question.topic ? `Assunto: ${question.topic.name}` : '',
    question.legalBasis ? `Base legal: ${question.legalBasis}` : '',
    ``,
    `ENUNCIADO: ${question.prompt}`,
    ``,
    ...question.options.map((o) => `${o.label}) ${o.text}`),
    ``,
    chosenLabel ? `Eu marquei a alternativa ${chosenLabel}.` : 'Ainda não respondi.',
    ``,
    `Explique por que a alternativa ${correctLabel} é a correta e por que as outras estão erradas.` +
      (chosenLabel && chosenLabel !== correctLabel
        ? ` Foque especialmente no meu erro (alternativa ${chosenLabel}).`
        : ''),
  ]
    .filter(Boolean)
    .join('\n');

  return chat(userId, {
    messages: [{ role: 'user', content: prompt }],
    provider,
    model,
    feature: 'QUESTION_EXPLANATION',
    questionId,
    title: `Explicação: ${question.prompt.slice(0, 60)}…`,
  });
}

/** Explica um erro específico do caderno de erros. */
export async function explainError(userId, questionId, { provider, model } = {}) {
  const item = await prisma.errorNotebookItem.findFirst({
    where: { userId, questionId },
    include: {
      question: { include: { options: { orderBy: { order: 'asc' } }, subject: true, topic: true } },
    },
  });
  if (!item) throw ApiError.notFound('Questão não está no seu caderno de erros.');

  const q = item.question;
  const correctLabel = q.options.find((o) => o.isCorrect)?.label || '?';

  const prompt =
    `Eu erro esta questão com frequência (já errei ${item.errorCount}x). Me ajude a nunca mais errar.\n\n` +
    `Matéria: ${q.subject?.name || ''}\n` +
    (q.topic ? `Assunto: ${q.topic.name}\n` : '') +
    `\n${q.prompt}\n\n` +
    q.options.map((o) => `${o.label}) ${o.text}`).join('\n') +
    `\n\nGabarito: ${correctLabel}.\n\n` +
    `Dê: (1) o raciocínio para chegar na resposta, (2) a "pegadinha" que leva ao erro, ` +
    `(3) uma dica curta de memorização.`;

  return chat(userId, {
    messages: [{ role: 'user', content: prompt }],
    provider,
    model,
    feature: 'ERROR_EXPLANATION',
    questionId,
    title: `Meu erro: ${q.prompt.slice(0, 60)}…`,
  });
}

/** Resume um conteúdo de teoria ou matéria inteira. */
export async function summarizeContent(userId, { subjectId, topicId, content, provider, model, style = 'resumo' } = {}) {
  let text = content || '';

  if (!text && topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw ApiError.notFound('Assunto não encontrado.');
    const theory = await prisma.theoryItem.findMany({ where: { topicId } });
    text = theory.map((t) => `## ${t.title}\n${t.content}`).join('\n\n') || topic.name;
  }

  if (!text && subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: { topics: { where: { isActive: true } }, theoryItems: true },
    });
    if (!subject) throw ApiError.notFound('Matéria não encontrada.');
    text =
      `Matéria: ${subject.name}\n` +
      `Tópicos do edital:\n- ${subject.topics.map((t) => t.name).join('\n- ')}\n\n` +
      subject.theoryItems.map((t) => `## ${t.title}\n${t.content}`).join('\n\n');
  }

  if (!text) throw ApiError.badRequest('Informe o conteúdo, a matéria ou o assunto a resumir.');

  const styles = {
    resumo: 'um resumo objetivo em tópicos',
    esquema: 'um esquema/súmula para revisão rápida',
    mapa: 'um mapa mental em texto (hierarquia com marcadores)',
    pontos: 'os 10 pontos mais cobrados em prova',
  };

  return chat(userId, {
    messages: [
      {
        role: 'user',
        content: `Faça ${styles[style] || styles.resumo} do conteúdo abaixo.\n\n${text.slice(0, 12000)}`,
      },
    ],
    provider,
    model,
    feature: 'SUMMARY',
    title: `Resumo: ${(text || '').slice(0, 50)}…`,
  });
}

/**
 * Gera questões inéditas com IA e já grava no banco (origem AI).
 * O aluno pode responder e revisar como qualquer outra questão.
 */
export async function generateQuestions(userId, payload) {
  const {
    subjectId,
    topicId,
    count = 5,
    difficulty = 'MEDIA',
    provider,
    model,
    saveToBank = true,
  } = payload;

  const quantity = Math.min(Math.max(1, Number(count) || 5), 20);

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) throw ApiError.badRequest('Matéria inválida.');

  let topic = null;
  if (topicId) {
    topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic || topic.subjectId !== subjectId) {
      throw ApiError.badRequest('O assunto não pertence a esta matéria.');
    }
  }

  const difficultyLabel = { FACIL: 'fácil', MEDIA: 'média', DIFICIL: 'difícil' }[difficulty] || 'média';

  const prompt =
    `Crie ${quantity} questões INÉDITAS de múltipla escolha no estilo da banca Fundação CETAP ` +
    `para o cargo de Analista Legislativo da ALEPA.\n\n` +
    `Matéria: ${subject.name}\n` +
    (topic ? `Assunto: ${topic.name}\n` : '') +
    `Dificuldade: ${difficultyLabel}\n` +
    `Cada questão deve ter 5 alternativas (A a E) e exatamente uma correta.\n\n` +
    `Responda SOMENTE com JSON válido, sem texto antes ou depois, neste formato:\n` +
    `[{"enunciado": "...", "alternativas": ["...","...","...","...","..."], "correta": 0, ` +
    `"comentario": "...", "analise": "...", "ref": "base legal"}]` +
    `\nO campo "correta" é o índice (0 a 4) da alternativa correta dentro do array.`;

  const result = await chat(userId, {
    messages: [{ role: 'user', content: prompt }],
    provider,
    model,
    feature: 'GENERATE_QUESTIONS',
    saveHistory: false,
    maxTokens: Math.max(2000, quantity * 500),
    temperature: 0.8,
  });

  const questions = parseQuestionJson(result.content);
  if (!questions.length) {
    throw new ApiError(502, 'A IA não devolveu questões em formato válido. Tente novamente.');
  }

  if (!saveToBank) {
    return { created: 0, skipped: 0, duplicates: [], questions, batchId: null };
  }

  /*
   * Filtro anti-duplicidade: compara cada enunciado gerado com o que já existe
   * nesta matéria (e com os outros do mesmo lote). O que for "quase igual" é
   * descartado antes de encostar no banco — a IA não sabe o que já temos.
   */
  const existing = await prisma.question.findMany({
    where: { subjectId, status: { not: 'ARCHIVED' } },
    select: { prompt: true },
  });
  const { unique, duplicates } = filterDuplicates(
    questions.map((item) => item.enunciado),
    existing.map((row) => row.prompt),
  );

  if (!unique.length) {
    throw new ApiError(
      409,
      'A IA devolveu só questões que já existem no seu banco. Tente outro assunto, outra dificuldade ou peça mais questões.',
    );
  }

  // Mantém a ordem em que a IA gerou, descartando as repetidas.
  const accepted = [];
  const queue = [...unique];
  for (const item of questions) {
    const position = queue.indexOf(item.enunciado);
    if (position !== -1) {
      queue.splice(position, 1);
      accepted.push(item);
    }
  }

  const batch = await prisma.aiGeneratedBatch.create({
    data: {
      userId,
      topicId: topic?.id || null,
      provider: result.provider,
      model: result.model,
      prompt,
      count: accepted.length,
    },
  });

  const created = [];
  for (const q of accepted) {
    const options = (q.alternativas || []).slice(0, 5);
    const correctIndex = Number.isInteger(q.correta) ? Math.min(Math.max(q.correta, 0), options.length - 1) : 0;

    const question = await prisma.question.create({
      data: {
        subjectId,
        topicId: topic?.id || null,
        prompt: q.enunciado,
        difficulty,
        year: new Date().getFullYear(),
        source: 'Gerada por IA',
        legalBasis: q.ref || null,
        explanation: q.comentario || null,
        analysis: q.analise || null,
        origin: 'AI',
        status: 'PUBLISHED',
        createdById: userId,
        generatedBatchId: batch.id,
        options: {
          create: options.map((text, index) => ({
            label: ['A', 'B', 'C', 'D', 'E'][index],
            text,
            isCorrect: index === correctIndex,
            order: index,
          })),
        },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    created.push(question);
  }

  return {
    created: created.length,
    // Quem atendeu (pode não ser o provedor pedido, se ele falhou).
    provider: result.provider,
    model: result.model,
    fallback: result.fallback || null,
    // Quantas a IA mandou e nós jogamos fora por já existirem no banco.
    skipped: questions.length - created.length,
    duplicates: duplicates.map((item) => ({
      prompt: String(item.prompt).slice(0, 160),
      score: item.score,
    })),
    batchId: batch.id,
    questions: created,
  };
}

/** Extrai o JSON da resposta da IA (ela às vezes envolve em ```json). */
function parseQuestionJson(content) {
  const cleaned = String(content || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((q) => q?.enunciado && Array.isArray(q?.alternativas));
  } catch {
    // Tenta recuperar apenas o trecho entre o primeiro [ e o último ]
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed.filter((q) => q?.enunciado && Array.isArray(q?.alternativas)) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

/** Tira dúvidas gerais de estudo. */
export async function studyHelp(userId, { message, provider, model } = {}) {
  if (!message?.trim()) throw ApiError.badRequest('Escreva sua dúvida.');
  return chat(userId, {
    messages: [{ role: 'user', content: message.trim() }],
    provider,
    model,
    feature: 'STUDY_HELP',
    title: message.trim().slice(0, 80),
  });
}

/**
 * Sugere o que revisar hoje, com base no desempenho real do aluno.
 * (O raciocínio é montado aqui, não pela IA: passamos os dados prontos.)
 */
export async function suggestReview(userId, { provider, model } = {}) {
  const [progress, errors, subjects] = await Promise.all([
    prisma.userProgress.findMany({
      where: { userId },
      orderBy: [{ nextReviewAt: 'asc' }],
      take: 40,
      include: { question: { include: { subject: true, topic: true } } },
    }),
    prisma.errorNotebookItem.count({ where: { userId, resolvedAt: null } }),
    prisma.subject.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);

  const weak = progress.filter((p) => p.attempts > 0 && p.correctCount / p.attempts < 0.6);
  const due = progress.filter((p) => p.nextReviewAt && p.nextReviewAt <= new Date());

  const subjectCount = new Map();
  [...weak, ...due].forEach((p) => {
    const name = p.question?.subject?.name;
    if (name) subjectCount.set(name, (subjectCount.get(name) || 0) + 1);
  });

  const resumo = [
    `Questões na fila de revisão: ${due.length}`,
    `Questões com baixo aproveitamento (<60%): ${weak.length}`,
    `Erros pendentes no caderno: ${errors}`,
    `Matérias mais críticas: ${
      [...subjectCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n} (${c})`).join(', ') || 'nenhuma ainda'
    }`,
    `Matérias do edital: ${subjects.map((s) => s.name).join(', ')}`,
  ].join('\n');

  return chat(userId, {
    messages: [
      {
        role: 'user',
        content:
          `Com base nos meus dados de estudo, monte um plano de revisão para HOJE (máximo 90 minutos).\n\n` +
          `${resumo}\n\n` +
          `Responda com: (1) prioridade do dia, (2) ordem sugerida de matérias, ` +
          `(3) quantidade de questões por bloco, (4) uma dica final.`,
      },
    ],
    provider,
    model,
    feature: 'REVIEW_SUGGESTION',
    title: 'Plano de revisão de hoje',
  });
}

/** Gera um simulado montado com questões criadas pela IA. */
export async function generateSimulado(userId, payload) {
  const { subjectIds = [], count = 10, difficulty = 'MEDIA', durationMinutes = 60, provider, model, title } = payload;
  const perSubject = Math.max(1, Math.ceil(count / Math.max(1, subjectIds.length)));

  const created = [];
  let skipped = 0;
  const duplicates = [];
  const usados = [];

  for (const subjectId of subjectIds) {
    try {
      const result = await generateQuestions(userId, {
        subjectId,
        count: Math.min(perSubject, 20),
        difficulty,
        provider,
        model,
        saveToBank: true,
      });
      created.push(...(result.questions || []));
      skipped += result.skipped || 0;
      duplicates.push(...(result.duplicates || []));
      if (result.provider) usados.push(result.provider);
    } catch (error) {
      // 409 = nesta matéria a IA só repetiu o que já existe. Não derruba o
      // simulado inteiro: seguimos para a próxima matéria.
      if (error?.statusCode !== 409) throw error;
      skipped += 1;
    }
  }

  if (!created.length) {
    throw new ApiError(
      skipped > 0 ? 409 : 502,
      skipped > 0
        ? 'A IA só devolveu questões que já existem no seu banco. Tente outra matéria, outra dificuldade ou peça mais questões.'
        : 'Não foi possível gerar questões para o simulado.',
    );
  }

  /**
   * Monta a prova com as questões que acabaram de ser criadas.
   * (Antes isso chamava uma função inexistente e caía em 500 — e, mesmo que
   * existisse, sortearia questões aleatórias do banco em vez das geradas.)
   */
  const { createWithQuestionIds } = await import('../simulados/simulados.service.js');
  const simulado = await createWithQuestionIds(userId, {
    questionIds: created.map((question) => question.id),
    title: title || `Simulado com IA — ${new Date().toLocaleDateString('pt-BR')}`,
    mode: 'AI',
    durationMinutes,
    shuffleOptions: false,
    feedbackMode: 'final',
    difficulty,
  });

  // `generation` é informativo: quantas a IA mandou e nós descartamos por
  // já existirem no banco. O frontend usa para avisar o aluno.
  return {
    ...simulado,
    generation: {
      created: created.length,
      skipped,
      duplicates,
      // pode haver mais de um: cada matéria cai num provedor diferente
      providers: [...new Set(usados)],
    },
  };
}

// ------------------------------------------------------------ histórico -----

export async function listConversations(userId, { page = 1, limit = 20 } = {}) {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.aiConversation.count({ where }),
    prisma.aiConversation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } }, provider: { select: { key: true, name: true } } },
    }),
  ]);
  return { rows, total, page, limit };
}

export async function getConversation(userId, conversationId) {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) throw ApiError.notFound('Conversa não encontrada.');
  return conversation;
}

export async function deleteConversation(userId, conversationId) {
  const conversation = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw ApiError.notFound('Conversa não encontrada.');
  await prisma.aiConversation.delete({ where: { id: conversationId } });
  return { deleted: true };
}

// --------------------------------------------------------- configuração -----

/** Salva (cifrada) a chave do usuário para um provedor. */
export async function saveCredential(userId, { provider: providerKey, apiKey, model, baseUrl, isEnabled = true }) {
  const provider = getProvider(providerKey);
  if (!provider) throw ApiError.badRequest('Provedor desconhecido.');

  const providerRecord = await prisma.aiProvider.upsert({
    where: { key: provider.key },
    create: { key: provider.key, name: provider.name, kind: provider.kind, defaultModel: provider.defaultModel },
    update: {},
  });

  /**
   * O provedor "custom" (compatível com OpenAI) não tem endereço fixo:
   * sem a URL ele nunca vai funcionar, então avisamos agora em vez de
   * aceitar o salvamento e só reclamar na hora de usar.
   */
  const existing = await prisma.aiUserCredential.findUnique({
    where: { userId_providerId: { userId, providerId: providerRecord.id } },
  });

  const wantsCustom = provider.key === 'custom';
  const finalBaseUrl = (baseUrl || existing?.baseUrl || (wantsCustom ? '' : provider.baseUrl) || '').trim();

  if (wantsCustom && !finalBaseUrl) {
    throw ApiError.badRequest(
      'Para o provedor "Outra IA (compatível com OpenAI)" você precisa informar o ' +
        'Endereço da API, ex.: https://meu-servidor.com/v1/chat/completions',
    );
  }

  const data = {
    // Só sobrescreve o que foi enviado: salvar só a chave não zera modelo/URL.
    model: model || existing?.model || provider.defaultModel || null,
    baseUrl: finalBaseUrl || null,
    isEnabled,
  };
  if (apiKey) data.apiKeyEnc = encrypt(apiKey);

  const credential = await prisma.aiUserCredential.upsert({
    where: { userId_providerId: { userId, providerId: providerRecord.id } },
    create: { userId, providerId: providerRecord.id, ...data },
    update: data,
  });

  return { provider: provider.key, hasKey: Boolean(credential.apiKeyEnc), model: credential.model, isEnabled };
}

export async function listCredentials(userId) {
  const credentials = await prisma.aiUserCredential.findMany({
    where: { userId },
    include: { provider: true },
  });
  const configured = new Set(credentials.map((c) => c.provider.key));

  const all = Object.values((await import('./providers/index.js')).PROVIDERS).map((p) => {
    const found = credentials.find((c) => c.provider.key === p.key);
    return {
      key: p.key,
      name: p.name,
      isFree: FREE_PROVIDERS.includes(p.key),
      requiresKey: p.requiresKey,
      hasKey: Boolean(found?.apiKeyEnc),
      model: found?.model || p.defaultModel,
      baseUrl: found?.baseUrl || (p.key === 'custom' ? '' : p.baseUrl),
      isEnabled: found?.isEnabled ?? false,
      configured: configured.has(p.key),
      hasServerKey: Boolean(env.ai.keys[p.key]),
      lastError: found?.lastError || null,
    };
  });

  return all;
}

export async function deleteCredential(userId, providerKey) {
  const provider = getProvider(providerKey);
  if (!provider) throw ApiError.badRequest('Provedor desconhecido.');
  const providerRecord = await prisma.aiProvider.findUnique({ where: { key: provider.key } });
  if (!providerRecord) return { deleted: false };

  await prisma.aiUserCredential.deleteMany({ where: { userId, providerId: providerRecord.id } });
  return { deleted: true };
}

/** Lista os modelos disponíveis usando a chave do usuário (ou do servidor). */
export async function listModels(userId, providerKey) {
  const { provider, apiKey, baseUrl } = await resolveCredentials(userId, providerKey);
  const request = provider.buildModelsRequest?.({ apiKey, baseUrl });
  if (!request) throw ApiError.badRequest('Este provedor não permite listar modelos.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(request.url, { headers: request.headers, signal: controller.signal });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(502, 'Não consegui listar os modelos deste provedor.');
    return provider.parseModels(json);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, `Falha ao listar modelos: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Testa se a chave funciona (faz uma chamada mínima). */
export async function testCredential(userId, providerKey) {
  try {
    const result = await chat(userId, {
      messages: [{ role: 'user', content: 'Responda apenas: OK' }],
      provider: providerKey,
      saveHistory: false,
      // Modelos de raciocínio (gpt-oss, o1...) gastam tokens "pensando"
      // antes de escrever: com 10 dava "A IA respondeu sem texto".
      maxTokens: 300,
    });

    const provider = getProvider(providerKey);
    const providerRecord = await prisma.aiProvider.findUnique({ where: { key: provider.key } });
    if (providerRecord) {
      await prisma.aiUserCredential.updateMany({
        where: { userId, providerId: providerRecord.id },
        data: { validatedAt: new Date(), lastError: null },
      });
    }
    return { ok: true, provider: provider.key, model: result.model, latencyMs: result.latencyMs };
  } catch (err) {
    logger.warn({ err: err.message, providerKey }, 'Falha ao testar credencial de IA');
    const provider = getProvider(providerKey);
    const providerRecord = provider
      ? await prisma.aiProvider.findUnique({ where: { key: provider.key } })
      : null;
    if (providerRecord) {
      await prisma.aiUserCredential.updateMany({
        where: { userId, providerId: providerRecord.id },
        data: { lastError: err.message },
      });
    }
    return { ok: false, provider: providerKey, error: err.message };
  }
}

export default {
  chat,
  explainQuestion,
  explainError,
  summarizeContent,
  generateQuestions,
  generateSimulado,
  studyHelp,
  suggestReview,
  listConversations,
  getConversation,
  deleteConversation,
  saveCredential,
  listCredentials,
  deleteCredential,
  listModels,
  testCredential,
  resolveCredentials,
  SYSTEM_PERSONA,
};
