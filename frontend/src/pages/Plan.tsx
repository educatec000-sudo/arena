import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, ProgressBar, Spinner } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { progressService } from '@/services/progress.service';
import { subjectsService } from '@/services/questions.service';
import { aiService } from '@/services/ai.service';
import { AiAnswer } from '@/components/question/StudySessionRunner';
import { nf } from '@/utils/format';
import { useState } from 'react';

/**
 * Plano até a prova.
 * Distribui o ritmo semanal priorizando o que o aluno tem pior desempenho.
 */
export default function Plan() {
  const toast = useToast();
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['progress-report'],
    queryFn: () => progressService.report(),
  });

  const { data: subjectsStats = [] } = useQuery({
    queryKey: ['subjects-stats'],
    queryFn: () => subjectsService.stats(),
    staleTime: 10 * 60_000,
  });

  const plan = useMemo(() => {
    if (!data || !subjectsStats.length) return null;

    const remaining = data.overview.goals.remainingQuestions;
    const days = data.overview.goals.remainingDays || 1;
    const perDay = Math.ceil(remaining / Math.max(1, days));

    // Peso inverso ao desempenho: quem vai pior recebe mais questões.
    const ranked = data.bySubject
      .map((subject) => {
        const bank = subjectsStats.find((s) => s.code === subject.code)?.questions || 1;
        const accuracy = subject.answered ? subject.accuracy : 50;
        const weight = subject.answered ? Math.max(0.4, 1.6 - accuracy / 100) : 1.2;
        return { code: subject.code, name: subject.name, color: subject.color, accuracy, weight, bank, answered: subject.answered };
      })
      .sort((a, b) => b.weight - a.weight);

    const totalWeight = ranked.reduce((sum, item) => sum + item.weight, 0) || 1;

    return {
      perDay,
      days,
      remaining,
      distribution: ranked.map((item) => ({
        ...item,
        questionsPerWeek: Math.max(1, Math.round(((perDay * 7) / totalWeight) * item.weight)),
      })),
    };
  }, [data, subjectsStats]);

  const suggestWithAi = async () => {
    setLoading(true);
    try {
      const result = await aiService.suggestReview();
      setAiPlan(result.content);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Configure uma chave de IA para usar este recurso.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <Spinner label="Montando seu plano..." />;

  if (!data || !plan) {
    return (
      <div className="wrap">
        <Card title="Plano indisponível" subtitle="Responda algumas questões para gerar seu plano." />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Card
        title="🗓️ Plano até a prova"
        subtitle={`Faltam ${plan.days} dias e ${plan.remaining} questões para bater sua meta.`}
      >
        <div className="grid c3">
          <div className="kpi">
            <b style={{ color: 'var(--pri2)' }}>{plan.perDay}</b>
            <span>questões por dia</span>
          </div>
          <div className="kpi">
            <b>{plan.perDay * 7}</b>
            <span>por semana</span>
          </div>
          <div className="kpi">
            <b>{nf(data.overview.goals.percentOfTotalGoal, 1)}%</b>
            <span>da meta concluída</span>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <ProgressBar value={data.overview.goals.percentOfTotalGoal} />
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <Button variant="primary" loading={loading} onClick={suggestWithAi}>
            🤖 Pedir plano de revisão para a IA
          </Button>
        </div>
      </Card>

      <Card title="📊 Distribuição sugerida por semana">
        <p className="muted small">
          As matérias com pior aproveitamento recebem mais questões. Ajuste livremente — o plano é
          uma sugestão, não uma regra.
        </p>
        {plan.distribution.map((item) => (
          <div key={item.code} className="plan-row">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <b>{item.name}</b>{' '}
                <Badge tone={item.accuracy >= 60 ? 'ok' : item.accuracy >= 50 ? 'warn' : 'err'}>
                  {item.answered ? `${nf(item.accuracy, 0)}%` : 'sem dados'}
                </Badge>
              </span>
              <span className="muted small">{item.questionsPerWeek} questões/semana</span>
            </div>
            <ProgressBar
              value={(item.questionsPerWeek / Math.max(1, plan.perDay * 7)) * 100}
              tone={item.accuracy >= 60 ? 'ok' : 'gold'}
            />
          </div>
        ))}
      </Card>

      <Card title="🧭 Estratégia de estudo">
        <ol className="strategy-list">
          <li>
            <b>Processo Legislativo e Regimento Interno da ALEPA</b> é o coração da prova deste cargo:
            estude com o Regimento aberto ao lado.
          </li>
          <li>Faça pelo menos <b>um simulado por semana</b> e corrija no mesmo dia.</li>
          <li>Mande todas as erradas para o <b>caderno de erros</b> e revise no dia seguinte.</li>
          <li>Reserve 20 minutos diários para <b>teoria de bolso</b> antes de dormir.</li>
          <li>Nos últimos 15 dias, priorize <b>questões da banca</b> e revisão do caderno de erros.</li>
        </ol>
      </Card>

      {aiPlan && (
        <Card title="🤖 Plano de revisão sugerido pela IA">
          <AiAnswer text={aiPlan} />
        </Card>
      )}
    </div>
  );
}
