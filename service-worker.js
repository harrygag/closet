const CACHE_NAME = 'closet-arcade-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/css/variables.css',
  '/src/css/arcade.css',
  '/src/css/components.css',
  '/src/css/responsive.css',
  '/src/js/storage-service.js',
  '/src/js/item-service.js',
  '/src/js/filter-service.js',
  '/src/js/ui-service.js',
  '/src/js/app.js'
];

// Install service worker and cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
