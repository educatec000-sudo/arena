import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Kpi, ProgressBar, Spinner } from '@/components/ui';
import { DonutChart, Heatmap, LineChart, ProgressList } from '@/components/charts';
import { AchievementsGrid } from '@/components/gamification/AchievementsGrid';
import { GamificationCard } from '@/components/gamification/GamificationCard';
import { useAuth } from '@/contexts/AuthContext';
import { gamificationService } from '@/services/gamification.service';
import { studyTracksService } from '@/services/study-tracks.service';
import { progressService } from '@/services/progress.service';
import { questionsService, subjectsService } from '@/services/questions.service';
import { nf } from '@/utils/format';

/** Painel do aluno: o que fazer hoje + como está o desempenho. */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => progressService.dashboard(),
  });

  /** Revisão espaçada (Leitner): o que precisa ser revisto hoje. */
  const { data: schedule } = useQuery({
    queryKey: ['review-schedule'],
    queryFn: () => progressService.schedule(60),
    staleTime: 60_000,
  });

  const { data: bank } = useQuery({
    queryKey: ['bank-stats'],
    queryFn: () => questionsService.stats(),
    staleTime: 5 * 60_000,
  });

  const { data: subjects } = useQuery({
    queryKey: ['subjects-stats'],
    queryFn: () => subjectsService.stats(),
    staleTime: 5 * 60_000,
  });

  /** Gamificação: XP, nível e conquistas (servidor calcula tudo). */
  const { data: gamification } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => gamificationService.me(),
    staleTime: 30_000,
  });

  /** Trilha em andamento (primeira trilha com progresso < 100%). */
  const { data: tracks } = useQuery({
    queryKey: ['study-tracks'],
    queryFn: () => studyTracksService.list(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <Spinner label="Carregando seu painel..." />;

  if (error || !data) {
    return (
      <div className="wrap">
        <Card title="Não foi possível carregar seu painel">
          <p className="muted small">
            {error instanceof Error ? error.message : 'Tente recarregar a página.'}
          </p>
        </Card>
      </div>
    );
  }

  const { overview, evolution, bySubject, counters, recentSimulados } = data;
  const goalPercent = Math.min(
    100,
    (overview.today.questions / Math.max(1, overview.goals.dailyGoal)) * 100,
  );
  const metaBatida = overview.today.questions >= overview.goals.dailyGoal;

  // Primeira trilha ainda não concluída (ou a primeira, se todas estiverem prontas).
  const currentTrack = (tracks ?? []).find((track) => track.progress.percent < 100) ?? tracks?.[0];

  return (
    <div className="wrap">
      {/* ---------------------------------------------------------- saudação -- */}
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Olá, {user?.name?.split(' ')[0]}! Bora bater a meta de hoje? 🚀</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Assembleia Legislativa do Pará · Fundação CETAP · Cargo 15
              {overview.goals.remainingDays !== null && (
                <> · Faltam <b>{overview.goals.remainingDays}</b> dias para a prova</>
              )}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="timer" style={{ fontSize: 34, color: 'var(--gold)' }}>
              {overview.goals.remainingDays ?? '—'}
            </div>
            <div className="muted tiny">dias para a prova</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>
              Meta de hoje: {overview.today.questions} / {overview.goals.dailyGoal} questões
            </b>
            <span className="muted small">
              {metaBatida
                ? '✅ meta batida!'
                : `faltam ${overview.goals.dailyGoal - overview.today.questions}`}
            </span>
          </div>
          <ProgressBar value={goalPercent} tone="gold" />
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <Button variant="primary" onClick={() => (window.location.href = '/app/treinar')}>
            ▶ Treinar agora
          </Button>
          <Link to="/app/simulados">
            <Button>⏱️ Fazer simulado</Button>
          </Link>
          <Link to="/app/caderno">
            <Button>🔁 Revisar erros ({counters.pendingReviews})</Button>
          </Link>
        </div>
      </Card>

      {/* -------------------------------------------------------------- KPIs -- */}
      <div className="grid c4">
        <Kpi value={overview.totalAnswered} label="questões respondidas" />
        <Kpi
          value={`${nf(overview.accuracy, 0)}%`}
          label="aproveitamento"
          tone={overview.accuracy >= 60 ? 'var(--ok)' : overview.accuracy >= 50 ? 'var(--warn)' : 'var(--err)'}
        />
        <Kpi value={overview.streak} label="dias seguidos 🔥" tone="var(--gold)" />
        <Kpi value={overview.minutesStudied} label="minutos estudados" />
      </div>

      {/* ------------------------------------------- gamificação + trilha ---- */}
      <div className="grid c2">
        {gamification && <GamificationCard data={gamification} />}

        {currentTrack && (
          <Card
            title={`🧭 ${currentTrack.title}`}
            subtitle="Trilha em andamento — marque as etapas conforme avança."
            action={
              <Link to="/app/trilhas">
                <Button size="sm">Ver trilhas</Button>
              </Link>
            }
          >
            <ProgressBar
              value={currentTrack.progress.percent}
              tone={currentTrack.progress.percent === 100 ? 'ok' : 'gold'}
            />
            <p className="muted small" style={{ margin: '6px 0 10px' }}>
              {currentTrack.progress.completed} de {currentTrack.progress.total} etapas ·{' '}
              {Math.round(currentTrack.progress.percent)}% concluída
            </p>
            <ol className="track-list compact">
              {currentTrack.items.slice(0, 4).map((item) => (
                <li key={item.id} className={item.done ? 'done' : undefined}>
                  <span>
                    {item.done ? '✅' : '⬜'} {item.title}
                  </span>
                  {item.subject && <span className="muted tiny">{item.subject.name}</span>}
                </li>
              ))}
            </ol>
            {currentTrack.items.length > 4 && (
              <p className="muted tiny" style={{ marginTop: 6 }}>
                + {currentTrack.items.length - 4} etapas...
              </p>
            )}
          </Card>
        )}
      </div>

      {/* --------------------------------------------- revisão espaçada ------ */}
      <Card
        title="🔁 Revisão espaçada"
        subtitle="Caixas de Leitner: cada acerto empurra a questão para mais longe; cada erro a traz de volta para amanhã."
        action={
          <Button
            variant="primary"
            disabled={!schedule?.dueToday}
            onClick={() => navigate('/app/treinar?modo=pendentes')}
          >
            Revisar agora ({schedule?.dueToday ?? 0})
          </Button>
        }
      >
        {schedule && schedule.scheduled > 0 ? (
          <>
            <div className="grid c4">
              <Kpi value={schedule.dueToday} label="para hoje" tone="var(--pri2)" />
              <Kpi value={schedule.dueTomorrow} label="amanhã" />
              <Kpi value={schedule.dueNext7Days} label="nos próximos 7 dias" />
              <Kpi value={schedule.scheduled} label="questões agendadas" />
            </div>

            <div className="row gap-6 wrap" style={{ marginTop: 12 }}>
              {schedule.byBox.map((item) => (
                <Badge key={item.box} tone={item.box === 0 ? 'err' : item.box >= 4 ? 'ok' : 'warn'}>
                  caixa {item.box}
                  {item.intervalDays !== null ? ` · ${item.intervalDays}d` : ''}: {item.total}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon="🔁"
            title="Nenhuma revisão agendada ainda"
            description="Responda questões: a partir do seu desempenho o app monta sozinho a sua agenda de revisões."
            action={
              <Link to="/app/treinar">
                <Button variant="primary">Começar a treinar</Button>
              </Link>
            }
          />
        )}
      </Card>

      {/* ----------------------------------------------------- meta + banco --- */}
      <Card title={`🎯 Rumo às ${overview.goals.totalGoal} questões`}>
        <ProgressBar value={overview.goals.percentOfTotalGoal} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <span className="muted small">
            {overview.totalAnswered} de {overview.goals.totalGoal} (
            {nf(overview.goals.percentOfTotalGoal, 0)}%)
          </span>
          <span className="muted small">
            faltam <b style={{ color: '#fff' }}>{overview.goals.remainingQuestions}</b> →{' '}
            <b style={{ color: 'var(--pri2)' }}>{overview.goals.suggestedDaily}/dia</b>
          </span>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>
          Banco: <b>{bank?.total ?? 0}</b> questões comentadas · {subjects?.length ?? 0} matérias ·{' '}
          {counters.simulados} simulados concluídos · {counters.favorites} favoritas ·{' '}
          {counters.errorNotebook} no caderno de erros
        </p>
      </Card>

      {/* ---------------------------------------------------------- evolução -- */}
      <div className="grid c2">
        <Card title="📈 Últimos 35 dias">
          <LineChart
            data={evolution.map((point) => ({
              label: point.date.slice(8),
              value: point.questions,
            }))}
          />
          <Heatmap data={evolution} />
        </Card>

        <Card title="🍩 Acertos x erros">
          <div className="row" style={{ justifyContent: 'center' }}>
            <DonutChart
              segments={[
                { label: 'Acertos', value: overview.totalCorrect, color: 'var(--ok)' },
                {
                  label: 'Erros',
                  value: Math.max(0, overview.totalAnswered - overview.totalCorrect),
                  color: 'var(--err)',
                },
              ]}
              centerValue={`${nf(overview.accuracy, 0)}%`}
              centerLabel="de aproveitamento"
            />
          </div>
          <div className="row gap-8" style={{ justifyContent: 'center', marginTop: 10 }}>
            <Badge tone="ok">✅ {overview.totalCorrect} acertos</Badge>
            <Badge tone="err">❌ {overview.totalWrong} erros</Badge>
            <ReviewBadge pending={counters.pendingReviews} />
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------- conquistas ------ */}
      {gamification && gamification.achievements.length > 0 && (
        <Card
          title="🏅 Conquistas"
          subtitle={`${gamification.totals.unlocked} de ${gamification.totals.available} desbloqueadas`}
        >
          <AchievementsGrid items={gamification.achievements} />
        </Card>
      )}

      {/* -------------------------------------------------- por matéria ------- */}
      <Card title="📊 Desempenho por matéria">
        {bySubject.length ? (
          <ProgressList
            items={bySubject.map((subject) => ({
              label: subject.name,
              value: subject.answered ? subject.accuracy : 0,
              caption: subject.answered
                ? `${nf(subject.accuracy, 0)}% em ${subject.answered} · cobertura ${nf(subject.coverage, 0)}%`
                : 'ainda não treinada',
              tone: subject.accuracy >= 60 ? 'ok' : 'gold',
            }))}
          />
        ) : (
          <EmptyState
            icon="📚"
            title="Sem dados ainda"
            description="Responda algumas questões para ver seu desempenho por matéria."
            action={
              <Link to="/app/treinar">
                <Button variant="primary" size="sm">
                  Começar a treinar
                </Button>
              </Link>
            }
          />
        )}
      </Card>

      {/* -------------------------------------------------- simulados --------- */}
      <Card
        title="⏱️ Últimos simulados"
        action={
          <Link to="/app/simulados">
            <Button size="sm" variant="ghost">
              ver todos
            </Button>
          </Link>
        }
      >
        {recentSimulados.length ? (
          <div className="timeline">
            {recentSimulados.map((simulado) => (
              <Link key={simulado.id} to={`/app/simulados/${simulado.id}/resultado`} className="timeline-item">
                <div>
                  <b>{simulado.title}</b>
                  <div className="tiny muted">
                    {simulado.finishedAt ? new Date(simulado.finishedAt).toLocaleDateString('pt-BR') : 'em andamento'}
                  </div>
                </div>
                <Badge tone={(simulado.percentCorrect ?? 0) >= 60 ? 'ok' : (simulado.percentCorrect ?? 0) >= 50 ? 'warn' : 'err'}>
                  {simulado.score !== null ? nf(simulado.score, 1) : '—'} · {nf(simulado.percentCorrect ?? 0, 0)}%
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="⏱️"
            title="Nenhum simulado ainda"
            description="Simulados são a melhor forma de treinar para o dia da prova."
            action={
              <Link to="/app/simulados">
                <Button variant="primary" size="sm">
                  Criar meu primeiro simulado
                </Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  );
}

function ReviewBadge({ pending }: { pending: number }) {
  return <Badge tone="pri">🔁 {pending} para revisar</Badge>;
}
