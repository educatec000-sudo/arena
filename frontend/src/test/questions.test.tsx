import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { QuestionCard } from '@/components/question/QuestionCard';
import type { Question } from '@/types';

const question: Question = {
  id: 'q1',
  externalId: 'legado-1',
  correctLabel: 'B',
  status: 'PUBLISHED',
  prompt: 'Segundo a CF/88, o prazo do mandato do Presidente da República é de:',
  subjectId: 's1',
  topicId: null,
  difficulty: 'FACIL',
  origin: 'CURATED',
  year: 2024,
  source: 'CESPE',
  legalBasis: 'Art. 82 da CF/88',
  analysis: null,
  tags: ['direito constitucional'],
  options: [
    { id: 'o1', label: 'A', text: '3 anos', isCorrect: false },
    { id: 'o2', label: 'B', text: '4 anos', isCorrect: true },
    { id: 'o3', label: 'C', text: '5 anos', isCorrect: false },
    { id: 'o4', label: 'D', text: '6 anos', isCorrect: false },
  ],
  subject: {
    id: 's1',
    code: 'DC',
    name: 'Direito Constitucional',
    groupName: 'Conhecimentos Básicos',
    color: '#4f7dfb',
    order: 1,
    isActive: true,
  },
};

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuestionCard', () => {
  it('renderiza o enunciado e as alternativas', () => {
    renderWithProviders(
      <QuestionCard
        question={question}
        index={0}
        total={10}
        onAnswer={() => {}}
      />,
    );

    expect(screen.getByText(/prazo do mandato/i)).toBeInTheDocument();
    expect(screen.getByText('4 anos')).toBeInTheDocument();
  });

  it('não revela o gabarito antes da resposta', () => {
    renderWithProviders(
      <QuestionCard question={question} index={0} total={10} onAnswer={() => {}} />,
    );
    // Nenhuma alternativa recebe destaque de correta/errada antes de responder
    // e o bloco de gabarito não aparece.
    expect(document.querySelectorAll('.alt.right, .alt.wrong').length).toBe(0);
    expect(document.querySelector('.fb')).toBeNull();
  });

  it('marca a alternativa correta e a errada após responder', () => {
    renderWithProviders(
      <QuestionCard
        question={question}
        index={0}
        total={10}
        chosenLabel="A"
        revealed
        onAnswer={() => {}}
      />,
    );

    expect(document.querySelectorAll('.alt.right, .alt.wrong').length).toBeGreaterThan(0);
    expect(document.querySelector('.fb')).toBeTruthy();
  });
});
