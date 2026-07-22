/* ============================================================
   Groviglio – logger.js v1.0.2
   Log eventi (250 voci) + ultime 10 modifiche
   Tutto in memoria + persistito in IndexedDB
   ============================================================ */

import { getImpostazione, setImpostazione } from './db.js';

const MAX_LOG   = 250;
const MAX_MOD   = 10;
const KEY_LOG   = 'eventLog';
const KEY_MOD   = 'ultimeMod';

// Cache in memoria per accesso rapido
let _log = [];
let _mod = [];
let _inizializzato = false;

/* ─── Tipi evento ─────────────────────────────────────────── */
// 'crea' | 'modifica' | 'elimina' | 'sistema' | 'ai' | 'backup' | 'import' | 'errore'

/* ─── Init ────────────────────────────────────────────────── */
export async function initLogger() {
  try {
    _log = (await getImpostazione(KEY_LOG, [])) || [];
    _mod = (await getImpostazione(KEY_MOD, [])) || [];
    _inizializzato = true;
    log('App avviata', 'sistema');
  } catch (err) {
    console.warn('[Logger] Init fallito:', err);
    _log = [];
    _mod = [];
    _inizializzato = true;
  }
}

/* ─── Aggiungi evento al log ──────────────────────────────── */
export function log(messaggio, tipo = 'sistema', extra = null) {
  const voce = {
    id:        Date.now() + Math.random(),
    ts:        new Date().toISOString(),
    tipo,
    messaggio: String(messaggio),
    extra,
  };

  _log.unshift(voce);             // più recente in cima
  if (_log.length > MAX_LOG) _log.pop();  // taglia a 250

  // Persisti in background (non await per non bloccare)
  _salvaLog();

  console.log(`[${tipo.toUpperCase()}] ${messaggio}`);
  return voce;
}

/* ─── Registra modifica elemento ──────────────────────────── */
export function logModifica(elemento, azione = 'modifica') {
  const voce = {
    id:         Date.now(),
    ts:         new Date().toISOString(),
    azione,                        // 'crea' | 'modifica' | 'elimina'
    elementoId: elemento.id,
    tipo:       elemento.tipo,
    titolo:     elemento.titolo,
  };

  // Rimuovi eventuale voce precedente dello stesso elemento
  _mod = _mod.filter(m => m.elementoId !== elemento.id);
  _mod.unshift(voce);
  if (_mod.length > MAX_MOD) _mod.pop();

  _salvaMod();

  // Logga anche nel log generale
  const azioniLabel = { crea: 'Creato', modifica: 'Modificato', elimina: 'Eliminato' };
  log(`${azioniLabel[azione] || azione}: "${elemento.titolo}"`, azione);
}

/* ─── Getters ─────────────────────────────────────────────── */
export function getLog(limit = MAX_LOG) {
  return _log.slice(0, limit);
}

export function getUltimeModifiche() {
  return [..._mod];
}

/* ─── Cancella log ────────────────────────────────────────── */
export async function cancellaLog() {
  _log = [];
  await _salvaLog();
  log('Log eventi cancellato', 'sistema');
}

/* ─── Persistenza ─────────────────────────────────────────── */
async function _salvaLog() {
  try {
    await setImpostazione(KEY_LOG, _log);
  } catch {}
}

async function _salvaMod() {
  try {
    await setImpostazione(KEY_MOD, _mod);
  } catch {}
}

/* ─── Helpers render ──────────────────────────────────────── */
const TIPO_ICONA = {
  crea:    '✨',
  modifica:'✏️',
  elimina: '🗑️',
  sistema: '⚙️',
  ai:      '🤖',
  backup:  '💾',
  import:  '📥',
  errore:  '❌',
};

const TIPO_COLORE = {
  crea:    'var(--type-progetto)',
  modifica:'var(--type-nota)',
  elimina: 'var(--danger)',
  sistema: 'var(--text-muted)',
  ai:      'var(--type-task)',
  backup:  'var(--warning)',
  import:  'var(--type-idea)',
  errore:  'var(--danger)',
};

export function renderLogHTML(voci) {
  if (!voci.length) {
    return `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.8rem">
      Nessun evento registrato
    </div>`;
  }

  return voci.map(v => {
    const data = new Date(v.ts);
    const ora  = data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const gg   = data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const icona = TIPO_ICONA[v.tipo] || '•';
    const colore = TIPO_COLORE[v.tipo] || 'var(--text-muted)';

    return `
      <div style="
        display:flex;align-items:flex-start;gap:10px;
        padding:8px 14px;border-bottom:1px solid var(--border);
        transition:background var(--transition);
      " onmouseover="this.style.background='var(--surface-hover)'"
         onmouseout="this.style.background=''"
      >
        <span style="font-size:.85rem;flex-shrink:0;margin-top:1px">${icona}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.78rem;color:var(--text-primary);line-height:1.4">
            ${escHTML(v.messaggio)}
          </div>
          ${v.extra ? `<div style="font-size:.65rem;color:var(--text-muted);margin-top:2px">${escHTML(JSON.stringify(v.extra))}</div>` : ''}
        </div>
        <div style="
          font-size:.62rem;color:var(--text-muted);
          white-space:nowrap;flex-shrink:0;text-align:right;line-height:1.6
        ">
          <div style="color:${colore};font-weight:600;text-transform:uppercase;font-size:.56rem;letter-spacing:.06em">${v.tipo}</div>
          <div>${ora}</div>
          <div>${gg}</div>
        </div>
      </div>`;
  }).join('');
}

export function renderUltimeModHTML(voci) {
  if (!voci.length) {
    return `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:.78rem">
      Nessuna modifica ancora
    </div>`;
  }

  const tipoIcon = { nota:'📝', idea:'💡', progetto:'📁', task:'✅' };
  const azioneLabel = { crea:'Creato', modifica:'Modificato', elimina:'Eliminato' };
  const azioneColore = {
    crea: 'var(--type-progetto)',
    modifica: 'var(--type-nota)',
    elimina: 'var(--danger)'
  };

  return voci.map(v => {
    const data = new Date(v.ts);
    const rel  = dataRel(data);

    return `
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:9px 14px;border-bottom:1px solid var(--border);
        cursor:pointer;transition:background var(--transition)
      "
        onmouseover="this.style.background='var(--surface-hover)'"
        onmouseout="this.style.background=''"
        onclick="document.dispatchEvent(new CustomEvent('apriElemento',{detail:'${v.elementoId}'}))"
      >
        <span style="font-size:1rem">${tipoIcon[v.tipo] || '📄'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.8rem;font-weight:600;color:var(--text-primary);
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escHTML(v.titolo)}
          </div>
          <div style="font-size:.65rem;color:var(--text-muted)">${rel}</div>
        </div>
        <span style="
          font-size:.6rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.06em;color:${azioneColore[v.azione] || 'var(--text-muted)'};
          flex-shrink:0
        ">${azioneLabel[v.azione] || v.azione}</span>
      </div>`;
  }).join('');
}

/* ─── Util ────────────────────────────────────────────────── */
function escHTML(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function dataRel(d) {
  const diff = Date.now() - d.getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ora';
  if (min < 60)  return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h}h fa`;
  return `${Math.floor(h/24)}g fa`;
}
