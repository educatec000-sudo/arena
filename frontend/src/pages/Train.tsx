import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from '@/components/ui';
import QuestionFilters, { DEFAULT_FILTERS, type FilterState } from '@/components/question/QuestionFilters';
import StudySessionRunner from '@/components/question/StudySessionRunner';
import { useToast } from '@/contexts/ToastContext';
import { questionsService, subjectsService, topicsService } from '@/services/questions.service';
import { progressService } from '@/services/progress.service';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Question } from '@/types';

/**
 * Tela de treino.
 * Filtros -> monta sessão -> executa. Nenhuma regra de negócio na página:
 * a seleção vem da API e o registro de respostas fica no runner.
 */
export default function Train() {
  const toast = useToast();
  const [searchParams] = useSearchParams();

  // Permite abrir o treino já num modo: /app/treinar?modo=pendentes
  // (é para onde o botão "Revisar agora" do painel aponta).
  const initialMode = (searchParams.get('modo') || 'todas') as FilterState['mode'];
  // ?materia=LP já abre o treino filtrado (usado pelas trilhas de estudo).
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    mode: initialMode,
    subject: searchParams.get('materia') || '',
  });
  const [feedback, setFeedback] = useState<'imediato' | 'final'>('imediato');

  // Traduz o filtro de origem da tela para os parâmetros da API.
  // ('' = todas | 'AI' = só geradas por IA | 'NOT_AI' = só as do banco)
  const originQuery = useMemo(
    () =>
      filters.origin === 'AI'
        ? ({ origin: 'AI' } as const)
        : filters.origin === 'NOT_AI'
          ? ({ originNot: 'AI' } as const)
          : {},
    [filters.origin],
  );
  const [session, setSession] = useState<Question[] | null>(null);
  const debouncedSearch = useDebouncedValue(filters.search, 400);

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.code === filters.subject),
    [subjects, filters.subject],
  );

  const { data: topics = [] } = useQuery({
    queryKey: ['topics', selectedSubject?.id],
    queryFn: () => topicsService.list(selectedSubject?.id),
    enabled: Boolean(selectedSubject),
    staleTime: 10 * 60_000,
  });

  const { data: available } = useQuery({
    queryKey: ['questions-count', filters, debouncedSearch],
    queryFn: async () => {
      const response = await questionsService.list({
        subject: filters.subject || undefined,
        topicId: filters.topic || undefined,
        difficulty: (filters.difficulty || undefined) as 'facil' | 'media' | 'dificil' | undefined,
        mode: filters.mode as FilterState['mode'],
        search: debouncedSearch || undefined,
        ...originQuery,
        limit: 1,
      });
      return response.meta.total;
    },
    staleTime: 10_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const questions = await questionsService.session({
        subject: filters.subject || undefined,
        topicId: filters.topic || undefined,
        difficulty: (filters.difficulty || undefined) as 'facil' | 'media' | 'dificil' | undefined,
        mode: filters.mode as FilterState['mode'],
        search: debouncedSearch || undefined,
        ...originQuery,
        limit: filters.limit,
      });
      if (!questions.length) throw new Error('Nenhuma questão encontrada com esses filtros.');
      return questions;
    },
    onSuccess: (questions) => {
      setSession(questions);
      toast(`Sessão iniciada com ${questions.length} questões. Bons estudos!`);
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const queue = await progressService.reviewQueue(filters.limit);
      if (!queue.questionIds.length) return [];
      return Promise.all(queue.questionIds.map((id) => questionsService.findById(id)));
    },
    onSuccess: (questions) => {
      if (!questions.length) {
        toast('Sua fila de revisão está vazia. Responda mais questões para montá-la.', 'info');
        return;
      }
      setSession(questions);
    },
  });

  if (session) {
    return (
      <div className="wrap">
        <StudySessionRunner
          questions={session}
          title="Treino"
          feedbackMode={feedback}
          onExit={() => setSession(null)}
        />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Card
        title="✍️ Treinar por matéria e assunto"
        subtitle="Filtre o banco, monte sua sessão e responda com comentário na hora ou só no final."
      >
        <QuestionFilters
          value={filters}
          onChange={setFilters}
          subjects={subjects}
          topics={topics}
        />

        <div className="grid c2" style={{ marginTop: 12 }}>
          <Field label="Buscar no enunciado">
            <Input
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder="Ex.: crase, licitação, Regimento Interno..."
            />
          </Field>
          <Field label="Feedback">
            <Select value={feedback} onChange={(event) => setFeedback(event.target.value as 'imediato' | 'final')}>
              <option value="imediato">Imediato + comentário</option>
              <option value="final">Só no final (estilo prova)</option>
            </Select>
          </Field>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          {available !== undefined && <Badge tone="pri">{available} questões disponíveis</Badge>}
          <Button
            variant="primary"
            loading={startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            ▶ Começar sessão
          </Button>
          <Button loading={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
            🔁 Revisão espaçada do dia
          </Button>
        </div>
      </Card>

      <Card title="⚡ Atalhos">
        <div className="row gap-8">
          {['LP', 'PL', 'DA', 'RL', 'DC'].map((code) => {
            const subject = subjects.find((item) => item.code === code);
            if (!subject) return null;
            return (
              <Button
                key={code}
                size="sm"
                onClick={() => setFilters({ ...filters, subject: code, topic: '', mode: 'todas' })}
              >
                {subject.name}
              </Button>
            );
          })}
        </div>
      </Card>

      {available === 0 && (
        <Card>
          <EmptyState
            icon="🔍"
            title="Nada encontrado com esses filtros"
            description="Tente outra matéria, outro assunto ou mude o modo de estudo."
          />
        </Card>
      )}

      {startMutation.isPending && <Spinner label="Montando sua sessão..." />}
    </div>
  );
}
