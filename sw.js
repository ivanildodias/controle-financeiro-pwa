const CACHE_NAME = 'finance-pwa-v1';

// Arquivos estruturais do aplicativo (A "Casca")
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/favicon.png'
];

// INSTALAÇÃO: O robô baixa os arquivos e guarda no cofre do celular
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Arquivos em cache com sucesso.');
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(err => {
      console.warn('Aviso: Cache Storage ignorado (não suportado no protocolo atual):', err);
    })
  );
  self.skipWaiting();
});

// ATIVAÇÃO: O robô apaga caches velhos se você atualizar a versão
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('Apagando cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// INTERCEPTAÇÃO: O robô atua quando o celular pede um arquivo
self.addEventListener('fetch', event => {
  // Ignora requisições POST ou que não sejam HTTP/HTTPS (ex: file://, chrome-extension://)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      // Se o arquivo estiver no cache (Modo Avião), entrega ele. Se não, busca na internet.
      return response || fetch(event.request);
    })
  );
});