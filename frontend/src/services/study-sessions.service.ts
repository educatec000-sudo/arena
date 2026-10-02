import http from './http';

export const studySessionsService = {
  list: (params: { page?: number; limit?: number } = {}) =>
    http.paged<{
      id: string;
      title: string;
      kind: string;
      totalQuestions: number;
      answeredCount: number;
      correctCount: number;
      startedAt: string;
      finishedAt: string | null;
      durationSeconds: number | null;
    }>('/study-sessions', params),

  start: (payload: { title?: string; kind?: string; totalQuestions?: number; metadata?: unknown }) =>
    http.post<{ id: string }>('/study-sessions', payload),

  finish: (id: string, payload: { answeredCount?: number; correctCount?: number } = {}) =>
    http.post(`/study-sessions/${id}/finish`, payload),

  get: (id: string) => http.get(`/study-sessions/${id}`),
  remove: (id: string) => http.delete(`/study-sessions/${id}`),
};

/** Usuário logado. */

export default studySessionsService;
