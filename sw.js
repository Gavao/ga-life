// Service worker: l'app si apre e funziona anche senza rete (la partita è salvata nel telefono).
const SHELL = 'shell-v3';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/iso.js', 'js/catalog.js', 'js/game.js', 'js/town.js', 'js/world3d.js', 'js/version.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';   // Three.js: versione fissa, si tiene in copia

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.href.startsWith(CDN)) {   // libreria 3D: prima la copia salvata (non cambia mai)
    e.respondWith(caches.match(e.request).then(hit => hit ?? fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;   // aggiornamenti da GitHub: diretti
  // Prima la rete (così le modifiche si vedono subito), poi la copia salvata (anche i modelli 3D).
  e.respondWith(
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
