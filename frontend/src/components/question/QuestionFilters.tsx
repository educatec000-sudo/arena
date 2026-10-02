import { Field, Select } from '@/components/ui';
import type { Subject, Topic } from '@/types';

export type QuestionMode = 'todas' | 'novas' | 'erradas' | 'pendentes' | 'favoritas';

export interface FilterState {
  subject: string;
  topic: string;
  difficulty: string;
  mode: QuestionMode;
  /** '' = todas | 'AI' = só as geradas por IA | 'NOT_AI' = só as do banco */
  origin: '' | 'AI' | 'NOT_AI';
  search: string;
  limit: number;
}

export const DEFAULT_FILTERS: FilterState = {
  subject: '',
  topic: '',
  difficulty: '',
  mode: 'todas',
  origin: '',
  search: '',
  limit: 20,
};

/** Filtros de treino: matéria, assunto, dificuldade e modo de estudo. */
export default function QuestionFilters({
  value,
  onChange,
  subjects,
  topics,
  showModes = true,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  subjects: Subject[];
  topics: Topic[];
  showModes?: boolean;
}) {
  const update = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="grid c4">
      <Field label="Matéria">
        <Select
          value={value.subject}
          onChange={(e) => update({ subject: e.target.value, topic: '' })}
        >
          <option value="">Todas as matérias</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.code}>
              {subject.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Assunto">
        <Select
          value={value.topic}
          onChange={(e) => update({ topic: e.target.value })}
          disabled={!topics.length}
        >
          <option value="">{topics.length ? 'Todos os assuntos' : 'Escolha uma matéria'}</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Dificuldade">
        <Select value={value.difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
          <option value="">Todas</option>
          <option value="facil">Fácil</option>
          <option value="media">Média</option>
          <option value="dificil">Difícil</option>
        </Select>
      </Field>

      <Field label="Origem">
        <Select value={value.origin} onChange={(e) => update({ origin: e.target.value as FilterState['origin'] })}>
          <option value="">Todas as origens</option>
          <option value="NOT_AI">Só do banco (sem IA)</option>
          <option value="AI">Geradas por IA 🤖</option>
        </Select>
      </Field>

      {showModes ? (
        <Field label="Modo de estudo">
          <Select value={value.mode} onChange={(e) => update({ mode: e.target.value as FilterState['mode'] })}>
            <option value="todas">Todas as questões</option>
            <option value="novas">Só as que ainda não vi</option>
            <option value="erradas">Caderno de erros</option>
            <option value="pendentes">Revisão do dia (espaçada)</option>
            <option value="favoritas">Favoritas ⭐</option>
          </Select>
        </Field>
      ) : (
        <Field label="Quantidade">
          <Select
            value={String(value.limit)}
            onChange={(e) => update({ limit: Number(e.target.value) })}
          >
            <option value="10">10 questões</option>
            <option value="20">20 questões</option>
            <option value="30">30 questões</option>
            <option value="50">50 questões</option>
          </Select>
        </Field>
      )}
    </div>
  );
}

