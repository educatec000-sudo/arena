import { Badge, ProgressBar } from '@/components/ui';
import type { Achievement } from '@/types';

/** Rótulos amigáveis para os critérios das conquistas. */
const CRITERIA_LABEL: Record<string, string> = {
  answers: 'questões respondidas',
  correct: 'acertos',
  streak: 'dias seguidos',
  simulados: 'simulados',
  accuracy: 'aproveitamento',
  favorites: 'favoritas',
  errorBook: 'erros resolvidos',
  minutes: 'minutos estudados',
};

/**
 * Grade de conquistas.
 * Travadas aparecem em cinza com a barra de progresso do objetivo.
 */
export function AchievementsGrid({ items }: { items: Achievement[] }) {
  return (
    <div className="grid c3">
      {items.map((item) => (
        <div
          key={item.code}
          className="card"
          style={{
            opacity: item.unlocked ? 1 : 0.65,
            borderColor: item.unlocked ? 'var(--gold)' : undefined,
          }}
        >
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 28 }}>{item.icon}</div>
            {item.unlocked ? (
              <Badge tone="gold">+{item.xp} XP</Badge>
            ) : (
              <Badge>{Math.floor(item.progress)}%</Badge>
            )}
          </div>

          <b style={{ display: 'block', marginTop: 6 }}>{item.name}</b>
          <p className="muted tiny" style={{ margin: '2px 0 8px' }}>
            {item.description}
          </p>

          {item.unlocked ? (
            <p className="tiny" style={{ margin: 0, color: 'var(--ok)' }}>
              ✅ Desbloqueada
              {item.unlockedAt
                ? ` em ${new Date(item.unlockedAt).toLocaleDateString('pt-BR')}`
                : ''}
            </p>
          ) : (
            <>
              <ProgressBar value={item.progress} />
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                {CRITERIA_LABEL[item.criteria] ?? item.criteria}: {item.target} necessários
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default AchievementsGrid;
