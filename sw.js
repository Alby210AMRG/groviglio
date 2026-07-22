/* ============================================================
   Groviglio – Service Worker
   Strategia: Cache-First per asset statici, Network-First per API
   ============================================================ */

const CACHE_NAME = 'groviglio-v1.0.0';
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
  '/groviglio/manifest.json',
  '/groviglio/icons/icon-192.png',
  '/groviglio/icons/icon-512.png',
  // CDN esterni
  'https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap'
];

// ─── Install ───────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installazione in corso...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache asset critici — ignora errori per CDN
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Cache fallita per:', url, err)
          )
        )
      );
    }).then(() => {
      console.log('[SW] Installazione completata');
      return self.skipWaiting();
    })
  );
});

// ─── Activate ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Attivazione in corso...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Elimino vecchia cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Attivazione completata');
      return self.clients.claim();
    })
  );
});

// ─── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Non intercettare richieste API AI (sempre network)
  if (
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'generativelanguage.googleapis.com' ||
    url.hostname === 'api.openai.com'
  ) {
    return; // Lascia passare direttamente
  }

  // version.json → Network-First (per aggiornamenti)
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Tutto il resto → Cache-First
  event.respondWith(cacheFirst(event.request));
});

// ─── Strategie ─────────────────────────────────────────────

/** Cache-First: usa cache, fallback su network, salva in cache */
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
    // Offline e non in cache
    return new Response('Offline – risorsa non disponibile', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/** Network-First: prova network, fallback su cache */
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
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
