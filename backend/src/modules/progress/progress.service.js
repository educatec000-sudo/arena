import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { applyReview, accuracy, diagnose, LEITNER_INTERVALS_DAYS } from '../../shared/leitner.js';
import { addDays, dayKey, diffInDays, lastDays, startOfDay, toNumber } from '../../shared/date.js';

/**
 * Núcleo de progresso do aluno.
 *
 * Este é o ÚNICO ponto do sistema que grava uma resposta: treino, simulado,
 * revisão e caderno de erros passam todos por `registerAnswer`. Assim as
 * estatísticas nunca divergem entre telas.
 */

// ------------------------------------------------------------ gravação base --

/**
 * Registra uma resposta e propaga o efeito em:
 *  - Answer        (fato bruto, auditável)
 *  - UserProgress  (caixas de Leitner -> revisão espaçada)
 *  - DailyStat     (heatmap, streak, meta diária)
 *  - ErrorNotebook (entrada automática quando erra)
 *
 * @param {object} input
 * @returns {Promise<object>} resposta + estado Leitner atualizado
 */
export async function registerAnswer(input) {
  const {
    userId,
    questionId,
    chosenOptionId = null,
    chosenLabel = null,
    isCorrect,
    timeSpentSeconds = null,
    source = 'TRAINING',
    studySessionId = null,
    simuladoId = null,
    autoAddToErrorNotebook = true,
    note = null,
  } = input;

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, subjectId: true, topicId: true },
  });
  if (!question) throw ApiError.notFound('Questão não encontrada.');

  const now = new Date();
  const correct = Boolean(isCorrect);

  const existing = await prisma.userProgress.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  const next = applyReview(existing, correct, now);
  const minutes = timeSpentSeconds ? Number((timeSpentSeconds / 60).toFixed(2)) : 0;

  const [answer] = await prisma.$transaction([
    prisma.answer.create({
      data: {
        userId,
        questionId,
        chosenOptionId,
        chosenLabel,
        isCorrect: correct,
        timeSpentSeconds,
        source,
        studySessionId,
        simuladoId,
      },
    }),
    prisma.userProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId, ...next },
      update: next,
    }),
    prisma.dailyStat.upsert({
      where: { userId_date: { userId, date: startOfDay(now) } },
      create: {
        userId,
        date: startOfDay(now),
        questions: 1,
        correct: correct ? 1 : 0,
        minutes: new Prisma.Decimal(minutes),
      },
      update: {
        questions: { increment: 1 },
        correct: { increment: correct ? 1 : 0 },
        minutes: { increment: new Prisma.Decimal(minutes) },
      },
    }),
  ]);

  // Errar alimenta automaticamente o caderno de erros (comportamento do legado).
  if (!correct && autoAddToErrorNotebook) {
    await prisma.errorNotebookItem.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: {
        userId,
        questionId,
        subjectId: question.subjectId,
        note,
        errorCount: 1,
        lastErrorAt: now,
      },
      update: {
        errorCount: { increment: 1 },
        lastErrorAt: now,
        resolvedAt: null,
        ...(note ? { note } : {}),
      },
    });
  }

  // Acertar uma questão que estava no caderno conta como revisão feita.
  if (correct) {
    await prisma.errorNotebookItem.updateMany({
      where: { userId, questionId, resolvedAt: null },
      data: { reviewCount: { increment: 1 } },
    });
  }

  return {
    answerId: answer.id,
    isCorrect: correct,
    leitnerBox: next.leitnerBox,
    nextReviewAt: next.nextReviewAt,
    attempts: next.attempts,
    correctCount: next.correctCount,
    wrongCount: next.wrongCount,
  };
}

/** Soma tempo de estudo no dia (usado por sessões sem resposta direta). */
export async function addStudyMinutes(userId, seconds) {
  if (!seconds || seconds <= 0) return null;
  const now = new Date();
  return prisma.dailyStat.upsert({
    where: { userId_date: { userId, date: startOfDay(now) } },
    create: {
      userId,
      date: startOfDay(now),
      minutes: new Prisma.Decimal(Number((seconds / 60).toFixed(2))),
    },
    update: { minutes: { increment: new Prisma.Decimal(Number((seconds / 60).toFixed(2))) } },
  });
}

// --------------------------------------------------------------- consultas ---

/** Totais gerais do aluno (substitui o `metricas()` do legado). */
export async function getOverview(userId) {
  const [agg, uniqueAnswered, setting] = await Promise.all([
    prisma.dailyStat.aggregate({
      where: { userId },
      _sum: { questions: true, correct: true, minutes: true },
    }),
    prisma.userProgress.count({ where: { userId } }),
    prisma.userSetting.findUnique({ where: { userId } }),
  ]);

  const total = agg._sum.questions || 0;
  const correct = agg._sum.correct || 0;
  const minutes = toNumber(agg._sum.minutes);

  const history = await prisma.dailyStat.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true, questions: true },
  });

  const streak = computeStreak(history);
  const today = history.find((h) => dayKey(h.date) === dayKey()) || { questions: 0, correct: 0 };

  const totalGoal = setting?.totalGoal || 3000;
  const dailyGoal = setting?.dailyGoal || 41;
  const examDate = setting?.examDate || null;
  const remainingDays = examDate ? Math.max(0, diffInDays(examDate, new Date())) : null;
  const remainingQuestions = Math.max(0, totalGoal - total);
  const suggestedDaily = remainingDays && remainingDays > 0
    ? Math.ceil(remainingQuestions / remainingDays)
    : remainingQuestions;

  return {
    totalAnswered: total,
    totalCorrect: correct,
    totalWrong: Math.max(0, total - correct),
    accuracy: accuracy(correct, total),
    uniqueQuestions: uniqueAnswered,
    minutesStudied: Math.round(minutes),
    streak,
    daysStudied: history.filter((h) => h.questions > 0).length,
    today: { questions: today.questions || 0, correct: today.correct || 0 },
    goals: {
      dailyGoal,
      totalGoal,
      remainingDays,
      remainingQuestions,
      suggestedDaily,
      percentOfTotalGoal: Number(((total / totalGoal) * 100).toFixed(2)),
    },
  };
}

/** Sequência de dias consecutivos com estudo (hoje conta; ontem segura a série). */
function computeStreak(history) {
  if (!history.length) return 0;
  const daysWithStudy = new Set(
    history.filter((h) => h.questions > 0).map((h) => dayKey(h.date)),
  );
  if (!daysWithStudy.size) return 0;

  let cursor = new Date();
  // Se hoje ainda não estudou, a sequência continua válida a partir de ontem.
  if (!daysWithStudy.has(dayKey(cursor))) cursor = addDays(cursor, -1);

  let streak = 0;
  while (daysWithStudy.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Série diária para heatmap e gráfico de evolução. */
export async function getEvolution(userId, days = 35) {
  const since = startOfDay(addDays(new Date(), -(days - 1)));
  const stats = await prisma.dailyStat.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });
  const map = new Map(stats.map((s) => [dayKey(s.date), s]));

  return lastDays(days).map((date) => {
    const key = dayKey(date);
    const found = map.get(key);
    const questions = found?.questions || 0;
    const correct = found?.correct || 0;
    return {
      date: key,
      questions,
      correct,
      minutes: Math.round(toNumber(found?.minutes)),
      accuracy: accuracy(correct, questions),
    };
  });
}

/** Desempenho agregado por matéria (com cobertura do banco). */
export async function getBySubject(userId) {
  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: { _count: { select: { questions: true } } },
  });

  // Agrupar por matéria exige join: fazemos pela tabela de progresso.
  const progressBySubject = await prisma.userProgress.groupBy({
    by: ['questionId'],
    where: { userId },
    _sum: { attempts: true, correctCount: true },
  });

  const questionIds = progressBySubject.map((p) => p.questionId);
  const questions = questionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, subjectId: true },
      })
    : [];
  const subjectOf = new Map(questions.map((q) => [q.id, q.subjectId]));

  const totals = new Map();
  progressBySubject.forEach((p) => {
    const sid = subjectOf.get(p.questionId);
    if (!sid) return;
    const acc = totals.get(sid) || { attempts: 0, correct: 0, seen: 0 };
    acc.attempts += p._sum.attempts || 0;
    acc.correct += p._sum.correctCount || 0;
    acc.seen += 1;
    totals.set(sid, acc);
  });

  return subjects.map((s) => {
    const t = totals.get(s.id) || { attempts: 0, correct: 0, seen: 0 };
    const bankTotal = s._count.questions;
    return {
      subjectId: s.id,
      code: s.code,
      name: s.name,
      color: s.color,
      bankTotal,
      answered: t.attempts,
      correct: t.correct,
      wrong: Math.max(0, t.attempts - t.correct),
      accuracy: accuracy(t.correct, t.attempts),
      coverage: bankTotal ? Number(((t.seen / bankTotal) * 100).toFixed(2)) : 0,
      diagnosis: diagnose(accuracy(t.correct, t.attempts)),
    };
  });
}

/** Desempenho por assunto (tópico) do edital. */
export async function getByTopic(userId, subjectId) {
  const where = { userId };
  const answers = await prisma.answer.findMany({
    where,
    select: { questionId: true, isCorrect: true, question: { select: { topicId: true, subjectId: true } } },
    ...(subjectId ? { where: { userId, question: { subjectId } } } : {}),
  });

  const totals = new Map();
  answers.forEach((a) => {
    const tid = a.question?.topicId;
    if (!tid) return;
    const acc = totals.get(tid) || { total: 0, correct: 0 };
    acc.total += 1;
    if (a.isCorrect) acc.correct += 1;
    totals.set(tid, acc);
  });

  const topicIds = [...totals.keys()];
  const topics = topicIds.length
    ? await prisma.topic.findMany({
        where: { id: { in: topicIds } },
        include: { subject: { select: { id: true, name: true, code: true, color: true } } },
      })
    : [];

  return topics
    .map((topic) => {
      const t = totals.get(topic.id);
      return {
        topicId: topic.id,
        name: topic.name,
        subject: topic.subject,
        answered: t.total,
        correct: t.correct,
        wrong: t.total - t.correct,
        accuracy: accuracy(t.correct, t.total),
        diagnosis: diagnose(accuracy(t.correct, t.total)),
      };
    })
    .sort((a, b) => b.answered - a.answered);
}

/** Desempenho por nível de dificuldade. */
export async function getByDifficulty(userId) {
  const groups = await prisma.answer.groupBy({
    by: ['isCorrect'],
    where: { userId },
    _count: { _all: true },
  });

  const byDifficulty = await prisma.question.groupBy({
    by: ['difficulty'],
    where: { answers: { some: { userId } } },
    _count: { _all: true },
  });

  // Conta acertos por dificuldade com duas queries simples (evita RAW SQL).
  const [facil, media, dificil] = await Promise.all(
    ['FACIL', 'MEDIA', 'DIFICIL'].map(async (difficulty) => {
      const [total, correct] = await Promise.all([
        prisma.answer.count({ where: { userId, question: { difficulty } } }),
        prisma.answer.count({ where: { userId, isCorrect: true, question: { difficulty } } }),
      ]);
      return {
        difficulty,
        label: { FACIL: 'Fácil', MEDIA: 'Média', DIFICIL: 'Difícil' }[difficulty],
        answered: total,
        correct,
        wrong: total - correct,
        accuracy: accuracy(correct, total),
      };
    }),
  );

  void groups;
  void byDifficulty;
  return [facil, media, dificil];
}

/** Tempo médio por questão e total de minutos. */
export async function getTiming(userId) {
  const agg = await prisma.answer.aggregate({
    where: { userId, timeSpentSeconds: { not: null } },
    _avg: { timeSpentSeconds: true },
    _sum: { timeSpentSeconds: true },
    _count: { _all: true },
  });
  return {
    answeredWithTimer: agg._count._all,
    averageSeconds: Math.round(agg._avg.timeSpentSeconds || 0),
    totalSeconds: agg._sum.timeSpentSeconds || 0,
  };
}

/**
 * Fila de revisão espaçada (Leitner) — equivale ao `filaRevisao()` do legado:
 * questões vencidas OU com taxa de acerto abaixo de 60%.
 */
export async function getReviewQueue(userId, { limit = 30, subjectId } = {}) {
  const now = new Date();
  const progress = await prisma.userProgress.findMany({
    where: {
      userId,
      OR: [{ nextReviewAt: { lte: now } }, { wrongCount: { gt: 0 } }],
      ...(subjectId ? { question: { subjectId } } : {}),
    },
    orderBy: [{ nextReviewAt: 'asc' }],
    take: limit * 3,
    include: { question: { select: { id: true, subjectId: true, topicId: true, difficulty: true } } },
  });

  return progress
    .filter((p) => {
      const due = !p.nextReviewAt || p.nextReviewAt <= now;
      const weak = p.attempts > 0 && p.correctCount / p.attempts < 0.6;
      return due || weak;
    })
    .slice(0, limit)
    .map((p) => p.questionId);
}

/**
 * Agenda de revisão espaçada (caixas de Leitner).
 * Responde "o que eu reviso hoje / amanhã / nos próximos 7 dias?" — é o que
 * transforma o caderno de erros em rotina em vez de pilha infinita.
 */
export async function getReviewSchedule(userId, { limit = 60 } = {}) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inDays = (days) => new Date(startOfToday.getTime() + days * 24 * 60 * 60 * 1000);
  const tomorrow = inDays(1);
  const in7Days = inDays(8); // "próximos 7 dias" = hoje + 7

  const progress = await prisma.userProgress.findMany({
    where: { userId, nextReviewAt: { not: null } },
    select: { questionId: true, nextReviewAt: true, leitnerBox: true, attempts: true, correctCount: true },
    orderBy: [{ nextReviewAt: 'asc' }],
  });

  let dueToday = 0;
  let dueTomorrow = 0;
  let dueNext7Days = 0;
  const boxes = new Map();
  const dueIds = [];

  for (const item of progress) {
    if (!item.nextReviewAt) continue;

    boxes.set(
      item.leitnerBox || 0,
      (boxes.get(item.leitnerBox || 0) || 0) + 1,
    );

    if (item.nextReviewAt <= now) {
      dueToday += 1;
      if (dueIds.length < limit) dueIds.push(item.questionId);
    } else if (item.nextReviewAt < tomorrow) {
      dueTomorrow += 1;
    } else if (item.nextReviewAt < in7Days) {
      dueNext7Days += 1;
    }
  }

  return {
    dueToday,
    dueTomorrow,
    dueNext7Days,
    scheduled: progress.length,
    byBox: [...boxes.entries()]
      .map(([box, total]) => ({ box, total, intervalDays: LEITNER_INTERVALS_DAYS[box] ?? null }))
      .sort((a, b) => a.box - b.box),
    questionIds: dueIds,
  };
}

/** Histórico de simulados (usado no dashboard e na página de simulados). */
export async function getSimuladoHistory(userId, limit = 20) {
  return prisma.simulado.findMany({
    where: { userId, status: 'FINISHED' },
    orderBy: { finishedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      mode: true,
      correctCount: true,
      wrongCount: true,
      blankCount: true,
      questionCount: true,
      score: true,
      percentCorrect: true,
      finishedAt: true,
      timeSpentSeconds: true,
    },
  });
}

export const LEITNER_BOXES = LEITNER_INTERVALS_DAYS;

export default {
  registerAnswer,
  addStudyMinutes,
  getReviewSchedule,
  getOverview,
  getEvolution,
  getBySubject,
  getByTopic,
  getByDifficulty,
  getTiming,
  getReviewQueue,
  getSimuladoHistory,
};
