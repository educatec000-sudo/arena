import type { ApiErrorBody } from '@/types';

/**
 * Cliente HTTP único do frontend.
 *
 * Responsabilidades:
 *  - prefixar /api e serializar JSON;
 *  - anexar o access token;
 *  - renovar a sessão automaticamente quando o access token expira
 *    (refresh em cookie httpOnly), sem que as páginas saibam disso;
 *  - converter erros da API em `ApiRequestError` com a mensagem em pt-BR.
 */

/**
 * Endereço da API.
 *
 * Padrão: `/api` relativo — o mesmo domínio serve o site e a API (dev com proxy
 * do Vite, ou deploy tudo-em-um). Quando o frontend mora em um domínio e a API
 * em outro (ex.: site na Vercel + API no Render), defina `VITE_API_URL`
 * apontando para a API inteira, COM o prefixo:
 *
 *     VITE_API_URL=https://arena-estudos-api.onrender.com/api
 */
const configuredBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const API_BASE = configuredBase ? configuredBase.replace(/\/+$/, '') : '/api';

export class ApiRequestError extends Error {
  status: number;
  details?: ApiErrorBody['error']['details'];
  requestId?: string;

  constructor(message: string, status: number, details?: ApiErrorBody['error']['details'], requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * O access token vive em memória. Para não deslogar a cada F5 ele também é
 * guardado no localStorage como CACHE (o servidor continua sendo a fonte da
 * verdade: se o token estiver inválido, a API recusa e o refresh entra em ação).
 */
const TOKEN_CACHE_KEY = 'arena.access_token';

function readCache(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_CACHE_KEY);
  } catch {
    return null; // navegador com storage bloqueado: seguimos só em memória
  }
}

function writeCache(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_CACHE_KEY, token);
    else window.localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    /* storage indisponível: o app continua funcionando em memória */
  }
}

let accessToken: string | null = readCache();
let refreshPromise: Promise<string | null> | null = null;
const listeners = new Set<(token: string | null) => void>();

/** Renova a sessão "por fora" (usado no boot do app). */
export function refreshSession(): Promise<string | null> {
  return refreshAccessToken();
}

export const tokenStore = {
  get: () => accessToken,
  set(token: string | null) {
    accessToken = token;
    writeCache(token);
    listeners.forEach((fn) => fn(token));
  },
  subscribe(fn: (token: string | null) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/**
 * Quantos milissegundos ainda restam para o token expirar (ou `null` se não dá
 * para saber). Só lê o `exp` do JWT — não valida assinatura, isso é papel da
 * API. Serve para renovar ANTES de levar 401, evitando aquela rajada de erros
 * quando a sessão expira enquanto a aba está aberta.
 */
export function tokenExpiresInMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded?.exp === 'number' ? decoded.exp * 1000 - Date.now() : null;
  } catch {
    return null;
  }
}

/**
 * Renova antes da hora se o token já venceu ou vence nos próximos 30 s.
 * Só age quando EXISTE um token: sem token, a chamada segue (rotas públicas)
 * e o 401 continua sendo tratado pelo `request`.
 */
async function ensureFreshToken(): Promise<void> {
  if (!accessToken) return;
  const remaining = tokenExpiresInMs(accessToken);
  if (remaining === null || remaining > 30_000) return;
  await refreshAccessToken();
}

/** Renova o access token. Chamadas concorrentes compartilham a mesma promise. */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // envia o cookie httpOnly do refresh token
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return null;
        const json = await response.json();
        const token = json?.data?.tokens?.accessToken ?? null;
        tokenStore.set(token);
        return token;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuthRetry?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
  /**
   * Tempo máximo de espera. Usado nas chamadas de IA: se o provedor enrolar,
   * a tela mostra um erro em vez de ficar com o spinner girando para sempre.
   */
  timeoutMs?: number;
}

/** Opções extras (hoje só o timeout) aceitas por get/post/patch/put/delete. */
interface ExtraOptions {
  timeoutMs?: number;
}

/** Transforma o abort em um erro com mensagem em português. */
function friendlyFetchError(err: unknown, fallback: string): ApiRequestError {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new ApiRequestError(
      'A IA demorou demais para responder e a chamada foi cancelada. Tente de novo ou troque o provedor.',
      408,
    );
  }
  if (err instanceof ApiRequestError) return err;
  return new ApiRequestError(err instanceof Error ? err.message : fallback, 0);
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipAuthRetry, headers, timeoutMs, ...rest } = options;
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  // Sessão vencida? Renova primeiro e faz a chamada já com o token novo.
  await ensureFreshToken();

  const doFetch = async (): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      ...(signal ? { signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response: Response;
  try {
    response = await doFetch();

    // 401 -> tenta renovar uma vez e repete a chamada.
    if (response.status === 401 && !skipAuthRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await doFetch();
      }
    }
  } catch (err) {
    throw friendlyFetchError(err, `Não foi possível falar com o servidor (${path}).`);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiRequestError(
      errorBody?.error?.message || `Erro ${response.status} ao falar com o servidor.`,
      response.status,
      errorBody?.error?.details,
      errorBody?.error?.requestId,
    );
  }

  return (payload as { data: T }).data;
}

/** Igual ao `request`, mas preserva `meta` (respostas paginadas). */
async function requestPaged<T>(path: string, options: RequestOptions = {}): Promise<{
  data: T;
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
}> {
  const { body, query, skipAuthRetry, headers, timeoutMs, ...rest } = options;
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  const doFetch = async (): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      ...(signal ? { signal } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response: Response;
  try {
    response = await doFetch();
    if (response.status === 401 && !skipAuthRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) response = await doFetch();
    }
  } catch (err) {
    throw friendlyFetchError(err, `Não foi possível falar com o servidor (${path}).`);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiRequestError(
      errorBody?.error?.message || `Erro ${response.status} ao falar com o servidor.`,
      response.status,
      errorBody?.error?.details,
      errorBody?.error?.requestId,
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], opts?: ExtraOptions) =>
    request<T>(path, { method: 'GET', query, ...opts }),
  /** Para endpoints paginados: devolve `{ data, meta }`. */
  paged: <T>(path: string, query?: RequestOptions['query'], opts?: ExtraOptions) =>
    requestPaged<T[]>(path, { method: 'GET', query, ...opts }),
  post: <T>(path: string, body?: unknown, opts?: ExtraOptions) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: ExtraOptions) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: ExtraOptions) =>
    request<T>(path, { method: 'PUT', body, ...opts }),
  delete: <T>(path: string, opts?: ExtraOptions) => request<T>(path, { method: 'DELETE', ...opts }),
};

export default http;
