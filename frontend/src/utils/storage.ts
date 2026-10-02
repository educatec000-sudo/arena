/**
 * Cache local (localStorage) para leitura offline.
 *
 * Regra de ouro: o banco é a fonte da verdade. O localStorage guarda apenas
 * cópias de leitura (banco de questões, última sessão de treino) e uma fila de
 * respostas feitas offline, que é enviada ao voltar a conexão.
 */

const PREFIX = 'arena:v1:';

export const storage = {
  get<T>(key: string, fallback: T | null = null): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* cota cheia ou modo privado: cache é opcional, seguimos sem ele */
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* silencioso */
    }
  },

  clearAll(): void {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      /* silencioso */
    }
  },
};

/** Fila de respostas feitas offline (enviada quando a conexão voltar). */
export interface PendingAnswer {
  questionId: string;
  chosenLabel: string;
  timeSpentSeconds?: number;
  source?: string;
  createdAt: number;
}

export const pendingAnswers = {
  KEY: 'pending-answers',
  all: (): PendingAnswer[] => storage.get<PendingAnswer[]>(pendingAnswers.KEY, []) || [],
  add: (answer: PendingAnswer) => {
    const list = pendingAnswers.all();
    list.push(answer);
    storage.set(pendingAnswers.KEY, list);
  },
  clear: () => storage.remove(pendingAnswers.KEY),
};

export default storage;
