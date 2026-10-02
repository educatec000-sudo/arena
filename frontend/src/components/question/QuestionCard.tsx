import { useState } from 'react';
import { Badge, Button, Card, cn } from '@/components/ui';
import { DIFFICULTY_LABEL, formatMinutes } from '@/utils/format';
import type { Question } from '@/types';

interface QuestionCardProps {
  question: Question;
  index?: number;
  total?: number;
  /** Alternativa já escolhida (modo "prova": permite limpar). */
  chosenLabel?: string | null;
  /** Quando true mostra gabarito e comentário. */
  revealed?: boolean;
  feedbackMode?: 'imediato' | 'final';
  onAnswer?: (label: string) => void;
  onToggleFavorite?: () => void;
  onToggleErrorBook?: () => void;
  onExplain?: () => void;
  isFavorite?: boolean;
  inErrorNotebook?: boolean;
  disabled?: boolean;
}

/**
 * Cartão de questão.
 * Componente "burro": recebe tudo por props e não conhece a API.
 * Reutilizado em treino, simulado, caderno de erros, favoritas e revisão.
 */
export function QuestionCard({
  question,
  index,
  total,
  chosenLabel,
  revealed = false,
  feedbackMode = 'imediato',
  onAnswer,
  onToggleFavorite,
  onToggleErrorBook,
  onExplain,
  isFavorite,
  inErrorNotebook,
  disabled = false,
}: QuestionCardProps) {
  const [showNote, setShowNote] = useState(false);

  const correctLabel = question.correctLabel;
  // No modo "final" o gabarito só aparece depois de corrigir; no "imediato",
  // assim que o aluno marca a alternativa (nunca antes).
  const showSolution = revealed || Boolean(chosenLabel && feedbackMode === 'imediato');

  const optionTone = (label: string) => {
    if (!showSolution || !correctLabel) return '';
    if (label === correctLabel) return 'right';
    if (label === chosenLabel) return 'wrong';
    return '';
  };

  return (
    <Card className="question-card">
      <header className="qhead-row">
        <div className="row gap-6 wrap">
          {typeof index === 'number' && total ? (
            <Badge tone="pri">
              Questão {index + 1} de {total}
            </Badge>
          ) : null}
          {question.subject && <Badge>{question.subject.name}</Badge>}
          {question.topic && <Badge>{question.topic.name}</Badge>}
          <Badge
            tone={
              question.difficulty === 'DIFICIL' ? 'err' : question.difficulty === 'MEDIA' ? 'warn' : 'ok'
            }
          >
            {DIFFICULTY_LABEL[question.difficulty]}
          </Badge>
          {question.origin === 'AI' && <Badge tone="warn">gerada por IA 🤖</Badge>}
          {question.origin === 'IMPORTED' && <Badge tone="gold">prova antiga</Badge>}
        </div>
      </header>

      <div className="qtext">
        {question.prompt}
      </div>

      {question.legalBasis && <div className="tiny muted qmeta">📎 {question.legalBasis}</div>}

      <div className="options" role="group" aria-label="Alternativas">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cn(
              'alt',
              chosenLabel === option.label && 'sel',
              optionTone(option.label),
              disabled && 'disabled',
            )}
            disabled={disabled || (chosenLabel !== undefined && feedbackMode === 'final' && !showSolution)}
            onClick={() => onAnswer?.(option.label)}
          >
            <span className="ltr">{option.label}</span>
            <span className="tx">{option.text}</span>
          </button>
        ))}
      </div>

      {showSolution && correctLabel && (
        <div className={cn('fb', chosenLabel === correctLabel ? 'right' : 'wrong')}>
          <div className="tt">
            {chosenLabel === correctLabel
              ? '✅ Correto!'
              : `❌ Gabarito: ${correctLabel}${chosenLabel ? ` (você marcou ${chosenLabel})` : ''}`}
          </div>
          {question.explanation && <div className="com">{question.explanation}</div>}
          {question.analysis && (
            <>
              <button type="button" className="linkish tiny" onClick={() => setShowNote((v) => !v)}>
                {showNote ? '▾ esconder análise por alternativa' : '▸ ver análise por alternativa'}
              </button>
              {showNote && <div className="explica">{question.analysis}</div>}
            </>
          )}
        </div>
      )}

      <footer className="qactions">
        {onToggleFavorite && (
          <Button size="sm" variant="ghost" onClick={onToggleFavorite}>
            {isFavorite ? '⭐ Favorita' : '☆ Favoritar'}
          </Button>
        )}
        {onToggleErrorBook && (
          <Button size="sm" variant="ghost" onClick={onToggleErrorBook}>
            {inErrorNotebook ? '📕 No caderno' : '➕ Caderno de erros'}
          </Button>
        )}
        {onExplain && (
          <Button size="sm" variant="ghost" onClick={onExplain}>
            🤖 Explicar com IA
          </Button>
        )}
      </footer>
    </Card>
  );
}

export { formatMinutes };

export default QuestionCard;
