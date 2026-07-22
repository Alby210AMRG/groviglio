/* ============================================================
   Groviglio – export.js
   Import / Export JSON completo con merge intelligente
   ============================================================ */

import { esportaDB, importaDB } from './db.js';
import { mostraToast } from './ui.js';

/* ─── Export ──────────────────────────────────────────────── */

/**
 * Esporta tutto il database in un file JSON scaricabile
 */
export async function esportaJSON() {
  try {
    const dati = await esportaDB();
    const json  = JSON.stringify(dati, null, 2);
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);

    const dataStr = new Date().toISOString().split('T')[0];
    const link    = document.createElement('a');
    link.href     = url;
    link.download = `groviglio_backup_${dataStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 5000);

    mostraToast(
      `✅ Esportati ${dati.elementi.length} elementi`,
      'success'
    );

    return dati;
  } catch (err) {
    console.error('[Export] Errore:', err);
    mostraToast('❌ Errore durante l\'esportazione', 'error');
    throw err;
  }
}

/* ─── Import ──────────────────────────────────────────────── */

/**
 * Importa dati da un file JSON selezionato dall'utente
 * @returns {Promise<void>}
 */
export function importaJSON() {
  return new Promise((resolve, reject) => {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) { resolve(); return; }

      try {
        const testo = await file.text();
        const dati  = JSON.parse(testo);

        // Validazione base
        if (!dati.elementi && !dati.impostazioni) {
          throw new Error('File JSON non valido: struttura non riconosciuta');
        }

        // Conferma utente
        const nEl = Array.isArray(dati.elementi) ? dati.elementi.length : 0;
        const ok  = confirm(
          `Importare ${nEl} elementi da "${file.name}"?\n\n` +
          `I dati esistenti NON verranno eliminati.\n` +
          `Verranno usati i record più recenti in caso di conflitto.`
        );

        if (!ok) { resolve(); return; }

        const stats = await importaDB(dati);

        mostraToast(
          `✅ Import: ${stats.aggiunti} aggiunti, ${stats.aggiornati} aggiornati, ${stats.ignorati} ignorati`,
          'success',
          5000
        );

        // Ricarica l'app per mostrare i nuovi dati
        setTimeout(() => window.location.reload(), 1500);

        resolve(stats);
      } catch (err) {
        console.error('[Import] Errore:', err);
        mostraToast(`❌ ${err.message}`, 'error');
        reject(err);
      }
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}

/**
 * Esporta solo gli elementi visibili/filtrati
 * @param {Elemento[]} elementi
 */
export function esportaElementiFiltrati(elementi) {
  const dati = {
    version:    '1.0.0',
    exportedAt: new Date().toISOString(),
    elementi,
    nota:       'Esportazione parziale – solo elementi selezionati',
  };

  const json  = JSON.stringify(dati, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);

  const dataStr = new Date().toISOString().split('T')[0];
  const link    = document.createElement('a');
  link.href     = url;
  link.download = `groviglio_selezione_${dataStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 5000);

  mostraToast(`✅ Esportati ${elementi.length} elementi`, 'success');
}
