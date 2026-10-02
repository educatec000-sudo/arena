/** Google Gemini — API própria (generateContent). */
import { systemMessages, conversationMessages } from './base.js';

export const gemini = {
  key: 'gemini',
  name: 'Google Gemini',
  kind: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
  defaultModel: 'gemini-3.8-flash',
  requiresKey: true,

  buildUrl(model, apiKey) {
    return `${this.baseUrl}${model}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
  },

  buildRequest({ messages, model, maxTokens, temperature, apiKey }) {
    const system = systemMessages(messages).map((m) => m.content).join('\n');
    const contents = conversationMessages(messages).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    return {
      url: this.buildUrl(model || this.defaultModel, apiKey),
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  },

  parseResponse(json) {
    const candidate = (json?.candidates || [])[0] || {};
    const parts = candidate?.content?.parts || [];
    return parts.map((p) => p.text || '').join('').trim();
  },

  buildModelsRequest({ apiKey }) {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey || '')}`,
      headers: {},
    };
  },

  parseModels(json) {
    const list = json?.models || [];
    return list
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), name: m.displayName || m.name }))
      .filter((m) => m.id);
  },
};

export default gemini;
