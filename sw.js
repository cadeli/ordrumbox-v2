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

// Installation : Mise en cache des ressources critiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching critical assets');
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
});

// Listener pour forcer la mise à jour quand l'utilisateur clique sur le bouton
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activation : Nettoyage des anciens caches
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

// Stratégie : Cache-first avec fallback réseau (et mise en cache dynamique)
self.addEventListener('fetch', (event) => {
  // On ne gère que les requêtes GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Ne pas mettre en cache si la réponse n'est pas valide
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }

        // Mise en cache dynamique des sons (.wav) et des scripts bundle
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Optionnel : Retourner une page d'erreur offline ici
      });
    })
  );
});
