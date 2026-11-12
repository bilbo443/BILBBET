// Cache only the static application shell as an offline fallback.
// Scores and other data must never enter the service-worker cache.
const CACHE_NAME = 'bilbbet-shell-v4';
const SHELL_FILES = ['./index.html', './css/styles.css', './js/app.js',
  './fixtures.html', './css/fixture-share.css', './js/fixture-share.js', './js/streak-specials.js', './js/ecl-draw.js', './js/matchup-notes.js', './js/team-abbreviations.js'];
const SHELL_PATHS = new Set(SHELL_FILES.map(path => new URL(path, self.location.href).pathname));
SHELL_PATHS.add(new URL('./', self.location.href).pathname);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(SHELL_FILES.map(path => new Request(path, {cache:'reload'})))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith('bilbbet-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return;
  event.respondWith(fetch(event.request, {cache:'no-cache'}).then(response => {
    if(response.ok){
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) ||
    new Response('Bilbbet is offline. Reconnect and reload.', {status:503})));
});
