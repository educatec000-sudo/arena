/**
 * Fino repositório de questões.
 *
 * A leitura/escrita pesada fica em `questions.service.js`; este arquivo existe
 * apenas para expor helpers compartilhados (como o `toDto`) para outros
 * módulos sem criar import circular entre domínios.
 */

const OPTION_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export function toDto(question, { includeSolution = false } = {}) {
  const options = [...(question.options || [])]
    .sort((a, b) => (OPTION_ORDER[a.label] ?? 99) - (OPTION_ORDER[b.label] ?? 99))
    .map((o) => ({
      id: o.id,
      label: o.label,
      text: o.text,
      ...(includeSolution ? { isCorrect: o.isCorrect } : {}),
    }));

  return {
    id: question.id,
    externalId: question.externalId,
    subjectId: question.subjectId,
    topicId: question.topicId,
    subject: question.subject
      ? {
          id: question.subject.id,
          code: question.subject.code,
          name: question.subject.name,
          color: question.subject.color,
        }
      : undefined,
    topic: question.topic ? { id: question.topic.id, name: question.topic.name } : undefined,
    prompt: question.prompt,
    difficulty: question.difficulty,
    year: question.year,
    source: question.source,
    legalBasis: question.legalBasis,
    origin: question.origin,
    status: question.status,
    tags: (question.tags || []).map((t) => t.tag?.name).filter(Boolean),
    options,
    ...(includeSolution
      ? {
          correctLabel: options.find((o) => o.isCorrect)?.label || null,
          explanation: question.explanation,
          analysis: question.analysis,
        }
      : {}),
  };
}

/** Objeto exportado para deixar a intenção explícita nos imports. */
export const questionsRepository = { toDto };

export default questionsRepository;
