// TouchWorkstation service worker — intentionally minimal.
// No fetch handler: we never want to serve a stale app shell (that caused
// blank-screen-after-update). This SW only cleans up old caches.
const CACHE='touchworkstation-beta11';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
