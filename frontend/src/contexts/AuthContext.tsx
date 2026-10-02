import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from '@/services/auth.service';
import { tokenStore } from '@/services/http';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  hasRole: (...roles: Role[]) => boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Na montagem tentamos restaurar a sessão via cookie httpOnly.
   * Enquanto isso, `loading` mantém a tela de carregamento (evita "piscar"
   * a tela de login para quem já está logado).
   */
  useEffect(() => {
    let cancelled = false;
    authService
      .bootstrap()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: logged } = await authService.login(email, password);
    setUser(logged);
    return logged;
  }, []);

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; confirmPassword: string }) => {
      const { user: created } = await authService.register(payload);
      setUser(created);
      return created;
    },
    [],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    tokenStore.set(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await authService.me().catch(() => null);
    if (fresh) setUser(fresh);
  }, []);

  const role = user?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: role === 'ADMIN',
      isEditor: role === 'EDITOR' || role === 'ADMIN',
      hasRole: (...roles: Role[]) => Boolean(role && roles.includes(role)),
      login,
      register,
      logout,
      refreshUser,
      updateUser: setUser,
    }),
    [user, loading, role, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return context;
}

export default AuthContext;
