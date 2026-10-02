import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Kpi, ProgressBar, Spinner } from '@/components/ui';
import { BarChart, Heatmap, LineChart, ProgressList } from '@/components/charts';
import { progressService } from '@/services/progress.service';
import { subjectsService } from '@/services/questions.service';
import { formatMinutes, nf } from '@/utils/format';

/** Painel de desempenho: tudo que o aluno precisa para se orientar. */
export default function Progress() {
  const [subjectFilter, setSubjectFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['progress-report'],
    queryFn: () => progressService.report(),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const { data: byTopic = [] } = useQuery({
    queryKey: ['progress-by-topic', subjectFilter],
    queryFn: () => progressService.byTopic(subjectFilter || undefined),
  });

  if (isLoading) return <Spinner label="Calculando seu desempenho..." />;

  if (!data) {
    return (
      <div className="wrap">
        <Card title="Não foi possível carregar seu progresso" />
      </div>
    );
  }

  const { overview, evolution, bySubject, byDifficulty, timing } = data;
  const hasData = overview.totalAnswered > 0;

  return (
    <div className="wrap">
      <Card title="📈 Meu desempenho" subtitle="Números calculados a partir de tudo que você já respondeu.">
        {hasData ? (
          <div className="grid c4">
            <Kpi value={overview.totalAnswered} label="questões respondidas" />
            <Kpi value={overview.uniqueQuestions} label="questões diferentes" />
            <Kpi
              value={`${nf(overview.accuracy, 1)}%`}
              label="aproveitamento"
              tone={overview.accuracy >= 60 ? 'var(--ok)' : overview.accuracy >= 50 ? 'var(--warn)' : 'var(--err)'}
            />
            <Kpi
              value={timing.averageSeconds ? `${timing.averageSeconds}s` : '—'}
              label="tempo médio por questão"
            />
          </div>
        ) : (
          <EmptyState
            icon="📈"
            title="Sem dados ainda"
            description="Responda algumas questões para liberar seus gráficos de desempenho."
          />
        )}
      </Card>

      {hasData && (
        <>
          <div className="grid c2">
            <Card title="🗓️ Evolução diária (35 dias)">
              <LineChart
                data={evolution.map((point) => ({ label: point.date.slice(8), value: point.questions }))}
              />
              <Heatmap data={evolution} />
            </Card>

            <Card title="🎚️ Desempenho por dificuldade">
              <BarChart
                data={byDifficulty.map((item) => ({
                  label: item.label,
                  value: item.accuracy,
                  color:
                    item.difficulty === 'FACIL'
                      ? 'var(--ok)'
                      : item.difficulty === 'MEDIA'
                        ? 'var(--warn)'
                        : 'var(--err)',
                }))}
                formatValue={(value) => `${nf(value, 0)}%`}
              />
              <div className="row gap-6" style={{ marginTop: 8 }}>
                {byDifficulty.map((item) => (
                  <Badge key={item.difficulty}>
                    {item.label}: {item.correct}/{item.answered}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <Card title="📊 Por matéria">
            <ProgressList
              items={bySubject.map((subject) => ({
                label: subject.name,
                value: subject.answered ? subject.accuracy : 0,
                caption: subject.answered
                  ? `${nf(subject.accuracy, 0)}% · ${subject.correct}/${subject.answered} · cobertura ${nf(subject.coverage, 0)}%`
                  : 'não treinada',
                tone: subject.accuracy >= 60 ? 'ok' : 'gold',
              }))}
            />
          </Card>

          <Card
            title="🎯 Por assunto"
            subtitle="Onde você precisa investir mais tempo."
            action={
              <select
                className="input select"
                style={{ maxWidth: 220 }}
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
              >
                <option value="">Todas as matérias</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            }
          >
            {byTopic.length ? (
              <ProgressList
                items={byTopic.slice(0, 20).map((topic) => ({
                  label: `${topic.subject?.code ?? ''} · ${topic.name}`,
                  value: topic.accuracy,
                  caption: `${nf(topic.accuracy, 0)}% · ${topic.correct}/${topic.answered}`,
                  tone: topic.accuracy >= 60 ? 'ok' : 'gold',
                }))}
              />
            ) : (
              <p className="muted small">Ainda não há assuntos com respostas suficientes.</p>
            )}
          </Card>

          <div className="grid c3">
            <Card title="⏱️ Tempo de estudo">
              <div className="kpi">
                <b>{formatMinutes(overview.minutesStudied)}</b>
                <span>tempo total</span>
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                {timing.answeredWithTimer} respostas com cronômetro ·{' '}
                {formatMinutes(timing.totalSeconds / 60)} em questões
              </p>
            </Card>

            <Card title="🔥 Constância">
              <div className="kpi">
                <b style={{ color: 'var(--gold)' }}>{overview.streak}</b>
                <span>dias seguidos</span>
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Você estudou em {overview.daysStudied} dias diferentes.
              </p>
            </Card>

            <Card title="🎯 Meta total">
              <ProgressBar value={overview.goals.percentOfTotalGoal} />
              <p className="tiny muted" style={{ marginTop: 8 }}>
                {overview.totalAnswered} de {overview.goals.totalGoal} questões · ritmo sugerido de{' '}
                <b>{overview.goals.suggestedDaily}/dia</b>
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
