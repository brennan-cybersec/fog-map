/**
 * Service worker.
 *
 * Deliberately minimal. Its job is to make the app installable and to survive a
 * flaky connection on a walk — not to be a full offline cache.
 *
 * Map tiles are explicitly NOT cached. A world of vector tiles and satellite
 * imagery would fill a phone's storage quota within minutes of walking, and
 * being evicted mid-demo is worse than fetching over the network. The app shell
 * is small and static, so that is what gets cached.
 */

const CACHE = 'terra-shell-v1';

// Only same-origin shell assets. Hashed bundle filenames change per build, so
// they are cached on first use rather than listed here.
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing entry must not block installation, or one 404 leaves the app
      // permanently uninstallable.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Everything cross-origin is tiles, fonts and imagery: straight to network.
  if (url.origin !== self.location.origin) return;

  // Network-first, so a running dev or preview server always wins and the app
  // never serves a stale bundle; the cache is only a fallback when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/index.html'))),
  );
});
