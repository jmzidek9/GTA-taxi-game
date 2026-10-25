/* CROSSTOWN — offline cache. Bump VERSION whenever any shipped file changes. */
const VERSION = 'crosstown-v4';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg',
  'vendor/three.r147.min.js', 'vendor/three-postfx.r147.js',
  'js/core.js', 'js/world.js', 'js/fx.js', 'js/people.js', 'js/vehicle.js', 'js/traffic.js', 'js/police.js',
  'js/mission.js', 'js/goals.js', 'js/radio.js', 'js/ui.js', 'js/main.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // game files: network first so updates land right away, cache when offline
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.host)) {
    // fonts and the fallback CDN: serve cached copy, refresh in the background
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
