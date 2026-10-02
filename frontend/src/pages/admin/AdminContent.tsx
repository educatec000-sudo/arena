import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Input, Spinner, Table } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { subjectsService, topicsService } from '@/services/questions.service';
import { adminService } from '@/services/admin.service';
import { ProgressList } from '@/components/charts';
import { nf } from '@/utils/format';

/** Gestão de matérias e assuntos + estatísticas de conteúdo. */
export default function AdminContent() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', groupName: '', color: '#4f7dfb' });
  const [topicForm, setTopicForm] = useState({ subjectId: '', name: '' });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
  });

  const { data: contentStats = [] } = useQuery({
    queryKey: ['admin-content-stats'],
    queryFn: () => adminService.contentStats(),
  });

  const { data: hardest = [] } = useQuery({
    queryKey: ['admin-hardest'],
    queryFn: () => adminService.hardestQuestions(15),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['subjects'] });
    queryClient.invalidateQueries({ queryKey: ['subjects-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-content-stats'] });
    queryClient.invalidateQueries({ queryKey: ['topics'] });
  };

  const subjectMutation = useMutation({
    mutationFn: () => subjectsService.create(subjectForm),
    onSuccess: () => {
      setSubjectForm({ code: '', name: '', groupName: '', color: '#4f7dfb' });
      invalidate();
      toast('Matéria criada.');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const topicMutation = useMutation({
    mutationFn: () => topicsService.create({ subjectId: topicForm.subjectId, name: topicForm.name }),
    onSuccess: () => {
      setTopicForm({ subjectId: '', name: '' });
      invalidate();
      toast('Assunto criado.');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  if (isLoading) return <Spinner label="Carregando conteúdo..." />;

  return (
    <div className="wrap">
      <h1 className="page-title">🗂️ Conteúdo</h1>

      <div className="grid c2">
        <Card title="➕ Nova matéria">
          <div className="grid c2">
            <Field label="Sigla">
              <Input
                value={subjectForm.code}
                onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                placeholder="LP"
                maxLength={10}
              />
            </Field>
            <Field label="Nome">
              <Input
                value={subjectForm.name}
                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                placeholder="Língua Portuguesa"
              />
            </Field>
          </div>
          <div className="grid c2">
            <Field label="Grupo">
              <Input
                value={subjectForm.groupName}
                onChange={(e) => setSubjectForm({ ...subjectForm, groupName: e.target.value })}
                placeholder="Conhecimentos Básicos"
              />
            </Field>
            <Field label="Cor">
              <Input
                type="color"
                value={subjectForm.color}
                onChange={(e) => setSubjectForm({ ...subjectForm, color: e.target.value })}
              />
            </Field>
          </div>
          <Button
            variant="primary"
            loading={subjectMutation.isPending}
            disabled={!subjectForm.code || subjectForm.name.length < 2}
            onClick={() => subjectMutation.mutate()}
          >
            Criar matéria
          </Button>
        </Card>

        <Card title="➕ Novo assunto">
          <Field label="Matéria">
            <select
              className="input select"
              value={topicForm.subjectId}
              onChange={(e) => setTopicForm({ ...topicForm, subjectId: e.target.value })}
            >
              <option value="">Escolha a matéria</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome do assunto">
            <Input
              value={topicForm.name}
              onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
              placeholder="Ex.: Crase"
            />
          </Field>
          <Button
            variant="primary"
            loading={topicMutation.isPending}
            disabled={!topicForm.subjectId || topicForm.name.length < 2}
            onClick={() => topicMutation.mutate()}
          >
            Criar assunto
          </Button>
        </Card>
      </div>

      <Card title="📚 Matérias cadastradas">
        <Table head={['Sigla', 'Nome', 'Grupo', 'Cor']}>
          {subjects.map((subject) => (
            <tr key={subject.id}>
              <td>
                <Badge tone="pri">{subject.code}</Badge>
              </td>
              <td>{subject.name}</td>
              <td className="tiny muted">{subject.groupName || '—'}</td>
              <td>
                <span
                  className="color-dot"
                  style={{ background: subject.color }}
                  title={subject.color}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="📊 Uso do conteúdo" subtitle="Respostas e aproveitamento por matéria.">
        <ProgressList
          items={contentStats.map((item) => ({
            label: `${item.code} · ${item.name}`,
            value: item.answers,
            caption: `${item.answers} respostas · ${nf(item.accuracy, 0)}% de acerto · ${item.questions} no banco`,
            tone: item.accuracy >= 60 ? 'ok' : 'gold',
          }))}
        />
      </Card>

      <Card title="🚨 Questões que mais erram" subtitle="Use para revisar enunciados ou reforçar a teoria.">
        {hardest.length ? (
          <Table head={['Matéria', 'Questão', 'Tentativas', 'Erros', 'Acerto']}>
            {hardest.map((item) => (
              <tr key={item.questionId}>
                <td className="tiny">{item.subject.code}</td>
                <td className="small">{item.prompt}</td>
                <td>{item.attempts}</td>
                <td style={{ color: 'var(--err)' }}>{item.wrongCount}</td>
                <td>{nf(item.accuracy, 0)}%</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="muted small">Ainda não há dados de erros suficientes.</p>
        )}
      </Card>
    </div>
  );
}
