/* ============================================================
   Groviglio – updater.js v1.0.4
   Banner aggiornamento anche con app attiva (Visibility API)
   ============================================================ */

import { log } from './logger.js';

const VERSION_LOCALE = '1.1.3';
const VERSION_URL = 'https://raw.githubusercontent.com/Alby210AMRG/groviglio/main/version.json';

let _bannerEl = null;
let _ultimoCheck = 0;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 ora

export function initUpdater() {
  _bannerEl = document.getElementById('update-banner');
  if (!_bannerEl) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg?.waiting) {
        log('Aggiornamento in attesa (SW waiting)', 'sistema');
        mostraBannerAggiornamento('aggiornamento pronto');
      }
      reg?.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            log('Nuovo SW installato, in attesa conferma utente', 'sistema');
            mostraBannerAggiornamento();
          }
        });
      });
    });

    // Ricarica SOLO dopo conferma utente
    let aspettandoRicarica = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (aspettandoRicarica) window.location.reload();
    });

    window._applicaAggiornamento = async () => {
      aspettandoRicarica = true;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      } else {
        await caches.keys().then(k => Promise.all(k.map(c => caches.delete(c))));
        window.location.reload(true);
      }
    };
  }

  // Bottoni banner
  document.getElementById('update-aggiorna')?.addEventListener('click', () => {
    log('Utente ha confermato aggiornamento', 'sistema');
    window._applicaAggiornamento?.();
  });
  document.getElementById('update-chiudi')?.addEventListener('click', () => {
    _bannerEl.classList.remove('visible');
    log('Utente ha rimandato aggiornamento', 'sistema');
  });

  // ── Controllo versione ──────────────────────────────────
  // 1. Al boot (dopo 3s)
  setTimeout(controllaAggiornamento, 3000);

  // 2. Ogni ora (app in background o attiva)
  setInterval(controllaAggiornamento, CHECK_INTERVAL_MS);

  // 3. Page Visibility API: controlla quando l'utente torna sull'app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const ora = Date.now();
      // Evita check troppo frequenti (min 5 minuti tra un check e l'altro)
      if (ora - _ultimoCheck > 5 * 60 * 1000) {
        controllaAggiornamento();
      }
    }
  });

  // 4. Evento online: ricontrolla quando si riacquisisce connessione
  window.addEventListener('online', () => {
    setTimeout(controllaAggiornamento, 2000);
  });
}

async function controllaAggiornamento() {
  if (!navigator.onLine) return;
  _ultimoCheck = Date.now();

  try {
    const response = await fetch(VERSION_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;

    const dati = await response.json();
    const remota = dati.version;
    const changelog = dati.changelog || '';

    if (isVersionePiuRecente(remota, VERSION_LOCALE)) {
      log(`Nuova versione rilevata: ${remota}`, 'sistema');
      mostraBannerAggiornamento(changelog);
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.update();
    }
  } catch (err) {
    console.log('[Updater] Check fallito:', err.message);
  }
}

function isVersionePiuRecente(remota, locale) {
  const n = v => v.split('.').map(Number);
  const r = n(remota), l = n(locale);
  for (let i = 0; i < 3; i++) {
    if ((r[i]||0) > (l[i]||0)) return true;
    if ((r[i]||0) < (l[i]||0)) return false;
  }
  return false;
}

function mostraBannerAggiornamento(changelog = '') {
  if (!_bannerEl) return;
  const msgEl = _bannerEl.querySelector('#update-msg');
  if (msgEl) {
    msgEl.textContent = changelog
      ? `🚀 Aggiornamento disponibile — ${changelog}`
      : '🚀 Aggiornamento disponibile — premi per installare';
  }
  _bannerEl.classList.add('visible');
}

export const VERSIONE_LOCALE = VERSION_LOCALE;
