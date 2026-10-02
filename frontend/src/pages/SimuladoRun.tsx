import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Modal, Spinner } from '@/components/ui';
import { AiAnswer } from '@/components/question/StudySessionRunner';
import { useToast } from '@/contexts/ToastContext';
import { simuladosService } from '@/services/simulados.service';
import { aiService } from '@/services/ai.service';
import { cn, formatClock } from '@/utils/format';

/**
 * Execução do simulado.
 *
 * O cronômetro é calculado a partir do `deadlineAt` devolvido pelo servidor —
 * ou seja, se você recarregar a página (ou trocar de aparelho) o tempo
 * restante continua correto.
 */
export default function SimuladoRun() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const { data: simulado, isLoading } = useQuery({
    queryKey: ['simulado', id],
    queryFn: () => simuladosService.get(id),
    refetchOnMount: 'always',
  });

  const answerMutation = useMutation({
    mutationFn: (payload: { questionId: string; chosenLabel: string | null }) =>
      simuladosService.answer(id, payload),
    onSuccess: () => {
      // Revalida o simulado para refletir a resposta gravada no servidor.
      queryClient.invalidateQueries({ queryKey: ['simulado', id] });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const finishMutation = useMutation({
    mutationFn: () => simuladosService.finish(id),
    onSuccess: () => {
      toast('Prova entregue! Corrigindo...');
      navigate(`/app/simulados/${id}/resultado`, { replace: true });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const data = simulado;

  // Cronômetro baseado no prazo final do servidor.
  useEffect(() => {
    if (!data?.deadlineAt || data.status !== 'IN_PROGRESS') return undefined;
    const deadline = new Date(data.deadlineAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [data?.deadlineAt, data?.status]);

  // Entrega automática quando o tempo acaba.
  useEffect(() => {
    if (remaining === 0 && data?.status === 'IN_PROGRESS' && !finishMutation.isPending) {
      toast('⏰ Tempo esgotado! Entregando a prova...');
      finishMutation.mutate();
    }
  }, [remaining, data?.status, finishMutation, toast]);

  const questions = data?.questions ?? [];
  const current = questions[index];

  const answeredCount = useMemo(() => questions.filter((q) => q.answered).length, [questions]);

  const explain = async () => {
    if (!current) return;
    try {
      const result = await aiService.explainQuestion(current.id, current.chosenLabel ?? undefined);
      setExplanation(result.content);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Configure uma chave de IA.', 'error');
    }
  };

  if (isLoading && !data) return <Spinner label="Carregando simulado..." />;

  if (!data) {
    return (
      <div className="wrap">
        <Card title="Simulado não encontrado">
          <Link to="/app/simulados">
            <Button>Voltar</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (data.status !== 'IN_PROGRESS') {
    return (
      <div className="wrap">
        <Card title="Este simulado já foi finalizado">
          <p className="muted small">Você pode ver a correção completa na tela de resultado.</p>
          <Link to={`/app/simulados/${id}/resultado`}>
            <Button variant="primary">Ver correção</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="sim-top">
        <div className="row gap-8 wrap">
          <Badge tone="pri">SIMULADO</Badge>
          <b>{data.title}</b>
          <span className="muted small">
            {answeredCount}/{data.questionCount} respondidas
          </span>
        </div>
        <div className="row gap-8">
          <span className={cn('timer', remaining !== null && remaining < 300 && 'danger')}>
            {remaining === null ? '--:--' : formatClock(remaining)}
          </span>
          <Button
            variant="ok"
            size="sm"
            loading={finishMutation.isPending}
            onClick={() => finishMutation.mutate()}
          >
            Entregar prova
          </Button>
        </div>
      </div>

      <div className="qnav">
        {questions.map((question, questionIndex) => (
          <button
            key={question.id}
            type="button"
            className={cn(question.answered && 'done', questionIndex === index && 'cur', question.isFlagged && 'flag')}
            onClick={() => setIndex(questionIndex)}
          >
            {questionIndex + 1}
          </button>
        ))}
      </div>

      {current && (
        <Card>
          <div className="row gap-6 wrap" style={{ marginBottom: 10 }}>
            {current.subject && <Badge>{current.subject.name}</Badge>}
            {current.topic && <Badge>{current.topic.name}</Badge>}
            <Badge
              tone={
                current.difficulty === 'DIFICIL' ? 'err' : current.difficulty === 'MEDIA' ? 'warn' : 'ok'
              }
            >
              {current.difficulty === 'FACIL' ? 'Fácil' : current.difficulty === 'MEDIA' ? 'Média' : 'Difícil'}
            </Badge>
          </div>

          <div className="qtext">{current.prompt}</div>

          <div className="options">
            {current.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn('alt', current.chosenLabel === option.label && 'sel')}
                onClick={() =>
                  answerMutation.mutate({ questionId: current.id, chosenLabel: option.label })
                }
                disabled={answerMutation.isPending}
              >
                <span className="ltr">{option.label}</span>
                <span className="tx">{option.text}</span>
              </button>
            ))}
          </div>

          {data.feedbackMode === 'imediato' && current.answered && current.correctLabel && (
            <div className={cn('fb', current.isCorrect ? 'right' : 'wrong')}>
              <div className="tt">
                {current.isCorrect ? '✅ Correto' : `❌ Gabarito: ${current.correctLabel}`}
              </div>
              {current.explanation && <div className="com">{current.explanation}</div>}
            </div>
          )}

          <div className="row gap-8" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            <div className="row gap-8">
              <Button size="sm" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
                ◀
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  answerMutation.mutate({ questionId: current.id, chosenLabel: null })
                }
              >
                Limpar resposta
              </Button>
              <Button size="sm" variant="ghost" onClick={explain}>
                🤖 Explicar
              </Button>
            </div>
            <Button
              variant="primary"
              disabled={index >= questions.length - 1}
              onClick={() => setIndex((value) => value + 1)}
            >
              Próxima ▶
            </Button>
          </div>
        </Card>
      )}

      <Modal open={Boolean(explanation)} title="🤖 Explicação" onClose={() => setExplanation(null)} size="lg">
        <AiAnswer text={explanation || ''} />
      </Modal>
    </div>
  );
}
