import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Field, Input, Pagination, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { questionsService, subjectsService, topicsService } from '@/services/questions.service';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { DIFFICULTY_LABEL, ORIGIN_LABEL } from '@/utils/format';
import type { Difficulty, Question } from '@/types';

const EMPTY_OPTIONS = [
  { label: 'A', text: '', isCorrect: true },
  { label: 'B', text: '', isCorrect: false },
  { label: 'C', text: '', isCorrect: false },
  { label: 'D', text: '', isCorrect: false },
  { label: 'E', text: '', isCorrect: false },
];

/** Gestão de questões (ADMIN e EDITOR). */
export default function AdminQuestions() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [origin, setOrigin] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    subjectId: '',
    topicId: '',
    prompt: '',
    difficulty: 'MEDIA' as Difficulty,
    year: '',
    source: '',
    legalBasis: '',
    explanation: '',
    analysis: '',
    tags: '',
    options: EMPTY_OPTIONS,
  });

  const debounced = useDebouncedValue(search, 400);

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const { data: topics = [] } = useQuery({
    queryKey: ['topics', form.subjectId],
    queryFn: () => topicsService.list(form.subjectId || undefined),
    enabled: Boolean(form.subjectId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-questions', page, debounced, subjectCode, difficulty, origin],
    queryFn: () =>
      questionsService.list({
        page,
        limit: 15,
        search: debounced || undefined,
        subject: subjectCode || undefined,
        difficulty: (difficulty || undefined) as 'facil' | 'media' | 'dificil' | undefined,
        origin: (origin || undefined) as 'CURATED' | 'GENERATED' | 'IMPORTED' | 'AI' | undefined,
        includeSolution: true,
      }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-stats'] });
    queryClient.invalidateQueries({ queryKey: ['subjects-stats'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      questionsService.create({
        subjectId: form.subjectId,
        topicId: form.topicId || null,
        prompt: form.prompt,
        difficulty: form.difficulty,
        year: form.year ? Number(form.year) : null,
        source: form.source || null,
        legalBasis: form.legalBasis || null,
        explanation: form.explanation || null,
        analysis: form.analysis || null,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        options: form.options
          .filter((option) => option.text.trim())
          .map((option) => ({
            label: option.label,
            text: option.text.trim(),
            isCorrect: option.isCorrect,
          })),
      }),
    onSuccess: () => {
      setCreating(false);
      setForm({
        ...form,
        prompt: '',
        explanation: '',
        analysis: '',
        legalBasis: '',
        tags: '',
        options: EMPTY_OPTIONS,
      });
      invalidate();
      toast('Questão cadastrada.', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => questionsService.remove(id),
    onSuccess: () => {
      invalidate();
      toast('Questão arquivada.');
    },
  });

  const items = data?.data ?? [];

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">🗃️ Questões</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Nova questão
        </Button>
      </div>

      <Card>
        <div className="grid c4">
          <Field label="Buscar">
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="enunciado..." />
          </Field>
          <Field label="Matéria">
            <Select value={subjectCode} onChange={(e) => { setSubjectCode(e.target.value); setPage(1); }}>
              <option value="">Todas</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.code}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dificuldade">
            <Select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}>
              <option value="">Todas</option>
              <option value="facil">Fácil</option>
              <option value="media">Média</option>
              <option value="dificil">Difícil</option>
            </Select>
          </Field>
          <Field label="Origem">
            <Select value={origin} onChange={(e) => { setOrigin(e.target.value); setPage(1); }}>
              <option value="">Todas</option>
              <option value="CURATED">Banco curado</option>
              <option value="IMPORTED">Prova antiga</option>
              <option value="AI">Gerada por IA</option>
            </Select>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando questões..." />
      ) : items.length ? (
        <Card>
          <Table head={['Questão', 'Matéria', 'Dificuldade', 'Origem', 'Gabarito', '']}>
            {items.map((question) => (
              <tr key={question.id}>
                <td>
                  <b className="small">
                    {question.prompt.length > 110 ? `${question.prompt.slice(0, 110)}…` : question.prompt}
                  </b>
                  {expanded === question.id && (
                    <div className="question-detail">
                      <p className="small">{question.prompt}</p>
                      <ol type="A">
                        {question.options.map((option) => (
                          <li
                            key={option.id}
                            style={{ color: option.isCorrect ? 'var(--ok)' : undefined }}
                            className="tiny"
                          >
                            {option.text}
                          </li>
                        ))}
                      </ol>
                      {question.explanation && <p className="tiny muted">{question.explanation}</p>}
                    </div>
                  )}
                </td>
                <td className="tiny">{question.subject?.name}</td>
                <td>
                  <Badge
                    tone={
                      question.difficulty === 'DIFICIL'
                        ? 'err'
                        : question.difficulty === 'MEDIA'
                          ? 'warn'
                          : 'ok'
                    }
                  >
                    {DIFFICULTY_LABEL[question.difficulty]}
                  </Badge>
                </td>
                <td className="tiny muted">{ORIGIN_LABEL[question.origin]}</td>
                <td>
                  <Badge tone="pri">{question.correctLabel ?? '—'}</Badge>
                </td>
                <td>
                  <div className="row gap-6">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(expanded === question.id ? null : question.id)}
                    >
                      {expanded === question.id ? 'Fechar' : 'Ver'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('Arquivar esta questão? Ela sai dos treinos novos.')) {
                          removeMutation.mutate(question.id);
                        }
                      }}
                    >
                      Arquivar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} />
        </Card>
      ) : (
        <Card>
          <EmptyState icon="🗃️" title="Nenhuma questão encontrada" description="Ajuste os filtros ou cadastre uma nova." />
        </Card>
      )}

      {creating && (
        <Card title="Nova questão">
          <div className="grid c3">
            <Field label="Matéria">
              <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, topicId: '' })}>
                <option value="">Escolha...</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assunto">
              <Select value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
                <option value="">(sem assunto específico)</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dificuldade">
              <Select
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}
              >
                <option value="FACIL">Fácil</option>
                <option value="MEDIA">Média</option>
                <option value="DIFICIL">Difícil</option>
              </Select>
            </Field>
          </div>

          <Field label="Enunciado">
            <textarea
              className="input textarea"
              rows={5}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
          </Field>

          <Field label="Alternativas" hint="Marque exatamente uma como correta.">
            <div className="option-editor">
              {form.options.map((option, index) => (
                <div key={option.label} className="option-row">
                  <button
                    type="button"
                    className={`btn sm ${option.isCorrect ? 'ok' : 'ghost'}`}
                    onClick={() =>
                      setForm({
                        ...form,
                        options: form.options.map((item) => ({
                          ...item,
                          isCorrect: item.label === option.label,
                        })),
                      })
                    }
                  >
                    {option.label}
                    {option.isCorrect ? ' ✓' : ''}
                  </button>
                  <Input
                    value={option.text}
                    placeholder={`Alternativa ${option.label}`}
                    onChange={(e) => {
                      const next = [...form.options];
                      next[index] = { ...next[index], text: e.target.value };
                      setForm({ ...form, options: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </Field>

          <div className="grid c2">
            <Field label="Comentário / explicação">
              <textarea
                className="input textarea"
                rows={4}
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
              />
            </Field>
            <Field label="Análise por alternativa (opcional)">
              <textarea
                className="input textarea"
                rows={4}
                value={form.analysis}
                onChange={(e) => setForm({ ...form, analysis: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid c3">
            <Field label="Base legal">
              <Input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} />
            </Field>
            <Field label="Ano">
              <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </Field>
            <Field label="Banca / fonte">
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
          </div>

          <Field label="Tags" hint="Separadas por vírgula.">
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </Field>

          <div className="row gap-8">
            <Button
              variant="primary"
              loading={createMutation.isPending}
              disabled={!form.subjectId || form.prompt.length < 10}
              onClick={() => createMutation.mutate()}
            >
              Salvar questão
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export type { Question };
