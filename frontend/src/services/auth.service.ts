import http, { refreshSession, tokenExpiresInMs, tokenStore } from './http';
import type { AuthResponse, User, UserSetting } from '@/types';

/** Autenticação: a única camada que conhece as rotas de login/sessão. */
export const authService = {
  async register(payload: { name: string; email: string; password: string; confirmPassword: string }) {
    const data = await http.post<AuthResponse>('/auth/register', payload);
    tokenStore.set(data.tokens.accessToken);
    return data;
  },

  async login(email: string, password: string) {
    const data = await http.post<AuthResponse>('/auth/login', { email, password });
    tokenStore.set(data.tokens.accessToken);
    return data;
  },

  async logout() {
    try {
      await http.post('/auth/logout');
    } finally {
      tokenStore.set(null);
    }
  },

  async logoutAll() {
    await http.post('/auth/logout-all');
    tokenStore.set(null);
  },

  /** Tenta restaurar a sessão a partir do cookie httpOnly. */
  /**
   * Restaura a sessão ao abrir o app.
   * Se não há token (ou ele já venceu), renova ANTES de chamar /auth/me:
   * assim o usuário não vê uma rajada de 401 no console ao voltar para a aba.
   */
  async bootstrap(): Promise<User | null> {
    const token = tokenStore.get();
    const remaining = tokenExpiresInMs(token);
    if (!token || (remaining !== null && remaining <= 30_000)) {
      await refreshSession();
    }
    if (!tokenStore.get()) return null;
    return http.get<User>('/auth/me').catch(() => null);
  },

  me: () => http.get<User>('/auth/me'),

  updateProfile: (name: string) => http.patch<User>('/auth/profile', { name }),

  updateSettings: (settings: Partial<UserSetting>) =>
    http.patch<UserSetting>('/auth/settings', settings),

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }) => http.post('/auth/change-password', payload),

  requestPasswordReset: (email: string) => http.post('/auth/forgot-password', { email }),

  resetPassword: (payload: { token: string; password: string; confirmPassword: string }) =>
    http.post('/auth/reset-password', payload),

  listSessions: () =>
    http.get<Array<{ id: string; userAgent: string | null; ip: string | null; createdAt: string; current: boolean }>>(
      '/auth/sessions',
    ),

  revokeSession: (id: string) => http.delete(`/auth/sessions/${id}`),
};

export default authService;
