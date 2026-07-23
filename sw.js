/* ============================================================
   Groviglio – Service Worker v1.0.2
   Fix: aggiornamento solo su consenso utente (no auto-reload)
   ============================================================ */

const CACHE_NAME = 'groviglio-v1.1.9';
const STATIC_ASSETS = [
  '/groviglio/',
  '/groviglio/index.html',
  '/groviglio/css/app.css',
  '/groviglio/js/db.js',
  '/groviglio/js/app.js',
  '/groviglio/js/ui.js',
  '/groviglio/js/graph.js',
  '/groviglio/js/ai.js',
  '/groviglio/js/export.js',
  '/groviglio/js/backup.js',
  '/groviglio/js/updater.js',
  '/groviglio/js/tree.js',
  '/groviglio/js/tableview.js',
  '/groviglio/js/icons.js',
  '/groviglio/js/logger.js',
  '/groviglio/manifest.json',
  '/groviglio/icons/icon-192.png',
  '/groviglio/icons/favicon.ico',
  '/groviglio/icons/icon-512.png',
  'https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
];

// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installazione v1.0.2...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Cache fallita per:', url, err)
          )
        )
      )
    ).then(() => {
      console.log('[SW] Installazione completata — in attesa di attivazione');
      // ⚠️ NON chiamare skipWaiting() qui
      // Il nuovo SW rimane in stato "waiting" finché l'utente conferma
    })
  );
});

// ─── Activate ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Attivazione...');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Elimino vecchia cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => {
      console.log('[SW] Attivo — prendo controllo dei client');
      return self.clients.claim();
    })
  );
});

// ─── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Intercetta solo http/https — salta chrome-extension e altri schemi
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API AI → sempre network, non intercettare
  if (
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'generativelanguage.googleapis.com' ||
    url.hostname === 'api.openai.com'
  ) return;

  // version.json → Network-First (per rilevare aggiornamenti)
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Tutto il resto → Cache-First
  event.respondWith(cacheFirst(event.request));
});

// ─── Strategie cache ───────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline – risorsa non disponibile', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─── Messaggi dall'app ──────────────────────────────────────
// L'app manda SKIP_WAITING solo quando l'utente preme "Aggiorna"
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    console.log('[SW] Aggiornamento confermato dall\'utente');
    self.skipWaiting();
  }
});
