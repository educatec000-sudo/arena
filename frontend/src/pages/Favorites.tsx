import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Pagination, Spinner } from '@/components/ui';
import QuestionCard from '@/components/question/QuestionCard';
import StudySessionRunner from '@/components/question/StudySessionRunner';
import { useToast } from '@/contexts/ToastContext';
import { favoritesService } from '@/services/favorites.service';
import { errorNotebookService } from '@/services/error-notebook.service';
import type { Question } from '@/types';

/** Favoritas — atalho para revisar as questões marcadas com ⭐. */
export default function Favorites() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [session, setSession] = useState<Question[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['favorites', page],
    queryFn: () => favoritesService.list({ page, limit: 10 }),
  });

  const toggleMutation = useMutation({
    mutationFn: (questionId: string) => favoritesService.toggle(questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Removida das favoritas.');
    },
  });

  const addErrorMutation = useMutation({
    mutationFn: (questionId: string) => errorNotebookService.add(questionId),
    onSuccess: () => toast('Adicionada ao caderno de erros 📕'),
  });

  if (session) {
    return (
      <div className="wrap">
        <StudySessionRunner questions={session} title="Favoritas" onExit={() => setSession(null)} />
      </div>
    );
  }

  const items = data?.data ?? [];

  return (
    <div className="wrap">
      <Card
        title="⭐ Questões favoritas"
        subtitle="Guarde aqui as questões que você quer revisar com mais calma."
      >
        <div className="row gap-8">
          <Button variant="primary" disabled={!items.length} onClick={() => setSession(items)}>
            ▶ Treinar estas questões
          </Button>
          <span className="muted small">{data?.meta.total ?? 0} favoritas</span>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando favoritas..." />
      ) : items.length ? (
        <>
          {items.map((question) => (
            <div key={question.id}>
              <QuestionCard
                question={{ ...question, isFavorite: true }}
                revealed={false}
                onToggleFavorite={() => toggleMutation.mutate(question.id)}
                onToggleErrorBook={() => addErrorMutation.mutate(question.id)}
                isFavorite
              />
            </div>
          ))}
          <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} />
        </>
      ) : (
        <Card>
          <EmptyState
            icon="⭐"
            title="Nenhuma favorita ainda"
            description="Toque em “☆ Favoritar” durante o treino para guardar uma questão aqui."
          />
        </Card>
      )}
    </div>
  );
}
