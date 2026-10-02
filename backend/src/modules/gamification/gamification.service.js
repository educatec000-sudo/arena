import { prisma } from '../../database/prisma.js';

/**
 * Gamificação: XP, níveis e conquistas.
 *
 * Regra importante: **nada é digitado pelo usuário**. O XP é derivado do que
 * já existe no banco (respostas, acertos, streak, simulados) e as conquistas
 * são concedidas automaticamente quando a meta é batida. Assim o ranking é
 * honesto e não existe como inflar a pontuação.
 */

/** XP por atividade (mantido simples de propósito: dá para explicar ao aluno). */
export const XP_RULES = {
  answer: 2,
  correct: 3,
  simuladoFinished: 40,
  errorResolved: 5,
};

/** Níveis: cada nível exige um pouco mais que o anterior. */
export function levelFromXp(xp) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
  return level;
}

/** Quanto de XP falta para o próximo nível. */
function levelProgress(xp) {
  const level = levelFromXp(xp);
  const xpForLevel = (level - 1) ** 2 * 60;
  const xpForNext = level ** 2 * 60;
  const into = xp - xpForLevel;
  const span = Math.max(1, xpForNext - xpForLevel);
  return { level, into, need: span, percent: Math.min(100, (into / span) * 100) };
}

/** Contadores que alimentam as conquistas (uma consulta por fonte). */
async function collectStats(userId) {
  const [answers, correct, simulados, favorites, errorsResolved, progress, unlocked] =
    await Promise.all([
      prisma.answer.count({ where: { userId } }),
      prisma.answer.count({ where: { userId, isCorrect: true } }),
      prisma.simulado.count({ where: { userId, status: 'FINISHED' } }),
      prisma.favorite.count({ where: { userId } }),
      prisma.errorNotebookItem.count({ where: { userId, resolvedAt: { not: null } } }),
      prisma.dailyStat.aggregate({ where: { userId }, _sum: { minutes: true } }),
      prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
      }),
    ]);

  const minutes = progress._sum.minutes || 0;
  const accuracy = answers ? (correct / answers) * 100 : 0;

  const streak = await currentStreak(userId);

  return {
    counters: {
      answers,
      correct,
      streak,
      simulados,
      favorites,
      errorBook: errorsResolved,
      minutes,
      accuracy,
    },
    unlocked,
  };
}

/** Dias consecutivos com pelo menos uma resposta (terminando hoje ou ontem). */
async function currentStreak(userId) {
  const days = await prisma.answer.findMany({
    where: { userId },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  if (!days.length) return 0;

  const unique = [...new Set(days.map((item) => item.createdAt.toISOString().slice(0, 10)))].sort().reverse();
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const iso = (date) => date.toISOString().slice(0, 10);

  let streak = 0;
  let cursor = unique[0] === iso(today) ? today : unique[0] === iso(yesterday) ? yesterday : null;
  if (!cursor) return 0;

  for (const day of unique) {
    if (day !== iso(cursor)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

/** Verifica as metas e concede as conquistas novas (retorna as recém-ganhas). */
async function syncAchievements(userId, counters, unlocked) {
  const already = new Set(unlocked.map((item) => item.achievement.code));
  const catalog = await prisma.achievement.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  const earned = [];
  for (const achievement of catalog) {
    if (already.has(achievement.code)) continue;

    const value = counters[achievement.criteria] ?? 0;
    // Conquistas de aproveitamento exigem volume mínimo para não serem acidentais.
    const hasVolume =
      achievement.criteria !== 'accuracy' || counters.answers >= (achievement.target >= 80 ? 100 : 50);

    if (value >= achievement.target && hasVolume) {
      await prisma.userAchievement.create({ data: { userId, achievementId: achievement.id } });
      earned.push(achievement);
    }
  }
  return earned;
}

/** Painel de gamificação do usuário (XP, nível e conquistas). */
export async function getGamification(userId) {
  const { counters, unlocked } = await collectStats(userId);
  const earnedNow = await syncAchievements(userId, counters, unlocked);

  const activityXp =
    counters.correct * XP_RULES.correct +
    (counters.answers - counters.correct) * XP_RULES.answer +
    counters.simulados * XP_RULES.simuladoFinished +
    counters.errorBook * XP_RULES.errorResolved;

  const allUnlocked = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
    orderBy: { unlockedAt: 'desc' },
  });

  const achievementXp = allUnlocked.reduce((sum, item) => sum + (item.achievement.xp || 0), 0);
  const xp = activityXp + achievementXp;
  const { level, into, need, percent } = levelProgress(xp);

  const catalog = await prisma.achievement.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });
  const unlockedMap = new Map(allUnlocked.map((item) => [item.achievementId, item.unlockedAt]));

  return {
    xp,
    level,
    nextLevel: { into: Math.round(into), need, percent: Number(percent.toFixed(1)) },
    counters,
    newlyUnlocked: earnedNow.map((item) => ({
      code: item.code,
      name: item.name,
      icon: item.icon,
    })),
    achievements: catalog.map((item) => ({
      code: item.code,
      name: item.name,
      description: item.description,
      icon: item.icon,
      criteria: item.criteria,
      target: item.target,
      xp: item.xp,
      progress: Math.min(100, ((counters[item.criteria] ?? 0) / item.target) * 100),
      unlocked: unlockedMap.has(item.id),
      unlockedAt: unlockedMap.get(item.id) || null,
    })),
    totals: {
      unlocked: allUnlocked.length,
      available: catalog.length,
    },
  };
}

/**
 * Ranking por XP no período.
 * Privacidade: só o primeiro nome + inicial do sobrenome e nunca o e-mail.
 */
export async function getRanking({ period = '30d', limit = 20 } = {}) {
  const days = period === '7d' ? 7 : period === 'all' ? null : 30;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, blockedAt: null },
    select: { id: true, name: true },
    take: 500,
  });

  const [answers, simulados] = await Promise.all([
    prisma.answer.groupBy({
      by: ['userId', 'isCorrect'],
      ...(since ? { where: { createdAt: { gte: since } } } : {}),
      _count: { _all: true },
    }),
    prisma.simulado.groupBy({
      by: ['userId'],
      where: { status: 'FINISHED', ...(since ? { finishedAt: { gte: since } } : {}) },
      _count: { _all: true },
    }),
  ]);

  const simuladoMap = new Map(simulados.map((row) => [row.userId, row._count._all]));
  const stats = new Map();

  for (const row of answers) {
    const current = stats.get(row.userId) || { answers: 0, correct: 0 };
    current.answers += row._count._all;
    if (row.isCorrect) current.correct += row._count._all;
    stats.set(row.userId, current);
  }

  const ranking = users
    .map((user) => {
      const stat = stats.get(user.id) || { answers: 0, correct: 0 };
      const finished = simuladoMap.get(user.id) || 0;
      const xp =
        stat.correct * XP_RULES.correct +
        (stat.answers - stat.correct) * XP_RULES.answer +
        finished * XP_RULES.simuladoFinished;

      return {
        userId: user.id,
        name: maskName(user.name),
        xp,
        answers: stat.answers,
        correct: stat.correct,
        accuracy: stat.answers ? Number(((stat.correct / stat.answers) * 100).toFixed(1)) : 0,
        simulados: finished,
        level: levelFromXp(xp),
      };
    })
    .filter((row) => row.answers > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit)
    .map((row, index) => ({ position: index + 1, ...row }));

  return { period, updatedAt: new Date().toISOString(), ranking };
}

/** "Ana Souza" -> "Ana S." (o ranking é público, o e-mail nunca aparece). */
export function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export default { getGamification, getRanking, levelFromXp, maskName };
