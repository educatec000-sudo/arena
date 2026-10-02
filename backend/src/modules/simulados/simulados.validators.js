import { z } from 'zod';

const difficulty = z.enum(['FACIL', 'MEDIA', 'DIFICIL']).optional();

export const createSimuladoSchema = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  mode: z.enum(['MANUAL', 'RANDOM', 'ADAPTIVE', 'ERRORS', 'AI']).default('MANUAL'),

  // MANUAL: distribuição por matéria
  distribution: z
    .array(
      z.object({
        subjectId: z.string().uuid('Matéria inválida.'),
        topicIds: z.array(z.string().uuid()).max(50).optional(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .max(30)
    .default([]),

  topicIds: z.array(z.string().uuid()).max(50).default([]),
  difficulty,
  questionCount: z.number().int().min(1).max(200).default(20),

  durationMinutes: z.number().int().min(5).max(600).default(240),
  shuffleOptions: z.boolean().default(false),
  feedbackMode: z.enum(['final', 'imediato']).default('final'),
});

export const answerSchema = z.object({
  questionId: z.string().uuid('Questão inválida.'),
  chosenLabel: z.enum(['A', 'B', 'C', 'D', 'E']).optional().nullable(),
  timeSpentSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  flag: z.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid('Id inválido.') });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['IN_PROGRESS', 'FINISHED', 'ABANDONED']).optional(),
});
