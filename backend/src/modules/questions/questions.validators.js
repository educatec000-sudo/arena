import { z } from 'zod';

const LEGACY_DIFFICULTY = { facil: 'FACIL', media: 'MEDIA', dificil: 'DIFICIL', todas: undefined };

export const difficultyParam = z
  .enum(['FACIL', 'MEDIA', 'DIFICIL', 'facil', 'media', 'dificil'])
  .optional()
  .transform((v) => (v ? (LEGACY_DIFFICULTY[v] ?? v.toUpperCase()) : undefined));

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // aceita o id da matéria (uuid) ou a sigla do legado (LP, PL, DA...)
  subjectId: z.string().optional(),
  subject: z.string().optional(),
  topicId: z.string().uuid().optional(),
  difficulty: difficultyParam,
  origin: z.enum(['CURATED', 'GENERATED', 'IMPORTED', 'AI']).optional(),
  /** Exclui uma origem — usado pelo filtro "sem as geradas por IA". */
  originNot: z.enum(['CURATED', 'GENERATED', 'IMPORTED', 'AI']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  search: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  /**
   * Modos de estudo (herdados do app legado):
   *  novas     -> nunca respondidas
   *  erradas   -> caderno de erros
   *  pendentes -> revisão espaçada vencida
   *  favoritas -> favoritas do usuário
   */
  mode: z.enum(['todas', 'novas', 'erradas', 'pendentes', 'favoritas']).default('todas'),
  random: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  includeSolution: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const optionSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D', 'E']),
  text: z.string().trim().min(1, 'Texto da alternativa obrigatório.').max(2000),
  isCorrect: z.boolean().default(false),
});

/** Campos base — reaproveitados por create (superRefine) e update (partial). */
const questionFields = z
  .object({
    externalId: z.string().trim().max(60).optional().nullable(),
    subjectId: z.string({ required_error: 'Informe a matéria.' }).uuid('Matéria inválida.'),
    topicId: z.string().uuid().optional().nullable(),
    prompt: z.string({ required_error: 'Informe o enunciado.' }).trim().min(10).max(10000),
    difficulty: z.enum(['FACIL', 'MEDIA', 'DIFICIL']).default('MEDIA'),
    year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
    source: z.string().trim().max(120).optional().nullable(),
    legalBasis: z.string().trim().max(2000).optional().nullable(),
    explanation: z.string().trim().max(20000).optional().nullable(),
    analysis: z.string().trim().max(20000).optional().nullable(),
    origin: z.enum(['CURATED', 'GENERATED', 'IMPORTED', 'AI']).default('CURATED'),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
    tags: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
    options: z
      .array(optionSchema)
      .min(2, 'A questão precisa de pelo menos 2 alternativas.')
      .max(5, 'No máximo 5 alternativas.'),
  })
;

export const createQuestionSchema = questionFields.superRefine((data, ctx) => {
  const correct = data.options.filter((o) => o.isCorrect);
  if (correct.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A questão deve ter exatamente uma alternativa correta.',
      path: ['options'],
    });
  }
  const labels = data.options.map((o) => o.label);
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Há letras de alternativa repetidas.',
      path: ['options'],
    });
  }
});

/** Na edição, as regras de gabarito só valem se as alternativas forem enviadas. */
export const updateQuestionSchema = questionFields.partial().superRefine((data, ctx) => {
  if (!data.options) return;
  const correct = data.options.filter((o) => o.isCorrect);
  if (correct.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A questão deve ter exatamente uma alternativa correta.',
      path: ['options'],
    });
  }
  const labels = data.options.map((o) => o.label);
  if (new Set(labels).size !== labels.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Há letras de alternativa repetidas.',
      path: ['options'],
    });
  }
});

export const idParamSchema = z.object({ id: z.string().uuid('Id inválido.') });

export const pickRandomSchema = z.object({
  count: z.coerce.number().int().min(1).max(100).default(20),
  subjectIds: z.array(z.string().uuid()).max(20).optional(),
  topicIds: z.array(z.string().uuid()).max(50).optional(),
  difficulty: difficultyParam,
  excludeIds: z.array(z.string().uuid()).max(500).optional(),
});
