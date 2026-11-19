const CACHE_NAME = 'chess-study-pro-pc-v32';
const APP_SHELL = ['./', './index.html', './pc.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.svg', './pieces/cburnett/wK.svg', './pieces/cburnett/wQ.svg', './pieces/cburnett/wR.svg', './pieces/cburnett/wB.svg', './pieces/cburnett/wN.svg', './pieces/cburnett/wP.svg', './pieces/cburnett/bK.svg', './pieces/cburnett/bQ.svg', './pieces/cburnett/bR.svg', './pieces/cburnett/bB.svg', './pieces/cburnett/bN.svg', './pieces/cburnett/bP.svg', './pieces/cburnett-v2/wK.svg', './pieces/cburnett-v2/wQ.svg', './pieces/cburnett-v2/wR.svg', './pieces/cburnett-v2/wB.svg', './pieces/cburnett-v2/wN.svg', './pieces/cburnett-v2/wP.svg', './pieces/cburnett-v2/bK.svg', './pieces/cburnett-v2/bQ.svg', './pieces/cburnett-v2/bR.svg', './pieces/cburnett-v2/bB.svg', './pieces/cburnett-v2/bN.svg', './pieces/cburnett-v2/bP.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache the small Lite build after its first successful download so
  // installed iPhone users can still analyze offline. Full is ~99 MB and
  // remains network-only to avoid filling the device's cache quota.
  if (url.pathname.includes('/engine/')) {
    const isLiteAsset = /\/engine\/stockfish-19-lite-single\.(js|wasm)$/.test(url.pathname);
    if (!isLiteAsset) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Always check the network first for page navigations so installed iPhone
  // apps receive the latest HTML and loader code after a deployment.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
