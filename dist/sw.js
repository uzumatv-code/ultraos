// Service Worker para PWA
const CACHE_NAME = 'sistema-os-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('Cache aberto');
        // Adiciona recursos individualmente para evitar falha completa
        const promises = urlsToCache.map(async (url) => {
          try {
            await cache.add(url);
            console.log('✅ Cached:', url);
          } catch (err) {
            console.warn('⚠️ Falha ao cachear:', url, err.message);
          }
        });
        return Promise.allSettled(promises);
      })
  );
  // Força o service worker a se tornar ativo imediatamente
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Torna o service worker ativo imediatamente
  return self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Ignora requisições para outras origens
  if (url.origin !== location.origin) {
    return;
  }

  // Ignora requisições para Supabase
  if (url.hostname.includes('supabase')) {
    return;
  }

  // Para navegação HTML (rotas do React Router), sempre busca da rede primeiro
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { redirect: 'follow' })
        .then(response => {
          // Não cacheia respostas redirecionadas ou opacas
          if (response.redirected || response.type === 'opaqueredirect') {
            return response;
          }
          // Clona a resposta antes de cachear
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache).catch(err => {
              console.warn('Falha ao cachear navegacao:', request.url, err.message);
            });
          });
          return response;
        })
        .catch(() => {
          // Se falhar, tenta buscar do cache
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Para assets (CSS, JS, imagens), usa cache first
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(request).then(response => {
          // Não cacheia se não for uma resposta válida
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clona a resposta antes de cachear
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache).catch(err => {
              console.warn('Falha ao cachear asset:', request.url, err.message);
            });
          });

          return response;
        }).catch(err => {
          console.log('Erro ao buscar:', request.url, err);
          return new Response('Network error', { status: 503 });
        });
      })
  );
});
