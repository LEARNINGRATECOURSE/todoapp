// Cache-first app shell so logging works offline; fonts are cached on first use.
const CACHE = 'scribble-habits-v7';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/tokens.css', 'css/base.css', 'css/components.css',
  'js/app.js', 'js/views.js', 'js/stats.js', 'js/store.js', 'js/csv.js', 'js/icons.js', 'js/reminders.js', 'js/prefs.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const fontHost = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fontHost) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    });
    // Same-origin: cache first, refresh in background. Offline with no cache: fall back to the shell.
    net.catch(() => {});
    return hit || net.catch(() => caches.match('index.html'));
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
