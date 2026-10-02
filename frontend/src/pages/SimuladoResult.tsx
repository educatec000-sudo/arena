import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, ProgressBar, Spinner } from '@/components/ui';
import { ProgressList } from '@/components/charts';
import { simuladosService } from '@/services/simulados.service';
import { cn, formatMinutes, nf } from '@/utils/format';

/** Correção comentada do simulado (equivalente à tela final do app legado). */
export default function SimuladoResult() {
  const { id = '' } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['simulado', id],
    queryFn: () => simuladosService.get(id),
  });

  if (isLoading) return <Spinner label="Carregando correção..." />;

  if (!data || !data.result) {
    return (
      <div className="wrap">
        <Card title="Resultado indisponível">
          <p className="muted small">Este simulado ainda não foi finalizado.</p>
          <Link to="/app/simulados">
            <Button>Voltar</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { result, questions } = data;

  return (
    <div className="wrap">
      <Card title={`✅ ${data.title}`} subtitle="Resultado final">
        <div className="grid c4">
          <div className="kpi">
            <b style={{ color: result.score >= 6 ? 'var(--ok)' : 'var(--err)' }}>{nf(result.score, 1)}</b>
            <span>nota (0–10)</span>
          </div>
          <div className="kpi">
            <b>
              {result.correct}/{data.questionCount}
            </b>
            <span>acertos</span>
          </div>
          <div className="kpi">
            <b>{nf(result.percent, 0)}%</b>
            <span>aproveitamento</span>
          </div>
          <div className="kpi">
            <b>{data.timeSpentSeconds ? formatMinutes(data.timeSpentSeconds / 60) : '—'}</b>
            <span>tempo de prova</span>
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 12 }}>
          Em branco: <b>{result.blank}</b> — em prova real, questão em branco não pontua. Sempre
          marque uma alternativa!
        </p>
      </Card>

      <Card title="📊 Desempenho por matéria">
        <ProgressList
          items={result.bySubject.map((item) => ({
            label: item.subject.name,
            value: item.percent,
            caption: `${item.correct}/${item.total} · ${nf(item.percent, 0)}% · ${
              item.diagnosis === 'forte' ? '💪 forte' : item.diagnosis === 'atencao' ? '⚠️ atenção' : '🚨 prioridade'
            }`,
            tone: item.percent >= 70 ? 'ok' : item.percent >= 50 ? 'gold' : undefined,
          }))}
        />
      </Card>

      <Card title="📝 Correção comentada">
        <div className="correction-list">
          {questions.map((question, index) => {
            const isCorrect = question.isCorrect;
            return (
              <details key={question.id} className="correction-item">
                <summary className={cn(isCorrect ? 'ok' : 'err')}>
                  <span>
                    {isCorrect ? '✅' : '❌'} Q{index + 1} — {question.subject?.name}
                    {!question.chosenLabel && ' (em branco)'}
                  </span>
                  <Badge tone={isCorrect ? 'ok' : 'err'}>
                    {question.chosenLabel ? `você: ${question.chosenLabel}` : 'em branco'} · gabarito{' '}
                    {question.correctLabel}
                  </Badge>
                </summary>

                <div className="small muted">{question.topic?.name}</div>
                <div className="qtext" style={{ margin: '8px 0' }}>
                  {question.prompt}
                </div>

                {question.options.map((option) => (
                  <div
                    key={option.id}
                    className="tiny correction-option"
                    style={{
                      color:
                        option.label === question.correctLabel
                          ? '#6ee7b7'
                          : option.label === question.chosenLabel
                            ? '#fda4af'
                            : 'var(--txt2)',
                    }}
                  >
                    <b>{option.label})</b> {option.text}
                  </div>
                ))}

                {question.explanation && (
                  <div className="fb" style={{ marginTop: 8 }}>
                    <div className="com">{question.explanation}</div>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      </Card>

      <div className="row gap-8">
        <Link to="/app/simulados">
          <Button variant="primary">⏱️ Novo simulado</Button>
        </Link>
        <Link to="/app/caderno">
          <Button>🔁 Revisar os erros desta prova</Button>
        </Link>
        <Link to="/app">
          <Button variant="ghost">🎯 Painel</Button>
        </Link>
      </div>

      <Card>
        <ProgressBar value={result.percent} tone={result.percent >= 60 ? 'ok' : 'gold'} />
      </Card>
    </div>
  );
}
