import { describe, it, expect } from 'vitest';
import { isModelGoneError, pickChatModel } from '../src/modules/ai/ai.service.js';
import { extractOpenAiText } from '../src/modules/ai/providers/base.js';

/**
 * Provedores aposentam modelos o tempo todo (o Google fez isso com o
 * gemini-2.0-flash). O app precisa reconhecer o erro e se virar sozinho.
 */
describe('modelo descontinuado pelo provedor', () => {
  it('reconhece o erro "modelo não existe mais"', () => {
    expect(
      isModelGoneError(404, 'This model models/gemini-2.0-flash is no longer available.'),
    ).toBe(true);
    expect(
      isModelGoneError(404, 'models/gemini-2.0-flash is not found for API version v1beta'),
    ).toBe(true);
    expect(isModelGoneError(404, 'models/x is not supported for generateContent')).toBe(true);
    expect(isModelGoneError(400, 'The model `foo` does not exist')).toBe(true);
  });

  it('NÃO confunde com erro de cota/chave (esses o usuário precisa resolver)', () => {
    expect(isModelGoneError(429, 'Quota exceeded for requests per minute')).toBe(false);
    expect(isModelGoneError(401, 'API key not valid. Please pass a valid API key.')).toBe(false);
    expect(isModelGoneError(403, 'Permission denied on resource project')).toBe(false);
    expect(isModelGoneError(200, 'ok')).toBe(false);
  });

  it('escolhe o flash mais novo e ignora o que não serve para texto', () => {
    const modelos = [
      { id: 'gemini-2.5-flash' },
      { id: 'gemini-3.5-flash' },
      { id: 'gemini-3.8-flash' },
      { id: 'gemini-3.5-flash-lite' },
      { id: 'gemini-3.8-flash-tts' }, // áudio: fora
      { id: 'gemini-3.1-flash-image' }, // imagem: fora
      { id: 'text-embedding-004' }, // embedding: fora
    ];
    expect(pickChatModel(modelos)).toBe('gemini-3.8-flash');
  });

  it('aceita o "pro" quando não há flash na lista (e prefere o mais novo)', () => {
    expect(pickChatModel([{ id: 'gemini-3.1-pro-preview' }, { id: 'gemini-2.5-pro' }])).toBe(
      'gemini-3.1-pro-preview',
    );
  });

  it('em empate de versão, prefere o estável ao preview', () => {
    expect(pickChatModel([{ id: 'gemini-3.5-flash-preview' }, { id: 'gemini-3.5-flash' }])).toBe(
      'gemini-3.5-flash',
    );
  });

  it('devolve null quando não há nada utilizável', () => {
    expect(pickChatModel([{ id: 'text-embedding-004' }, { id: 'gemini-3.8-flash-tts' }])).toBeNull();
    expect(pickChatModel([])).toBeNull();
    expect(pickChatModel(null)).toBeNull();
  });
});

describe('leitura da resposta dos provedores (padrão OpenAI)', () => {
  it('lê o content simples', () => {
    expect(extractOpenAiText({ choices: [{ message: { content: 'Resposta.' } }] })).toBe('Resposta.');
  });

  it('lê o content em partes [{ type: "text", text }]', () => {
    expect(
      extractOpenAiText({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] }),
    ).toBe('a\nb');
  });

  it('usa o reasoning quando o modelo "pensa" e não escreve (gpt-oss)', () => {
    expect(extractOpenAiText({ choices: [{ message: { content: '', reasoning: 'raciocínio' } }] })).toBe(
      'raciocínio',
    );
    expect(extractOpenAiText({ choices: [{ message: { content: null, reasoning_content: 'outro' } }] })).toBe(
      'outro',
    );
  });

  it('aceita os formatos antigos (choices[].text e output_text)', () => {
    expect(extractOpenAiText({ choices: [{ text: 'direto' }] })).toBe('direto');
    expect(extractOpenAiText({ output_text: 'fora de choices' })).toBe('fora de choices');
  });

  it('devolve vazio quando não há texto (aí o serviço avisa "sem texto")', () => {
    expect(extractOpenAiText({ choices: [{ message: {} }] })).toBe('');
    expect(extractOpenAiText({})).toBe('');
  });
});
