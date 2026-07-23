/* ============================================================
   Groviglio – db.js v1.1.0
   Schema v2: aggiunge parentId, ordine, icona + indice parentId
   ============================================================ */

const DB_NAME    = 'GroviglioDB';
const DB_VERSION = 2;           // ← v2: aggiunge indice parentId

const STORES = {
  elementi:     'elementi',
  impostazioni: 'impostazioni',
  chat:         'chat',
};

let _db = null;

/* ─── Apertura DB ─────────────────────────────────────────── */
export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const { oldVersion } = event;

      // ── Versione 1 → crea stores originali ──────────────
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORES.elementi)) {
          const store = db.createObjectStore(STORES.elementi, { keyPath: 'id' });
          store.createIndex('tipo',       'tipo',       { unique: false });
          store.createIndex('priorita',   'priorita',   { unique: false });
          store.createIndex('createdAt',  'createdAt',  { unique: false });
          store.createIndex('updatedAt',  'updatedAt',  { unique: false });
          store.createIndex('completato', 'completato', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.impostazioni)) {
          db.createObjectStore(STORES.impostazioni, { keyPath: 'chiave' });
        }
        if (!db.objectStoreNames.contains(STORES.chat)) {
          const cs = db.createObjectStore(STORES.chat, { keyPath: 'id', autoIncrement: true });
          cs.createIndex('timestamp', 'timestamp', { unique: false });
          cs.createIndex('sessione',  'sessione',  { unique: false });
        }
      }

      // ── Versione 2 → aggiunge indice parentId ───────────
      if (oldVersion < 2) {
        const store = event.target.transaction.objectStore(STORES.elementi);
        if (!store.indexNames.contains('parentId')) {
          store.createIndex('parentId', 'parentId', { unique: false });
        }
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      console.log('[DB] Aperto v2');
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

/* ─── Helpers ─────────────────────────────────────────────── */
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
   ELEMENTI
═══════════════════════════════════════════════════════════ */

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
    immagini:    dati.immagini    || [],
    collegamenti:dati.collegamenti|| [],
    completato:  dati.completato  || false,
    scadenza:    dati.scadenza    || null,
    coloreCustom:dati.coloreCustom|| null,
    // ── v1.1.0 ──
    parentId:    dati.parentId    || null,
    ordine:      dati.ordine      ?? 0,
    icona:       dati.icona       || null,
    // ── Google Drive (v2) ──
    _driveId:    null,
    _driveSyncAt:null,
    createdAt:   ora,
    updatedAt:   ora,
  };
  await promisify(tx(STORES.elementi, 'readwrite').add(elemento));
  return elemento;
}

function statoDefault(tipo) {
  switch (tipo) {
    case 'macroprogetto': return 'attivo';
    case 'progetto': return 'attivo';
    case 'idea':     return 'bozza';
    case 'task':     return 'da_fare';
    default:         return null;
  }
}

export async function getElementi() {
  return promisify(tx(STORES.elementi).getAll());
}

export async function getElemento(id) {
  return promisify(tx(STORES.elementi).get(id));
}

export async function aggiornaElemento(id, updates) {
  const store    = tx(STORES.elementi, 'readwrite');
  const esistente = await promisify(store.get(id));
  if (!esistente) throw new Error(`Elemento non trovato: ${id}`);
  const aggiornato = { ...esistente, ...updates, id, updatedAt: new Date().toISOString() };
  await promisify(tx(STORES.elementi, 'readwrite').put(aggiornato));
  return aggiornato;
}

export async function eliminaElemento(id) {
  // Ri-assegna i figli diretti alla radice
  const tutti = await getElementi();
  for (const el of tutti) {
    if (el.parentId === id) {
      await aggiornaElemento(el.id, { parentId: null });
    }
    if (el.collegamenti?.includes(id)) {
      await aggiornaElemento(el.id, {
        collegamenti: el.collegamenti.filter(c => c !== id)
      });
    }
  }
  await promisify(tx(STORES.elementi, 'readwrite').delete(id));
}

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

/** Ottieni figli diretti di un elemento */
export async function getElementiFigli(parentId) {
  const tutti = await getElementi();
  return tutti
    .filter(e => e.parentId === parentId)
    .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
}

/** Costruisce struttura ad albero: [{...el, figli:[...]}, ...] */
export async function buildAlbero() {
  const tutti = await getElementi();
  const mappa = {};
  for (const el of tutti) mappa[el.id] = { ...el, figli: [] };

  const radici = [];
  for (const el of tutti) {
    if (el.parentId && mappa[el.parentId]) {
      mappa[el.parentId].figli.push(mappa[el.id]);
    } else {
      radici.push(mappa[el.id]);
    }
  }

  const ordina = (nodi) => {
    nodi.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
    for (const n of nodi) ordina(n.figli);
  };
  ordina(radici);
  return radici;
}

/** Aggiorna parentId e ordine (per drag&drop albero) */
export async function spostaElemento(id, nuovoParentId, nuovoOrdine) {
  return aggiornaElemento(id, { parentId: nuovoParentId || null, ordine: nuovoOrdine });
}

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

export async function rimuoviCollegamento(idA, idB) {
  const [a, b] = await Promise.all([getElemento(idA), getElemento(idB)]);
  if (a) await aggiornaElemento(idA, { collegamenti: a.collegamenti.filter(c => c !== idB) });
  if (b) await aggiornaElemento(idB, { collegamenti: b.collegamenti.filter(c => c !== idA) });
}

/* ═══════════════════════════════════════════════════════════
   IMPOSTAZIONI
═══════════════════════════════════════════════════════════ */

export async function getImpostazione(chiave, defaultVal = null) {
  const record = await promisify(tx(STORES.impostazioni).get(chiave));
  return record ? record.valore : defaultVal;
}

export async function setImpostazione(chiave, valore) {
  return promisify(tx(STORES.impostazioni, 'readwrite').put({ chiave, valore }));
}

export async function getImpostazioni() {
  const records = await promisify(tx(STORES.impostazioni).getAll());
  return records.reduce((acc, r) => ({ ...acc, [r.chiave]: r.valore }), {});
}

/* ═══════════════════════════════════════════════════════════
   CHAT
═══════════════════════════════════════════════════════════ */

export async function salvaMessaggioChat(msg) {
  return promisify(tx(STORES.chat, 'readwrite').add({
    ...msg,
    timestamp: new Date().toISOString(),
    sessione:  msg.sessione || 'default',
  }));
}

export async function getStoricoChatSessione(sessione = 'default') {
  const tutti = await promisify(tx(STORES.chat).index('sessione').getAll(sessione));
  return tutti.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

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
   EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */

export async function esportaDB() {
  const [elementi, impostazioniRaw, chat] = await Promise.all([
    getElementi(),
    promisify(tx(STORES.impostazioni).getAll()),
    promisify(tx(STORES.chat).getAll()),
  ]);
  const impostazioni = impostazioniRaw.reduce(
    (acc, r) => ({ ...acc, [r.chiave]: r.valore }), {}
  );
  const safe = { ...impostazioni };
  delete safe.apiKeyAnthropic; delete safe.apiKeyGemini; delete safe.apiKeyOpenAI;
  return { version: '1.1.0', exportedAt: new Date().toISOString(), elementi, impostazioni: safe, chat };
}

export async function importaDB(dati) {
  const stats = { aggiunti: 0, aggiornati: 0, ignorati: 0 };
  if (Array.isArray(dati.elementi)) {
    for (const el of dati.elementi) {
      if (!el.id || !el.tipo) { stats.ignorati++; continue; }
      const esistente = await getElemento(el.id);
      if (!esistente) {
        await promisify(tx(STORES.elementi, 'readwrite').add({
          parentId: null, ordine: 0, icona: null, ...el
        }));
        stats.aggiunti++;
      } else {
        if (new Date(el.updatedAt||0) > new Date(esistente.updatedAt||0)) {
          await promisify(tx(STORES.elementi, 'readwrite').put({
            parentId: null, ordine: 0, icona: null, ...el
          }));
          stats.aggiornati++;
        } else { stats.ignorati++; }
      }
    }
  }
  if (dati.impostazioni) {
    const skip = ['apiKeyAnthropic','apiKeyGemini','apiKeyOpenAI'];
    for (const [k, v] of Object.entries(dati.impostazioni)) {
      if (!skip.includes(k)) await setImpostazione(k, v);
    }
  }
  return stats;
}

export async function resetDB() {
  await Promise.all([
    promisify(tx(STORES.elementi,    'readwrite').clear()),
    promisify(tx(STORES.impostazioni,'readwrite').clear()),
    promisify(tx(STORES.chat,        'readwrite').clear()),
  ]);
}

export async function contaElementi() {
  const tutti = await getElementi();
  return {
    totale:        tutti.length,
    macroprogetto: tutti.filter(e => e.tipo === 'macroprogetto').length,
    nota:          tutti.filter(e => e.tipo === 'nota').length,
    idea:          tutti.filter(e => e.tipo === 'idea').length,
    progetto:      tutti.filter(e => e.tipo === 'progetto').length,
    task:          tutti.filter(e => e.tipo === 'task').length,
  };
}
