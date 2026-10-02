import { Link } from 'react-router-dom';
import { Badge, Button, Card, Kpi, ProgressBar } from '@/components/ui';
import type { Gamification } from '@/types';
import { nf } from '@/utils/format';

/**
 * Cartão de XP/nível do aluno.
 * Apenas apresentação: todo o cálculo vem pronto do endpoint /gamification/me.
 */
export function GamificationCard({ data }: { data: Gamification }) {
  const minutes = Number(data.counters.minutes || 0);

  return (
    <Card
      title={`🏅 Nível ${data.level}`}
      subtitle={`${data.totals.unlocked} de ${data.totals.available} conquistas desbloqueadas`}
      action={
        <Link to="/app/ranking">
          <Button size="sm">🏆 Ver ranking</Button>
        </Link>
      }
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="timer" style={{ fontSize: 34, color: 'var(--gold)' }}>
          {data.xp} XP
        </div>
        <span className="muted small">
          faltam <b>{Math.max(0, data.nextLevel.need - data.nextLevel.into)}</b> XP para o nível{' '}
          {data.level + 1}
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        <ProgressBar value={data.nextLevel.percent} tone="gold" />
      </div>

      <div className="grid c4" style={{ marginTop: 14 }}>
        <Kpi value={data.counters.answers} label="questões" />
        <Kpi value={`${nf(data.counters.accuracy, 0)}%`} label="aproveitamento" />
        <Kpi value={data.counters.streak} label="dias seguidos 🔥" tone="var(--gold)" />
        <Kpi value={Math.round(minutes)} label="minutos" />
      </div>

      {data.newlyUnlocked.length > 0 && (
        <div className="row gap-6 wrap" style={{ marginTop: 12 }}>
          {data.newlyUnlocked.map((item) => (
            <Badge key={item.code} tone="gold">
              {item.icon} nova conquista: {item.name}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

export default GamificationCard;
