import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types';

/** Bloqueia rotas de quem não está autenticado. */
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Carregando sua sessão..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
}

/** Bloqueia rotas por perfil (ex.: área administrativa). */
export function RoleRoute({ roles }: { roles: Role[] }) {
  const { hasRole } = useAuth();

  if (!hasRole(...roles)) {
    return (
      <div className="wrap">
        <section className="card">
          <h2>🔒 Acesso restrito</h2>
          <p className="muted small">
            Esta área é exclusiva para {roles.join(' / ')}. Se você acha que isso é um engano, fale
            com o administrador.
          </p>
        </section>
      </div>
    );
  }

  return <Outlet />;
}

/** Redireciona quem já está logado para longe de login/cadastro. */
export function PublicOnlyRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return <Outlet />;
}
