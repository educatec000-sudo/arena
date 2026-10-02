import http from './http';
import type {
  AnswerResult,
  DashboardData,
  DifficultyPerformance,
  EvolutionPoint,
  Overview,
  ReviewSchedule,
  SimuladoSummary,
  SubjectPerformance,
  TopicPerformance,
} from '@/types';

export const progressService = {
  dashboard: () => http.get<DashboardData>('/progress/dashboard'),

  report: () =>
    http.get<{
      overview: Overview;
      evolution: EvolutionPoint[];
      bySubject: SubjectPerformance[];
      byTopic: TopicPerformance[];
      byDifficulty: DifficultyPerformance[];
      timing: { answeredWithTimer: number; averageSeconds: number; totalSeconds: number };
    }>('/progress/report'),

  overview: () => http.get<Overview>('/progress/overview'),

  evolution: (days = 35) => http.get<EvolutionPoint[]>('/progress/evolution', { days }),

  bySubject: () => http.get<SubjectPerformance[]>('/progress/by-subject'),

  byTopic: (subjectId?: string) => http.get<TopicPerformance[]>('/progress/by-topic', { subjectId }),

  byDifficulty: () => http.get<DifficultyPerformance[]>('/progress/by-difficulty'),

  reviewQueue: (limit = 30, subjectId?: string) =>
    http.get<{ questionIds: string[]; total: number }>('/progress/review-queue', { limit, subjectId }),

  /** Agenda de revisão espaçada: hoje, amanhã e próximos 7 dias. */
  schedule: (limit = 60) => http.get<ReviewSchedule>('/progress/review-schedule', { limit }),

  answer: (payload: {
    questionId: string;
    chosenLabel: string;
    timeSpentSeconds?: number;
    source?: 'TRAINING' | 'SIMULADO' | 'REVIEW' | 'ERROR_BOOK' | 'FAVORITES';
    studySessionId?: string;
  }) => http.post<AnswerResult>('/progress/answer', payload),

  addStudyTime: (seconds: number) => http.post('/progress/study-time', { seconds }),

  simuladoHistory: () => http.get<SimuladoSummary[]>('/progress/simulados'),
};

/** Favoritos, caderno de erros e sessões de estudo. */

export default progressService;
