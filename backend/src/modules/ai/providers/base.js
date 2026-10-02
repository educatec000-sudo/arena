/**
 * Contrato comum dos provedores de IA.
 *
 * Cada provedor implementa:
 *   buildRequest({ messages, model, maxTokens, temperature, apiKey, baseUrl })
 *     -> { url, headers, body }
 *   parseResponse(json)
 *     -> texto da resposta
 *   buildModelsRequest({ apiKey, baseUrl })
 *     -> { url, headers } | null
 *   parseModels(json)
 *     -> [{ id, name }]
 *
 * Assim o serviço de IA não precisa saber nada sobre a API de cada um,
 * e adicionar um provedor novo é só criar um arquivo aqui.
 */

export function systemMessages(messages) {
  return messages.filter((m) => m.role === 'system');
}

export function conversationMessages(messages) {
  return messages.filter((m) => m.role !== 'system');
}


/**
 * Deixa um campo de texto utilizável.
 * O "content" pode vir como string, como array de partes
 * ([{ type: 'text', text: '...' }]) ou nem vir.
 */
function textOf(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n').trim();
  if (value && typeof value === 'object' && typeof value.text === 'string') return value.text.trim();
  return '';
}

function firstFilled(...values) {
  for (const value of values) {
    const text = textOf(value);
    if (text) return text;
  }
  return '';
}

/**
 * Extrai o texto da resposta de provedores no padrão OpenAI.
 *
 * Modelos de raciocínio (ex.: openai/gpt-oss-120b, o padrão do Hugging Face)
 * devolvem o pensamento em `reasoning`/`reasoning_content` e deixam o
 * `content` vazio — era isso que virava "A IA respondeu sem texto".
 * O `reasoning` entra só como último recurso: melhor do que nada, e o JSON
 * das questões é validado depois.
 */
export function extractOpenAiText(json) {
  const choice = (json?.choices || [])[0];
  if (!choice) {
    return firstFilled(json?.output_text, json?.completion, json?.response, json?.generated_text);
  }
  return firstFilled(
    choice?.message?.content,
    choice?.text,
    choice?.message?.output_text,
    choice?.message?.reasoning_content,
    choice?.message?.reasoning,
  );
}

/** Provedor no padrão OpenAI (a maioria). */
export function createOpenAiStyleProvider({
  key,
  name,
  baseUrl,
  modelsUrl = null,
  defaultModel = '',
  requiresKey = true,
  headersExtra = () => ({}),
}) {
  return {
    key,
    name,
    kind: 'openai',
    baseUrl,
    defaultModel,
    requiresKey,
    buildRequest({ messages, model, maxTokens, temperature, apiKey, baseUrl: customBase }) {
      const headers = { 'Content-Type': 'application/json', ...headersExtra({ apiKey }) };
      if (apiKey && requiresKey) headers.Authorization = `Bearer ${apiKey}`;
      return {
        url: customBase || baseUrl,
        headers,
        body: {
          model: model || defaultModel,
          messages,
          max_tokens: maxTokens,
          temperature,
        },
      };
    },
    parseResponse(json) {
      return extractOpenAiText(json);
    },
    buildModelsRequest({ apiKey, baseUrl: customBase }) {
      if (!modelsUrl && !customBase) return null;
      const url = modelsUrl || String(customBase || '').replace(/\/chat\/completions$/, '/models');
      const headers = { ...headersExtra({ apiKey }) };
      if (apiKey && requiresKey) headers.Authorization = `Bearer ${apiKey}`;
      return { url, headers };
    },
    parseModels(json) {
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      return list
        .map((m) => ({ id: m.id || m.name || m.model, name: m.id || m.name || m.model }))
        .filter((m) => m.id);
    },
  };
}

export default { createOpenAiStyleProvider, systemMessages, conversationMessages };
