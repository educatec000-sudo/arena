import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Field, Modal, Pagination, Select, Spinner, Textarea } from '@/components/ui';
import QuestionCard from '@/components/question/QuestionCard';
import StudySessionRunner from '@/components/question/StudySessionRunner';
import { useToast } from '@/contexts/ToastContext';
import { errorNotebookService } from '@/services/error-notebook.service';
import { subjectsService } from '@/services/questions.service';
import { aiService } from '@/services/ai.service';
import { formatDate } from '@/utils/format';
import { AiAnswer } from '@/components/question/StudySessionRunner';
import type { ErrorNotebookItem } from '@/types';

/**
 * Caderno de erros.
 * Cada erro pode ser anotado, resolvido, refeito e explicado pela IA.
 */
export default function ErrorNotebook() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [subjectId, setSubjectId] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [noteFor, setNoteFor] = useState<ErrorNotebookItem | null>(null);
  const [noteText, setNoteText] = useState('');
  const [explaining, setExplaining] = useState<{ id: string; text: string } | null>(null);
  const [session, setSession] = useState<ErrorNotebookItem[] | null>(null);

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['error-notebook-stats'],
    queryFn: () => errorNotebookService.stats(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['error-notebook', page, subjectId, onlyPending],
    queryFn: () =>
      errorNotebookService.list({ page, limit: 10, subjectId: subjectId || undefined, onlyPending }),
  });

  const items = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['error-notebook'] });
    queryClient.invalidateQueries({ queryKey: ['error-notebook-stats'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const removeMutation = useMutation({
    mutationFn: (questionId: string) => errorNotebookService.remove(questionId),
    onSuccess: () => {
      invalidate();
      toast('Removida do caderno de erros.');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (questionId: string) => errorNotebookService.resolve(questionId, true),
    onSuccess: () => {
      invalidate();
      toast('Erro marcado como resolvido ✅');
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ questionId, note }: { questionId: string; note: string }) =>
      errorNotebookService.updateNote(questionId, note),
    onSuccess: () => {
      setNoteFor(null);
      invalidate();
      toast('Anotação salva 📝');
    },
  });

  const generateSimulado = useMutation({
    mutationFn: () =>
      errorNotebookService.generateSimulado({ count: 20, durationMinutes: 120, subjectIds: subjectId ? [subjectId] : undefined }),
    onSuccess: (simulado) => {
      toast(`Simulado criado com ${simulado.questionCount} questões!`);
      window.location.href = `/app/simulados/${simulado.id}`;
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const bySubject = useMemo(() => stats?.bySubject ?? [], [stats]);

  if (session) {
    return (
      <div className="wrap">
        <StudySessionRunner
          questions={session}
          title="Refazendo meus erros"
          onExit={() => setSession(null)}
        />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Card
        title="📕 Caderno de erros"
        subtitle="Toda questão que você erra vem para cá automaticamente. Revise, anote e refaça."
      >
        <div className="grid c3">
          <div className="kpi">
            <b style={{ color: 'var(--err)' }}>{stats?.pending ?? 0}</b>
            <span>erros pendentes</span>
          </div>
          <div className="kpi">
            <b style={{ color: 'var(--ok)' }}>{stats?.resolved ?? 0}</b>
            <span>resolvidos</span>
          </div>
          <div className="kpi">
            <b>{items.length}</b>
            <span>nesta página</span>
          </div>
        </div>

        <div className="row gap-8" style={{ marginTop: 14 }}>
          <Button
            variant="primary"
            loading={generateSimulado.isPending}
            disabled={!stats?.pending}
            onClick={() => generateSimulado.mutate()}
          >
            🎯 Gerar simulado com meus erros
          </Button>
          <Button disabled={!items.length} onClick={() => setSession(items)}>
            🔁 Refazer estas questões
          </Button>
        </div>

        {bySubject.length > 0 && (
          <div className="row gap-6" style={{ marginTop: 12 }}>
            {bySubject.map((entry) =>
              entry.subject ? (
                <Badge key={entry.subject.id} tone="err">
                  {entry.subject.code}: {entry.total}
                </Badge>
              ) : null,
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="grid c2">
          <Field label="Filtrar por matéria">
            <Select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setPage(1); }}>
              <option value="">Todas as matérias</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select
              value={onlyPending ? 'pending' : 'all'}
              onChange={(event) => setOnlyPending(event.target.value === 'pending')}
            >
              <option value="pending">Só pendentes</option>
              <option value="all">Incluir resolvidos</option>
            </Select>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando seu caderno..." />
      ) : items.length ? (
        <>
          {items.map((item) => (
            <div key={item.id} className="notebook-entry">
              <div className="notebook-meta">
                <Badge tone="err">{item.notebook.errorCount} erro(s)</Badge>
                {item.notebook.reviewCount > 0 && <Badge>{item.notebook.reviewCount} revisão(ões)</Badge>}
                {item.notebook.lastErrorAt && (
                  <span className="tiny muted">último erro em {formatDate(item.notebook.lastErrorAt)}</span>
                )}
              </div>

              <QuestionCard
                question={item}
                revealed
                onToggleFavorite={undefined}
              />

              {item.notebook.note && (
                <div className="note-box">
                  <b className="tiny">📝 Sua anotação</b>
                  <p className="small">{item.notebook.note}</p>
                </div>
              )}

              <div className="row gap-8" style={{ marginTop: 10 }}>
                <Button
                  size="sm"
                  onClick={() => {
                    setNoteFor(item);
                    setNoteText(item.notebook.note || '');
                  }}
                >
                  📝 {item.notebook.note ? 'Editar anotação' : 'Anotar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setExplaining({ id: item.id, text: '' });
                    try {
                      const result = await aiService.explainError(item.id);
                      setExplaining({ id: item.id, text: result.content });
                    } catch (err) {
                      setExplaining(null);
                      toast(err instanceof Error ? err.message : 'Não foi possível consultar a IA.', 'error');
                    }
                  }}
                >
                  🤖 Explicar meu erro
                </Button>
                <Button
                  size="sm"
                  variant="ok"
                  onClick={() => resolveMutation.mutate(item.id)}
                  loading={resolveMutation.isPending}
                >
                  ✅ Marcar como resolvido
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMutation.mutate(item.id)}
                  loading={removeMutation.isPending}
                >
                  🗑 Remover
                </Button>
              </div>
            </div>
          ))}

          <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} />
        </>
      ) : (
        <Card>
          <EmptyState
            icon="🎉"
            title="Seu caderno está limpo!"
            description={
              onlyPending
                ? 'Nenhum erro pendente. Quando você errar uma questão ela aparece aqui automaticamente.'
                : 'Você ainda não errou nenhuma questão. Continue treinando!'
            }
          />
        </Card>
      )}

      <Modal
        open={Boolean(noteFor)}
        title="📝 Anotação da questão"
        onClose={() => setNoteFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={noteMutation.isPending}
              onClick={() => noteFor && noteMutation.mutate({ questionId: noteFor.id, note: noteText })}
            >
              Salvar
            </Button>
          </>
        }
      >
        <Textarea
          rows={6}
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="Escreva aqui o que você precisa lembrar sobre esta questão..."
        />
      </Modal>

      <Modal
        open={Boolean(explaining)}
        title="🤖 Explicação do seu erro"
        onClose={() => setExplaining(null)}
        size="lg"
      >
        {explaining?.text ? (
          <AiAnswer text={explaining.text} />
        ) : (
          <p className="muted small">O professor está analisando o seu erro...</p>
        )}
      </Modal>
    </div>
  );
}
