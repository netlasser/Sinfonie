const CACHE = 'crate-shell-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only cache-serve our own static shell files. Every Drive / Google
// API request should always go to the network — never cache audio
// or auth traffic.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let Google requests pass through untouched
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
