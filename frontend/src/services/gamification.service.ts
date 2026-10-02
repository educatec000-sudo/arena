import http from './http';
import type { Achievement, Gamification, RankingEntry, RankingPeriod } from '@/types';

/** Gamificação: XP, nível e conquistas do usuário logado. */
export const gamificationService = {
  me: () => http.get<Gamification>('/gamification/me'),

  ranking: (period: RankingPeriod = '30d', limit = 20) =>
    http.get<{ period: RankingPeriod; updatedAt: string; ranking: RankingEntry[] }>(
      '/gamification/ranking',
      { period, limit },
    ),
};

export type { Achievement, Gamification, RankingEntry };
