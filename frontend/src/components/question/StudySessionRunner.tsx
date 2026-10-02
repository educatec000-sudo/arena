import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Modal, ProgressBar } from '@/components/ui';
import QuestionCard from './QuestionCard';
import { useToast } from '@/contexts/ToastContext';
import { progressService } from '@/services/progress.service';
import { favoritesService } from '@/services/favorites.service';
import { errorNotebookService } from '@/services/error-notebook.service';
import { aiService } from '@/services/ai.service';
import { parseInline, parseMarkdown } from '@/utils/format';
import type { Question } from '@/types';

interface RunnerProps {
  questions: Question[];
  title: string;
  feedbackMode?: 'imediato' | 'final';
  onExit: () => void;
  onFinish?: (summary: { total: number; correct: number }) => void;
}

/**
 * Executor de sessão de estudo (treino, revisão, caderno de erros, favoritas).
 *
 * Toda a lógica de negócio está nos services: este componente apenas orquestra
 * a experiência. Respostas são enviadas ao backend uma a uma, então fechar a
 * aba no meio da sessão não perde o que já foi respondido.
 */
export default function StudySessionRunner({
  questions,
  title,
  feedbackMode = 'imediato',
  onExit,
  onFinish,
}: RunnerProps) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { label: string; correct: boolean }>>({});
  const [current, setCurrent] = useState<Question | null>(questions[0] ?? null);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [finished, setFinished] = useState(false);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    setCurrent(questions[0] ?? null);
    setIndex(0);
    setAnswers({});
    setFinished(false);
  }, [questions]);

  const total = questions.length;
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a.correct).length;

  const progress = total ? (index / total) * 100 : 0;

  const answerCurrent = useCallback(
    async (label: string) => {
      if (!current || loading) return;
      if (answers[current.id]) return; // já respondeu esta

      setLoading(true);
      try {
        const result = await progressService.answer({
          questionId: current.id,
          chosenLabel: label,
          source: 'TRAINING',
          timeSpentSeconds: Math.round((Date.now() - startedAt) / 1000) % 600,
        });

        setAnswers((prev) => ({ ...prev, [current.id]: { label, correct: result.isCorrect } }));
        setCurrent((prev) =>
          prev
            ? {
                ...prev,
                correctLabel: result.correctLabel,
                explanation: result.explanation,
                analysis: result.analysis,
              }
            : prev,
        );
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Não foi possível registrar sua resposta.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [answers, current, loading, startedAt, toast],
  );

  const goNext = () => {
    if (index + 1 >= total) {
      setFinished(true);
      onFinish?.({ total: answeredCount, correct: correctCount });
      return;
    }
    const nextIndex = index + 1;
    setIndex(nextIndex);
    setCurrent(questions[nextIndex] ?? null);
  };

  const goPrev = () => {
    if (index === 0) return;
    const prevIndex = index - 1;
    setIndex(prevIndex);
    setCurrent(questions[prevIndex] ?? null);
  };

  const toggleFavorite = async () => {
    if (!current) return;
    try {
      const { favorited } = await favoritesService.toggle(current.id);
      setCurrent((prev) => (prev ? { ...prev, isFavorite: favorited } : prev));
      toast(favorited ? 'Adicionada às favoritas ⭐' : 'Removida das favoritas.');
    } catch {
      toast('Não foi possível atualizar seus favoritos.', 'error');
    }
  };

  const toggleErrorBook = async () => {
    if (!current) return;
    try {
      if (current.inErrorNotebook) {
        await errorNotebookService.remove(current.id);
        setCurrent((prev) => (prev ? { ...prev, inErrorNotebook: false } : prev));
        toast('Removida do caderno de erros.');
      } else {
        await errorNotebookService.add(current.id);
        setCurrent((prev) => (prev ? { ...prev, inErrorNotebook: true } : prev));
        toast('Adicionada ao caderno de erros 📕');
      }
    } catch {
      toast('Não foi possível atualizar o caderno de erros.', 'error');
    }
  };

  const explain = async () => {
    if (!current) return;
    setExplaining(true);
    try {
      const result = await aiService.explainQuestion(current.id, answers[current.id]?.label);
      setExplanation(result.content);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Configure uma chave de IA para usar o tutor.', 'error');
    } finally {
      setExplaining(false);
    }
  };

  const accuracy = answeredCount ? (correctCount / answeredCount) * 100 : 0;

  const summary = useMemo(
    () => ({
      answered: answeredCount,
      correct: correctCount,
      wrong: answeredCount - correctCount,
    }),
    [answeredCount, correctCount],
  );

  if (finished) {
    return (
      <Card title="✅ Sessão finalizada" subtitle={`${title} · ${summary.answered} questões respondidas`}>
        <div className="grid c3">
          <div className="kpi">
            <b style={{ color: 'var(--ok)' }}>{summary.correct}</b>
            <span>acertos</span>
          </div>
          <div className="kpi">
            <b style={{ color: 'var(--err)' }}>{summary.wrong}</b>
            <span>erros</span>
          </div>
          <div className="kpi">
            <b>{answeredCount ? `${accuracy.toFixed(0)}%` : '—'}</b>
            <span>aproveitamento</span>
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          {summary.wrong > 0
            ? 'As questões que você errou já foram para o caderno de erros e entraram na sua fila de revisão.'
            : 'Mandou bem! As questões voltam para a sua fila de revisão espaçada.'}
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <Button variant="primary" onClick={onExit}>
            Voltar
          </Button>
        </div>
      </Card>
    );
  }

  if (!current) {
    return (
      <Card title="Nenhuma questão encontrada">
        <p className="muted small">Ajuste os filtros e tente novamente.</p>
        <Button onClick={onExit}>Voltar</Button>
      </Card>
    );
  }

  return (
    <div className="session-runner">
      <div className="session-top">
        <div className="row gap-8 wrap">
          <Badge tone="pri">{title}</Badge>
          <span className="muted small">
            {index + 1} de {total}
          </span>
          <span className="muted small">
            ✅ {correctCount} · ❌ {answeredCount - correctCount}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          ✖ Sair
        </Button>
      </div>

      <ProgressBar value={progress} />

      <QuestionCard
        question={current}
        chosenLabel={answers[current.id]?.label ?? null}
        revealed={Boolean(answers[current.id])}
        feedbackMode={feedbackMode}
        onAnswer={answerCurrent}
        onToggleFavorite={toggleFavorite}
        onToggleErrorBook={toggleErrorBook}
        onExplain={explain}
        isFavorite={current.isFavorite}
        inErrorNotebook={current.inErrorNotebook}
        disabled={loading}
      />

      <div className="row gap-8 session-nav">
        <Button onClick={goPrev} disabled={index === 0}>
          ◀ Anterior
        </Button>
        <div className="spacer" />
        {answers[current.id] ? (
          <Button variant="primary" onClick={goNext}>
            {index + 1 >= total ? 'Finalizar sessão ✅' : 'Próxima ▶'}
          </Button>
        ) : (
          <span className="tiny muted">Escolha uma alternativa para continuar</span>
        )}
      </div>

      <Modal open={Boolean(explanation)} title="🤖 Explicação do tutor" onClose={() => setExplanation(null)} size="lg">
        <AiAnswer text={explanation || ''} />
      </Modal>

      <Modal open={explaining} title="🤖 Consultando a IA..." onClose={() => setExplaining(false)} size="sm">
        <p className="muted small">O professor está escrevendo a explicação...</p>
      </Modal>
    </div>
  );
}

/** Renderiza a resposta da IA sem usar HTML vindo de terceiros. */
export function AiAnswer({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="md">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h4 key={index}>{block.text}</h4>;
        }
        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>
                  {parseInline(item).map((part, j) =>
                    part.bold ? (
                      <strong key={j}>{part.text}</strong>
                    ) : part.code ? (
                      <code key={j}>{part.text}</code>
                    ) : (
                      <span key={j}>{part.text}</span>
                    ),
                  )}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {parseInline(block.text).map((part, j) =>
              part.bold ? (
                <strong key={j}>{part.text}</strong>
              ) : part.code ? (
                <code key={j}>{part.text}</code>
              ) : (
                <span key={j}>{part.text}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}
