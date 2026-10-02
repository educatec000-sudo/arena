import { z } from 'zod';

const providerKey = z.string().trim().toLowerCase().optional();

export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().trim().min(1).max(20000),
      }),
    )
    .min(1, 'Envie ao menos uma mensagem.')
    .max(50),
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
  conversationId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  title: z.string().trim().max(160).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  saveHistory: z.boolean().default(true),
});

export const explainQuestionSchema = z.object({
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
  chosenLabel: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
});

export const summarizeSchema = z.object({
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  content: z.string().trim().max(20000).optional(),
  style: z.enum(['resumo', 'esquema', 'mapa', 'pontos']).default('resumo'),
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
});

export const generateQuestionsSchema = z.object({
  subjectId: z.string().uuid('Matéria inválida.'),
  topicId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(20).default(5),
  difficulty: z.enum(['FACIL', 'MEDIA', 'DIFICIL']).default('MEDIA'),
  saveToBank: z.boolean().default(true),
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
});

export const generateSimuladoSchema = z.object({
  subjectIds: z.array(z.string().uuid()).min(1).max(10),
  count: z.number().int().min(1).max(40).default(10),
  difficulty: z.enum(['FACIL', 'MEDIA', 'DIFICIL']).default('MEDIA'),
  durationMinutes: z.number().int().min(10).max(600).default(90),
  title: z.string().trim().max(120).optional(),
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
});

export const studyHelpSchema = z.object({
  message: z.string().trim().min(3).max(8000),
  provider: providerKey,
  model: z.string().trim().max(120).optional(),
});

export const credentialSchema = z.object({
  provider: z.string().trim().min(2).max(30),
  apiKey: z.string().trim().max(400).optional(),
  model: z.string().trim().max(120).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  isEnabled: z.boolean().default(true),
});

export const idParamSchema = z.object({ id: z.string().uuid('Id inválido.') });

export const listConversationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
