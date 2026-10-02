import { z } from 'zod';

export const rankingQuerySchema = z.object({
  period: z.enum(['7d', '30d', 'all']).default('30d'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
