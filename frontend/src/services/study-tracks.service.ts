import http from './http';
import type { StudyTrack } from '@/types';

/** Trilhas de estudo: roteiro sugerido de matérias/assuntos. */
export const studyTracksService = {
  list: () => http.get<StudyTrack[]>('/study-tracks'),

  bySlug: (slug: string) => http.get<StudyTrack>(`/study-tracks/${slug}`),

  /** Marca (ou desmarca) uma etapa como concluída. */
  setDone: (slug: string, itemId: string, done: boolean) =>
    http.post<{ itemId: string; done: boolean }>(
      `/study-tracks/${slug}/items/${itemId}/complete`,
      { done },
    ),

  /** Zera o progresso do usuário na trilha. */
  reset: (slug: string) => http.post<{ ok: boolean }>(`/study-tracks/${slug}/reset`),

  // ------------------------------------------------------------ admin/editor --
  create: (payload: { slug: string; title: string; description?: string; level?: string }) =>
    http.post<StudyTrack>('/study-tracks', payload),

  update: (id: string, payload: Partial<{ title: string; description: string; level: string }>) =>
    http.patch<StudyTrack>(`/study-tracks/${id}`, payload),

  remove: (id: string) => http.delete<{ ok: boolean }>(`/study-tracks/${id}`),

  addItem: (
    id: string,
    payload: { subjectId?: string; topicId?: string; title: string; description?: string; goalQuestions?: number },
  ) => http.post<StudyTrack['items'][number]>(`/study-tracks/${id}/items`, payload),

  removeItem: (id: string, itemId: string) =>
    http.delete<{ ok: boolean }>(`/study-tracks/${id}/items/${itemId}`),
};
