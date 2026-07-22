/* ============================================================
   Groviglio – app.js v1.0.2
   Entry point: boot, SW registration, PWA install
   ============================================================ */

import { openDB } from './db.js';
import { initUI, setupFiltri } from './ui.js';
import { initBackup } from './backup.js';
import { initUpdater } from './updater.js';
import { initLogger, log } from './logger.js';

/* ─── Boot ────────────────────────────────────────────────── */
async function boot() {
  try {
    // 1. Logger prima di tutto (traccia tutti gli eventi successivi)
    await initLogger();

    // 2. Apri IndexedDB
    await openDB();
    log('Database aperto', 'sistema');

    // 3. Registra Service Worker (PRIMA dell'UI, così è pronto)
    await registraSW();

    // 4. Init UI
    await initUI();
    setupFiltri();
    log('Interfaccia pronta', 'sistema');

    // 5. Backup automatico
    await initBackup();

    // 6. Controllo aggiornamenti GitHub
    initUpdater();

    // 7. PWA install prompt
    gestisciPWA();

    console.log('🦊 Groviglio v1.1.2 avviato');
    window.__GROVIGLIO_READY__ = true;
  } catch (err) {
    console.error('❌ Errore boot:', err);
    document.getElementById('splash')?.remove();
    mostraErroreBoot(err);
  }
}

/* ─── Service Worker ──────────────────────────────────────── */
async function registraSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register(
      '/groviglio/sw.js',
      { scope: '/groviglio/' }
    );
    console.log('[SW] Registrato:', reg.scope);

    // ⚠️ NON aggiungere listener 'controllerchange' qui
    // Il reload avviene solo quando l'utente preme "Aggiorna"
    // ed è gestito in updater.js tramite window._applicaAggiornamento

  } catch (err) {
    console.warn('[SW] Registrazione fallita:', err);
  }
}

/* ─── PWA Install prompt ──────────────────────────────────── */
function gestisciPWA() {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const giaInstallata = window.matchMedia('(display-mode: standalone)').matches;
    if (!giaInstallata) {
      setTimeout(() => mostraBannerInstalla(deferredPrompt), 45000);
    }
  });

  window.addEventListener('appinstalled', () => {
    log('App installata come PWA', 'sistema');
    deferredPrompt = null;
    document.getElementById('install-banner')?.remove();
  });
}

function mostraBannerInstalla(prompt) {
  if (document.getElementById('install-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:var(--surface);border:1px solid var(--border-strong);
    border-radius:14px;padding:14px 18px;box-shadow:var(--shadow-lg);
    z-index:800;display:flex;align-items:center;gap:12px;
    max-width:340px;width:90%;
    animation:toastIn .3s cubic-bezier(.34,1.56,.64,1);
  `;
  banner.innerHTML = `
    <img src="/groviglio/icons/icon-72.png"
      style="width:40px;height:40px;border-radius:10px" alt="logo">
    <div style="flex:1">
      <div style="font-weight:700;font-size:.85rem;color:var(--text-primary)">
        Installa Groviglio
      </div>
      <div style="font-size:.72rem;color:var(--text-muted)">
        Accedi offline dal tuo dispositivo
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button id="install-yes" style="
        background:var(--accent-blue);color:#fff;border:none;
        border-radius:8px;padding:6px 12px;
        font-family:var(--font-ui);font-size:.75rem;font-weight:600;cursor:pointer">
        Installa
      </button>
      <button id="install-no" style="
        background:var(--surface-3);color:var(--text-muted);border:none;
        border-radius:8px;padding:6px 10px;
        font-family:var(--font-ui);font-size:.75rem;cursor:pointer">
        ✕
      </button>
    </div>`;

  document.body.appendChild(banner);

  document.getElementById('install-yes')?.addEventListener('click', async () => {
    banner.remove();
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      log(`PWA install prompt: ${outcome}`, 'sistema');
    }
  });

  document.getElementById('install-no')?.addEventListener('click', () => banner.remove());
}

/* ─── Errore boot ─────────────────────────────────────────── */
function mostraErroreBoot(err) {
  document.body.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:100dvh;gap:16px;padding:20px;
      font-family:sans-serif;background:#0D0F18;color:#EEF2FF
    ">
      <div style="font-size:3rem">⚠️</div>
      <div style="font-size:1.2rem;font-weight:700">Errore di avvio</div>
      <div style="font-size:.85rem;color:#94A3B8;text-align:center;max-width:400px">
        ${err.message || 'Impossibile avviare Groviglio. Ricarica la pagina.'}
      </div>
      <button onclick="location.reload()" style="
        background:#4F7BF7;color:#fff;border:none;border-radius:8px;
        padding:10px 20px;font-size:.85rem;cursor:pointer;font-family:inherit
      ">Ricarica</button>
    </div>`;
}

/* ─── Avvio ───────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
