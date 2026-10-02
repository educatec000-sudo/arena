import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Button } from '@/components/ui';
import { progressService } from '@/services/progress.service';
import { aiService } from '@/services/ai.service';
import { cn } from '@/utils/format';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  editorOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Painel', icon: '🎯' },
  { to: '/app/treinar', label: 'Treinar', icon: '✍️' },
  { to: '/app/simulados', label: 'Simulados', icon: '⏱️' },
  { to: '/app/caderno', label: 'Caderno de erros', icon: '📕' },
  { to: '/app/favoritas', label: 'Favoritas', icon: '⭐' },
  { to: '/app/progresso', label: 'Progresso', icon: '📈' },
  { to: '/app/teoria', label: 'Teoria', icon: '📚' },
  { to: '/app/trilhas', label: 'Trilhas', icon: '🧭' },
  { to: '/app/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/app/plano', label: 'Plano de estudos', icon: '🗓️' },
  { to: '/app/ia', label: 'Tutor de IA', icon: '🤖' },
  { to: '/app/admin', label: 'Administração', icon: '🛠️', adminOnly: true },
  { to: '/app/admin/questoes', label: 'Gerenciar questões', icon: '🗃️', editorOnly: true },
];

/**
 * Casca autenticada — visual "clássico" do app original:
 * barra superior fixa (logo, meta do dia, contagem de dias, usuário) e
 * ABAS HORIZONTAIS logo abaixo, com o conteúdo centralizado em 1060 px.
 *
 * As abas rolam de lado no celular, exatamente como no app antigo — por isso
 * não existe mais menu lateral nem barra inferior.
 */
export default function AppLayout() {
  const { user, logout, isAdmin, isEditor } = useAuth();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { canInstall, install } = usePwaInstall();

  const items = NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.editorOnly) return isEditor;
    return true;
  });

  /**
   * Mesma queryKey do Painel: se o usuário passar por lá, os números da barra
   * já vêm do cache (e vice-versa).
   */
  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => progressService.dashboard(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  /** Só para colorir o botão de IA (verde = pelo menos um provedor pronto). */
  const { data: credentials } = useQuery({
    queryKey: ['ai-credentials'],
    queryFn: () => aiService.credentials(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const iaPronta = (credentials ?? []).some((item) => item.isEnabled || item.hasServerKey);
  const hoje = dash?.overview?.today?.questions ?? 0;
  const meta = dash?.overview?.goals?.dailyGoal ?? 0;
  const dias = dash?.overview?.goals?.remainingDays;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="top">
        <div className="top-in">
          <div className="logo">
            <span className="dot">📘</span>
            <span>
              Arena Estudos ALEPA
              <small>Concurso 002/2026 · Fundação CETAP · Cargo 15 – Assistência Legislativa</small>
            </span>
          </div>

          <div className="spacer" />

          {meta > 0 && (
            <span className={cn('badge', hoje >= meta ? 'ok' : 'pri')}>
              {hoje}/{meta} hoje
            </span>
          )}
          {dias !== null && dias !== undefined && (
            <span className="badge warn">{dias} dias</span>
          )}
          {!online && <span className="badge err">offline</span>}

          <NavLink
            to="/app/ia"
            className={cn('badge', iaPronta ? 'ok' : 'warn')}
            title="Tutor de IA"
          >
            {iaPronta ? '🤖 IA pronta' : '🔑 IA desligada'}
          </NavLink>

          <div className="user-chip">
            <span className="avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
            <div className="user-meta">
              <b>{user?.name}</b>
              <small>{user?.role}</small>
            </div>
          </div>

          {canInstall && (
            <Button
              size="sm"
              variant="ghost"
              onClick={install}
              title="Instalar no celular/computador"
            >
              📲
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/app/configuracoes')}
            title="Configurações"
          >
            ⚙️
          </Button>
          <Button size="sm" variant="ghost" onClick={handleLogout} title="Sair">
            Sair
          </Button>
        </div>

        {/* abas horizontais (controle segmentado do app original) */}
        <nav className="tabs">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              className={({ isActive }) => cn('tab', isActive && 'active')}
            >
              <span className="tab-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="app-body">
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      <div className="fab">
        <button
          type="button"
          title="Voltar ao topo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
