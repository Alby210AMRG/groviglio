/* ============================================================
   Groviglio – updater.js v1.0.2
   Controllo aggiornamenti da GitHub — consenso esplicito utente
   ============================================================ */

import { log } from './logger.js';

const VERSION_LOCALE = '1.0.3';
const VERSION_URL = 'https://raw.githubusercontent.com/Alby210AMRG/groviglio/main/version.json';

let _bannerEl   = null;
let _swRegistration = null;

export function initUpdater() {
  _bannerEl = document.getElementById('update-banner');
  if (!_bannerEl) return;

  // Salva riferimento alla registrazione SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      _swRegistration = reg;

      // Controlla se c'è già un SW in attesa (da sessione precedente)
      if (reg?.waiting) {
        mostraBannerAggiornamento('(versione precedente in cache)');
      }

      // Ascolta nuovi SW che arrivano in stato "waiting"
      reg?.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nuovo SW pronto ma in attesa — mostra banner
            log('SW aggiornamento disponibile, in attesa consenso utente', 'sistema');
            mostraBannerAggiornamento();
          }
        });
      });
    });

    // Ricarica SOLO dopo che l'utente ha confermato e il SW ha preso controllo
    let aspettandoRicarica = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (aspettandoRicarica) {
        window.location.reload();
      }
    });

    // Rendi disponibile la funzione per il banner
    window._applicaAggiornamento = async () => {
      aspettandoRicarica = true;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      } else {
        // Nessun SW in attesa: svuota cache e ricarica
        await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        window.location.reload(true);
      }
    };
  }

  // Wiring bottoni banner
  document.getElementById('update-aggiorna')
    ?.addEventListener('click', () => {
      log('Utente ha confermato aggiornamento app', 'sistema');
      window._applicaAggiornamento?.();
    });

  document.getElementById('update-chiudi')
    ?.addEventListener('click', () => {
      _bannerEl.classList.remove('visible');
      log('Utente ha rimandato aggiornamento', 'sistema');
    });

  // Controlla versione remota dopo 3s (non blocca boot)
  setTimeout(controllaAggiornamento, 3000);
  // Ricontrolla ogni 6 ore
  setInterval(controllaAggiornamento, 6 * 60 * 60 * 1000);
}

async function controllaAggiornamento() {
  if (!navigator.onLine) return;

  try {
    const response = await fetch(VERSION_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;

    const dati = await response.json();
    const versioneRemota = dati.version;
    const changelog      = dati.changelog || '';

    if (isVersionePiuRecente(versioneRemota, VERSION_LOCALE)) {
      log(`Nuova versione rilevata: ${versioneRemota}`, 'sistema');
      mostraBannerAggiornamento(changelog);
      // Forza il browser a scaricare il nuovo SW
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.update();
    }
  } catch (err) {
    // Silenzioso — offline o GitHub non raggiungibile
    console.log('[Updater] Controllo fallito:', err.message);
  }
}

function isVersionePiuRecente(remota, locale) {
  const toNum = v => v.split('.').map(Number);
  const r = toNum(remota);
  const l = toNum(locale);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
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
