const CACHE_NAME = 'ordrumbox-v2-cache-v1';
const PRE_CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  './favicon.ico',
  './assets/data/drumkits.json',
  './assets/data/patterns.json',
  './assets/data/scales.json',
  './assets/data/generated_sounds.json'
];

// Installation: Pre-cache critical resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching critical assets');
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
});

// Listen for force-update when the user clicks the button
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activation: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Strategy: Cache-first with network fallback (and dynamic caching)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Do not cache if the response is not valid
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }

        // Dynamic caching of sounds (.wav) and bundle scripts
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Optional: Return an offline error page here
      });
    })
  );
});
