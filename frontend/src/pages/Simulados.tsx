import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { simuladosService } from '@/services/simulados.service';
import { errorNotebookService } from '@/services/error-notebook.service';
import { subjectsService } from '@/services/questions.service';
import { aiService } from '@/services/ai.service';
import { nf } from '@/utils/format';
import type { Difficulty } from '@/types';

/** Distribuição padrão (mesma proporção dos presets do app legado). */
const PRESET_60: Record<string, number> = {
  LP: 12, LE: 7, INFO: 6, RL: 8, SEC: 3, DA: 8, DC: 5, DPC: 2, PL: 12, DF: 3, DPREV: 2, DCIV: 4, DPCIV: 3, DH: 2,
};

export default function Simulados() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'MANUAL' | 'RANDOM' | 'ADAPTIVE'>('MANUAL');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [questionCount, setQuestionCount] = useState(40);
  const [durationMinutes, setDurationMinutes] = useState(240);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState<'final' | 'imediato'>('final');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [title, setTitle] = useState('');

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const { data: statsBySubject = [] } = useQuery({
    queryKey: ['subjects-stats'],
    queryFn: () => subjectsService.stats(),
    staleTime: 10 * 60_000,
  });

  const { data: history, isLoading } = useQuery({
    queryKey: ['simulados'],
    queryFn: () => simuladosService.list({ limit: 20 }),
  });

  const { data: simuladoStats } = useQuery({
    queryKey: ['simulados-stats'],
    queryFn: () => simuladosService.stats(),
  });

  const { data: errorStats } = useQuery({
    queryKey: ['error-notebook-stats'],
    queryFn: () => errorNotebookService.stats(),
  });

  const total = useMemo(
    () =>
      mode === 'MANUAL'
        ? Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0)
        : questionCount,
    [mode, quantities, questionCount],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      simuladosService.create({
        title: title || undefined,
        mode,
        ...(mode === 'MANUAL'
          ? {
              distribution: Object.entries(quantities)
                .filter(([, quantity]) => quantity > 0)
                .map(([subjectId, quantity]) => ({ subjectId, quantity })),
            }
          : { questionCount }),
        durationMinutes,
        shuffleOptions,
        feedbackMode,
        difficulty: difficulty || undefined,
      }),
    onSuccess: (simulado) => {
      queryClient.invalidateQueries({ queryKey: ['simulados'] });
      toast(`Simulado criado com ${simulado.questionCount} questões. Boa prova!`);
      navigate(`/app/simulados/${simulado.id}`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const errorsMutation = useMutation({
    mutationFn: () =>
      errorNotebookService.generateSimulado({ count: 20, durationMinutes: 120, feedbackMode }),
    onSuccess: (simulado) => {
      toast('Simulado dos seus erros criado!');
      navigate(`/app/simulados/${simulado.id}`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      aiService.generateSimulado({
        subjectIds: (Object.entries(quantities).filter(([, q]) => q > 0).map(([id]) => id)),
        count: Math.min(10, total || 10),
        difficulty: (difficulty || 'MEDIA') as Difficulty,
        durationMinutes: Math.max(10, Math.round(durationMinutes / 4)),
      }),
    onSuccess: (simulado) => {
      const skipped = simulado.generation?.skipped || 0;
      const usados = simulado.generation?.providers || [];
      if (usados.length) toast(`Provas montadas por: ${usados.join(' + ')}`, 'info');
      toast(
        skipped
          ? `Simulado gerado pela IA! ${skipped} ${skipped === 1 ? 'questão repetida foi descartada' : 'questões repetidas foram descartadas'}.`
          : 'Simulado gerado pela IA!',
        skipped ? 'info' : 'success',
      );
      navigate(`/app/simulados/${simulado.id}`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const available = (code: string) =>
    statsBySubject.find((subject) => subject.code === code)?.questions ?? 0;

  if (isLoading) return <Spinner label="Carregando seus simulados..." />;

  return (
    <div className="wrap">
      <Card
        title="⏱️ Novo simulado"
        subtitle="Monte uma prova no estilo da banca, com cronômetro e correção comentada por matéria."
      >
        <div className="grid c2">
          <Field label="Título (opcional)">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`Simulado ${new Date().toLocaleDateString('pt-BR')}`}
            />
          </Field>
          <Field label="Modo de montagem">
            <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="MANUAL">Escolher questões por matéria</option>
              <option value="RANDOM">Aleatório (quantidade total)</option>
              <option value="ADAPTIVE">Personalizado pelo meu desempenho</option>
            </Select>
          </Field>
        </div>

        {mode === 'MANUAL' ? (
          <>
            <div className="grid c3" style={{ marginTop: 12 }}>
              {subjects.map((subject) => (
                <Field key={subject.id} label={`${subject.name} (disp. ${available(subject.code)})`}>
                  <Input
                    type="number"
                    min={0}
                    max={available(subject.code)}
                    value={quantities[subject.id] ?? 0}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [subject.id]: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="row gap-8" style={{ marginTop: 10 }}>
              <Button size="sm" onClick={() => {
                const next: Record<string, number> = {};
                subjects.forEach((subject) => {
                  next[subject.id] = Math.min(available(subject.code), PRESET_60[subject.code] ?? 3);
                });
                setQuantities(next);
              }}>
                Preset: 60 questões
              </Button>
              <Button size="sm" onClick={() => setQuantities({})}>
                Limpar
              </Button>
            </div>
          </>
        ) : (
          <div className="grid c3" style={{ marginTop: 12 }}>
            <Field label="Quantidade de questões">
              <Input
                type="number"
                min={1}
                max={200}
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value) || 0)}
              />
            </Field>
          </div>
        )}

        <div className="grid c4" style={{ marginTop: 12 }}>
          <Field label="Tempo (minutos)">
            <Input
              type="number"
              min={5}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Embaralhar alternativas">
            <Select
              value={shuffleOptions ? 's' : 'n'}
              onChange={(event) => setShuffleOptions(event.target.value === 's')}
            >
              <option value="n">Não</option>
              <option value="s">Sim</option>
            </Select>
          </Field>
          <Field label="Feedback">
            <Select
              value={feedbackMode}
              onChange={(event) => setFeedbackMode(event.target.value as 'final' | 'imediato')}
            >
              <option value="final">Só no final (realista)</option>
              <option value="imediato">Imediato</option>
            </Select>
          </Field>
          <Field label="Dificuldade">
            <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty | '')}>
              <option value="">Todas</option>
              <option value="FACIL">Fácil</option>
              <option value="MEDIA">Média</option>
              <option value="DIFICIL">Difícil</option>
            </Select>
          </Field>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <Badge tone="pri">{total} questões no simulado</Badge>
          <Button variant="primary" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            ▶ Iniciar simulado
          </Button>
          <Button
            loading={errorsMutation.isPending}
            disabled={!errorStats?.pending}
            onClick={() => errorsMutation.mutate()}
          >
            📕 Gerar simulado com meus erros ({errorStats?.pending ?? 0})
          </Button>
          <Button
            variant="gold"
            loading={aiMutation.isPending}
            disabled={mode !== 'MANUAL' || total === 0}
            onClick={() => aiMutation.mutate()}
            title="Cria questões inéditas com IA e monta um simulado com elas"
          >
            🤖 Gerar simulado com IA
          </Button>
        </div>
      </Card>

      {simuladoStats && simuladoStats.finished > 0 && (
        <div className="grid c4">
          <div className="kpi">
            <b>{simuladoStats.finished}</b>
            <span>simulados concluídos</span>
          </div>
          <div className="kpi">
            <b>{nf(simuladoStats.averageScore, 1)}</b>
            <span>nota média</span>
          </div>
          <div className="kpi">
            <b>{nf(simuladoStats.averagePercent, 0)}%</b>
            <span>aproveitamento médio</span>
          </div>
          <div className="kpi">
            <b style={{ color: 'var(--gold)' }}>{nf(simuladoStats.bestPercent, 0)}%</b>
            <span>melhor resultado</span>
          </div>
        </div>
      )}

      <Card title="📋 Histórico de simulados">
        {history && history.data.length ? (
          <Table head={['Simulado', 'Modo', 'Questões', 'Acertos', 'Nota', 'Data', '']}>
            {history.data.map((simulado) => (
              <tr key={simulado.id}>
                <td>{simulado.title}</td>
                <td>
                  <Badge>{simulado.mode}</Badge>
                </td>
                <td>{simulado.questionCount}</td>
                <td>
                  {simulado.status === 'FINISHED'
                    ? `${simulado.correctCount}/${simulado.questionCount}`
                    : '—'}
                </td>
                <td>
                  {simulado.score !== null ? <b>{nf(simulado.score, 1)}</b> : '—'}
                </td>
                <td className="tiny muted">
                  {new Date(simulado.createdAt).toLocaleDateString('pt-BR')}
                </td>
                <td>
                  {simulado.status === 'IN_PROGRESS' ? (
                    <Link to={`/app/simulados/${simulado.id}`}>
                      <Button size="sm" variant="primary">
                        Continuar
                      </Button>
                    </Link>
                  ) : simulado.status === 'FINISHED' ? (
                    <Link to={`/app/simulados/${simulado.id}/resultado`}>
                      <Button size="sm">Ver correção</Button>
                    </Link>
                  ) : (
                    <Badge tone="warn">abandonado</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState
            icon="⏱️"
            title="Você ainda não fez simulados"
            description="Monte o primeiro usando o formulário acima."
          />
        )}
      </Card>
    </div>
  );
}
