import http from './http';
import type { Difficulty, Simulado, SimuladoMode, SimuladoSummary } from '@/types';

export const simuladosService = {
  list: (params: { page?: number; limit?: number; status?: string } = {}) =>
    http.paged<SimuladoSummary>('/simulados', params),

  get: (id: string) => http.get<Simulado>(`/simulados/${id}`),

  create: (payload: {
    title?: string;
    mode?: SimuladoMode;
    distribution?: Array<{ subjectId: string; topicIds?: string[]; quantity: number }>;
    topicIds?: string[];
    difficulty?: Difficulty;
    questionCount?: number;
    durationMinutes?: number;
    shuffleOptions?: boolean;
    feedbackMode?: 'final' | 'imediato';
  }) => http.post<Simulado>('/simulados', payload),

  answer: (id: string, payload: { questionId: string; chosenLabel: string | null; timeSpentSeconds?: number; flag?: boolean }) =>
    http.post(`/simulados/${id}/answer`, payload),

  finish: (id: string) => http.post<Simulado>(`/simulados/${id}/finish`),
  abandon: (id: string) => http.post(`/simulados/${id}/abandon`),
  remove: (id: string) => http.delete(`/simulados/${id}`),
  stats: () =>
    http.get<{
      total: number;
      finished: number;
      inProgress: number;
      averagePercent: number;
      averageScore: number;
      bestPercent: number;
    }>('/simulados/stats'),
};

export default simuladosService;
