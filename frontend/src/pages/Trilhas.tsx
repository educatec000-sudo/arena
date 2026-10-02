import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ProgressBar, Spinner } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { studyTracksService } from '@/services/study-tracks.service';
import type { StudyTrack } from '@/types';

const KIND_LABEL: Record<string, string> = {
  SUBJECT: 'Matéria',
  TOPIC: 'Assunto',
  THEORY: 'Teoria',
  SIMULADO: 'Simulado',
  REVIEW: 'Revisão',
};

/** Trilhas de estudo: roteiro do edital com progresso salvo no servidor. */
export default function Trilhas() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['study-tracks'],
    queryFn: () => studyTracksService.list(),
  });

  const toggle = useMutation({
    mutationFn: ({ slug, itemId, done }: { slug: string; itemId: string; done: boolean }) =>
      studyTracksService.setDone(slug, itemId, done),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['study-tracks'] });
      toast(variables.done ? 'Etapa concluída! 🎉' : 'Etapa reaberta.');
    },
  });

  const reset = useMutation({
    mutationFn: (slug: string) => studyTracksService.reset(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-tracks'] });
      toast('Progresso da trilha reiniciado.');
    },
  });

  if (isLoading) return <Spinner label="Carregando trilhas..." />;

  const tracks = (data ?? []) as StudyTrack[];

  return (
    <div className="wrap">
      <Card
        title="🧭 Trilhas de estudo"
        subtitle="Um roteiro pronto: siga a ordem sugerida, marque cada etapa e nunca mais se pergunte “por onde eu começo?”."
      >
        {error ? (
          <p className="muted small">Não foi possível carregar as trilhas.</p>
        ) : tracks.length === 0 ? (
          <EmptyState
            icon="🧭"
            title="Nenhuma trilha publicada"
            description="Assim que a equipe publicar uma trilha ela aparece aqui."
          />
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            {tracks.length} trilha(s) disponível(is). O progresso fica salvo na sua conta, em qualquer
            aparelho.
          </p>
        )}
      </Card>

      {tracks.map((track) => (
        <Card
          key={track.id}
          title={track.title}
          subtitle={track.description ?? undefined}
          action={
            <div className="row gap-6">
              <Badge tone={track.progress.percent === 100 ? 'ok' : 'pri'}>
                {track.progress.completed}/{track.progress.total} etapas
              </Badge>
              <Button
                size="sm"
                onClick={() => reset.mutate(track.slug)}
                loading={reset.isPending && reset.variables === track.slug}
              >
                Reiniciar
              </Button>
            </div>
          }
        >
          <ProgressBar value={track.progress.percent} tone={track.progress.percent === 100 ? 'ok' : 'gold'} />
          <p className="muted tiny" style={{ margin: '6px 0 12px' }}>
            {nf0(track.progress.percent)}% concluída · meta de {track.progress.goalQuestions} questões
          </p>

          <ol className="track-list">
            {track.items.map((item) => (
              <li key={item.id} className={item.done ? 'done' : undefined}>
                <label className="row gap-8" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(item.done)}
                    disabled={toggle.isPending}
                    onChange={(event) =>
                      toggle.mutate({
                        slug: track.slug,
                        itemId: item.id,
                        done: event.target.checked,
                      })
                    }
                  />
                  <div>
                    <b style={{ textDecoration: item.done ? 'line-through' : undefined }}>
                      {item.title}
                    </b>
                    <div className="row gap-6 wrap" style={{ marginTop: 4 }}>
                      <Badge>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                      {item.subject && (
                        <Badge tone="pri">{item.subject.name}</Badge>
                      )}
                      {item.goalQuestions > 0 && (
                        <span className="muted tiny">meta: {item.goalQuestions} questões</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="muted tiny" style={{ margin: '4px 0 0' }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </label>

                {(item.subject || item.goalQuestions > 0) && (
                  <Link
                    className="muted small"
                    to={`/app/treinar?materia=${item.subject?.code ?? ''}`}
                  >
                    Treinar →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

const nf0 = (value: number) => `${Math.round(value)}`;
