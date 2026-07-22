const CACHE_NAME = 'synthlab-isochronic-pwa-v6-1-timer-sequence';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=6_1',
  './presets.js?v=6_1',
  './app.js?v=6_1',
  './manifest.json?v=6_1',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Navigation/HTML: prefer network so updates appear quickly, fallback to cache offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Assets: cache-first for offline use, network fallback.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
