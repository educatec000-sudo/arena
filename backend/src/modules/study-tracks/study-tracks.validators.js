import { z } from 'zod';
import { slugify } from '../../shared/slug.js';

export const slugParamSchema = z.object({ slug: z.string().trim().min(2).max(80) });
export const itemParamSchema = z.object({
  slug: z.string().trim().min(2).max(80),
  itemId: z.string().uuid('Etapa inválida.'),
});
export const idParamSchema = z.object({ id: z.string().uuid('Id inválido.') });

export const toggleItemSchema = z.object({ done: z.boolean().default(true) });

export const createTrackSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .transform((value) => slugify(value)),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  level: z.enum(['iniciante', 'intermediario', 'avancado']).default('iniciante'),
  order: z.number().int().min(0).max(999).default(0),
});

export const updateTrackSchema = createTrackSchema
  .partial()
  .omit({ slug: true })
  .extend({ isActive: z.boolean().optional() });

export const createItemSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  goalQuestions: z.number().int().min(1).max(500).default(20),
  subjectId: z.string().uuid().optional().nullable(),
  topicId: z.string().uuid().optional().nullable(),
  order: z.number().int().min(0).max(999).default(0),
});
