import http from './http';
import type { ErrorNotebookItem, Simulado, Subject } from '@/types';

export const errorNotebookService = {
  list: (params: { page?: number; limit?: number; subjectId?: string; onlyPending?: boolean } = {}) =>
    http.paged<ErrorNotebookItem>('/error-notebook', params),

  stats: () =>
    http.get<{
      pending: number;
      resolved: number;
      bySubject: Array<{ subject: Subject | null; total: number }>;
    }>('/error-notebook/stats'),

  add: (questionId: string, note?: string) => http.post(`/error-notebook/${questionId}`, { note }),
  updateNote: (questionId: string, note: string) =>
    http.patch(`/error-notebook/${questionId}/note`, { note }),
  remove: (questionId: string) => http.delete(`/error-notebook/${questionId}`),
  resolve: (questionId: string, resolved = true) =>
    http.patch(`/error-notebook/${questionId}/resolve`, { resolved }),

  generateSimulado: (payload: {
    count: number;
    subjectIds?: string[];
    durationMinutes?: number;
    shuffleOptions?: boolean;
    feedbackMode?: 'final' | 'imediato';
  }) => http.post<Simulado>('/error-notebook/generate-simulado', payload),
};

export default errorNotebookService;
