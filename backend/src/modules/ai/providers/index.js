import { env } from '../../../config/env.js';
import { createOpenAiStyleProvider } from './base.js';
import { gemini } from './gemini.provider.js';
import { anthropic } from './anthropic.provider.js';

/**
 * Registro dos provedores suportados.
 * Migrado do `PROVEDORES` do app legado — agora 100% no servidor.
 */

export const openai = createOpenAiStyleProvider({
  key: 'openai',
  name: 'ChatGPT (OpenAI)',
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  modelsUrl: 'https://api.openai.com/v1/models',
  defaultModel: 'gpt-4o-mini',
});

export const huggingface = createOpenAiStyleProvider({
  key: 'huggingface',
  name: 'Hugging Face',
  baseUrl: 'https://router.huggingface.co/v1/chat/completions',
  modelsUrl: 'https://router.huggingface.co/v1/models',
  defaultModel: 'openai/gpt-oss-120b',
});

export const groq = createOpenAiStyleProvider({
  key: 'groq',
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  modelsUrl: 'https://api.groq.com/openai/v1/models',
  defaultModel: 'llama-3.3-70b-versatile',
});

export const deepseek = createOpenAiStyleProvider({
  key: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/chat/completions',
  modelsUrl: 'https://api.deepseek.com/models',
  defaultModel: 'deepseek-chat',
});

export const mistral = createOpenAiStyleProvider({
  key: 'mistral',
  name: 'Mistral',
  baseUrl: 'https://api.mistral.ai/v1/chat/completions',
  modelsUrl: 'https://api.mistral.ai/v1/models',
  defaultModel: 'mistral-small-latest',
});

export const openrouter = createOpenAiStyleProvider({
  key: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  modelsUrl: 'https://openrouter.ai/api/v1/models',
  defaultModel: 'meta-llama/llama-3.3-70b-instruct',
  headersExtra: () => ({ 'X-Title': 'Arena Estudos ALEPA' }),
});

export const xai = createOpenAiStyleProvider({
  key: 'xai',
  name: 'Grok (xAI)',
  baseUrl: 'https://api.x.ai/v1/chat/completions',
  modelsUrl: 'https://api.x.ai/v1/models',
  defaultModel: 'grok-3-mini',
});

/** Roda na máquina do usuário — sem chave, sem custo, sem sair da rede local. */
export const ollama = createOpenAiStyleProvider({
  key: 'ollama',
  name: 'IA local (Ollama / LM Studio)',
  baseUrl: env.ai.keys.ollama || 'http://localhost:11434/v1/chat/completions',
  defaultModel: 'llama3.2',
  requiresKey: false,
});

/** Qualquer endpoint compatível com a API da OpenAI. */
export const custom = createOpenAiStyleProvider({
  key: 'custom',
  name: 'Outra IA (compatível com OpenAI)',
  baseUrl: '',
  defaultModel: '',
  requiresKey: false,
});

export const PROVIDERS = {
  openai,
  gemini,
  anthropic,
  huggingface,
  groq,
  deepseek,
  mistral,
  openrouter,
  xai,
  ollama,
  custom,
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS);

/** Três provedores gratuitos que aparecem no "modo simples". */
export const FREE_PROVIDERS = ['huggingface', 'groq', 'gemini'];

export function getProvider(key) {
  return PROVIDERS[String(key || '').toLowerCase()] || null;
}

/** Metadados públicos — NUNCA inclui chave alguma. */
export function listProvidersForClient() {
  return Object.values(PROVIDERS).map((p) => ({
    key: p.key,
    name: p.name,
    kind: p.kind,
    defaultModel: p.defaultModel,
    requiresKey: p.requiresKey,
    isFree: FREE_PROVIDERS.includes(p.key),
    hasServerKey: Boolean(env.ai.keys[p.key] || (p.key === 'ollama' && p.baseUrl)),
  }));
}

export default PROVIDERS;
