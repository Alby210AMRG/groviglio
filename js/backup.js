/* ============================================================
   Groviglio – backup.js
   Backup automatico con notifica download
   ============================================================ */

import { esportaDB } from './db.js';
import { getImpostazione, setImpostazione } from './db.js';

const BACKUP_KEY_LAST = 'backupUltimaVolta';
const BACKUP_KEY_FREQ = 'backupFrequenza'; // ore

let _bannerEl = null;
let _intervalId = null;
let _pendingBlob = null;
let _pendingFilename = null;

/* ─── Init ────────────────────────────────────────────────── */

export async function initBackup() {
  _bannerEl = document.getElementById('backup-banner');
  if (!_bannerEl) return;

  // Wiring bottoni banner
  const btnScarica = _bannerEl.querySelector('#backup-scarica');
  const btnIgnora  = _bannerEl.querySelector('#backup-ignora');
  if (btnScarica) btnScarica.addEventListener('click', eseguiDownload);
  if (btnIgnora)  btnIgnora.addEventListener('click', nascondiBanner);

  // Avvia controllo periodico ogni 30 min
  await controllaBackup();
  _intervalId = setInterval(controllaBackup, 30 * 60 * 1000);
}

/* ─── Controllo ───────────────────────────────────────────── */

async function controllaBackup() {
  const frequenzaOre = await getImpostazione(BACKUP_KEY_FREQ, 24);
  if (frequenzaOre === 0) return; // backup disabilitato

  const ultimaVolta = await getImpostazione(BACKUP_KEY_LAST, null);
  const ora = Date.now();

  if (!ultimaVolta) {
    // Prima volta: schedula dopo 5 min dalla prima apertura
    setTimeout(mostraBanner, 5 * 60 * 1000);
    return;
  }

  const diff = ora - new Date(ultimaVolta).getTime();
  const diffOre = diff / (1000 * 60 * 60);

  if (diffOre >= frequenzaOre) {
    await preparaBanner();
  }
}

async function preparaBanner() {
  try {
    // Prepara il backup in memoria (non scarica ancora)
    const dati = await esportaDB();
    const json = JSON.stringify(dati, null, 2);
    _pendingBlob = new Blob([json], { type: 'application/json' });
    _pendingFilename = `groviglio_backup_${new Date().toISOString().split('T')[0]}.json`;

    const nEl = dati.elementi?.length || 0;
    const subEl = _bannerEl.querySelector('#backup-count');
    if (subEl) subEl.textContent = `${nEl} elementi da salvare`;

    mostraBanner();
  } catch (err) {
    console.error('[Backup] Errore preparazione:', err);
  }
}

/* ─── Banner UI ───────────────────────────────────────────── */

function mostraBanner() {
  if (!_bannerEl) return;
  _bannerEl.classList.add('visible');
}

function nascondiBanner() {
  if (!_bannerEl) return;
  _bannerEl.classList.remove('visible');
}

/* ─── Download ────────────────────────────────────────────── */

async function eseguiDownload() {
  if (!_pendingBlob) {
    // Se non è già preparato, preparalo ora
    const dati = await esportaDB();
    const json = JSON.stringify(dati, null, 2);
    _pendingBlob = new Blob([json], { type: 'application/json' });
    _pendingFilename = `groviglio_backup_${new Date().toISOString().split('T')[0]}.json`;
  }

  const url  = URL.createObjectURL(_pendingBlob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = _pendingFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  // Registra timestamp
  await setImpostazione(BACKUP_KEY_LAST, new Date().toISOString());

  _pendingBlob = null;
  _pendingFilename = null;

  nascondiBanner();

  // Toast di conferma
  const { mostraToast } = await import('./ui.js');
  mostraToast('✅ Backup salvato con successo', 'success');
}

/**
 * Backup manuale forzato (dal menu impostazioni)
 */
export async function backupManuale() {
  await preparaBanner();
  // Se vuol scaricarlo subito
  await eseguiDownload();
}

/**
 * Aggiorna frequenza backup
 * @param {number} ore - 0 = disabilitato, 1,6,12,24,72
 */
export async function setFrequenzaBackup(ore) {
  await setImpostazione(BACKUP_KEY_FREQ, ore);
}
