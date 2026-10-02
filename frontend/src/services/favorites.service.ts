import http from './http';
import type { Question } from '@/types';

export const favoritesService = {
  list: (params: { page?: number; limit?: number; subjectId?: string } = {}) =>
    http.paged<Question>('/favorites', params),
  toggle: (questionId: string) =>
    http.post<{ favorited: boolean }>(`/favorites/${questionId}/toggle`),
  count: () => http.get<{ total: number }>('/favorites/count'),
};

export default favoritesService;
