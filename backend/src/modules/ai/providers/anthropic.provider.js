/** Anthropic (Claude) — header x-api-key e formato próprio. */
import { systemMessages, conversationMessages } from './base.js';

export const anthropic = {
  key: 'anthropic',
  name: 'Claude (Anthropic)',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  defaultModel: 'claude-3-5-sonnet-latest',
  requiresKey: true,

  buildRequest({ messages, model, maxTokens, temperature, apiKey }) {
    const system = systemMessages(messages).map((m) => m.content).join('\n');
    const conversa = conversationMessages(messages).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const body = {
      model: model || this.defaultModel,
      max_tokens: maxTokens,
      temperature,
      messages: conversa,
    };
    if (system) body.system = system;

    return {
      url: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body,
    };
  },

  parseResponse(json) {
    const bloco = (json?.content || []).find((c) => c.type === 'text');
    return (bloco?.text || '').trim();
  },

  buildModelsRequest({ apiKey }) {
    return {
      url: 'https://api.anthropic.com/v1/models',
      headers: { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' },
    };
  },

  parseModels(json) {
    const list = json?.data || [];
    return list.map((m) => ({ id: m.id, name: m.display_name || m.id }));
  },
};

export default anthropic;
