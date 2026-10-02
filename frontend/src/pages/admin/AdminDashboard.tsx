import { useQuery } from '@tanstack/react-query';
import { Card, Kpi, Spinner, Table } from '@/components/ui';
import { BarChart, LineChart } from '@/components/charts';
import { adminService } from '@/services/admin.service';
import { nf, formatDate } from '@/utils/format';
import { ORIGIN_LABEL } from '@/utils/format';

/** Dashboard administrativo — visão global da plataforma. */
export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminService.dashboard(),
  });

  if (isLoading) return <Spinner label="Carregando indicadores..." />;

  if (error || !data) {
    return (
      <div className="wrap">
        <Card title="Não foi possível carregar o painel administrativo">
          <p className="muted small">{error instanceof Error ? error.message : 'Tente novamente.'}</p>
        </Card>
      </div>
    );
  }

  const { users, content, activity, recentAudit } = data;

  return (
    <div className="wrap">
      <h1 className="page-title">🛠️ Administração</h1>

      <div className="grid c4">
        <Kpi value={users.total} label="usuários" />
        <Kpi value={users.active} label="ativos" tone="var(--ok)" />
        <Kpi value={users.newLast7Days} label="novos (7 dias)" tone="var(--pri2)" />
        <Kpi value={content.questions} label="questões no banco" />
      </div>

      <div className="grid c2">
        <Card title="👥 Usuários por perfil">
          <BarChart
            data={users.byRole.map((item) => ({
              label: item.role,
              value: item.total,
              color: item.role === 'ADMIN' ? 'var(--err)' : item.role === 'EDITOR' ? 'var(--warn)' : 'var(--pri)',
            }))}
          />
        </Card>

        <Card title="📈 Atividade dos últimos 30 dias">
          <LineChart
            data={activity.last30Days.map((day) => ({
              label: day.date.slice(8),
              value: day.questions,
            }))}
          />
        </Card>
      </div>

      <div className="grid c4">
        <Kpi value={activity.answers} label="respostas registradas" />
        <Kpi value={`${nf(activity.accuracy, 1)}%`} label="aproveitamento global" />
        <Kpi value={activity.simuladosFinished} label="simulados concluídos" />
        <Kpi value={activity.openErrors} label="erros em aberto" tone="var(--warn)" />
      </div>

      <Card title="🗂️ Conteúdo">
        <div className="row gap-8 wrap">
          {Object.entries(content.questionsByOrigin).map(([origin, total]) => (
            <span key={origin} className="badge">
              {ORIGIN_LABEL[origin] || origin}: <b>{total}</b>
            </span>
          ))}
          <span className="badge">matérias: <b>{content.subjects}</b></span>
          <span className="badge">assuntos: <b>{content.topics}</b></span>
          <span className="badge">conversas com IA: <b>{activity.aiConversations}</b></span>
        </div>
      </Card>

      <Card title="🧾 Últimas ações registradas" subtitle="Trilha de auditoria">
        <Table head={['Ação', 'Entidade', 'Autor', 'Data']}>
          {recentAudit.map((log) => (
            <tr key={log.id}>
              <td>
                <code className="tiny">{log.action}</code>
              </td>
              <td className="tiny muted">{log.entity}</td>
              <td className="small">{log.actor?.name ?? '—'}</td>
              <td className="tiny muted">{formatDate(log.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
