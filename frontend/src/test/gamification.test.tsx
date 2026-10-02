import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { AchievementsGrid } from '@/components/gamification/AchievementsGrid';
import { GamificationCard } from '@/components/gamification/GamificationCard';
import Ranking from '@/pages/Ranking';
import Trilhas from '@/pages/Trilhas';
import { gamificationService } from '@/services/gamification.service';
import { studyTracksService } from '@/services/study-tracks.service';
import type { Achievement, Gamification } from '@/types';

vi.mock('@/services/gamification.service', () => ({
  gamificationService: { me: vi.fn(), ranking: vi.fn() },
}));
vi.mock('@/services/study-tracks.service', () => ({
  studyTracksService: { list: vi.fn(), setDone: vi.fn(), reset: vi.fn() },
}));

const gamification: Gamification = {
  xp: 128,
  level: 2,
  nextLevel: { into: 8, need: 240, percent: 3.3 },
  counters: {
    answers: 42,
    correct: 30,
    streak: 5,
    simulados: 2,
    favorites: 3,
    errorBook: 1,
    minutes: 96,
    accuracy: 71.4,
  },
  newlyUnlocked: [{ code: 'sharp', name: 'Afine a pontaria', icon: '🎯' }],
  achievements: [
    {
      code: 'first-steps',
      name: 'Primeiros passos',
      description: 'Responda a 1 questão.',
      icon: '🚀',
      criteria: 'answers',
      target: 1,
      xp: 10,
      progress: 100,
      unlocked: true,
      unlockedAt: '2026-09-20T12:00:00.000Z',
    },
    {
      code: 'century',
      name: 'Centenário',
      description: 'Responda 100 questões.',
      icon: '💯',
      criteria: 'answers',
      target: 100,
      xp: 60,
      progress: 42,
      unlocked: false,
      unlockedAt: null,
    },
  ],
  totals: { unlocked: 1, available: 2 },
};

function renderWithProviders(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Gamificação (componentes)', () => {
  it('mostra XP, nível e conquistas desbloqueadas', () => {
    renderWithProviders(<GamificationCard data={gamification} />);
    expect(screen.getByText('128 XP')).toBeTruthy();
    expect(screen.getByText(/Nível 2/)).toBeTruthy();
    expect(screen.getByText('1 de 2 conquistas desbloqueadas')).toBeTruthy();
  });

  it('marca visualmente conquistas travadas com o progresso', () => {
    const items: Achievement[] = gamification.achievements;
    renderWithProviders(<AchievementsGrid items={items} />);
    expect(screen.getByText('Primeiros passos')).toBeTruthy();
    expect(screen.getByText('Centenário')).toBeTruthy();
    expect(screen.getByText(/Desbloqueada/)).toBeTruthy();
    expect(screen.getByText(/questões respondidas: 100 necessários/)).toBeTruthy();
  });
});

describe('Páginas de gamificação e trilhas', () => {
  it('Ranking mostra a posição do aluno e a tabela de classificação', async () => {
    vi.mocked(gamificationService.ranking).mockResolvedValue({
      period: '30d',
      updatedAt: new Date().toISOString(),
      ranking: [
        {
          position: 1,
          userId: 'u1',
          name: 'Ana S.',
          xp: 320,
          answers: 120,
          correct: 96,
          accuracy: 80,
          simulados: 4,
          level: 3,
        },
        {
          position: 2,
          userId: 'u2',
          name: 'Bruno O.',
          xp: 150,
          answers: 60,
          correct: 33,
          accuracy: 55,
          simulados: 1,
          level: 2,
        },
      ],
    });

    renderWithProviders(<Ranking />);
    expect(await screen.findByText('Ana S.')).toBeTruthy();
    expect(screen.getByText('Bruno O.')).toBeTruthy();
    expect(screen.getByText('Classificação')).toBeTruthy();
    expect(screen.getByText('2 participantes')).toBeTruthy();
  });

  it('Trilhas lista as etapas e permite marcar como concluída', async () => {
    vi.mocked(studyTracksService.list).mockResolvedValue([
      {
        id: 't1',
        slug: 'trilha-base',
        title: 'Trilha base',
        description: 'Comece por aqui.',
        level: 'iniciante',
        items: [
          {
            id: 'i1',
            title: 'Língua Portuguesa',
            description: null,
            kind: 'SUBJECT',
            order: 1,
            goalQuestions: 40,
            subjectId: 's1',
            subject: { id: 's1', name: 'Língua Portuguesa', code: 'LP', color: '#4f7dfb' },
            done: false,
          },
        ],
        progress: { completed: 0, total: 1, percent: 0, goalQuestions: 40 },
      },
    ] as never);
    vi.mocked(studyTracksService.setDone).mockResolvedValue({ itemId: 'i1', done: true });

    renderWithProviders(<Trilhas />);
    expect(await screen.findByRole('heading', { name: 'Trilha base' })).toBeTruthy();
    expect(screen.getAllByText('Língua Portuguesa').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(studyTracksService.setDone).toHaveBeenCalledWith('trilha-base', 'i1', true),
    );
  });
});
