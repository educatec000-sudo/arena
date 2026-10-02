/**
 * Tipos compartilhados do frontend.
 * Espelham os DTOs da API — se algo mudar no backend, muda aqui.
 */

export type Role = 'ADMIN' | 'EDITOR' | 'ALUNO';

export interface UserSetting {
  dailyGoal: number;
  totalGoal: number;
  examDate: string | null;
  examTimeMinutes: number;
  theme: string;
  onboardingDone: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  blockedAt: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  setting: UserSetting | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export type Difficulty = 'FACIL' | 'MEDIA' | 'DIFICIL';
export type QuestionOrigin = 'CURATED' | 'GENERATED' | 'IMPORTED' | 'AI';

export interface Subject {
  id: string;
  code: string;
  name: string;
  groupName: string | null;
  color: string;
  order: number;
  isActive: boolean;
}

export interface SubjectStats extends Subject {
  questions: number;
  topics: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  slug: string;
  order: number;
  subject?: Subject;
}

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
  isCorrect?: boolean;
}

export interface Question {
  id: string;
  externalId: string | null;
  subjectId: string;
  topicId: string | null;
  subject?: Subject;
  topic?: Topic;
  prompt: string;
  difficulty: Difficulty;
  year: number | null;
  source: string | null;
  legalBasis: string | null;
  origin: QuestionOrigin;
  status: string;
  tags: string[];
  options: QuestionOption[];
  // Campos de solução: presentes apenas quando a API revela o gabarito.
  correctLabel?: string | null;
  explanation?: string | null;
  analysis?: string | null;
  // Flags de estudo
  isFavorite?: boolean;
  inErrorNotebook?: boolean;
}

export interface AnswerResult {
  answerId: string;
  isCorrect: boolean;
  leitnerBox: number;
  nextReviewAt: string | null;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  correctLabel: string | null;
  explanation: string | null;
  analysis: string | null;
}

export interface Overview {
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  uniqueQuestions: number;
  minutesStudied: number;
  streak: number;
  daysStudied: number;
  today: { questions: number; correct: number };
  goals: {
    dailyGoal: number;
    totalGoal: number;
    remainingDays: number | null;
    remainingQuestions: number;
    suggestedDaily: number;
    percentOfTotalGoal: number;
  };
}

/** Agenda de revisão espaçada (caixas de Leitner). */
export interface ReviewSchedule {
  dueToday: number;
  dueTomorrow: number;
  dueNext7Days: number;
  scheduled: number;
  byBox: Array<{ box: number; total: number; intervalDays: number | null }>;
  questionIds: string[];
}

export interface EvolutionPoint {
  date: string;
  questions: number;
  correct: number;
  minutes: number;
  accuracy: number;
}

export interface SubjectPerformance {
  subjectId: string;
  code: string;
  name: string;
  color: string;
  bankTotal: number;
  answered: number;
  correct: number;
  wrong: number;
  accuracy: number;
  coverage: number;
  diagnosis: 'forte' | 'atencao' | 'prioridade';
}

export interface TopicPerformance {
  topicId: string;
  name: string;
  subject: Subject;
  answered: number;
  correct: number;
  wrong: number;
  accuracy: number;
  diagnosis: string;
}

export interface DifficultyPerformance {
  difficulty: Difficulty;
  label: string;
  answered: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface DashboardData {
  overview: Overview;
  evolution: EvolutionPoint[];
  bySubject: SubjectPerformance[];
  recentSimulados: SimuladoSummary[];
  counters: {
    pendingReviews: number;
    errorNotebook: number;
    favorites: number;
    simulados: number;
  };
}

export type SimuladoMode = 'MANUAL' | 'RANDOM' | 'ADAPTIVE' | 'ERRORS' | 'AI';
export type SimuladoStatus = 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';

export interface SimuladoQuestionView {
  id: string;
  order: number;
  isFlagged: boolean;
  answered: boolean;
  chosenLabel: string | null;
  correctLabel?: string | null;
  isCorrect?: boolean | null;
  explanation?: string | null;
  analysis?: string | null;
  prompt: string;
  options: QuestionOption[];
  subject?: Subject;
  topic?: Topic;
  difficulty: Difficulty;
  year?: number | null;
  source?: string | null;
  legalBasis?: string | null;
  externalId?: string | null;
  tags?: string[];
}

export interface SimuladoResultView {
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  percent: number;
  bySubject: Array<{
    subject: Subject;
    total: number;
    correct: number;
    wrong: number;
    blank: number;
    percent: number;
    diagnosis: string;
  }>;
}

export interface Simulado {
  id: string;
  title: string;
  description: string | null;
  mode: SimuladoMode;
  status: SimuladoStatus;
  durationMinutes: number;
  questionCount: number;
  shuffleOptions: boolean;
  feedbackMode: 'final' | 'imediato';
  startedAt: string;
  finishedAt: string | null;
  deadlineAt: string | null;
  timeSpentSeconds: number | null;
  answeredCount: number;
  result: SimuladoResultView | null;
  questions: SimuladoQuestionView[];
}

export interface SimuladoSummary {
  id: string;
  title: string;
  mode: SimuladoMode;
  status: SimuladoStatus;
  questionCount: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  score: number | null;
  percentCorrect: number | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  timeSpentSeconds: number | null;
}

export interface ErrorNotebookEntry {
  id: string;
  note: string | null;
  errorCount: number;
  reviewCount: number;
  lastErrorAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ErrorNotebookItem extends Question {
  notebook: ErrorNotebookEntry;
}

export interface AiMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  providerKey: string | null;
  model: string | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string | null;
  feature: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: AiMessage[];
}

export interface AiProviderInfo {
  key: string;
  name: string;
  kind: string;
  defaultModel: string | null;
  requiresKey: boolean;
  isFree: boolean;
  hasServerKey: boolean;
}

export interface AiCredential extends AiProviderInfo {
  hasKey: boolean;
  model: string | null;
  baseUrl: string | null;
  isEnabled: boolean;
  configured: boolean;
  lastError: string | null;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ApiErrorBody {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Array<{ field: string; message: string }>;
    requestId?: string;
  };
}

export interface TheoryItemView {
  id: string;
  subjectId: string;
  subject: Subject;
  title: string;
  content: string;
  order: number;
  done: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  metadata: unknown;
  actor: { id: string; name: string; email: string } | null;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  answers: number;
  simulados: number;
}

/* ------------------------------------------------------------------ gamificação -- */

export type RankingPeriod = '7d' | '30d' | 'all';

export interface Achievement {
  code: string;
  name: string;
  description: string | null;
  icon: string;
  criteria: string;
  target: number;
  xp: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface Gamification {
  xp: number;
  level: number;
  nextLevel: { into: number; need: number; percent: number };
  counters: {
    answers: number;
    correct: number;
    streak: number;
    simulados: number;
    favorites: number;
    errorBook: number;
    minutes: number | string;
    accuracy: number;
  };
  newlyUnlocked: Array<{ code: string; name: string; icon: string }>;
  achievements: Achievement[];
  totals: { unlocked: number; available: number };
}

export interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  xp: number;
  answers: number;
  correct: number;
  accuracy: number;
  simulados: number;
  level: number;
}

/* --------------------------------------------------------------------- trilhas -- */

export interface StudyTrackItem {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  order: number;
  goalQuestions: number;
  subjectId: string | null;
  subject?: { id: string; name: string; code: string; color: string } | null;
  done?: boolean;
  doneAt?: string | null;
}

export interface StudyTrack {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  items: StudyTrackItem[];
  progress: {
    completed: number;
    total: number;
    percent: number;
    goalQuestions: number;
  };
}
