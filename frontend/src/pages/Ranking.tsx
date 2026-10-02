import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { gamificationService } from '@/services/gamification.service';
import type { RankingPeriod } from '@/types';
import { nf } from '@/utils/format';

const PERIODS: Array<{ value: RankingPeriod; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'all', label: 'Desde o início' },
];

const MEDAL = ['🥇', '🥈', '🥉'];

/**
 * Ranking de XP entre os alunos.
 * Privacidade: a API devolve só o primeiro nome + inicial do sobrenome.
 */
export default function Ranking() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<RankingPeriod>('30d');

  const { data, isLoading } = useQuery({
    queryKey: ['ranking', period],
    queryFn: () => gamificationService.ranking(period, 50),
    staleTime: 60_000,
  });

  const ranking = data?.ranking ?? [];
  const myPosition = ranking.find((item) => item.userId === user?.id);

  return (
    <div className="wrap">
      <Card
        title="🏆 Ranking"
        subtitle="Compare seu ritmo com o de outros candidatos. O nome aparece mascarado (ex.: Ana S.) para preservar a privacidade."
        action={
          <div className="row gap-6">
            {PERIODS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={period === item.value ? 'primary' : 'default'}
                onClick={() => setPeriod(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        }
      >
        {myPosition ? (
          <div className="row gap-8">
            <Badge tone="gold">
              Você está em {myPosition.position}º lugar com {myPosition.xp} XP
            </Badge>
            <span className="muted small">
              {myPosition.answers} questões · {nf(myPosition.accuracy, 0)}% de aproveitamento · nível{' '}
              {myPosition.level}
            </span>
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Responda questões para entrar no ranking do período.
          </p>
        )}
      </Card>

      {isLoading ? (
        <Spinner label="Carregando ranking..." />
      ) : ranking.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Ninguém pontuou nesse período ainda"
          description="Volte depois de responder algumas questões — ou chame seus colegas para estudar junto."
        />
      ) : (
        <Card title="Classificação" subtitle={`${ranking.length} participantes`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Aluno</th>
                  <th style={{ width: 90 }}>Nível</th>
                  <th style={{ width: 90 }}>XP</th>
                  <th style={{ width: 110 }}>Questões</th>
                  <th style={{ width: 130 }}>Aproveitamento</th>
                  <th style={{ width: 110 }}>Simulados</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((item) => (
                  <tr
                    key={item.userId}
                    style={item.userId === user?.id ? { background: 'rgba(255,255,255,.05)' } : undefined}
                  >
                    <td>{MEDAL[item.position - 1] ?? item.position}</td>
                    <td>
                      <b>{item.name}</b>
                      {item.userId === user?.id && (
                        <span className="muted tiny"> · você</span>
                      )}
                    </td>
                    <td>{item.level}</td>
                    <td>{item.xp}</td>
                    <td>{item.answers}</td>
                    <td>
                      <Badge tone={item.accuracy >= 70 ? 'ok' : item.accuracy >= 50 ? 'warn' : 'err'}>
                        {nf(item.accuracy, 0)}%
                      </Badge>
                    </td>
                    <td>{item.simulados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
