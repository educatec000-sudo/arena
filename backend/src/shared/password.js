import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/** Hash seguro de senha (bcrypt com custo configurável). */
export function hashPassword(plain) {
  return bcrypt.hash(plain, env.security.bcryptRounds);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Política de senha: mínimo 8, maiúscula, minúscula e número.
 * Mensagens em pt-BR porque vão direto para o usuário final.
 */
export function validatePasswordStrength(password) {
  const rules = [
    { test: String(password || '').length >= 8, message: 'pelo menos 8 caracteres' },
    { test: /[A-Za-zÀ-ÿ]/.test(String(password || '')), message: 'pelo menos uma letra' },
    { test: /\d/.test(String(password || '')), message: 'pelo menos um número' },
  ];
  const failed = rules.filter((r) => !r.test).map((r) => r.message);
  return {
    valid: failed.length === 0,
    failed,
    message: failed.length ? `A senha precisa ter ${failed.join(', ')}.` : null,
  };
}

/**
 * Hash determinístico e barato — usado apenas para gravar o token de
 * redefinição/refresh no banco. (Não serve para senha: usa bcrypt.)
 */
export async function sha256(value) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(String(value)).digest('hex');
}

export default { hashPassword, verifyPassword, validatePasswordStrength, sha256 };
