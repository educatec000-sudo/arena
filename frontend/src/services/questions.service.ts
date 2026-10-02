import http from './http';
import type { Difficulty, Question, Subject, SubjectStats, Topic } from '@/types';

export interface QuestionQuery {
  page?: number;
  limit?: number;
  subject?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: 'facil' | 'media' | 'dificil';
  origin?: 'CURATED' | 'GENERATED' | 'IMPORTED' | 'AI';
  /** Exclui uma origem — usado por "sem as geradas por IA". */
  originNot?: 'CURATED' | 'GENERATED' | 'IMPORTED' | 'AI';
  year?: number;
  search?: string;
  tag?: string;
  mode?: 'todas' | 'novas' | 'erradas' | 'pendentes' | 'favoritas';
  includeSolution?: boolean;
}

export const questionsService = {
  list: (query: QuestionQuery = {}) =>
    http.paged<Question>('/questions', query as Record<string, string | number | boolean | undefined>),

  findById: (id: string, includeSolution = false) =>
    http.get<Question>(`/questions/${id}`, { includeSolution }),

  /** Sorteia questões avulsas. */
  random: (payload: {
    count: number;
    subjectIds?: string[];
    topicIds?: string[];
    difficulty?: Difficulty;
    excludeIds?: string[];
  }) => http.post<Question[]>('/questions/random', payload),

  /**
   * Monta uma sessão de treino aplicando filtros + modo de estudo.
   * (Equivale ao "Começar sessão" do app legado.)
   */
  session: (query: QuestionQuery) =>
    http.get<Question[]>('/questions/session', query as Record<string, string>),

  counts: () => http.get<Array<{ id: string; code: string; name: string; color: string; count: number }>>(
    '/questions/counts',
  ),

  stats: () =>
    http.get<{ total: number; byOrigin: Record<string, number> }>('/questions/stats'),

  create: (payload: unknown) => http.post<Question>('/questions', payload),
  update: (id: string, payload: unknown) => http.patch<Question>(`/questions/${id}`, payload),
  remove: (id: string) => http.delete(`/questions/${id}`),
};

export const subjectsService = {
  list: (includeTopics = false) => http.get<Subject[]>('/subjects', { includeTopics }),
  stats: () => http.get<SubjectStats[]>('/subjects/stats'),
  create: (payload: Partial<Subject>) => http.post<Subject>('/subjects', payload),
  update: (id: string, payload: Partial<Subject>) => http.patch<Subject>(`/subjects/${id}`, payload),
  remove: (id: string) => http.delete(`/subjects/${id}`),
};

export const topicsService = {
  list: (subjectId?: string) => http.get<Topic[]>('/topics', { subjectId }),
  create: (payload: { subjectId: string; name: string }) => http.post<Topic>('/topics', payload),
  update: (id: string, payload: Partial<Topic>) => http.patch<Topic>(`/topics/${id}`, payload),
  remove: (id: string) => http.delete(`/topics/${id}`),
  theory: (subjectId?: string) => http.get<import('@/types').TheoryItemView[]>('/topics/theory', { subjectId }),
  toggleTheory: (id: string, done = true) => http.post(`/topics/theory/${id}/read`, { done }),
};

export default questionsService;
