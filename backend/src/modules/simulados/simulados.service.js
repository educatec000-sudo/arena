import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { questionsRepository } from '../questions/questions.repository.js';
import { registerAnswer } from '../progress/progress.service.js';
import { accuracy, diagnose } from '../../shared/leitner.js';

/**
 * Domínio de simulados.
 *
 * Ciclo de vida: criar (IN_PROGRESS) -> responder questões -> finalizar
 * (FINISHED). A correção é feita inteira no banco, então o aluno pode
 * fechar a aba no meio da prova e continuar em outro dispositivo.
 */

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];

// ------------------------------------------------------------- seleção -------

/**
 * Escolhe as questões do simulado a partir da distribuição pedida.
 * @returns {Promise<{ids: string[], perSubject: Map<string, number>}>}
 */
async function selectQuestions({ distribution, topicIds, difficulty, total, mode, userId }) {
  const perSubject = new Map();

  if (mode === 'MANUAL' && distribution?.length) {
    const ids = [];
    for (const item of distribution) {
      const where = { status: 'PUBLISHED', subjectId: item.subjectId };
      if (item.topicIds?.length) where.topicId = { in: item.topicIds };
      else if (topicIds?.length) where.topicId = { in: topicIds };
      if (difficulty) where.difficulty = difficulty;

      const rows = await prisma.question.findMany({
        where,
        select: { id: true },
        take: Math.min((item.quantity || 0) * 30, 3000),
      });
      const picked = rows.sort(() => Math.random() - 0.5).slice(0, item.quantity || 0);
      picked.forEach((q) => ids.push(q.id));
      perSubject.set(item.subjectId, picked.length);
    }
    return { ids, perSubject };
  }

  // RANDOM / ADAPTIVE / ERRORS / AI: quantidade total
  const where = { status: 'PUBLISHED' };
  if (difficulty) where.difficulty = difficulty;
  if (topicIds?.length) where.topicId = { in: topicIds };

  let candidateIds = null;

  if (mode === 'ADAPTIVE') {
    // Prioriza matérias com pior desempenho (reproduz "simulado personalizado").
    const weak = await prisma.userProgress.findMany({
      where: { userId, wrongCount: { gt: 0 } },
      orderBy: { wrongCount: 'desc' },
      take: 400,
      select: { questionId: true, wrongCount: true },
    });
    const questionIds = weak.map((w) => w.questionId);
    const questions = questionIds.length
      ? await prisma.question.findMany({
          where: { id: { in: questionIds } },
          select: { id: true, subjectId: true },
        })
      : [];

    const bySubject = new Map();
    questions.forEach((q) => {
      bySubject.set(q.subjectId, (bySubject.get(q.subjectId) || 0) + 1);
    });
    // Distribui proporcionalmente ao número de erros, garantindo ao menos 1.
    const ordered = [...bySubject.entries()].sort((a, b) => b[1] - a[1]);
    const ids = [];
    for (const [subjectId] of ordered) {
      const share = Math.max(1, Math.round((total * (bySubject.get(subjectId) || 1)) / Math.max(1, questions.length)));
      const rows = await prisma.question.findMany({
        where: { ...where, subjectId },
        select: { id: true },
        take: Math.min(share * 30, 3000),
      });
      const picked = rows.sort(() => Math.random() - 0.5).slice(0, share);
      picked.forEach((q) => ids.push(q.id));
      perSubject.set(subjectId, picked.length);
      if (ids.length >= total) break;
    }
    return { ids: ids.slice(0, total), perSubject };
  }

  if (mode === 'ERRORS') {
    const items = await prisma.errorNotebookItem.findMany({
      where: { userId, resolvedAt: null },
      orderBy: [{ errorCount: 'desc' }, { lastErrorAt: 'desc' }],
      select: { questionId: true },
      take: total * 3,
    });
    candidateIds = items.map((i) => i.questionId);
  }

  const rows = await prisma.question.findMany({
    where: { ...where, ...(candidateIds ? { id: { in: candidateIds } } : {}) },
    select: { id: true, subjectId: true },
    take: Math.min(total * 40, 6000),
  });

  const ids = rows
    .sort(() => Math.random() - 0.5)
    .slice(0, total)
    .map((q) => q.id);

  return { ids, perSubject };
}

/** Embaralha alternativas preservando o gabarito no snapshot. */
function buildOptionsSnapshot(question, shuffle) {
  const options = [...question.options].sort((a, b) => a.order - b.order);
  if (!shuffle) {
    return {
      options: options.map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
      correctLabel: options.find((o) => o.isCorrect)?.label || null,
    };
  }
  const shuffled = options.sort(() => Math.random() - 0.5);
  return {
    options: shuffled.map((o, index) => ({
      id: o.id,
      label: OPTION_LABELS[index],
      text: o.text,
      isCorrect: o.isCorrect,
    })),
    correctLabel: OPTION_LABELS[shuffled.findIndex((o) => o.isCorrect)],
  };
}

// ---------------------------------------------------------------- criação ---

export async function create(userId, payload) {
  const {
    title,
    description,
    mode = 'MANUAL',
    distribution = [],
    topicIds = [],
    difficulty = null,
    questionCount = 0,
    durationMinutes = 240,
    shuffleOptions = false,
    feedbackMode = 'final',
  } = payload;

  const total =
    mode === 'MANUAL'
      ? distribution.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      : Number(questionCount) || 0;

  if (total <= 0) throw ApiError.badRequest('Escolha pelo menos 1 questão para o simulado.');
  if (total > 200) throw ApiError.badRequest('Um simulado pode ter no máximo 200 questões.');

  const { ids } = await selectQuestions({
    distribution,
    topicIds,
    difficulty,
    total,
    mode,
    userId,
  });

  if (!ids.length) {
    throw ApiError.badRequest('Nenhuma questão encontrada com esses filtros.');
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
    },
  });

  // Mantém a ordem sorteada da seleção.
  const ordered = ids.map((id) => questions.find((q) => q.id === id)).filter(Boolean);
  const shuffledOrder = ordered.sort(() => Math.random() - 0.5);

  const simulado = await prisma.simulado.create({
    data: {
      userId,
      title: title || `Simulado ${new Date().toLocaleDateString('pt-BR')}`,
      description,
      mode,
      durationMinutes,
      shuffleOptions,
      feedbackMode,
      difficulty,
      questionCount: shuffledOrder.length,
      deadlineAt: new Date(Date.now() + durationMinutes * 60 * 1000),
      questions: {
        create: shuffledOrder.map((question, index) => {
          const snapshot = buildOptionsSnapshot(question, shuffleOptions);
          return {
            questionId: question.id,
            order: index,
            correctLabelSnapshot: snapshot.correctLabel,
            optionsSnapshot: snapshot.options,
          };
        }),
      },
      ...(mode === 'MANUAL'
        ? {
            filters: {
              create: distribution.map((d) => ({
                subjectId: d.subjectId,
                topicId: d.topicIds?.length === 1 ? d.topicIds[0] : null,
                difficulty,
                quantity: d.quantity,
              })),
            },
          }
        : {}),
    },
    include: { questions: true },
  });

  return getById(userId, simulado.id);
}


/**
 * Monta um simulado a partir de uma lista de questões JÁ ESCOLHIDA
 * (usado pelo gerador de IA: as questões acabaram de ser criadas e precisam
 * entrar na prova, e não ser sorteadas de novo do banco).
 */
export async function createWithQuestionIds(userId, payload) {
  const {
    questionIds = [],
    title,
    description = null,
    mode = 'AI',
    durationMinutes = 60,
    shuffleOptions = false,
    feedbackMode = 'final',
    difficulty = null,
    topicIds = [],
    distribution = [],
  } = payload;

  const ids = [...new Set(questionIds)].filter(Boolean);
  if (!ids.length) throw ApiError.badRequest('Nenhuma questão para montar o simulado.');
  if (ids.length > 200) throw ApiError.badRequest('Um simulado pode ter no máximo 200 questões.');

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  // Mantém a ordem em que as questões foram geradas.
  const ordered = ids.map((id) => questions.find((q) => q.id === id)).filter(Boolean);
  if (!ordered.length) throw ApiError.badRequest('As questões informadas não existem mais.');

  const simulado = await prisma.simulado.create({
    data: {
      userId,
      title: title || `Simulado ${new Date().toLocaleDateString('pt-BR')}`,
      description,
      mode,
      durationMinutes,
      shuffleOptions,
      feedbackMode,
      difficulty,
      questionCount: ordered.length,
      deadlineAt: new Date(Date.now() + durationMinutes * 60 * 1000),
      questions: {
        create: ordered.map((question, index) => {
          const snapshot = buildOptionsSnapshot(question, shuffleOptions);
          return {
            questionId: question.id,
            order: index,
            correctLabelSnapshot: snapshot.correctLabel,
            optionsSnapshot: snapshot.options,
          };
        }),
      },
      ...(mode === 'MANUAL'
        ? {
            filters: {
              create: distribution.map((d) => ({
                subjectId: d.subjectId,
                topicId: d.topicIds?.length === 1 ? d.topicIds[0] : null,
                difficulty,
                quantity: d.quantity,
              })),
            },
          }
        : {}),
    },
    include: { questions: true },
  });

  // Guarda os filtros usados na geração (auditável depois).
  if (topicIds.length) {
    void topicIds;
  }

  return getById(userId, simulado.id);
}

/** Atalho usado pelo caderno de erros. */
export async function createFromErrors(userId, payload) {
  const { count = 20, subjectIds = [], durationMinutes = 120, shuffleOptions = false, feedbackMode = 'final' } = payload;

  const items = await prisma.errorNotebookItem.findMany({
    where: {
      userId,
      resolvedAt: null,
      ...(subjectIds.length ? { subjectId: { in: subjectIds } } : {}),
    },
    orderBy: [{ errorCount: 'desc' }, { lastErrorAt: 'desc' }],
    select: { questionId: true },
    take: count * 3,
  });

  const ids = items
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((i) => i.questionId);

  if (!ids.length) {
    throw ApiError.badRequest('Seu caderno de erros está vazio. Erre algumas questões primeiro 🙂');
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    include: {
      options: { orderBy: { order: 'asc' } },
      subject: { select: { id: true, code: true, name: true, color: true } },
      topic: { select: { id: true, name: true } },
    },
  });

  const simulado = await prisma.simulado.create({
    data: {
      userId,
      title: `Simulado dos meus erros — ${new Date().toLocaleDateString('pt-BR')}`,
      mode: 'ERRORS',
      durationMinutes,
      shuffleOptions,
      feedbackMode,
      questionCount: questions.length,
      deadlineAt: new Date(Date.now() + durationMinutes * 60 * 1000),
      questions: {
        create: questions.map((question, index) => {
          const snapshot = buildOptionsSnapshot(question, shuffleOptions);
          return {
            questionId: question.id,
            order: index,
            correctLabelSnapshot: snapshot.correctLabel,
            optionsSnapshot: snapshot.options,
          };
        }),
      },
    },
  });

  return getById(userId, simulado.id);
}

// ---------------------------------------------------------------- leitura ---

function serializeQuestion(sq, { includeSolution = false } = {}) {
  const q = sq.question;
  const snapshot = sq.optionsSnapshot || null;
  const options = snapshot
    ? snapshot.map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        ...(includeSolution ? { isCorrect: o.isCorrect } : {}),
      }))
    : (q.options || []).map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        ...(includeSolution ? { isCorrect: o.isCorrect } : {}),
      }));

  return {
    ...questionsRepository.toDto(q, { includeSolution: false }),
    options,
    order: sq.order,
    isFlagged: sq.isFlagged,
    answered: sq.answeredAt !== null,
    chosenLabel: sq.chosenOption ? sq.chosenOption.label : null,
    ...(includeSolution
      ? {
          correctLabel: sq.correctLabelSnapshot,
          explanation: q.explanation,
          analysis: q.analysis,
          isCorrect: sq.isCorrect,
        }
      : {}),
  };
}

export async function getById(userId, id, { includeSolution = false } = {}) {
  const simulado = await prisma.simulado.findFirst({
    where: { id, userId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          question: {
            include: {
              options: { orderBy: { order: 'asc' } },
              subject: { select: { id: true, code: true, name: true, color: true } },
              topic: { select: { id: true, name: true } },
              tags: { include: { tag: true } },
            },
          },
          chosenOption: true,
        },
      },
      results: { include: { subject: { select: { id: true, code: true, name: true, color: true } } } },
    },
  });

  if (!simulado) throw ApiError.notFound('Simulado não encontrado.');

  const finished = simulado.status === 'FINISHED';
  const reveal = includeSolution || finished || simulado.feedbackMode === 'imediato';

  return {
    id: simulado.id,
    title: simulado.title,
    description: simulado.description,
    mode: simulado.mode,
    status: simulado.status,
    durationMinutes: simulado.durationMinutes,
    questionCount: simulado.questionCount,
    shuffleOptions: simulado.shuffleOptions,
    feedbackMode: simulado.feedbackMode,
    startedAt: simulado.startedAt,
    finishedAt: simulado.finishedAt,
    deadlineAt: simulado.deadlineAt,
    timeSpentSeconds: simulado.timeSpentSeconds,
    answeredCount: simulado.correctCount + simulado.wrongCount,
    result: finished
      ? {
          correct: simulado.correctCount,
          wrong: simulado.wrongCount,
          blank: simulado.blankCount,
          score: simulado.score ? Number(simulado.score) : 0,
          percent: simulado.percentCorrect ? Number(simulado.percentCorrect) : 0,
          bySubject: simulado.results.map((r) => ({
            subject: r.subject,
            total: r.total,
            correct: r.correct,
            wrong: r.wrong,
            blank: r.blank,
            percent: Number(r.percent),
            diagnosis: r.diagnosis,
          })),
        }
      : null,
    questions: simulado.questions.map((sq) => serializeQuestion(sq, { includeSolution: reveal })),
  };
}

export async function list(userId, { page = 1, limit = 20, status } = {}) {
  const where = { userId, ...(status ? { status } : {}) };
  const [total, rows] = await Promise.all([
    prisma.simulado.count({ where }),
    prisma.simulado.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        mode: true,
        status: true,
        questionCount: true,
        correctCount: true,
        wrongCount: true,
        blankCount: true,
        score: true,
        percentCorrect: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        timeSpentSeconds: true,
      },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      score: r.score ? Number(r.score) : null,
      percentCorrect: r.percentCorrect ? Number(r.percentCorrect) : null,
    })),
    total,
    page,
    limit,
  };
}

// -------------------------------------------------------------- execução ----

export async function answerQuestion(userId, simuladoId, { questionId, chosenLabel, timeSpentSeconds, flag }) {
  const simulado = await prisma.simulado.findFirst({ where: { id: simuladoId, userId } });
  if (!simulado) throw ApiError.notFound('Simulado não encontrado.');
  if (simulado.status !== 'IN_PROGRESS') {
    throw ApiError.badRequest('Este simulado já foi finalizado.');
  }

  const sq = await prisma.simuladoQuestion.findUnique({
    where: { simuladoId_questionId: { simuladoId, questionId } },
    include: { question: { include: { options: true } } },
  });
  if (!sq) throw ApiError.notFound('Esta questão não pertence ao simulado.');

  const snapshot = sq.optionsSnapshot;
  const options = snapshot || sq.question.options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect }));

  const chosen = chosenLabel ? options.find((o) => o.label === chosenLabel) : null;
  if (chosenLabel && !chosen) throw ApiError.badRequest('Alternativa inválida.');

  const correctLabel = sq.correctLabelSnapshot;
  const isCorrect = chosen ? chosen.label === correctLabel : false;

  await prisma.simuladoQuestion.update({
    where: { id: sq.id },
    data: {
      chosenOptionId: chosen ? chosen.id : null,
      isCorrect: chosen ? isCorrect : null,
      isBlank: !chosen,
      answeredAt: chosen ? new Date() : null,
      timeSpentSeconds: timeSpentSeconds ?? undefined,
      ...(flag !== undefined ? { isFlagged: flag } : {}),
    },
  });

  const immediate = simulado.feedbackMode === 'imediato';

  return {
    questionId,
    chosenLabel: chosen?.label || null,
    answered: Boolean(chosen),
    // No modo "final" o gabarito (e até o acerto) só aparece depois de corrigir:
    // devolver isCorrect aqui estragaria o simulado.
    ...(immediate ? { isCorrect: chosen ? isCorrect : null } : {}),
    reveal: immediate,
    ...(immediate
      ? {
          correctLabel,
          explanation: sq.question.explanation,
          analysis: sq.question.analysis,
        }
      : {}),
  };
}

/** Finaliza o simulado, corrige e grava o progresso do aluno. */
export async function finish(userId, simuladoId) {
  const simulado = await prisma.simulado.findFirst({
    where: { id: simuladoId, userId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { question: { select: { id: true, subjectId: true } }, chosenOption: true },
      },
    },
  });

  if (!simulado) throw ApiError.notFound('Simulado não encontrado.');
  if (simulado.status === 'FINISHED') return getById(userId, simuladoId);

  const now = new Date();
  const timeSpentSeconds = Math.max(
    0,
    Math.round((now.getTime() - simulado.startedAt.getTime()) / 1000),
  );

  let correct = 0;
  let wrong = 0;
  let blank = 0;
  const bySubject = new Map();

  simulado.questions.forEach((sq) => {
    const subjectId = sq.question.subjectId;
    const acc = bySubject.get(subjectId) || { total: 0, correct: 0, wrong: 0, blank: 0 };
    acc.total += 1;

    if (sq.isBlank || sq.chosenOptionId === null) {
      blank += 1;
      acc.blank += 1;
    } else if (sq.isCorrect) {
      correct += 1;
      acc.correct += 1;
    } else {
      wrong += 1;
      acc.wrong += 1;
    }
    bySubject.set(subjectId, acc);
  });

  const total = simulado.questions.length;
  const percent = accuracy(correct, total);
  const score = total ? Number(((correct / total) * 10).toFixed(2)) : 0;

  await prisma.$transaction(async (tx) => {
    await tx.simuladoResult.deleteMany({ where: { simuladoId } });

    await tx.simulado.update({
      where: { id: simuladoId },
      data: {
        status: 'FINISHED',
        finishedAt: now,
        timeSpentSeconds,
        correctCount: correct,
        wrongCount: wrong,
        blankCount: blank,
        score: new Prisma.Decimal(score),
        percentCorrect: new Prisma.Decimal(percent),
      },
    });

    await tx.simuladoResult.createMany({
      data: [...bySubject.entries()].map(([subjectId, acc]) => ({
        simuladoId,
        subjectId,
        total: acc.total,
        correct: acc.correct,
        wrong: acc.wrong,
        blank: acc.blank,
        percent: new Prisma.Decimal(accuracy(acc.correct, acc.total)),
        diagnosis: diagnose(accuracy(acc.correct, acc.total)),
      })),
    });
  });

  // Registra cada resposta no progresso (fora da transação: gravação pesada
  // e o simulado já está consistente a partir daqui).
  for (const sq of simulado.questions) {
    if (sq.chosenOptionId === null) continue; // em branco não conta
    await registerAnswer({
      userId,
      questionId: sq.questionId,
      chosenOptionId: sq.chosenOptionId,
      chosenLabel: sq.chosenOption?.label || null,
      isCorrect: Boolean(sq.isCorrect),
      timeSpentSeconds: sq.timeSpentSeconds || null,
      source: 'SIMULADO',
      simuladoId,
    });
  }

  return getById(userId, simuladoId);
}

export async function abandon(userId, simuladoId) {
  const simulado = await prisma.simulado.findFirst({ where: { id: simuladoId, userId } });
  if (!simulado) throw ApiError.notFound('Simulado não encontrado.');
  if (simulado.status !== 'IN_PROGRESS') return { id: simuladoId, status: simulado.status };

  await prisma.simulado.update({
    where: { id: simuladoId },
    data: { status: 'ABANDONED', finishedAt: new Date() },
  });
  return { id: simuladoId, status: 'ABANDONED' };
}

export async function remove(userId, simuladoId) {
  const simulado = await prisma.simulado.findFirst({ where: { id: simuladoId, userId } });
  if (!simulado) throw ApiError.notFound('Simulado não encontrado.');
  await prisma.simulado.delete({ where: { id: simuladoId } });
  return { id: simuladoId, deleted: true };
}

/** Estatísticas agregadas de simulados do aluno. */
export async function stats(userId) {
  const [total, finished, agg] = await Promise.all([
    prisma.simulado.count({ where: { userId } }),
    prisma.simulado.count({ where: { userId, status: 'FINISHED' } }),
    prisma.simulado.aggregate({
      where: { userId, status: 'FINISHED' },
      _avg: { percentCorrect: true, score: true },
      _max: { percentCorrect: true },
    }),
  ]);

  return {
    total,
    finished,
    inProgress: total - finished,
    averagePercent: Number(agg._avg.percentCorrect || 0),
    averageScore: Number(agg._avg.score || 0),
    bestPercent: Number(agg._max.percentCorrect || 0),
  };
}

export default {
  createWithQuestionIds,
  create,
  createFromErrors,
  getById,
  list,
  answerQuestion,
  finish,
  abandon,
  remove,
  stats,
};
