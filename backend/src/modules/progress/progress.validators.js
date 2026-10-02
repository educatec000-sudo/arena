import { z } from 'zod';

export const answerSchema = z.object({
  questionId: z.string().uuid('Questão inválida.'),
  chosenLabel: z.enum(['A', 'B', 'C', 'D', 'E']).optional().nullable(),
  chosenOptionId: z.string().uuid().optional().nullable(),
  timeSpentSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  source: z.enum(['TRAINING', 'SIMULADO', 'REVIEW', 'ERROR_BOOK', 'FAVORITES']).default('TRAINING'),
  studySessionId: z.string().uuid().optional().nullable(),
  simuladoId: z.string().uuid().optional().nullable(),
  autoAddToErrorNotebook: z.boolean().default(true),
});

export const studyTimeSchema = z.object({
  seconds: z.number().int().min(1).max(86400),
});

export const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  subjectId: z.string().uuid().optional(),
});

export const evolutionQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(35),
});
