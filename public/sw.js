self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // For now, we are just passing through requests to satisfy PWA install requirements.
  e.respondWith(
    fetch(e.request).catch(() => {
      // Return a basic offline response or handle gracefully
      return new Response('Sem conexão com a internet', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
      });
    })
  );
});
