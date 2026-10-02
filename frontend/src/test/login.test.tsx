import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import Login from '@/pages/auth/Login';

/**
 * Teste de fluxo: digita, envia, a API responde e o usuário entra no app.
 * O fetch é mockado — o objetivo é a integração tela + auth + cliente HTTP,
 * não o backend (que já tem a própria suíte).
 */

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

const user = {
  id: 'u1',
  name: 'Aluno Teste',
  email: 'aluno@arena.test',
  role: 'ALUNO',
  isActive: true,
  blockedAt: null,
  emailVerifiedAt: null,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
  setting: null,
};

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/app" element={<h1>Painel do aluno</h1>} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Fluxo de login', () => {
  it('entra no app com credenciais válidas', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/login')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { user, tokens: { accessToken: 'token-teste', refreshToken: 'refresh' } },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: user }));
    });

    renderLogin();

    await userEvent.type(screen.getByLabelText('E-mail'), 'aluno@arena.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    // Chegou no painel: o login funcionou ponta a ponta.
    await waitFor(() => expect(screen.getByText('Painel do aluno')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('mostra a mensagem da API quando a senha está errada', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { success: false, error: { message: 'E-mail ou senha incorretos.', code: 'ApiError' } },
          401,
        ),
      ),
    );

    renderLogin();

    await userEvent.type(screen.getByLabelText('E-mail'), 'aluno@arena.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(screen.getByText(/E-mail ou senha incorretos/)).toBeInTheDocument());
    // Continua na tela de login.
    expect(screen.queryByText('Painel do aluno')).toBeNull();
  });

  it('chama SEMPRE a API com caminho relativo (nunca expõe o host do backend)', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: { user, tokens: { accessToken: 'token-teste', refreshToken: 'refresh' } },
        }),
      ),
    );

    renderLogin();

    await userEvent.type(screen.getByLabelText('E-mail'), 'aluno@arena.test');
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/auth/login'))).toBe(true);
    expect(urls.every((url) => !url.includes('127.0.0.1') && !url.includes('localhost'))).toBe(true);
  });
});
