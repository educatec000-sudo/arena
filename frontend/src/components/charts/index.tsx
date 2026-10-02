import { useMemo, useState } from 'react';
import { cn, nf } from '@/utils/format';

/**
 * Gráficos em SVG puro.
 *
 * Sem dependência externa: o bundle fica menor, o gráfico funciona offline e
 * imprime corretamente. Cada componente recebe dados já agregados da API.
 */

export function BarChart({
  data,
  height = 180,
  formatValue = (value: number) => String(value),
  color = 'var(--pri)',
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  formatValue?: (value: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="chart" style={{ height }}>
      {data.map((item) => (
        <div key={item.label} className="chart-col" title={`${item.label}: ${formatValue(item.value)}`}>
          <div className="chart-bar-wrap">
            <div
              className="chart-bar"
              style={{
                height: `${(item.value / max) * 100}%`,
                background: item.color || color,
              }}
            />
          </div>
          <span className="chart-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Gráfico de linha (evolução diária). */
export function LineChart({
  data,
  height = 160,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  const width = 100; // viewBox em % (responsivo)
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, index) => ({
    x: index * step,
    y: 100 - (d.value / max) * 100,
    ...d,
  }));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area = `${path} L${width},100 L0,100 Z`;

  return (
    <div className="line-chart" style={{ height }}>
      <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="line-svg">
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(79,125,251,.45)" />
            <stop offset="100%" stopColor="rgba(79,125,251,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lineFill)" />
        <path d={path} fill="none" stroke="var(--pri)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="line-labels">
        {data.length > 0 && <span className="tiny muted">{data[0].label}</span>}
        <span className="tiny muted">máx {max}</span>
        {data.length > 1 && <span className="tiny muted">{data[data.length - 1].label}</span>}
      </div>
    </div>
  );
}

/** Rosca (distribuição de acertos/erros). */
export function DonutChart({
  segments,
  size = 160,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="12" />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += length;
          return element;
        })}
      </svg>
      <div className="donut-center">
        <b>{centerValue}</b>
        <span className="tiny muted">{centerLabel}</span>
      </div>
    </div>
  );
}

/** Heatmap de dias estudados (igual ao do app legado). */
export function Heatmap({
  data,
  max = 1,
}: {
  data: Array<{ date: string; questions: number }>;
  max?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const peak = Math.max(max, ...data.map((d) => d.questions), 1);

  const level = (value: number) => {
    if (!value) return '';
    if (value < peak * 0.25) return 'l1';
    if (value < peak * 0.5) return 'l2';
    if (value < peak * 0.85) return 'l3';
    return 'l4';
  };

  return (
    <div>
      <div className="heat">
        {data.map((day) => (
          <i
            key={day.date}
            className={level(day.questions)}
            title={`${day.date}: ${day.questions} questões`}
            onMouseEnter={() => setHovered(`${day.date}: ${day.questions} questões`)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </div>
      <div className="tiny muted heat-caption">
        {hovered || `Últimos ${data.length} dias — quanto mais escuro, mais questões.`}
      </div>
    </div>
  );
}

/** Barras horizontais (desempenho por matéria). */
export function ProgressList({
  items,
}: {
  items: Array<{ label: string; value: number; caption?: string; color?: string; tone?: string }>;
}) {
  const ordered = useMemo(() => [...items].sort((a, b) => b.value - a.value), [items]);

  if (!ordered.length) {
    return <p className="muted small">Ainda não há dados suficientes.</p>;
  }

  return (
    <div className="progress-list">
      {ordered.map((item) => (
        <div key={item.label} className="progress-row">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">{item.label}</span>
            <span className="small muted">{item.caption ?? `${nf(item.value, 0)}%`}</span>
          </div>
          <div className={cn('bar', item.tone)}>
            <i
              style={{
                width: `${Math.max(0, Math.min(100, item.value))}%`,
                background: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
