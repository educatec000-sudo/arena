import http from './http';

/**
 * Tempo máximo de espera nas chamadas de IA.
 * O backend já desiste sozinho em `AI_REQUEST_TIMEOUT_MS` (padrão 60 s);
 * este limite é a rede do navegador — um pouco maior para a resposta de erro
 * do backend chegar antes e a mensagem ser a do provedor, não a de timeout.
 */
export const AI_TIMEOUT_MS = 75_000;
import type { AiConversation, AiCredential, AiProviderInfo, Difficulty, Question, Simulado } from '@/types';

export const aiService = {
  providers: () => http.get<AiProviderInfo[]>('/ai/providers'),
  chat: (payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    provider?: string;
    model?: string;
    conversationId?: string;
  }) =>
    http.post<AiChatResult>(
      '/ai/chat',
      payload,
    ),
  studyHelp: (message: string, provider?: string, model?: string) =>
    http.post<{ content: string; conversationId: string | null }>('/ai/study-help', { message, provider, model }, { timeoutMs: AI_TIMEOUT_MS }),
  explainQuestion: (questionId: string, chosenLabel?: string, provider?: string) =>
    http.post<{ content: string; conversationId: string | null }>(`/ai/questions/${questionId}/explain`, {
      chosenLabel,
      provider,
    }),
  explainError: (questionId: string, provider?: string) =>
    http.post<{ content: string; conversationId: string | null }>(`/ai/errors/${questionId}/explain`, { provider }, { timeoutMs: AI_TIMEOUT_MS }),
  summarize: (payload: {
    subjectId?: string;
    topicId?: string;
    content?: string;
    style?: 'resumo' | 'esquema' | 'mapa' | 'pontos';
    provider?: string;
  }) => http.post<{ content: string }>('/ai/summarize', payload, { timeoutMs: AI_TIMEOUT_MS }),
  generateQuestions: (payload: {
    subjectId: string;
    topicId?: string;
    count?: number;
    difficulty?: Difficulty;
    provider?: string;
  }) =>
    http.post<AiGeneratedQuestions>('/ai/generate-questions', payload, { timeoutMs: AI_TIMEOUT_MS }),
  generateSimulado: (payload: {
    subjectIds: string[];
    count?: number;
    difficulty?: Difficulty;
    durationMinutes?: number;
    provider?: string;
  }) => http.post<Simulado & { generation?: AiGenerationReport }>('/ai/generate-simulado', payload, { timeoutMs: AI_TIMEOUT_MS }),
  suggestReview: (provider?: string) => http.get<{ content: string }>('/ai/suggest-review', { provider }),
  conversations: (params: { page?: number; limit?: number } = {}) =>
    http.paged<AiConversation>('/ai/conversations', params),
  conversation: (id: string) => http.get<AiConversation>(`/ai/conversations/${id}`),
  deleteConversation: (id: string) => http.delete(`/ai/conversations/${id}`),
  credentials: () => http.get<AiCredential[]>('/ai/credentials'),
  saveCredential: (payload: {
    provider: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    isEnabled?: boolean;
  }) => http.post('/ai/credentials', payload),
  deleteCredential: (provider: string) => http.delete(`/ai/credentials/${provider}`),
  testCredential: (provider: string) =>
    http.post<{ ok: boolean; error?: string }>(`/ai/credentials/${provider}/test`, undefined, {
      timeoutMs: AI_TIMEOUT_MS,
    }),
  models: (provider: string) =>
    http.get<Array<{ id: string; name: string }>>(`/ai/credentials/${provider}/models`),
};

export default aiService;

/** Resposta de uma conversa com a IA (pode ter vindo de outro provedor). */
export interface AiChatResult {
  conversationId: string | null;
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  /** Preenchido só quando o provedor pedido falhou e outro assumiu. */
  fallback: AiFallbackInfo | null;
}

/** O que aconteceu quando houve troca de provedor. */
export interface AiFallbackInfo {
  from: string;
  attempts: Array<{ provider: string; model?: string; error: string }>;
}

/** Resultado da geração de questões pela IA. */
export interface AiGeneratedQuestions {
  created: number;
  provider: string;
  model: string;
  fallback: AiFallbackInfo | null;
  /** Quantas a IA mandou e nós descartamos por já existirem no banco. */
  skipped: number;
  duplicates: Array<{ prompt: string; score: number }>;
  questions: Question[];
  batchId: string | null;
}

/** Resumo da geração anexado ao simulado criado pela IA. */
export interface AiGenerationReport {
  created: number;
  skipped: number;
  duplicates: Array<{ prompt: string; score: number }>;
  /** Provedores que realmente geraram (pode ser mais de um). */
  providers: string[];
}
