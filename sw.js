// Scope the cache and asset URLs to support both a domain root and GitHub Pages.
const BASE = new URL(self.registration.scope);
const CACHE = `habitkit-v3-${BASE.pathname}`;
const FILES = ['', 'index.html', 'src/app.js', 'src/model.js', 'src/style.css', 'manifest.webmanifest', 'public/logo.png'].map(file => new URL(file, BASE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('habitkit-') && key !== CACHE && (key === 'habitkit-v1' || key.endsWith(`-${BASE.pathname}`))).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(event.request) || (event.request.mode === 'navigate' ? await cache.match(BASE.href) : null) || Response.error();
  }));
});
