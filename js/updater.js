/* ============================================================
   Groviglio – updater.js
   Controllo aggiornamenti da GitHub via version.json
   ============================================================ */

const VERSION_LOCALE = '1.0.0';
const VERSION_URL = 'https://raw.githubusercontent.com/Alby210AMRG/groviglio/main/version.json';

let _bannerEl = null;

export function initUpdater() {
  _bannerEl = document.getElementById('update-banner');
  if (!_bannerEl) return;

  const btnAggiorna = _bannerEl.querySelector('#update-aggiorna');
  const btnChiudi   = _bannerEl.querySelector('#update-chiudi');

  if (btnAggiorna) btnAggiorna.addEventListener('click', applicaAggiornamento);
  if (btnChiudi)   btnChiudi.addEventListener('click', () => _bannerEl.classList.remove('visible'));

  // Controlla subito (con delay per non bloccare il boot)
  setTimeout(controllaAggiornamento, 3000);

  // Ricontrolla ogni 6 ore
  setInterval(controllaAggiornamento, 6 * 60 * 60 * 1000);
}

async function controllaAggiornamento() {
  // Solo se online
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
      console.log(`[Updater] Nuova versione disponibile: ${versioneRemota}`);
      mostraBannerAggiornamento(versioneRemota, changelog);
    }
  } catch (err) {
    // Silenzioso — offline o GitHub non raggiungibile
    console.log('[Updater] Controllo fallito (offline?):', err.message);
  }
}

/**
 * Confronto versioni semantiche (1.2.3)
 */
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

function mostraBannerAggiornamento(versione, changelog) {
  if (!_bannerEl) return;

  const msgEl = _bannerEl.querySelector('#update-msg');
  if (msgEl) {
    msgEl.textContent = `🚀 Groviglio ${versione} disponibile${changelog ? ` — ${changelog}` : ''}`;
  }

  _bannerEl.classList.add('visible');
}

async function applicaAggiornamento() {
  // Notifica il service worker di aggiornare
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    }
    // Se non c'è SW in attesa, ricarica comunque
    await caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    );
  }

  window.location.reload(true);
}

export const VERSIONE_LOCALE = VERSION_LOCALE;
