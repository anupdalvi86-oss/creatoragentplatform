const CACHE = 'kitchen-shell-v1';
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg']))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/go/')) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname === '/' || url.pathname.startsWith('/assets/') || ['/manifest.webmanifest','/icon.svg'].includes(url.pathname))) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('/') : undefined))));
});
