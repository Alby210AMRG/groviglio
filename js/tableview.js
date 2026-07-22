/* ============================================================
   Groviglio – tableview.js v1.1.0
   Vista Tabella con gerarchia Macro → Progetto → Elemento
   ============================================================ */

import { getElementi } from './db.js';
import { getIcona } from './icons.js';

const TIPO_COLORI = {
  nota:     'var(--type-nota)',
  idea:     'var(--type-idea)',
  progetto: 'var(--type-progetto)',
  task:     'var(--type-task)',
};

let _sortCol   = 'updatedAt';
let _sortDir   = 'desc';
let _filtroTipo = '';
let _filtroMacro = '';
let _callbacks = {};

export function initTableView(callbacks) { _callbacks = callbacks; }

export async function renderTabella() {
  const container = document.getElementById('tabella-container');
  if (!container) return;

  const tutti = await getElementi();
  const mappa = Object.fromEntries(tutti.map(e => [e.id, e]));

  // Costruisce riga piatta con colonne derivate
  const righe = tutti.map(el => {
    const padre       = el.parentId ? mappa[el.parentId] : null;
    const nonno       = padre?.parentId ? mappa[padre.parentId] : null;
    const macroprog   = nonno || padre;
    const progetto    = nonno ? padre : null;

    return {
      el,
      icona:        getIcona(el),
      macroprogetto: macroprog?.titolo || '—',
      macroId:       macroprog?.id || null,
      progetto:      progetto?.titolo || '—',
      progettoId:    progetto?.id || null,
    };
  });

  // Filtra
  let filtrate = righe;
  if (_filtroTipo)  filtrate = filtrate.filter(r => r.el.tipo === _filtroTipo);
  if (_filtroMacro) filtrate = filtrate.filter(r => r.macroId === _filtroMacro);

  // Ordina
  filtrate.sort((a, b) => {
    let va = a.el[_sortCol] ?? a[_sortCol] ?? '';
    let vb = b.el[_sortCol] ?? b[_sortCol] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return _sortDir === 'desc' ? -cmp : cmp;
  });

  // Macroprogetti unici per filtro
  const macroUnici = [...new Map(
    righe.filter(r => r.macroId).map(r => [r.macroId, r.macroprogetto])
  )];

  const colonne = [
    { key: 'icona',         label: '',               sortable: false, cls: 'cell-icon' },
    { key: 'macroprogetto', label: 'Macroprogetto',  sortable: true,  cls: 'cell-macroprogetto' },
    { key: 'progetto',      label: 'Progetto',       sortable: true,  cls: '' },
    { key: 'titolo',        label: 'Titolo',         sortable: true,  cls: '' },
    { key: 'tipo',          label: 'Tipo',           sortable: true,  cls: 'cell-tipo' },
    { key: 'priorita',      label: 'Priorità',       sortable: true,  cls: 'cell-prio' },
    { key: 'stato',         label: 'Stato',          sortable: true,  cls: 'cell-stato' },
    { key: 'scadenza',      label: 'Scadenza',       sortable: true,  cls: 'cell-data' },
    { key: 'updatedAt',     label: 'Modifica',       sortable: true,  cls: 'cell-data' },
    { key: 'azioni',        label: '',               sortable: false, cls: 'cell-azioni' },
  ];

  container.innerHTML = `
    <!-- Toolbar tabella -->
    <div class="table-toolbar">
      <select class="toolbar-select" id="tbl-filtro-tipo">
        <option value="">Tutti i tipi</option>
        <option value="nota"     ${_filtroTipo==='nota'     ?'selected':''}>📝 Note</option>
        <option value="idea"     ${_filtroTipo==='idea'     ?'selected':''}>💡 Idee</option>
        <option value="progetto" ${_filtroTipo==='progetto' ?'selected':''}>📁 Progetti</option>
        <option value="task"     ${_filtroTipo==='task'     ?'selected':''}>✅ Task</option>
      </select>

      <select class="toolbar-select" id="tbl-filtro-macro">
        <option value="">Tutti i macroprogetti</option>
        ${macroUnici.map(([id, tit]) =>
          `<option value="${id}" ${_filtroMacro===id?'selected':''}>${escH(tit)}</option>`
        ).join('')}
      </select>

      <div style="margin-left:auto;font-size:.72rem;color:var(--text-muted)">
        ${filtrate.length} elementi
      </div>
    </div>

    <!-- Tabella -->
    <div style="overflow-x:auto">
      <table class="data-table table-wrapper">
        <thead>
          <tr>
            ${colonne.map(c => `
              <th class="${c.cls} ${_sortCol===c.key ? (_sortDir==='asc'?'sorted-asc':'sorted-desc') : ''}"
                data-col="${c.key}" ${c.sortable ? '' : 'style="cursor:default"'}>
                ${c.label}${c.sortable ? '<span class="sort-icon"></span>' : ''}
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filtrate.length ? filtrate.map(r => rigaHTML(r)).join('') : `
            <tr><td colspan="${colonne.length}" style="text-align:center;color:var(--text-muted);padding:30px">
              Nessun elemento trovato
            </td></tr>`}
        </tbody>
      </table>
    </div>`;

  // Ordinamento colonne
  container.querySelectorAll('th[data-col]').forEach(th => {
    const col = th.dataset.col;
    if (!colonne.find(c => c.key === col)?.sortable) return;
    th.addEventListener('click', () => {
      if (_sortCol === col) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortCol = col;
        _sortDir = 'asc';
      }
      renderTabella();
    });
  });

  // Filtri
  container.querySelector('#tbl-filtro-tipo')?.addEventListener('change', (e) => {
    _filtroTipo = e.target.value;
    renderTabella();
  });
  container.querySelector('#tbl-filtro-macro')?.addEventListener('change', (e) => {
    _filtroMacro = e.target.value;
    renderTabella();
  });

  // Click riga
  container.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.table-azioni')) return;
      _callbacks.apriElemento?.(tr.dataset.id);
    });
  });

  // Azioni
  container.querySelectorAll('[data-tbl-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.tblAction;
      const el = tutti.find(e => e.id === id);
      if (!el) return;
      if (action === 'modifica') _callbacks.apriModalModifica?.(el);
      if (action === 'elimina') {
        if (!confirm(`Eliminare "${el.titolo}"?`)) return;
        await _callbacks.eliminaElemento?.(id);
        renderTabella();
      }
    });
  });
}

function rigaHTML(r) {
  const el    = r.el;
  const colore = TIPO_COLORI[el.tipo] || 'var(--accent-blue)';
  const pColore = { alta:'var(--danger)', media:'var(--warning)', bassa:'var(--text-muted)' }[el.priorita] || 'var(--text-muted)';
  const dataScad = el.scadenza ? new Date(el.scadenza).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
  const dataMod  = dataRel(el.updatedAt);

  return `
    <tr data-id="${el.id}">
      <td class="cell-icon">${r.icona}</td>
      <td class="cell-macroprogetto" style="color:var(--text-muted)">${escH(r.macroprogetto)}</td>
      <td style="color:var(--text-muted)">${escH(r.progetto)}</td>
      <td style="font-weight:600">${escH(el.titolo)}</td>
      <td class="cell-tipo">
        <span style="background:${colore}22;color:${colore};font-size:.62rem;font-weight:700;
          padding:2px 7px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">
          ${el.tipo}
        </span>
      </td>
      <td class="cell-prio">
        <span style="color:${pColore};font-size:.72rem;font-weight:600">${el.priorita}</span>
      </td>
      <td class="cell-stato">
        <span style="font-size:.68rem;color:var(--text-secondary)">${el.stato || '—'}</span>
      </td>
      <td class="cell-data">${dataScad}</td>
      <td class="cell-data">${dataMod}</td>
      <td class="cell-azioni">
        <div class="table-azioni">
          <button class="table-action-btn" data-tbl-action="modifica" data-id="${el.id}" title="Modifica">✏️</button>
          <button class="table-action-btn danger" data-tbl-action="elimina" data-id="${el.id}" title="Elimina">🗑️</button>
        </div>
      </td>
    </tr>`;
}

function dataRel(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'ora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h/24)}g`;
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
