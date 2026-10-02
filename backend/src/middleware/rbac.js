import ApiError from '../shared/errors.js';

const HIERARCHY = { ALUNO: 1, EDITOR: 2, ADMIN: 3 };

/**
 * Controle de acesso por papel.
 * Hierarquia simples (ADMIN > EDITOR > ALUNO) + permissões granulares
 * para ações sensíveis (ex.: question:delete).
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());

    const userRole = (req.userRole || req.user.role?.name || 'ALUNO').toUpperCase();
    const allowed = roles.map((r) => String(r).toUpperCase());

    const byName = allowed.includes(userRole);
    const byLevel = allowed.some(
      (role) => (HIERARCHY[userRole] || 0) >= (HIERARCHY[role] || 99),
    );

    if (!byName && !byLevel) {
      return next(new ApiError(403, 'Você não tem permissão para acessar este recurso.', {
        required: allowed,
        current: userRole,
      }));
    }
    next();
  };
}

/** Permissão granular (tabela permissions). Ex.: requirePermission('questions:create') */
export function requirePermission(...keys) {
  return async (req, _res, next) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      const roleId = req.user.roleId;
      if (!roleId) return next(ApiError.forbidden());

      const { prisma } = await import('../database/prisma.js');
      const found = await prisma.rolePermission.count({
        where: { roleId, permission: { key: { in: keys.map(String) } } },
      });

      // ADMIN sempre passa: evita travar o sistema por falta de permissão semeada.
      const isAdmin = (req.userRole || '').toUpperCase() === 'ADMIN';
      if (!found && !isAdmin) {
        return next(new ApiError(403, 'Permissão insuficiente para esta ação.', { required: keys }));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
