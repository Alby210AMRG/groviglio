/* ============================================================
   Groviglio – logger.js v1.0.4
   Log eventi compatto (250) + Ultime modifiche (250)
   ============================================================ */

import { getImpostazione, setImpostazione } from './db.js';

const MAX_LOG = 250;
const MAX_MOD = 250;
const KEY_LOG = 'eventLog';
const KEY_MOD = 'ultimeMod';

let _log = [];
let _mod = [];

/* ─── Init ────────────────────────────────────────────────── */
export async function initLogger() {
  try {
    _log = (await getImpostazione(KEY_LOG, [])) || [];
    _mod = (await getImpostazione(KEY_MOD, [])) || [];
    log('App avviata', 'sistema');
  } catch {
    _log = []; _mod = [];
    log('App avviata (log reset)', 'sistema');
  }
}

/* ─── Log evento ──────────────────────────────────────────── */
export function log(messaggio, tipo = 'sistema', extra = null) {
  const voce = {
    id:  Date.now() + Math.random(),
    ts:  new Date().toISOString(),
    tipo,
    msg: String(messaggio),
    extra: extra ? JSON.stringify(extra).substring(0, 200) : null,
  };
  _log.unshift(voce);
  if (_log.length > MAX_LOG) _log.length = MAX_LOG;
  _salvaLog();
  return voce;
}

/* ─── Registra modifica elemento ──────────────────────────── */
export function logModifica(elemento, azione = 'modifica') {
  const voce = {
    id:         Date.now(),
    ts:         new Date().toISOString(),
    azione,
    elementoId: elemento.id,
    tipo:       elemento.tipo,
    titolo:     elemento.titolo,
  };
  _mod = _mod.filter(m => m.elementoId !== elemento.id);
  _mod.unshift(voce);
  if (_mod.length > MAX_MOD) _mod.length = MAX_MOD;
  _salvaMod();

  const lbl = { crea:'Creato', modifica:'Modificato', elimina:'Eliminato' };
  log(`${lbl[azione]||azione}: "${elemento.titolo}" [${elemento.tipo}]`, azione);
}

/* ─── Getters ─────────────────────────────────────────────── */
export function getLog(limit = MAX_LOG) { return _log.slice(0, limit); }
export function getUltimeModifiche()     { return [..._mod]; }

/* ─── Cancella ────────────────────────────────────────────── */
export async function cancellaLog() {
  _log = [];
  await _salvaLog();
  log('Log cancellato', 'sistema');
}

/* ─── Copia log come testo ────────────────────────────────── */
export function logComeTesto(limit = MAX_LOG) {
  return _log.slice(0, limit).map(v => {
    const ts = new Date(v.ts).toLocaleString('it-IT');
    return `[${ts}] [${v.tipo.toUpperCase()}] ${v.msg}${v.extra ? ' | '+v.extra : ''}`;
  }).join('\n');
}

/* ─── Persistenza ─────────────────────────────────────────── */
let _timerLog, _timerMod;
function _salvaLog() {
  clearTimeout(_timerLog);
  _timerLog = setTimeout(() => setImpostazione(KEY_LOG, _log).catch(()=>{}), 500);
}
function _salvaMod() {
  clearTimeout(_timerMod);
  _timerMod = setTimeout(() => setImpostazione(KEY_MOD, _mod).catch(()=>{}), 500);
}

/* ─── Render Log compatto ─────────────────────────────────── */
const TIPO_META = {
  crea:     { i:'✨', c:'var(--type-progetto)' },
  modifica: { i:'✏️', c:'var(--type-nota)' },
  elimina:  { i:'🗑️', c:'var(--danger)' },
  sistema:  { i:'⚙️', c:'var(--text-muted)' },
  ai:       { i:'🤖', c:'var(--type-task)' },
  errore:   { i:'❌', c:'var(--danger)' },
  backup:   { i:'💾', c:'var(--warning)' },
  import:   { i:'📥', c:'var(--type-idea)' },
};

export function renderLogHTML(voci) {
  if (!voci.length) return `
    <div style="padding:14px;text-align:center;color:var(--text-muted);font-size:.75rem">
      Nessun evento
    </div>`;

  return `<table style="width:100%;border-collapse:collapse;font-size:.72rem">
    ${voci.map(v => {
      const m    = TIPO_META[v.tipo] || { i:'•', c:'var(--text-muted)' };
      const ts   = new Date(v.ts);
      const ora  = ts.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const data = ts.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
      return `
        <tr style="border-bottom:1px solid var(--border)"
          onmouseover="this.style.background='var(--surface-hover)'"
          onmouseout="this.style.background=''">
          <td style="padding:5px 8px;width:20px;text-align:center">${m.i}</td>
          <td style="padding:5px 4px;color:${m.c};width:56px;font-weight:700;
            font-size:.6rem;text-transform:uppercase;letter-spacing:.04em">${v.tipo}</td>
          <td style="padding:5px 4px;color:var(--text-primary);line-height:1.35">
            ${escH(v.msg)}
            ${v.extra ? `<div style="color:var(--text-muted);font-size:.62rem;margin-top:1px">${escH(v.extra)}</div>` : ''}
          </td>
          <td style="padding:5px 8px;color:var(--text-muted);white-space:nowrap;
            text-align:right;font-size:.6rem;line-height:1.5">
            <div>${ora}</div><div>${data}</div>
          </td>
        </tr>`;
    }).join('')}
  </table>`;
}

/* ─── Render Ultime Modifiche compatto ────────────────────── */
const TIPO_ICON  = { nota:'📝', idea:'💡', progetto:'📁', task:'✅' };
const AZ_META = {
  crea:     { lbl:'NUOVO',      c:'var(--type-progetto)' },
  modifica: { lbl:'MOD',        c:'var(--type-nota)' },
  elimina:  { lbl:'ELIMINATO',  c:'var(--danger)' },
};

export function renderUltimeModHTML(voci) {
  if (!voci.length) return `
    <div style="padding:14px;text-align:center;color:var(--text-muted);font-size:.75rem">
      Nessuna modifica ancora
    </div>`;

  return `<table style="width:100%;border-collapse:collapse;font-size:.72rem">
    ${voci.map(v => {
      const m   = AZ_META[v.azione] || { lbl: v.azione.toUpperCase(), c:'var(--text-muted)' };
      const rel = _dataRel(new Date(v.ts));
      return `
        <tr style="border-bottom:1px solid var(--border);cursor:pointer"
          onmouseover="this.style.background='var(--surface-hover)'"
          onmouseout="this.style.background=''"
          onclick="document.dispatchEvent(new CustomEvent('apriElemento',{detail:'${v.elementoId}'}))">
          <td style="padding:5px 8px;width:22px;text-align:center">
            ${TIPO_ICON[v.tipo]||'📄'}
          </td>
          <td style="padding:5px 4px;min-width:0">
            <div style="color:var(--text-primary);font-weight:600;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">
              ${escH(v.titolo)}
            </div>
            <div style="color:var(--text-muted);font-size:.6rem">${v.tipo}</div>
          </td>
          <td style="padding:5px 4px;white-space:nowrap">
            <span style="background:${m.c}22;color:${m.c};font-size:.58rem;
              font-weight:700;padding:2px 6px;border-radius:99px;letter-spacing:.04em">
              ${m.lbl}
            </span>
          </td>
          <td style="padding:5px 8px;color:var(--text-muted);white-space:nowrap;
            font-size:.62rem;text-align:right">${rel}</td>
        </tr>`;
    }).join('')}
  </table>`;
}

/* ─── Util ────────────────────────────────────────────────── */
function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _dataRel(d) {
  const diff = Date.now() - d.getTime();
  const min  = Math.floor(diff/60000);
  if (min < 1)  return 'adesso';
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min/60);
  if (h < 24)   return `${h}h fa`;
  return `${Math.floor(h/24)}g fa`;
}

/* ─── Ricarica da DB (per settings refresh) ───────────────── */
export async function reloadLogFromDB() {
  try {
    _log = (await getImpostazione(KEY_LOG, [])) || [];
    _mod = (await getImpostazione(KEY_MOD, [])) || [];
  } catch(e) {
    console.warn('[Logger] reloadFromDB fallito:', e);
  }
}
