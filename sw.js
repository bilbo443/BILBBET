// Minimal service worker, required for Android's "Add to Home Screen" /
// installability criteria. Deliberately network-first, not cache-first:
// this app's whole purpose is showing current odds, balances, and bets --
// caching those aggressively would mean occasionally showing stale money
// data, which is worse than just not being installable. The cache here
// exists only as a fallback if the network genuinely fails, not as the
// primary source.

const CACHE_NAME = 'bilbbet-shell-v1';
const SHELL_FILES = ['./index.html', './css/styles.css', './js/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for the app's own shell files -- never
  // intercept data fetches or anything cross-origin (Supabase, etc.),
  // so live data always goes straight to the network with no caching
  // logic in the way at all.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
