import { prisma } from '../../database/prisma.js';
import ApiError from '../../shared/errors.js';
import { hashPassword, sha256, verifyPassword } from '../../shared/password.js';
import { randomToken, encrypt } from '../../shared/crypto.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  signAccessToken,
} from '../../shared/tokens.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { sendPasswordResetEmail } from '../../shared/mailer.js';
import { audit } from '../../shared/audit.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/** Papel padrão de quem se cadastra pelo site. */
async function getRoleByName(name) {
  const role = await prisma.role.findUnique({ where: { name } });
  if (!role) throw ApiError.internal(`Papel "${name}" não encontrado. Rode o seed: npm run db:seed`);
  return role;
}

// ------------------------------------------------------------------ helpers --

async function issueSession(user, req, res) {
  const rawRefresh = randomToken(48);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Refresh token OPACO: o cookie carrega o valor aleatório e o banco guarda
  // só o hash (SHA-256). Assim um vazamento do banco não permite se passar
  // pelo usuário, e não há JWT de longa duração circulando.
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: await sha256(rawRefresh),
      userAgent: req.headers['user-agent']?.slice(0, 255) || null,
      ip: req.ip || null,
      expiresAt,
    },
  });

  setRefreshCookie(res, rawRefresh);

  return { accessToken: signAccessToken(user), refreshToken: rawRefresh };
}

/** Conta tentativas falhas recentes para travar força bruta. */
async function assertNotLocked(email, ip) {
  const since = new Date(Date.now() - env.rateLimit.authLockMinutes * 60 * 1000);
  const attempts = await prisma.loginAttempt.count({
    where: { email: normalizeEmail(email), success: false, createdAt: { gte: since } },
  });
  const max = env.rateLimit.authMax;
  if (attempts >= max) {
    throw ApiError.tooManyRequests(
      `Muitas tentativas de login. Aguarde ${env.rateLimit.authLockMinutes} minutos e tente novamente.`,
    );
  }
  void ip;
}

async function recordAttempt({ email, ip, userId, success }) {
  try {
    await prisma.loginAttempt.create({
      data: { email: normalizeEmail(email), ip: ip || null, userId: userId || null, success },
    });
  } catch (err) {
    logger.warn({ err }, 'Falha ao registrar tentativa de login');
  }
}

// ------------------------------------------------------------------ público --

export async function register(payload, req, res) {
  const email = normalizeEmail(payload.email);
  const existing = await prisma.user.findUnique({ where: { emailNormalized: email } });
  if (existing) throw ApiError.conflict('Já existe uma conta com este e-mail.');

  const role = await getRoleByName('ALUNO');
  const passwordHash = await hashPassword(payload.password);

  const user = await prisma.user.create({
    data: {
      name: payload.name.trim(),
      email: email,
      emailNormalized: email,
      passwordHash,
      roleId: role.id,
      setting: {
        create: {
          examDate: new Date('2026-12-13T00:00:00.000Z'),
          dailyGoal: 41,
          totalGoal: 3000,
        },
      },
    },
    include: { role: true, setting: true },
  });

  await recordAttempt({ email, ip: req.ip, userId: user.id, success: true });
  await audit({
    actorId: user.id,
    action: 'auth.register',
    entity: 'user',
    entityId: user.id,
    req,
  });

  const tokens = await issueSession(user, req, res);
  return { user: sanitizeUser(user), tokens };
}

export async function login(payload, req, res) {
  const email = normalizeEmail(payload.email);
  await assertNotLocked(email, req.ip);

  const user = await prisma.user.findUnique({
    where: { emailNormalized: email },
    include: { role: true, setting: true },
  });

  // Mensagem genérica: não revelamos se o e-mail existe (evita enumeração).
  const invalid = ApiError.unauthorized('E-mail ou senha incorretos.');

  if (!user || user.deletedAt) {
    await recordAttempt({ email, ip: req.ip, success: false });
    throw invalid;
  }

  const passwordOk = await verifyPassword(payload.password, user.passwordHash);
  if (!passwordOk) {
    await recordAttempt({ email, ip: req.ip, userId: user.id, success: false });
    throw invalid;
  }

  if (!user.isActive) throw ApiError.forbidden('Sua conta está desativada.');
  if (user.blockedAt) {
    throw ApiError.forbidden(
      user.blockedReason
        ? `Conta bloqueada: ${user.blockedReason}`
        : 'Sua conta está bloqueada. Fale com o administrador.',
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAttempt({ email, ip: req.ip, userId: user.id, success: true });
  await audit({ actorId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, req });

  const tokens = await issueSession(user, req, res);
  return { user: sanitizeUser(user), tokens };
}

/**
 * Renova o access token a partir do cookie httpOnly.
 * Rotação com detecção de reuso: se um token já revogado reaparecer,
 * toda a família de sessões é revogada (possível roubo de cookie).
 */
export async function refresh(req, res) {
  const raw = req.cookies?.[env.security.refreshCookieName];
  if (!raw) throw ApiError.unauthorized('Sessão expirada. Faça login novamente.');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: await sha256(raw) },
    include: { user: { include: { role: true, setting: true } } },
  });

  if (!stored) throw ApiError.unauthorized('Sessão inválida. Faça login novamente.');

  // Reuso de um token já revogado = possível cookie roubado: derruba tudo.
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(res);
    logger.warn({ userId: stored.userId }, 'Reuso de refresh token detectado — sessões revogadas');
    throw ApiError.unauthorized('Sessão inválida. Faça login novamente.');
  }

  if (stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Sessão expirada. Faça login novamente.');
  }

  const user = stored.user;
  if (!user || user.deletedAt || !user.isActive || user.blockedAt) {
    throw ApiError.forbidden('Sua conta não está ativa.');
  }

  // Rotação: invalida o token usado e emite um novo.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueSession(user, req, res);

  const newSession = await prisma.refreshToken.findUnique({
    where: { tokenHash: await sha256(tokens.refreshToken) },
    select: { id: true },
  });
  if (newSession) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: newSession.id },
    });
  }

  return { user: sanitizeUser(user), tokens };
}

export async function logout(req, res) {
  const raw = req.cookies?.[env.security.refreshCookieName];
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: await sha256(raw) },
      data: { revokedAt: new Date() },
    });
  }
  clearRefreshCookie(res);
  if (req.user) {
    await audit({ actorId: req.user.id, action: 'auth.logout', entity: 'user', entityId: req.user.id, req });
  }
  return { ok: true };
}

export async function logoutAll(req, res) {
  await prisma.refreshToken.updateMany({
    where: { userId: req.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  clearRefreshCookie(res);
  await audit({
    actorId: req.user.id,
    action: 'auth.logout_all',
    entity: 'user',
    entityId: req.user.id,
    req,
  });
  return { ok: true };
}

export async function me(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, setting: true },
  });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');
  return sanitizeUser(user);
}

export async function updateProfile(userId, payload) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: payload.name?.trim() },
    include: { role: true, setting: true },
  });
  return sanitizeUser(user);
}

export async function updateSettings(userId, payload) {
  const data = {};
  if (payload.dailyGoal !== undefined) data.dailyGoal = payload.dailyGoal;
  if (payload.totalGoal !== undefined) data.totalGoal = payload.totalGoal;
  if (payload.examDate !== undefined) data.examDate = payload.examDate ? new Date(payload.examDate) : null;
  if (payload.examTimeMinutes !== undefined) data.examTimeMinutes = payload.examTimeMinutes;
  if (payload.theme !== undefined) data.theme = payload.theme;
  if (payload.onboardingDone !== undefined) data.onboardingDone = payload.onboardingDone;

  const setting = await prisma.userSetting.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return setting;
}

// --------------------------------------------------------------- recuperação --

/**
 * Sempre responde sucesso (mesmo quando o e-mail não existe) para não
 * permitir enumeração de contas.
 */
export async function requestPasswordReset(emailInput, req) {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({ where: { emailNormalized: email } });

  if (!user || user.deletedAt || user.blockedAt) {
    logger.info({ email }, '[auth] pedido de redefinição ignorado (conta inexistente/bloqueada)');
    return { requested: true };
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: await sha256(rawToken),
      expiresAt: new Date(Date.now() + env.mail.passwordResetTtlMinutes * 60 * 1000),
      ip: req.ip || null,
      userAgent: req.headers['user-agent']?.slice(0, 255) || null,
    },
  });

  const mail = await sendPasswordResetEmail(user, rawToken);
  await audit({
    actorId: user.id,
    action: 'auth.password_reset_requested',
    entity: 'user',
    entityId: user.id,
    req,
  });

  return {
    requested: true,
    // Em desenvolvimento/testes o link volta na resposta: assim dá para testar
    // o fluxo sem servidor de e-mail. Em produção isso nunca é retornado.
    ...(env.isProduction ? {} : { devLink: mail.link }),
  };
}

export async function resetPassword({ token, password }, req) {
  const tokenHash = await sha256(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record) throw ApiError.badRequest('Link de redefinição inválido.');
  if (record.usedAt) throw ApiError.badRequest('Este link já foi usado. Peça um novo.');
  if (record.expiresAt < new Date()) {
    throw ApiError.badRequest('Este link expirou. Peça um novo.');
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Trocar a senha encerra todas as sessões ativas.
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({
    actorId: record.userId,
    action: 'auth.password_reset',
    entity: 'user',
    entityId: record.userId,
    req,
  });

  return { ok: true };
}

export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('Usuário não encontrado.');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest('A senha atual está incorreta.');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({ actorId: userId, action: 'auth.password_changed', entity: 'user', entityId: userId, req });
  return { ok: true };
}

/** Sessões ativas do usuário (para "encerrar outros dispositivos"). */
export async function listSessions(userId, currentTokenHash) {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      expiresAt: true,
      tokenHash: true,
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.tokenHash === currentTokenHash,
  }));
}

export async function revokeSession(userId, sessionId, req) {
  const session = await prisma.refreshToken.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw ApiError.notFound('Sessão não encontrada.');
  await prisma.refreshToken.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await audit({ actorId: userId, action: 'auth.session_revoked', entity: 'session', entityId: sessionId, req });
  return { ok: true };
}

// ------------------------------------------------------------------ utils --

/** Remove dados sensíveis antes de devolver o usuário ao cliente. */
export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role?.name || user.roleName || 'ALUNO',
    isActive: user.isActive,
    blockedAt: user.blockedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    setting: user.setting
      ? {
          dailyGoal: user.setting.dailyGoal,
          totalGoal: user.setting.totalGoal,
          examDate: user.setting.examDate,
          examTimeMinutes: user.setting.examTimeMinutes,
          theme: user.setting.theme,
          onboardingDone: user.setting.onboardingDone,
        }
      : null,
  };
}

export default {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  updateProfile,
  updateSettings,
  requestPasswordReset,
  resetPassword,
  changePassword,
  listSessions,
  revokeSession,
  sanitizeUser,
};

// `encrypt` é reexportado para o módulo de IA não importar crypto direto.
export { encrypt };
