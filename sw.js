/* Dozenten-Cockpit - Service Worker
   Zweck: App-Shell offline verfuegbar halten (z. B. im ICE ohne Netz).
   Strategie:
   - Navigations-/HTML-Anfragen: network-first mit Cache-Fallback
     (immer die frischeste Version, aber offline laeuft die letzte bekannte)
   - Fremd-APIs (Microsoft Graph, Claude-Proxy, Google): NIE cachen
     (sonst wuerden veraltete Daten oder Tokens ausgeliefert)
   Hinweis: Kommentare bewusst ohne Umlaute - Cloudflare liefert .js ohne
   charset-Angabe aus, dann stellt der Browser Umlaute falsch dar.
*/
const CACHE = 'dozenten-cockpit-v48';
const SHELL = ['/', '/index.html'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Nur eigene Herkunft behandeln - APIs und Fremddomains unangetastet lassen
  if (url.origin !== self.location.origin) return;
  // Cloudflare-Function (Claude-Proxy) niemals cachen
  if (url.pathname.startsWith('/claude-proxy')) return;
  // Nur GET cachen
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Erfolgreiche Antwort in den Cache spiegeln
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        // Offline: aus dem Cache bedienen, sonst App-Shell
        caches.match(e.request).then(hit => hit || caches.match('/index.html'))
      )
  );
});
