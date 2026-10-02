import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { hashPassword } from '../../shared/password.js';
import { parsePagination, buildSearch } from '../../shared/pagination.js';
import { accuracy } from '../../shared/leitner.js';

/**
 * Domínio administrativo.
 *
 * Toda ação aqui gera `AuditLog` (feito nos controllers) — é o requisito de
 * auditoria de ações administrativas.
 */

// ---------------------------------------------------------------- dashboard --

export async function getDashboard() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [
    totalUsers,
    activeUsers,
    newUsers7d,
    newUsers30d,
    blockedUsers,
    totalQuestions,
    questionsByOrigin,
    totalSubjects,
    totalTopics,
    totalAnswers,
    correctAnswers,
    totalSimulados,
    finishedSimulados,
    openErrors,
    totalConversations,
    answersByDay,
    roleDistribution,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, isActive: true, blockedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { deletedAt: null, blockedAt: { not: null } } }),
    prisma.question.count({ where: { status: 'PUBLISHED' } }),
    prisma.question.groupBy({ by: ['origin'], where: { status: 'PUBLISHED' }, _count: { _all: true } }),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.topic.count({ where: { isActive: true } }),
    prisma.answer.count(),
    prisma.answer.count({ where: { isCorrect: true } }),
    prisma.simulado.count(),
    prisma.simulado.count({ where: { status: 'FINISHED' } }),
    prisma.errorNotebookItem.count({ where: { resolvedAt: null } }),
    prisma.aiConversation.count(),
    prisma.dailyStat.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      select: { date: true, questions: true, correct: true },
      orderBy: { date: 'asc' },
    }),
    prisma.user.groupBy({ by: ['roleId'], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  // Agrega respostas por dia (o groupBy por Date é desalinhado por fuso).
  const dayMap = new Map();
  answersByDay.forEach((row) => {
    const key = new Date(row.date).toISOString().slice(0, 10);
    const acc = dayMap.get(key) || { date: key, questions: 0, correct: 0 };
    acc.questions += row.questions;
    acc.correct += row.correct;
    dayMap.set(key, acc);
  });

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      blocked: blockedUsers,
      newLast7Days: newUsers7d,
      newLast30Days: newUsers30d,
      byRole: roleDistribution.map((r) => ({ role: roleMap.get(r.roleId) || '?', total: r._count._all })),
    },
    content: {
      questions: totalQuestions,
      questionsByOrigin: questionsByOrigin.reduce((acc, r) => ({ ...acc, [r.origin]: r._count._all }), {}),
      subjects: totalSubjects,
      topics: totalTopics,
    },
    activity: {
      answers: totalAnswers,
      accuracy: accuracy(correctAnswers, totalAnswers),
      simulados: totalSimulados,
      simuladosFinished: finishedSimulados,
      openErrors,
      aiConversations: totalConversations,
      last30Days: [...dayMap.values()],
    },
    recentAudit,
  };
}

// ------------------------------------------------------------------ usuários --

export async function listUsers(query) {
  const { page, limit, skip } = parsePagination(query, {
    limit: 20,
    maxLimit: 100,
    sort: ['createdAt', 'name', 'email', 'lastLoginAt'],
  });

  const where = { deletedAt: null };
  if (query.search) Object.assign(where, buildSearch(query.search, ['name', 'email']));
  if (query.role) where.role = { name: query.role };
  if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
  if (query.blocked !== undefined) where.blockedAt = query.blocked === 'true' ? { not: null } : null;

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [query.sort || 'createdAt']: query.order || 'desc' },
      include: {
        role: true,
        setting: true,
        _count: { select: { answers: true, simulados: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role?.name,
      isActive: u.isActive,
      blockedAt: u.blockedAt,
      blockedReason: u.blockedReason,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      answers: u._count.answers,
      simulados: u._count.simulados,
    })),
    total,
    page,
    limit,
  };
}

export async function updateUser(id, payload) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) throw ApiError.notFound('Usuário não encontrado.');

  const data = {};
  if (payload.name) data.name = payload.name.trim();
  if (payload.email) {
    const email = String(payload.email).toLowerCase();
    const clash = await prisma.user.findFirst({ where: { emailNormalized: email, id: { not: id } } });
    if (clash) throw ApiError.conflict('Este e-mail já está em uso por outra conta.');
    data.email = email;
    data.emailNormalized = email;
  }
  if (payload.role) {
    const role = await prisma.role.findUnique({ where: { name: payload.role } });
    if (!role) throw ApiError.badRequest('Perfil inválido.');
    data.roleId = role.id;
  }
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (payload.password) data.passwordHash = await hashPassword(payload.password);

  await prisma.user.update({ where: { id }, data });
  return getUser(id);
}

export async function getUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: true,
      setting: true,
      _count: { select: { answers: true, simulados: true, favorites: true, errorNotebook: true } },
    },
  });
  if (!user || user.deletedAt) throw ApiError.notFound('Usuário não encontrado.');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role?.name,
    isActive: user.isActive,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    setting: user.setting,
    counters: user._count,
  };
}

export async function blockUser(id, reason = null) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { blockedAt: new Date(), blockedReason: reason, isActive: false },
    }),
    // Bloquear encerra as sessões imediatamente.
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return getUser(id);
}

export async function unblockUser(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');

  await prisma.user.update({
    where: { id },
    data: { blockedAt: null, blockedReason: null, isActive: true },
  });
  return getUser(id);
}

export async function changeRole(id, roleName) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw ApiError.badRequest('Perfil inválido.');
  await prisma.user.update({ where: { id }, data: { roleId: role.id } });
  return getUser(id);
}

export async function deleteUser(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, blockedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { id, deleted: true };
}

// ------------------------------------------------------------------- logs ----

export async function listAuditLogs(query) {
  const { page, limit, skip } = parsePagination(query, { limit: 30, maxLimit: 200 });

  const where = {};
  if (query.action) where.action = { contains: String(query.action) };
  if (query.entity) where.entity = String(query.entity);
  if (query.actorId) where.actorId = String(query.actorId);

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { rows, total, page, limit };
}

export async function listRoles() {
  return prisma.role.findMany({
    include: {
      _count: { select: { users: true } },
      permissions: { include: { permission: true } },
    },
    orderBy: { name: 'asc' },
  });
}

/** Estatísticas de uso por matéria (visão do administrador). */
export async function getContentStats() {
  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    include: { _count: { select: { questions: { where: { status: 'PUBLISHED' } } } } },
  });

  const rows = await Promise.all(
    subjects.map(async (s) => {
      const [answers, correct] = await Promise.all([
        prisma.answer.count({ where: { question: { subjectId: s.id } } }),
        prisma.answer.count({ where: { question: { subjectId: s.id }, isCorrect: true } }),
      ]);
      return {
        subjectId: s.id,
        code: s.code,
        name: s.name,
        questions: s._count.questions,
        answers,
        correct,
        accuracy: accuracy(correct, answers),
      };
    }),
  );

  return rows;
}

/** Questões mais erradas — útil para o editor revisar o banco. */
export async function getHardestQuestions({ limit = 20 } = {}) {
  const rows = await prisma.userProgress.findMany({
    where: { wrongCount: { gt: 0 } },
    orderBy: [{ wrongCount: 'desc' }, { attempts: 'desc' }],
    take: limit,
    include: { question: { include: { subject: { select: { code: true, name: true } } } } },
  });

  return rows.map((p) => ({
    questionId: p.questionId,
    subject: p.question.subject,
    prompt: p.question.prompt.slice(0, 160),
    attempts: p.attempts,
    wrongCount: p.wrongCount,
    accuracy: accuracy(p.correctCount, p.attempts),
  }));
}

export default {
  getDashboard,
  listUsers,
  updateUser,
  getUser,
  blockUser,
  unblockUser,
  changeRole,
  deleteUser,
  listAuditLogs,
  listRoles,
  getContentStats,
  getHardestQuestions,
};
