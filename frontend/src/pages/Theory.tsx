import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Field, Input, ProgressBar, Spinner } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { subjectsService, topicsService } from '@/services/questions.service';
import { aiService } from '@/services/ai.service';
import { AiAnswer } from '@/components/question/StudySessionRunner';
import type { TheoryItemView } from '@/types';

/** Teoria de bolso migrada do app legado (window.__TEORIA__). */
export default function Theory() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [subjectCode, setSubjectCode] = useState('');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ title: string; text: string } | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.code === subjectCode),
    [subjects, subjectCode],
  );

  const { data: items = [], isLoading } = useQuery<TheoryItemView[]>({
    queryKey: ['theory', selectedSubject?.id],
    queryFn: () => topicsService.theory(selectedSubject?.id),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => topicsService.toggleTheory(id, done),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['theory'] }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(term) || item.content.toLowerCase().includes(term),
    );
  }, [items, search]);

  const readCount = items.filter((item) => item.done).length;
  const percent = items.length ? (readCount / items.length) * 100 : 0;

  const summarize = async (item: TheoryItemView) => {
    setSummarizing(true);
    setSummary({ title: item.title, text: '' });
    try {
      const result = await aiService.summarize({ content: item.content, style: 'resumo' });
      setSummary({ title: item.title, text: result.content });
    } catch (err) {
      setSummary(null);
      toast(err instanceof Error ? err.message : 'Configure uma chave de IA para usar o resumo.', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="wrap">
      <Card
        title="📚 Teoria de bolso"
        subtitle="Resumos rápidos das matérias, com marcação de “visto” para você controlar a cobertura do edital."
      >
        <div className="grid c2">
          <Field label="Matéria">
            <select
              className="input select"
              value={subjectCode}
              onChange={(event) => setSubjectCode(event.target.value)}
            >
              <option value="">Todas as matérias</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.code}>
                  {subject.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buscar">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: crase, improbidade, orçamento..."
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">
              {readCount} de {items.length} conteúdos marcados como vistos
            </span>
            <span className="small muted">{nf0(percent)}%</span>
          </div>
          <ProgressBar value={percent} tone="ok" />
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando teoria..." />
      ) : filtered.length ? (
        filtered.map((item) => (
          <Card key={item.id} className={item.done ? 'theory-card done' : 'theory-card'}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                <div className="row gap-6" style={{ marginTop: 6 }}>
                  <Badge>{item.subject.name}</Badge>
                  {item.done && <Badge tone="ok">visto ✓</Badge>}
                </div>
              </div>
              <div className="row gap-6">
                <Button size="sm" variant="ghost" onClick={() => summarize(item)} loading={summarizing}>
                  🤖 Resumir com IA
                </Button>
                <Button
                  size="sm"
                  variant={item.done ? 'ok' : 'default'}
                  onClick={() => toggleMutation.mutate({ id: item.id, done: !item.done })}
                >
                  {item.done ? '✓ Visto' : 'Marcar como visto'}
                </Button>
              </div>
            </div>

            <div className="theory-content">{item.content}</div>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState icon="📚" title="Nada encontrado" description="Ajuste a busca ou escolha outra matéria." />
        </Card>
      )}

      {summary && (
        <Card title={`🤖 Resumo: ${summary.title}`}>
          {summary.text ? <AiAnswer text={summary.text} /> : <p className="muted small">Gerando resumo...</p>}
          <Button size="sm" variant="ghost" onClick={() => setSummary(null)} style={{ marginTop: 10 }}>
            Fechar resumo
          </Button>
        </Card>
      )}
    </div>
  );
}

const nf0 = (value: number) => `${Math.round(value)}`;
