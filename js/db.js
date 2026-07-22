/* ============================================================
   Groviglio – db.js
   Layer IndexedDB completo per tutti i dati dell'app
   ============================================================ */

const DB_NAME    = 'GroviglioDB';
const DB_VERSION = 1;

/** Schema stores */
const STORES = {
  elementi:    'elementi',    // note, idee, progetti, task
  impostazioni:'impostazioni',// chiave-valore impostazioni
  chat:        'chat',        // cronologia messaggi AI
};

let _db = null;

/* ─── Apertura DB ─────────────────────────────────────────── */
export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store elementi
      if (!db.objectStoreNames.contains(STORES.elementi)) {
        const store = db.createObjectStore(STORES.elementi, { keyPath: 'id' });
        store.createIndex('tipo',       'tipo',       { unique: false });
        store.createIndex('priorita',   'priorita',   { unique: false });
        store.createIndex('createdAt',  'createdAt',  { unique: false });
        store.createIndex('updatedAt',  'updatedAt',  { unique: false });
        store.createIndex('completato', 'completato', { unique: false });
      }

      // Store impostazioni
      if (!db.objectStoreNames.contains(STORES.impostazioni)) {
        db.createObjectStore(STORES.impostazioni, { keyPath: 'chiave' });
      }

      // Store chat
      if (!db.objectStoreNames.contains(STORES.chat)) {
        const chatStore = db.createObjectStore(STORES.chat, { keyPath: 'id', autoIncrement: true });
        chatStore.createIndex('timestamp', 'timestamp', { unique: false });
        chatStore.createIndex('sessione',  'sessione',  { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      console.log('[DB] Aperto con successo');
      resolve(_db);
    };

    request.onerror = () => {
      console.error('[DB] Errore apertura:', request.error);
      reject(request.error);
    };
  });
}

/* ─── Helpers transazione ─────────────────────────────────── */
function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

/* ═══════════════════════════════════════════════════════════
   ELEMENTI (CRUD)
═══════════════════════════════════════════════════════════ */

/**
 * Crea un nuovo elemento con campi di default
 * @param {Partial<Elemento>} dati
 * @returns {Promise<Elemento>}
 */
export async function creaElemento(dati) {
  const ora = new Date().toISOString();
  const elemento = {
    id:          crypto.randomUUID(),
    tipo:        dati.tipo        || 'nota',
    titolo:      dati.titolo      || 'Senza titolo',
    descrizione: dati.descrizione || '',
    tag:         dati.tag         || [],
    priorita:    dati.priorita    || 'media',
    stato:       dati.stato       || statoDefault(dati.tipo),
    immagini:    dati.immagini    || [],  // array base64
    collegamenti:dati.collegamenti|| [],  // array di ID
    completato:  dati.completato  || false,
    scadenza:    dati.scadenza    || null,
    coloreCustom:dati.coloreCustom|| null,
    // Metadati futuri Google Drive
    _driveId:    null,
    _driveSyncAt:null,
    createdAt:   ora,
    updatedAt:   ora,
  };

  await promisify(tx(STORES.elementi, 'readwrite').add(elemento));
  console.log('[DB] Elemento creato:', elemento.id);
  return elemento;
}

/** Tipo di stato di default per tipo elemento */
function statoDefault(tipo) {
  switch (tipo) {
    case 'progetto': return 'attivo';
    case 'idea':     return 'bozza';
    case 'task':     return 'da_fare';
    default:         return null;
  }
}

/**
 * Ottieni tutti gli elementi
 * @returns {Promise<Elemento[]>}
 */
export async function getElementi() {
  return promisify(tx(STORES.elementi).getAll());
}

/**
 * Ottieni un elemento per ID
 * @param {string} id
 * @returns {Promise<Elemento|undefined>}
 */
export async function getElemento(id) {
  return promisify(tx(STORES.elementi).get(id));
}

/**
 * Aggiorna un elemento (merge parziale)
 * @param {string} id
 * @param {Partial<Elemento>} updates
 * @returns {Promise<Elemento>}
 */
export async function aggiornaElemento(id, updates) {
  const store    = tx(STORES.elementi, 'readwrite');
  const esistente = await promisify(store.get(id));
  if (!esistente) throw new Error(`Elemento non trovato: ${id}`);

  const aggiornato = {
    ...esistente,
    ...updates,
    id,              // ID non modificabile
    updatedAt: new Date().toISOString(),
  };

  await promisify(tx(STORES.elementi, 'readwrite').put(aggiornato));
  return aggiornato;
}

/**
 * Elimina un elemento e rimuove i suoi collegamenti dagli altri elementi
 * @param {string} id
 */
export async function eliminaElemento(id) {
  // Rimuovi dai collegamenti di altri elementi
  const tutti = await getElementi();
  for (const el of tutti) {
    if (el.collegamenti.includes(id)) {
      await aggiornaElemento(el.id, {
        collegamenti: el.collegamenti.filter(c => c !== id)
      });
    }
  }
  await promisify(tx(STORES.elementi, 'readwrite').delete(id));
  console.log('[DB] Elemento eliminato:', id);
}

/**
 * Cerca elementi per testo (titolo + descrizione + tag)
 * @param {string} query
 * @returns {Promise<Elemento[]>}
 */
export async function cercaElementi(query) {
  const q = query.toLowerCase().trim();
  if (!q) return getElementi();

  const tutti = await getElementi();
  return tutti.filter(el =>
    el.titolo.toLowerCase().includes(q) ||
    el.descrizione.toLowerCase().includes(q) ||
    el.tag.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Filtra elementi
 * @param {{tipo?:string, priorita?:string, tag?:string}} filtri
 * @returns {Promise<Elemento[]>}
 */
export async function filtraElementi(filtri = {}) {
  let tutti = await getElementi();

  if (filtri.tipo)     tutti = tutti.filter(e => e.tipo === filtri.tipo);
  if (filtri.priorita) tutti = tutti.filter(e => e.priorita === filtri.priorita);
  if (filtri.tag)      tutti = tutti.filter(e => e.tag.includes(filtri.tag));

  return tutti;
}

/**
 * Aggiunge un collegamento tra due elementi (bidirezionale)
 */
export async function aggiungiCollegamento(idA, idB) {
  const [a, b] = await Promise.all([getElemento(idA), getElemento(idB)]);
  if (!a || !b) return;

  if (!a.collegamenti.includes(idB)) {
    await aggiornaElemento(idA, { collegamenti: [...a.collegamenti, idB] });
  }
  if (!b.collegamenti.includes(idA)) {
    await aggiornaElemento(idB, { collegamenti: [...b.collegamenti, idA] });
  }
}

/**
 * Rimuove un collegamento tra due elementi
 */
export async function rimuoviCollegamento(idA, idB) {
  const [a, b] = await Promise.all([getElemento(idA), getElemento(idB)]);
  if (a) await aggiornaElemento(idA, { collegamenti: a.collegamenti.filter(c => c !== idB) });
  if (b) await aggiornaElemento(idB, { collegamenti: b.collegamenti.filter(c => c !== idA) });
}

/* ═══════════════════════════════════════════════════════════
   IMPOSTAZIONI
═══════════════════════════════════════════════════════════ */

/**
 * Leggi impostazione
 * @param {string} chiave
 * @param {*} defaultVal
 */
export async function getImpostazione(chiave, defaultVal = null) {
  const record = await promisify(tx(STORES.impostazioni).get(chiave));
  return record ? record.valore : defaultVal;
}

/**
 * Salva impostazione
 * @param {string} chiave
 * @param {*} valore
 */
export async function setImpostazione(chiave, valore) {
  return promisify(
    tx(STORES.impostazioni, 'readwrite').put({ chiave, valore })
  );
}

/**
 * Leggi tutte le impostazioni come oggetto
 */
export async function getImpostazioni() {
  const records = await promisify(tx(STORES.impostazioni).getAll());
  return records.reduce((acc, r) => ({ ...acc, [r.chiave]: r.valore }), {});
}

/* ═══════════════════════════════════════════════════════════
   CHAT
═══════════════════════════════════════════════════════════ */

/**
 * Salva un messaggio chat
 * @param {{role:'user'|'assistant', content:string, provider?:string, sessione?:string}} msg
 */
export async function salvaMessaggioChat(msg) {
  const record = {
    ...msg,
    timestamp: new Date().toISOString(),
    sessione:  msg.sessione || 'default',
  };
  return promisify(tx(STORES.chat, 'readwrite').add(record));
}

/**
 * Ottieni storico chat per sessione
 * @param {string} sessione
 * @returns {Promise<Array>}
 */
export async function getStoricoChatSessione(sessione = 'default') {
  const tutti = await promisify(
    tx(STORES.chat).index('sessione').getAll(sessione)
  );
  return tutti.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

/**
 * Cancella storico chat
 */
export async function cancellaChat(sessione = null) {
  if (sessione) {
    const msgs = await getStoricoChatSessione(sessione);
    const store = tx(STORES.chat, 'readwrite');
    for (const m of msgs) await promisify(store.delete(m.id));
  } else {
    await promisify(tx(STORES.chat, 'readwrite').clear());
  }
}

/* ═══════════════════════════════════════════════════════════
   EXPORT / IMPORT completo DB
═══════════════════════════════════════════════════════════ */

/**
 * Esporta tutto il database come oggetto JS
 * @returns {Promise<{elementi, impostazioni, chat, exportedAt, version}>}
 */
export async function esportaDB() {
  const [elementi, impostazioniRaw, chat] = await Promise.all([
    getElementi(),
    promisify(tx(STORES.impostazioni).getAll()),
    promisify(tx(STORES.chat).getAll()),
  ]);

  const impostazioni = impostazioniRaw.reduce(
    (acc, r) => ({ ...acc, [r.chiave]: r.valore }), {}
  );

  // Non esportare API keys per sicurezza
  const impostazioniSafe = { ...impostazioni };
  delete impostazioniSafe.apiKeyAnthropic;
  delete impostazioniSafe.apiKeyGemini;
  delete impostazioniSafe.apiKeyOpenAI;

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    elementi,
    impostazioni: impostazioniSafe,
    chat,
  };
}

/**
 * Importa dati nel database (merge intelligente per ID)
 * @param {{elementi?, impostazioni?, chat?}} dati
 * @returns {Promise<{aggiunti, aggiornati, ignorati}>}
 */
export async function importaDB(dati) {
  const stats = { aggiunti: 0, aggiornati: 0, ignorati: 0 };

  // Importa elementi
  if (Array.isArray(dati.elementi)) {
    for (const el of dati.elementi) {
      if (!el.id || !el.tipo) { stats.ignorati++; continue; }

      const esistente = await getElemento(el.id);
      const storeW = tx(STORES.elementi, 'readwrite');

      if (!esistente) {
        await promisify(storeW.add(el));
        stats.aggiunti++;
      } else {
        // Tieni il più recente
        const dataImport  = new Date(el.updatedAt || 0);
        const dataLocale  = new Date(esistente.updatedAt || 0);
        if (dataImport > dataLocale) {
          await promisify(tx(STORES.elementi, 'readwrite').put(el));
          stats.aggiornati++;
        } else {
          stats.ignorati++;
        }
      }
    }
  }

  // Importa impostazioni (non-sensitive)
  if (dati.impostazioni && typeof dati.impostazioni === 'object') {
    const skip = ['apiKeyAnthropic','apiKeyGemini','apiKeyOpenAI'];
    for (const [k, v] of Object.entries(dati.impostazioni)) {
      if (!skip.includes(k)) await setImpostazione(k, v);
    }
  }

  console.log('[DB] Import completato:', stats);
  return stats;
}

/**
 * Resetta completamente il database
 */
export async function resetDB() {
  await Promise.all([
    promisify(tx(STORES.elementi,    'readwrite').clear()),
    promisify(tx(STORES.impostazioni,'readwrite').clear()),
    promisify(tx(STORES.chat,        'readwrite').clear()),
  ]);
  console.log('[DB] Database resettato');
}

/**
 * Conta elementi per tipo (per badge sidebar)
 * @returns {Promise<{nota,idea,progetto,task,totale}>}
 */
export async function contaElementi() {
  const tutti = await getElementi();
  return {
    totale:   tutti.length,
    nota:     tutti.filter(e => e.tipo === 'nota').length,
    idea:     tutti.filter(e => e.tipo === 'idea').length,
    progetto: tutti.filter(e => e.tipo === 'progetto').length,
    task:     tutti.filter(e => e.tipo === 'task').length,
  };
}
