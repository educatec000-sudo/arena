/**
 * Revisão espaçada (caixas de Leitner) — mesma regra do app legado,
 * agora executada no servidor para que o progresso sobreviva ao dispositivo.
 */

/** Intervalo em dias entre revisões, por caixa (0 = errou / hoje). */
export const LEITNER_INTERVALS_DAYS = [0, 1, 2, 4, 9, 20];

export function nextBox(currentBox, wasCorrect) {
  if (!wasCorrect) return 0;
  return Math.min((currentBox || 0) + 1, LEITNER_INTERVALS_DAYS.length - 1);
}

export function nextReviewDate(box, from = new Date()) {
  const days = LEITNER_INTERVALS_DAYS[Math.min(box, LEITNER_INTERVALS_DAYS.length - 1)] ?? 0;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Aplica uma resposta ao estado atual e devolve os novos valores. */
export function applyReview(progress, wasCorrect, now = new Date()) {
  const attempts = (progress?.attempts || 0) + 1;
  const correctCount = (progress?.correctCount || 0) + (wasCorrect ? 1 : 0);
  const wrongCount = (progress?.wrongCount || 0) + (wasCorrect ? 0 : 1);
  const box = nextBox(progress?.leitnerBox || 0, wasCorrect);

  return {
    attempts,
    correctCount,
    wrongCount,
    leitnerBox: box,
    nextReviewAt: nextReviewDate(box, now),
    lastAnsweredAt: now,
    lastWasCorrect: wasCorrect,
  };
}

/** Taxa de acerto em % (0 quando nunca respondeu). */
export function accuracy(correct, total) {
  if (!total) return 0;
  return Number(((correct / total) * 100).toFixed(2));
}

/** Diagnóstico usado no relatório de simulados e no dashboard. */
export function diagnose(percent) {
  if (percent >= 70) return 'forte';
  if (percent >= 50) return 'atencao';
  return 'prioridade';
}
