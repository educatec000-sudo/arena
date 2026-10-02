/* =============================================================================
   Arena Estudos — Service Worker (PWA)

   Estratégia de cache pensada para NUNCA conflitar com o PostgreSQL:

   * /api/**            -> NUNCA é cacheado. Os dados do usuário vivem no banco;
                           cachear respostas criaria divergência entre aparelhos.
   * assets (hash no nome) -> cache-first: são imutáveis, então é seguro.
   * index.html / navegação -> network-first com fallback para o cache (offline).

   O app continua abrindo sem internet (shell + última versão carregada), mas
   responder questões offline fica na fila e é sincronizado quando a rede volta.
   ========================================================================== */
const CACHE = 'arena-estudos-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => null)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // POST (respostas, IA) nunca é interceptado

  const url = new URL(request.url);

  // 1) Dados: sempre da rede.
  if (url.pathname.startsWith('/api/')) return;

  // 2) Navegação: rede primeiro, cache como plano B (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // 3) Assets estáticos: cache-first, e só do mesmo domínio.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response && response.status === 200 && response.type === 'basic') {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
              }
              return response;
            })
            .catch(() => cached),
      ),
    );
  }
});

/* Permite que o app force uma atualização do cache (botão "atualizar app"). */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
