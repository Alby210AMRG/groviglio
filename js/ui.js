/* ============================================================
   Groviglio – ui.js
   Gestione completa UI: viste, modal, filtri, tema
   ============================================================ */

import {
  getElementi, creaElemento, aggiornaElemento, eliminaElemento,
  cercaElementi, contaElementi, buildAlbero,
  getImpostazione, setImpostazione, resetDB
} from './db.js';
import { initGrafo, aggiornaGrafo, evidenziaNodo } from './graph.js';
import { initChat, populaListaContesto, setProvider, testaConnessioni, formattaInMarkdown, getProviderStatus } from './ai.js';
import { esportaJSON, importaJSON } from './export.js';
import { backupManuale, setFrequenzaBackup } from './backup.js';
import { VERSIONE_LOCALE } from './updater.js';
import { log, logModifica, getLog, getUltimeModifiche, cancellaLog, logComeTesto, renderLogHTML, renderUltimeModHTML } from './logger.js';
import { initTreeView, renderAlbero } from './tree.js';
import { initTableView, renderTabella } from './tableview.js';
import { getIcona, renderIconPicker, TIPO_ICONA_DEFAULT } from './icons.js';

/* ─── Stato globale UI ────────────────────────────────────── */
const stato = {
  vistaAttiva: 'elenco',
  filtri: { tipo: '', priorita: '', tag: '', query: '' },
  ordinamento: 'updatedAt_desc',
  elementi: [],
  elementoAperto: null,
};

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
export async function initUI() {
  await applicaTema();
  await applicaFontSize();
  setupNavigation();
  setupSidebar();
  setupToast();

  // Init tree e table view
  initTreeView({
    apriElemento: apriDettaglio,
    apriModalModifica,
    eliminaElemento: async (id) => {
      const el = stato.elementi.find(e => e.id === id);
      if (el) { logModifica(el, 'elimina'); await eliminaElemento(id); }
      stato.elementi = await getElementi();
      await aggiornaBadgeSidebar();
    },
  });
  initTableView({
    apriElemento: apriDettaglio,
    apriModalModifica,
    eliminaElemento: async (id) => {
      const el = stato.elementi.find(e => e.id === id);
      if (el) { logModifica(el, 'elimina'); await eliminaElemento(id); }
      stato.elementi = await getElementi();
      await aggiornaBadgeSidebar();
    },
  });
  stato.elementi = await getElementi();
  await aggiornaBadgeSidebar();
  log(`${stato.elementi.length} elementi caricati`, 'sistema');

  // Vista iniziale
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get('view');
  await navigaA(viewParam || 'elenco');

  // Gestisci azioni da URL (shortcut)
  const action = urlParams.get('action');
  const type   = urlParams.get('type');
  if (action === 'new') apriModalNuovo(type || 'nota');

  // Ascolto eventi personalizzati dal grafo
  document.addEventListener('apriElemento', (e) => apriDettaglio(e.detail));
  document.addEventListener('focusNodo', (e) => {
    const { evidenziaNodo: ev } = require('./graph.js');
    ev(e.detail);
  });

  // Nascondi splash
  setTimeout(() => {
    document.getElementById('splash')?.classList.add('hide');
  }, 800);
}

/* ═══════════════════════════════════════════════════════════
   NAVIGAZIONE
═══════════════════════════════════════════════════════════ */
function setupNavigation() {
  // Sidebar nav items
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => navigaA(el.dataset.view));
  });

  // Bottom nav
  document.querySelectorAll('[data-bnav]').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.bnav;
      if (target === 'crea') { apriBottomSheetCrea(); return; }
      navigaA(target);
    });
  });
}

export async function navigaA(vista) {
  stato.vistaAttiva = vista;

  // Aggiorna nav attivi
  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === vista);
  });
  document.querySelectorAll('[data-bnav]').forEach(el => {
    el.classList.toggle('active', el.dataset.bnav === vista);
  });

  // Aggiorna topbar
  const titles = {
    elenco:       'Tutti gli elementi',
    grafo:        'Vista Grafo',
    chat:         'Chat AI',
    impostazioni: 'Impostazioni',
  };
  const topbarTitle = document.querySelector('.topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[vista] || vista;

  // Mostra vista
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(`view-${vista}`);
  if (viewEl) viewEl.classList.add('active');

  // Carica contenuto vista
  switch (vista) {
    case 'elenco':       await renderElenco(); break;
    case 'grafo':        await renderGrafo(); break;
    case 'chat':         await renderChat(); break;
    case 'albero':       await renderAlbero(); break;
    case 'tabella':      await renderTabella(); break;
    case 'impostazioni': await renderImpostazioni(); break;
  }

  // Chiudi sidebar mobile
  chiudiSidebarMobile();
}

/* ═══════════════════════════════════════════════════════════
   VISTA ELENCO
═══════════════════════════════════════════════════════════ */
async function renderElenco() {
  let elementi = await getElementiFiltrati();
  const container = document.getElementById('cards-container');
  if (!container) return;

  if (!elementi.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗂️</div>
        <div class="empty-state-title">Nessun elemento trovato</div>
        <div class="empty-state-sub">
          ${stato.filtri.query || stato.filtri.tipo ?
            'Prova a modificare i filtri di ricerca.' :
            'Crea la tua prima nota, idea, progetto o task!'}
        </div>
        ${!stato.filtri.query && !stato.filtri.tipo ?
          `<button class="btn btn-primary" onclick="window.UI.apriModalNuovo('nota')">
             + Crea primo elemento
           </button>` : ''}
      </div>`;
    return;
  }

  container.innerHTML = elementi.map(el => cardHTML(el)).join('');

  // Event delegation click card
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-checkbox')) return;
      apriDettaglio(card.dataset.id);
    });
  });

  // Checkbox task
  container.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = cb.closest('.card').dataset.id;
      const el = stato.elementi.find(e => e.id === id);
      if (!el) return;
      const aggiornato = await aggiornaElemento(id, { completato: !el.completato });
      stato.elementi = stato.elementi.map(e => e.id === id ? aggiornato : e);
      cb.classList.toggle('done', aggiornato.completato);
      cb.textContent = aggiornato.completato ? '✓' : '';
    });
  });
}

function cardHTML(el) {
  const dataRel = dataRelativa(el.updatedAt);
  const nCollegamenti = el.collegamenti?.length || 0;
  const icona = getIcona(el);
  const padre = el.parentId ? stato.elementi.find(e => e.id === el.parentId) : null;

  let statoHTML = '';
  if (el.tipo === 'progetto' || el.tipo === 'idea') {
    const cls = `stato-${el.stato}`;
    const lbl = {
      attivo:'Attivo', pausato:'Pausato', concluso:'Concluso',
      bozza:'Bozza', sviluppo:'In sviluppo', realizzata:'Realizzata'
    }[el.stato] || el.stato;
    statoHTML = `<span class="stato-badge ${cls}">${lbl}</span>`;
  }

  const checkboxHTML = el.tipo === 'task' ? `
    <div class="card-checkbox ${el.completato ? 'done' : ''}">
      ${el.completato ? '✓' : ''}
    </div>` : '';

  const tagsHTML = el.tag.slice(0, 3)
    .map(t => `<span class="tag">#${t}</span>`)
    .join('');

  const breadcrumbHTML = padre ? `
    <div style="font-size:.62rem;color:var(--text-muted);margin-bottom:2px;
      display:flex;align-items:center;gap:4px">
      <span>${getIcona(padre)}</span>
      <span>${escapeHTML(padre.titolo)}</span>
      <span>›</span>
    </div>` : '';

  return `
    <div class="card" data-id="${el.id}" data-type="${el.tipo}">
      ${breadcrumbHTML}
      <div class="card-header">
        ${checkboxHTML}
        <div class="card-type-icon">${icona}</div>
        <div class="card-title ${el.completato ? 'done-text' : ''}">${escapeHTML(el.titolo)}</div>
        <div class="card-priority priority-${el.priorita}"></div>
      </div>
      ${el.descrizione ? `
        <div class="card-desc">${escapeHTML(
          el.descrizione.replace(/[#*`_~\[\]]/g, '').substring(0, 200)
        )}</div>` : ''}
      <div class="card-footer">
        ${tagsHTML}
        ${statoHTML}
        <div class="card-meta">
          ${nCollegamenti > 0 ? `<span class="card-links-count">🔗 ${nCollegamenti}</span>` : ''}
          <span>${dataRel}</span>
        </div>
      </div>
    </div>`;
}

async function getElementiFiltrati() {
  let elementi = [...stato.elementi];

  // Ricerca testuale
  if (stato.filtri.query) {
    const q = stato.filtri.query.toLowerCase();
    elementi = elementi.filter(e =>
      e.titolo.toLowerCase().includes(q) ||
      e.descrizione.toLowerCase().includes(q) ||
      e.tag.some(t => t.toLowerCase().includes(q))
    );
  }

  // Tipo
  if (stato.filtri.tipo) {
    elementi = elementi.filter(e => e.tipo === stato.filtri.tipo);
  }

  // Priorità
  if (stato.filtri.priorita) {
    elementi = elementi.filter(e => e.priorita === stato.filtri.priorita);
  }

  // Ordinamento
  const [campo, dir] = stato.ordinamento.split('_');
  elementi.sort((a, b) => {
    let va = a[campo], vb = b[campo];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });

  return elementi;
}

/* ═══════════════════════════════════════════════════════════
   TOOLBAR FILTRI
═══════════════════════════════════════════════════════════ */
export function setupFiltri() {
  // Ricerca
  const searchGlobal = document.getElementById('search-global');
  if (searchGlobal) {
    let searchTimeout;
    searchGlobal.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      stato.filtri.query = e.target.value;
      searchTimeout = setTimeout(() => {
        if (stato.vistaAttiva === 'elenco') renderElenco();
      }, 200);
    });
  }

  // Chip tipo
  document.querySelectorAll('.chip[data-filter-tipo]').forEach(chip => {
    chip.addEventListener('click', () => {
      const tipo = chip.dataset.filterTipo;
      stato.filtri.tipo = stato.filtri.tipo === tipo ? '' : tipo;
      document.querySelectorAll('.chip[data-filter-tipo]').forEach(c =>
        c.classList.toggle('active', c.dataset.filterTipo === stato.filtri.tipo)
      );
      if (stato.vistaAttiva === 'elenco') renderElenco();
    });
  });

  // Ordinamento
  const selectOrd = document.getElementById('select-ordinamento');
  if (selectOrd) {
    selectOrd.addEventListener('change', (e) => {
      stato.ordinamento = e.target.value;
      if (stato.vistaAttiva === 'elenco') renderElenco();
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   VISTA GRAFO
═══════════════════════════════════════════════════════════ */
async function renderGrafo() {
  stato.elementi = await getElementi();
  initGrafo(stato.elementi, apriDettaglio);
}

/* ═══════════════════════════════════════════════════════════
   VISTA CHAT
═══════════════════════════════════════════════════════════ */
async function renderChat() {
  await initChat();
  await populaListaContesto(stato.elementi);
}

/* ═══════════════════════════════════════════════════════════
   MODAL DETTAGLIO
═══════════════════════════════════════════════════════════ */
export async function apriDettaglio(id) {
  const el = stato.elementi.find(e => e.id === id);
  if (!el) return;

  stato.elementoAperto = el;

  const overlay = document.getElementById('modal-dettaglio');
  const body    = document.getElementById('modal-dettaglio-body');
  if (!overlay || !body) return;

  body.innerHTML = renderDettaglio(el);
  overlay.classList.add('open');

  // Setup azioni dettaglio
  document.getElementById('btn-modifica-el')?.addEventListener('click', () => {
    overlay.classList.remove('open');
    apriModalModifica(el);
  });

  document.getElementById('btn-elimina-el')?.addEventListener('click', async () => {
    if (confirm(`Eliminare "${el.titolo}"? Questa azione non è reversibile.`)) {
      logModifica(el, 'elimina');
      await eliminaElemento(el.id);
      stato.elementi = stato.elementi.filter(e => e.id !== el.id);
      overlay.classList.remove('open');
      await aggiornaBadgeSidebar();
      if (stato.vistaAttiva === 'grafo') aggiornaGrafo(stato.elementi);
      else renderElenco();
      mostraToast(`🗑️ "${el.titolo}" eliminato`, 'info');
    }
  });

  // Lightbox immagini
  body.querySelectorAll('.detail-image').forEach(imgEl => {
    imgEl.addEventListener('click', () => {
      const src = imgEl.querySelector('img')?.src;
      if (src) apriLightbox(src);
    });
  });

  // Nodi collegati → apri
  body.querySelectorAll('.connected-node-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.classList.remove('open');
      apriDettaglio(chip.dataset.id);
    });
  });
}

function renderDettaglio(el) {
  const mdContent = window.marked
    ? window.marked.parse(el.descrizione || '')
    : escapeHTML(el.descrizione || '');

  const immaginiHTML = el.immagini?.length ? `
    <div class="detail-section-title">📎 Immagini</div>
    <div class="detail-images">
      ${el.immagini.map(img => `
        <div class="detail-image">
          <img src="${img.data}" alt="${escapeHTML(img.nome || 'immagine')}" loading="lazy">
        </div>`).join('')}
    </div>` : '';

  const collegamentiHTML = el.collegamenti?.length ? `
    <div class="detail-section-title">🔗 Elementi collegati</div>
    <div class="connected-nodes">
      ${el.collegamenti.map(cId => {
        const cEl = stato.elementi.find(e => e.id === cId);
        if (!cEl) return '';
        return `<div class="connected-node-chip" data-id="${cId}">
          ${tipoIcon(cEl.tipo)} ${escapeHTML(cEl.titolo)}
        </div>`;
      }).join('')}
    </div>` : '';

  let extraHTML = '';
  if (el.tipo === 'task' || el.tipo === 'progetto') {
    if (el.scadenza) {
      extraHTML += `<span>📅 Scade: ${new Date(el.scadenza).toLocaleDateString('it-IT')}</span>`;
    }
  }

  return `
    <div class="detail-view">
      <div class="detail-header">
        <div class="card-type-icon detail-type-badge"
          style="background:${tipoColore(el.tipo)}22;width:44px;height:44px;font-size:1.2rem">
          ${tipoIcon(el.tipo)}
        </div>
        <div>
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;
            letter-spacing:.08em;color:${tipoColore(el.tipo)};margin-bottom:4px">
            ${el.tipo}
          </div>
          <h1 class="detail-title">${escapeHTML(el.titolo)}</h1>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-shrink:0">
          <button id="btn-modifica-el" class="btn btn-secondary">✏️ Modifica</button>
          <button id="btn-elimina-el" class="btn btn-danger">🗑️</button>
        </div>
      </div>

      <div class="detail-meta-row">
        <span class="tag">#${el.tipo}</span>
        <span class="priority-btn stato-${el.priorita}"
          style="padding:2px 8px;border-radius:99px;font-size:.65rem;font-weight:600;
            background:var(--surface-3);color:var(--text-muted)">
          ${el.priorita}
        </span>
        ${el.stato ? `<span class="stato-badge stato-${el.stato}">${el.stato}</span>` : ''}
        ${extraHTML}
        ${el.tag.map(t => `<span class="tag">#${t}</span>`).join('')}
        <span style="margin-left:auto">
          Creato ${dataRelativa(el.createdAt)} · 
          Modificato ${dataRelativa(el.updatedAt)}
        </span>
      </div>

      ${el.descrizione ? `
        <div class="detail-content">${mdContent}</div>` : ''}

      ${immaginiHTML}
      ${collegamentiHTML}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   MODAL CREA / MODIFICA
═══════════════════════════════════════════════════════════ */
export function apriModalNuovo(tipo = 'nota') {
  apriModalForm({ tipo, titolo: '', descrizione: '', tag: [], priorita: 'media', immagini: [], collegamenti: [] }, false);
}

export function apriModalModifica(el) {
  apriModalForm(el, true);
}

function apriModalForm(el, isModifica) {
  const overlay = document.getElementById('modal-form');
  const body    = document.getElementById('modal-form-body');
  const footer  = document.getElementById('modal-form-footer');
  const title   = document.getElementById('modal-form-title');
  if (!overlay || !body) return;

  if (title) title.textContent = isModifica ? `Modifica ${el.tipo}` : 'Nuovo elemento';

  // Ricrea il corpo del form (HTML fresco)
  body.innerHTML = formHTML(el);

  // ⚠️ FIX CRITICO: clona il bottone Salva per eliminare TUTTI i listener accumulati
  // (ogni apertura del modal aggiungeva un nuovo listener → duplicazione elementi)
  const btnVecchio = document.getElementById('btn-salva-form');
  if (btnVecchio) {
    const btnNuovo = btnVecchio.cloneNode(true);
    btnVecchio.parentNode.replaceChild(btnNuovo, btnVecchio);
  }

  setupFormListeners(el, isModifica);
  overlay.classList.add('open');
}

function formHTML(el) {
  const tagsStr = (el.tag || []).join(' ');
  const mdBtnStyle = `
    background:var(--surface-3);border:1px solid var(--border);
    color:var(--text-secondary);cursor:pointer;font-family:var(--font-ui);
    font-size:.7rem;padding:3px 7px;border-radius:4px;
    transition:all var(--transition);line-height:1.4
  `.replace(/\s+/g,' ');

  const immaginiHTML = (el.immagini || []).map((img, i) => `
    <div class="image-thumb" data-index="${i}">
      <img src="${img.data}" alt="img">
      <button class="image-thumb-remove" data-remove="${i}">✕</button>
    </div>`).join('');

  const collegamentiHTML = (el.collegamenti || []).map(cId => {
    const cEl = stato.elementi.find(e => e.id === cId);
    if (!cEl) return '';
    return `<div class="link-item" data-id="${cId}">
      ${tipoIcon(cEl.tipo)} <span>${escapeHTML(cEl.titolo)}</span>
      <button class="link-item-remove" data-id="${cId}">✕</button>
    </div>`;
  }).join('');

  return `
    <!-- Icona + Tipo -->
    <div class="form-field">
      <div class="form-label">Icona & Tipo</div>
      <div style="display:flex;align-items:center;gap:12px">
        <!-- Icon picker -->
        <div id="icon-picker-container"></div>
        <!-- Tipo selector -->
        <div class="type-selector" style="flex:1">
          ${['nota','idea','progetto','task'].map(t => `
            <button class="type-btn ${el.tipo === t ? 'active' : ''}" data-type="${t}">
              <span class="type-btn-icon">${TIPO_ICONA_DEFAULT[t]}</span>
              ${t.charAt(0).toUpperCase() + t.slice(1)}
            </button>`).join('')}
        </div>
      </div>
    </div>

    <!-- Titolo -->
    <div class="form-field">
      <label class="form-label" for="f-titolo">Titolo</label>
      <input id="f-titolo" class="form-input" type="text"
        placeholder="Titolo elemento…" value="${escapeHTML(el.titolo || '')}" autocomplete="off">
    </div>

    <!-- Descrizione (markdown) -->
    <div class="form-field">
      <div class="form-label">Descrizione</div>

      <!-- Toolbar Markdown -->
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;
        background:var(--surface-2);border:1px solid var(--border);
        border-radius:var(--radius-sm) var(--radius-sm) 0 0;
        padding:5px 8px;border-bottom:none">

        <button type="button" class="md-tool-btn" data-md="**testo in grassetto**" data-sel="testo in grassetto"
          title="Grassetto (Ctrl+B)" style="${mdBtnStyle}"><b>B</b></button>
        <button type="button" class="md-tool-btn" data-md="_testo in corsivo_" data-sel="testo in corsivo"
          title="Corsivo (Ctrl+I)" style="${mdBtnStyle}"><i>I</i></button>
        <button type="button" class="md-tool-btn" data-md="# Titolo" data-sel="Titolo"
          title="Titolo H1" style="${mdBtnStyle}">H1</button>
        <button type="button" class="md-tool-btn" data-md="## Titolo" data-sel="Titolo"
          title="Titolo H2" style="${mdBtnStyle}">H2</button>

        <div style="width:1px;height:16px;background:var(--border);margin:0 2px"></div>

        <button type="button" class="md-tool-btn" data-md="- elemento lista" data-sel="elemento lista"
          title="Lista" style="${mdBtnStyle}">≡</button>
        <button type="button" class="md-tool-btn" data-md="1. elemento lista" data-sel="elemento lista"
          title="Lista numerata" style="${mdBtnStyle}">1.</button>
        <button type="button" class="md-tool-btn" data-md="- [ ] task da fare" data-sel="task da fare"
          title="Checklist" style="${mdBtnStyle}">☐</button>

        <div style="width:1px;height:16px;background:var(--border);margin:0 2px"></div>

        <button type="button" class="md-tool-btn" data-md="\`codice\`" data-sel="codice"
          title="Codice inline" style="${mdBtnStyle}">&lt;/&gt;</button>
        <button type="button" class="md-tool-btn" data-md="[testo](url)" data-sel="testo"
          title="Link" style="${mdBtnStyle}">🔗</button>
        <button type="button" class="md-tool-btn" data-md="> citazione" data-sel="citazione"
          title="Citazione" style="${mdBtnStyle}">"</button>

        <div style="flex:1"></div>

        <button type="button" id="btn-md-help"
          title="Aiuto Markdown"
          style="${mdBtnStyle};background:var(--accent-blue-dim);color:var(--accent-blue);
            border-color:var(--accent-blue);font-weight:700">?</button>

        <button type="button" id="btn-md-import"
          title="Importa file .md"
          style="${mdBtnStyle}">📂</button>
        <input type="file" id="f-md-file" accept=".md,.txt,text/markdown,text/plain" style="display:none">

        <button type="button" id="btn-md-ai"
          title="Formatta con AI"
          style="${mdBtnStyle};background:linear-gradient(135deg,var(--accent-blue),var(--accent-orange));
            color:#fff;border:none;font-weight:700;padding:3px 10px;letter-spacing:.01em">
          ✨ AI
        </button>
      </div>

      <!-- Panel AI inline -->
      <div id="md-ai-panel" style="
        display:none;
        background:var(--surface-2);
        border:1px solid var(--accent-blue);
        border-top:none;
        border-radius:0;
        padding:12px 14px;
        display:none;
        flex-direction:column;
        gap:10px;
      ">
        <!-- Header panel -->
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:.72rem;font-weight:700;color:var(--text-primary)">
            ✨ Formatta con AI
          </span>
          <div id="ai-panel-provider" style="
            display:flex;align-items:center;gap:5px;
            background:var(--surface-3);border-radius:99px;
            padding:2px 8px;font-size:.65rem;color:var(--text-secondary)
          ">
            <span id="ai-panel-avatar">🤖</span>
            <span id="ai-panel-label">Caricamento…</span>
          </div>
          <button type="button" id="btn-ai-panel-close" style="
            margin-left:auto;background:none;border:none;
            color:var(--text-muted);cursor:pointer;font-size:.85rem;
            padding:2px 6px;border-radius:4px;
          ">✕</button>
        </div>

        <!-- Testo da formattare -->
        <div>
          <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px">
            📝 Testo da formattare
          </div>
          <textarea id="ai-panel-input" rows="4" style="
            width:100%;background:var(--input-bg);border:1px solid var(--input-border);
            border-radius:var(--radius-sm);padding:8px 10px;
            font-family:var(--font-ui);font-size:.8rem;color:var(--text-primary);
            resize:vertical;outline:none;transition:border-color var(--transition);
          " placeholder="Scrivi il testo qui oppure verrà usato quello già presente nell'editor…"></textarea>
        </div>

        <!-- Istruzioni opzionali -->
        <div>
          <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px">
            💬 Istruzioni aggiuntive <span style="font-weight:400;text-transform:none">(opzionali)</span>
          </div>
          <input type="text" id="ai-panel-istruzioni" style="
            width:100%;background:var(--input-bg);border:1px solid var(--input-border);
            border-radius:var(--radius-sm);padding:7px 10px;
            font-family:var(--font-ui);font-size:.8rem;color:var(--text-primary);
            outline:none;transition:border-color var(--transition);
          " placeholder="es. 'aggiungi titoli', 'formatta come lista', 'rendilo più formale'…">
        </div>

        <!-- Bottone genera -->
        <div style="display:flex;justify-content:flex-end">
          <button type="button" id="btn-ai-genera" style="
            background:linear-gradient(135deg,var(--accent-blue),var(--accent-orange));
            color:#fff;border:none;border-radius:var(--radius-sm);
            padding:8px 18px;font-family:var(--font-ui);font-size:.8rem;
            font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;
            transition:opacity var(--transition),transform var(--transition);
            box-shadow:0 3px 12px rgba(79,123,247,.3);
          ">
            <span id="ai-genera-icon">✨</span>
            <span id="ai-genera-label">Genera</span>
          </button>
        </div>

        <!-- Anteprima risultato (nascosta finché non c'è output) -->
        <div id="ai-panel-preview-wrap" style="display:none">
          <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px">
            👁️ Anteprima risultato
          </div>

          <!-- Raw Markdown -->
          <div id="ai-panel-raw" style="
            background:var(--surface-3);border:1px solid var(--border);
            border-radius:var(--radius-sm) var(--radius-sm) 0 0;
            padding:10px 12px;font-size:.78rem;
            font-family:var(--font-mono);color:var(--text-secondary);
            max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;
          "></div>

          <!-- Preview renderizzata -->
          <div id="ai-panel-rendered" style="
            background:var(--input-bg);border:1px solid var(--border);border-top:none;
            border-radius:0 0 var(--radius-sm) var(--radius-sm);
            padding:10px 12px;font-size:.8rem;line-height:1.65;
            max-height:160px;overflow-y:auto;
          "></div>

          <!-- Azioni -->
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button type="button" id="btn-ai-sostituisci" class="btn btn-primary" style="font-size:.75rem;padding:6px 14px">
              ✅ Sostituisci
            </button>
            <button type="button" id="btn-ai-aggiungi" class="btn btn-secondary" style="font-size:.75rem;padding:6px 14px">
              ➕ Aggiungi in fondo
            </button>
            <button type="button" id="btn-ai-rigenera" class="btn btn-ghost" style="font-size:.75rem;padding:6px 14px">
              🔄 Rigenera
            </button>
            <button type="button" id="btn-ai-annulla" class="btn btn-ghost" style="font-size:.75rem;padding:6px 14px;margin-left:auto">
              ✕ Annulla
            </button>
          </div>
        </div>

        <!-- Messaggio errore -->
        <div id="ai-panel-error" style="
          display:none;background:rgba(240,101,121,.1);border:1px solid var(--danger);
          border-radius:var(--radius-sm);padding:8px 12px;
          font-size:.75rem;color:var(--danger);
        "></div>
      </div>

      <!-- Cheatsheet collassabile -->
      <div id="md-cheatsheet" style="
        display:none;background:var(--surface-2);
        border:1px solid var(--border);border-bottom:none;
        padding:10px 12px;font-size:.72rem;
        border-radius:0;
      ">
        <div style="font-weight:700;color:var(--text-secondary);margin-bottom:8px">
          📖 Guida rapida Markdown
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;color:var(--text-muted);line-height:1.8">
          <div><code style="color:var(--accent-blue)">**testo**</code> → <b>grassetto</b></div>
          <div><code style="color:var(--accent-blue)">_testo_</code> → <em>corsivo</em></div>
          <div><code style="color:var(--accent-blue)"># Titolo</code> → Titolo grande</div>
          <div><code style="color:var(--accent-blue)">## Titolo</code> → Titolo medio</div>
          <div><code style="color:var(--accent-blue)">- voce</code> → • lista</div>
          <div><code style="color:var(--accent-blue)">1. voce</code> → 1. numerata</div>
          <div><code style="color:var(--accent-blue)">- [ ] task</code> → ☐ checklist</div>
          <div><code style="color:var(--accent-blue)">[testo](url)</code> → link</div>
          <div><code style="color:var(--accent-blue)">\`codice\`</code> → <code>codice</code></div>
          <div><code style="color:var(--accent-blue)">&gt; testo</code> → citazione</div>
        </div>
        <div style="margin-top:8px;color:var(--text-muted);font-size:.65rem">
          💡 Usa il tab "Anteprima" per vedere il risultato prima di salvare
        </div>
      </div>

      <!-- Tab scrivi/anteprima -->
      <div class="md-editor-tabs">
        <button class="md-tab active" data-tab="edit">Scrivi</button>
        <button class="md-tab" data-tab="preview">Anteprima</button>
      </div>
      <textarea id="f-desc" class="form-textarea" placeholder="Descrivi qui… usa i bottoni sopra o scrivi direttamente in Markdown."
        style="border-radius:0 0 var(--radius-sm) var(--radius-sm);border-top:none"
        >${escapeHTML(el.descrizione || '')}</textarea>
      <div id="f-desc-preview" class="md-preview" style="display:none;
        border-radius:0 0 var(--radius-sm) var(--radius-sm)">
        ${window.marked ? window.marked.parse(el.descrizione || '') : (el.descrizione || '')}
      </div>
    </div>

    <!-- Priorità -->
    <div class="form-field">
      <div class="form-label">Priorità</div>
      <div class="priority-selector">
        ${['bassa','media','alta'].map(p => `
          <button class="priority-btn ${el.priorita === p ? 'active' : ''}" data-priority="${p}">
            ${{bassa:'🟢 Bassa', media:'🟡 Media', alta:'🔴 Alta'}[p]}
          </button>`).join('')}
      </div>
    </div>

    <!-- Stato (condizionale) -->
    <div class="form-field" id="f-stato-wrap" style="display:${el.tipo !== 'nota' ? 'flex' : 'none'}">
      <label class="form-label" for="f-stato">Stato</label>
      <select id="f-stato" class="form-select">
        ${getOpzioniStato(el.tipo).map(s =>
          `<option value="${s.val}" ${el.stato === s.val ? 'selected' : ''}>${s.lbl}</option>`
        ).join('')}
      </select>
    </div>

    <!-- Scadenza (task/progetto) -->
    <div class="form-field" id="f-scadenza-wrap"
      style="display:${['task','progetto'].includes(el.tipo) ? 'flex' : 'none'}">
      <label class="form-label" for="f-scadenza">Scadenza</label>
      <input id="f-scadenza" class="form-input" type="date"
        value="${el.scadenza ? el.scadenza.split('T')[0] : ''}">
    </div>

    <!-- Tag -->
    <div class="form-field">
      <div class="form-label">Tag</div>
      <div class="tags-input-wrap" id="tags-container">
        ${(el.tag || []).map(t => `
          <div class="tag-chip">
            #${t}<span class="tag-chip-remove" data-tag="${t}">×</span>
          </div>`).join('')}
        <input class="tags-input" id="f-tag-input" placeholder="Aggiungi tag…" autocomplete="off">
      </div>
    </div>

    <!-- Immagini -->
    <div class="form-field">
      <div class="form-label">Immagini</div>
      <div class="images-grid" id="images-container">
        ${immaginiHTML}
        <div class="image-upload-btn" id="btn-upload-img">
          <span style="font-size:1.2rem">📎</span>
          <span>Aggiungi</span>
        </div>
      </div>
      <input type="file" id="f-img-input" accept="image/*" multiple style="display:none">
      <div style="font-size:.65rem;color:var(--text-muted);margin-top:4px">
        Max 5MB per immagine · Compressione automatica
      </div>
    </div>

    <!-- Genitore (parentId) -->
    <div class="form-field">
      <div class="form-label">Genitore <span style="color:var(--text-muted);font-weight:400;font-size:.65rem">(opzionale — per gerarchia)</span></div>
      <div id="parent-selector-container">
        <!-- Popolato da JS -->
      </div>
    </div>

    <!-- Collegamento ad altri elementi -->
    <div class="form-field">
      <div class="form-label">Collega ad altri elementi</div>
      <input class="form-input" id="f-link-search" placeholder="Cerca elemento da collegare…" autocomplete="off">
      <div id="link-suggestions" style="display:none;background:var(--surface-2);
        border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:4px;
        max-height:150px;overflow-y:auto"></div>
      <div class="links-list" id="links-container" style="margin-top:8px">
        ${collegamentiHTML}
      </div>
    </div>
  `;
}

function getOpzioniStato(tipo) {
  switch (tipo) {
    case 'progetto': return [
      { val: 'attivo', lbl: '🟢 Attivo' },
      { val: 'pausato', lbl: '⏸️ Pausato' },
      { val: 'concluso', lbl: '✅ Concluso' },
    ];
    case 'idea': return [
      { val: 'bozza', lbl: '📝 Bozza' },
      { val: 'sviluppo', lbl: '⚡ In sviluppo' },
      { val: 'realizzata', lbl: '✨ Realizzata' },
    ];
    case 'task': return [
      { val: 'da_fare', lbl: '⬜ Da fare' },
      { val: 'in_corso', lbl: '🔄 In corso' },
      { val: 'fatto', lbl: '✅ Fatto' },
    ];
    default: return [{ val: 'null', lbl: 'Nessuno' }];
  }
}

function setupFormListeners(elOrigine, isModifica) {
  // Stato form corrente
  const formState = {
    tipo:        elOrigine.tipo || 'nota',
    immagini:    [...(elOrigine.immagini || [])],
    tag:         [...(elOrigine.tag || [])],
    collegamenti:[...(elOrigine.collegamenti || [])],
    priorita:    elOrigine.priorita || 'media',
    icona:       elOrigine.icona || null,
    parentId:    elOrigine.parentId || null,
  };

  // ── Icon picker ─────────────────────────────────────────
  const iconPickerCont = document.getElementById('icon-picker-container');
  if (iconPickerCont) {
    renderIconPicker(iconPickerCont, formState.icona, (nuovaIcona) => {
      formState.icona = nuovaIcona;
    });
  }

  // ── Import .md ──────────────────────────────────────────
  document.getElementById('btn-md-import')?.addEventListener('click', () => {
    document.getElementById('f-md-file')?.click();
  });
  document.getElementById('f-md-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const testo = await file.text();
    const textarea = document.getElementById('f-desc');
    if (textarea) {
      const sep = textarea.value.trim() ? '\n\n' : '';
      textarea.value += sep + testo;
    }
    mostraToast(`✅ Importato: ${file.name}`, 'success');
    e.target.value = '';
  });

  // ── Parent selector ─────────────────────────────────────
  const parentCont = document.getElementById('parent-selector-container');
  if (parentCont) {
    setupParentSelector(parentCont, formState, elOrigine.id);
  }

  // ── Pulsante AI Markdown ────────────────────────────────
  const btnAI     = document.getElementById('btn-md-ai');
  const aiPanel   = document.getElementById('md-ai-panel');
  const btnClose  = document.getElementById('btn-ai-panel-close');
  const btnGenera = document.getElementById('btn-ai-genera');
  const aiInput   = document.getElementById('ai-panel-input');
  const aiIstr    = document.getElementById('ai-panel-istruzioni');
  const previewW  = document.getElementById('ai-panel-preview-wrap');
  const rawEl     = document.getElementById('ai-panel-raw');
  const rendEl    = document.getElementById('ai-panel-rendered');
  const errEl     = document.getElementById('ai-panel-error');

  let _ultimoRisultato = '';

  // Apri/chiudi panel
  btnAI?.addEventListener('click', async () => {
    if (!aiPanel) return;
    const isOpen = aiPanel.style.display === 'flex';

    if (isOpen) {
      aiPanel.style.display = 'none';
      return;
    }

    // Precompila con testo esistente nell'editor
    const textarea = document.getElementById('f-desc');
    if (aiInput && textarea?.value.trim()) {
      aiInput.value = textarea.value;
    }

    // Mostra provider attivo
    const status = await getProviderStatus();
    const avatarEl = document.getElementById('ai-panel-avatar');
    const labelEl  = document.getElementById('ai-panel-label');
    if (avatarEl) avatarEl.textContent = status.avatar;
    if (labelEl)  labelEl.textContent  = status.hasKey
      ? status.label
      : `${status.label} — chiave mancante`;

    // Reset preview e errore
    if (previewW)  previewW.style.display  = 'none';
    if (errEl)     errEl.style.display     = 'none';
    if (rawEl)     rawEl.textContent        = '';
    if (rendEl)    rendEl.innerHTML         = '';

    aiPanel.style.display = 'flex';
    aiInput?.focus();
  });

  // Chiudi panel
  btnClose?.addEventListener('click', () => {
    if (aiPanel) aiPanel.style.display = 'none';
  });

  // Genera — funzione riutilizzabile per il pulsante Rigenera
  async function eseguiGenerazione() {
    const testo     = aiInput?.value.trim() || '';
    const istruzioni = aiIstr?.value.trim()  || '';

    if (!testo) {
      if (errEl) {
        errEl.style.display  = '';
        errEl.textContent    = '⚠️ Inserisci del testo da formattare.';
      }
      return;
    }

    // Stato loading
    const iconEl  = document.getElementById('ai-genera-icon');
    const labelEl = document.getElementById('ai-genera-label');
    if (iconEl)  iconEl.textContent  = '';
    if (labelEl) labelEl.textContent = 'Generazione…';
    if (btnGenera) {
      btnGenera.disabled = true;
      btnGenera.style.opacity = '.6';
    }
    // Aggiunge spinner
    if (iconEl) {
      iconEl.innerHTML = '<div class="loading-spinner" style="width:13px;height:13px;border-width:2px;border-color:rgba(255,255,255,.3);border-top-color:#fff"></div>';
    }

    if (errEl)    errEl.style.display    = 'none';
    if (previewW) previewW.style.display = 'none';

    try {
      const status = await getProviderStatus();
      const risultato = await formattaInMarkdown(testo, istruzioni, status.provider);
      _ultimoRisultato = risultato;

      // Mostra raw
      if (rawEl) rawEl.textContent = risultato;

      // Mostra preview renderizzata
      if (rendEl && window.marked) {
        rendEl.innerHTML = window.marked.parse(risultato);
      } else if (rendEl) {
        rendEl.textContent = risultato;
      }

      if (previewW) previewW.style.display = '';
      log(`AI Markdown: testo formattato (${risultato.length} caratteri)`, 'ai');

    } catch (err) {
      log(`Errore AI Markdown: ${err.message}`, 'errore');
      if (errEl) {
        errEl.style.display = '';
        errEl.textContent   = `❌ ${err.message}`;
      }
    } finally {
      if (iconEl)  iconEl.textContent  = '✨';
      if (labelEl) labelEl.textContent = 'Genera';
      if (btnGenera) {
        btnGenera.disabled    = false;
        btnGenera.style.opacity = '1';
      }
    }
  }

  btnGenera?.addEventListener('click', eseguiGenerazione);

  // Rigenera (stesse istruzioni)
  document.getElementById('btn-ai-rigenera')?.addEventListener('click', eseguiGenerazione);

  // Sostituisci contenuto editor
  document.getElementById('btn-ai-sostituisci')?.addEventListener('click', () => {
    const textarea = document.getElementById('f-desc');
    if (textarea && _ultimoRisultato) {
      textarea.value = _ultimoRisultato;
      // Aggiorna anteprima MD se aperta
      const preview = document.getElementById('f-desc-preview');
      if (preview && window.marked) preview.innerHTML = window.marked.parse(_ultimoRisultato);
    }
    if (aiPanel) aiPanel.style.display = 'none';
    mostraToast('✅ Testo sostituito', 'success');
  });

  // Aggiungi in fondo
  document.getElementById('btn-ai-aggiungi')?.addEventListener('click', () => {
    const textarea = document.getElementById('f-desc');
    if (textarea && _ultimoRisultato) {
      const sep = textarea.value.trim() ? '\n\n' : '';
      textarea.value += sep + _ultimoRisultato;
      const preview = document.getElementById('f-desc-preview');
      if (preview && window.marked) preview.innerHTML = window.marked.parse(textarea.value);
    }
    if (aiPanel) aiPanel.style.display = 'none';
    mostraToast('✅ Testo aggiunto', 'success');
  });

  // Annulla
  document.getElementById('btn-ai-annulla')?.addEventListener('click', () => {
    if (previewW) previewW.style.display = 'none';
    if (rawEl)    rawEl.textContent = '';
    if (rendEl)   rendEl.innerHTML  = '';
    _ultimoRisultato = '';
  });

  // Focus styling sui campi AI
  [aiInput, aiIstr].forEach(el => {
    el?.addEventListener('focus', () => el.style.borderColor = 'var(--accent-blue)');
    el?.addEventListener('blur',  () => el.style.borderColor = 'var(--input-border)');
  });

  // ── Toolbar Markdown ────────────────────────────────────
  document.querySelectorAll('.md-tool-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--surface-hover)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'var(--surface-3)');
    btn.addEventListener('click', () => {
      const textarea = document.getElementById('f-desc');
      if (!textarea) return;

      const md  = btn.dataset.md;
      const sel = btn.dataset.sel;
      const start = textarea.selectionStart;
      const end   = textarea.selectionEnd;
      const selTxt = textarea.value.substring(start, end);

      let inserimento;
      if (selTxt && sel) {
        // Sostituisci selezione con testo selezionato wrappato
        inserimento = md.replace(sel, selTxt);
      } else {
        inserimento = md;
      }

      // Inserisci nel punto del cursore
      const before = textarea.value.substring(0, start);
      const after  = textarea.value.substring(end);
      const needsNewline = before.length > 0 && !before.endsWith('\n') &&
        (md.startsWith('#') || md.startsWith('-') || md.startsWith('1.') || md.startsWith('>'));

      textarea.value = before + (needsNewline ? '\n' : '') + inserimento + after;

      // Posiziona cursore dopo il testo inserito
      const newPos = start + (needsNewline ? 1 : 0) + inserimento.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    });
  });

  // Cheatsheet toggle
  document.getElementById('btn-md-help')?.addEventListener('click', () => {
    const cs = document.getElementById('md-cheatsheet');
    if (cs) {
      const isVisible = cs.style.display !== 'none';
      cs.style.display = isVisible ? 'none' : '';
      document.getElementById('btn-md-help').style.background =
        isVisible ? 'var(--accent-blue-dim)' : 'var(--accent-blue)';
      document.getElementById('btn-md-help').style.color =
        isVisible ? 'var(--accent-blue)' : '#fff';
    }
  });

  // Selettore tipo
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      formState.tipo = btn.dataset.type;

      // Mostra/nascondi campi condizionali
      document.getElementById('f-stato-wrap').style.display =
        formState.tipo !== 'nota' ? 'flex' : 'none';
      document.getElementById('f-scadenza-wrap').style.display =
        ['task','progetto'].includes(formState.tipo) ? 'flex' : 'none';

      // Aggiorna opzioni stato
      const statoSel = document.getElementById('f-stato');
      if (statoSel) {
        statoSel.innerHTML = getOpzioniStato(formState.tipo)
          .map(s => `<option value="${s.val}">${s.lbl}</option>`).join('');
      }
    });
  });

  // Priorità
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      formState.priorita = btn.dataset.priority;
    });
  });

  // Tabs markdown
  document.querySelectorAll('.md-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.md-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isPreview = tab.dataset.tab === 'preview';
      const textarea = document.getElementById('f-desc');
      const preview  = document.getElementById('f-desc-preview');
      if (textarea) textarea.style.display = isPreview ? 'none' : '';
      if (preview)  {
        preview.style.display = isPreview ? '' : 'none';
        if (isPreview && window.marked) {
          preview.innerHTML = window.marked.parse(textarea?.value || '');
        }
      }
    });
  });

  // Tag input
  const tagInput = document.getElementById('f-tag-input');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInput.value.trim()) {
        e.preventDefault();
        const tag = tagInput.value.trim().replace(/[, ]/g, '').toLowerCase();
        if (tag && !formState.tag.includes(tag)) {
          formState.tag.push(tag);
          const cont = document.getElementById('tags-container');
          const chip = document.createElement('div');
          chip.className = 'tag-chip';
          chip.dataset.tag = tag;
          chip.innerHTML = `#${tag}<span class="tag-chip-remove" data-tag="${tag}">×</span>`;
          cont.insertBefore(chip, tagInput);
          chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
            formState.tag = formState.tag.filter(t => t !== tag);
            chip.remove();
          });
        }
        tagInput.value = '';
      }
      if (e.key === 'Backspace' && !tagInput.value && formState.tag.length) {
        const last = document.querySelector('.tag-chip:last-of-type');
        if (last) {
          formState.tag = formState.tag.filter(t => t !== last.dataset.tag);
          last.remove();
        }
      }
    });
  }

  // Rimozione tag esistenti
  document.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      formState.tag = formState.tag.filter(t => t !== tag);
      btn.closest('.tag-chip')?.remove();
    });
  });

  // Upload immagini
  document.getElementById('btn-upload-img')?.addEventListener('click', () => {
    document.getElementById('f-img-input')?.click();
  });

  document.getElementById('f-img-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        mostraToast(`⚠️ "${file.name}" è troppo grande (max 10MB)`, 'warning');
        continue;
      }
      try {
        const compressed = await comprimeImmagine(file);
        formState.immagini.push({ nome: file.name, data: compressed });
        aggiungiThumb(compressed, file.name, formState.immagini.length - 1, formState);
      } catch (err) {
        mostraToast(`❌ Errore caricamento: ${file.name}`, 'error');
      }
    }
    e.target.value = '';
  });

  // Rimozione immagini esistenti
  document.getElementById('images-container')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.image-thumb-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.remove);
    formState.immagini.splice(idx, 1);
    btn.closest('.image-thumb')?.remove();
  });

  // Ricerca collegamenti
  const linkSearch = document.getElementById('f-link-search');
  const linkSugg   = document.getElementById('link-suggestions');
  if (linkSearch && linkSugg) {
    linkSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) { linkSugg.style.display = 'none'; return; }

      const risultati = stato.elementi.filter(el =>
        el.id !== elOrigine.id &&
        !formState.collegamenti.includes(el.id) &&
        (el.titolo.toLowerCase().includes(q) || el.tipo.toLowerCase().includes(q))
      ).slice(0, 6);

      if (!risultati.length) { linkSugg.style.display = 'none'; return; }

      linkSugg.style.display = '';
      linkSugg.innerHTML = risultati.map(el => `
        <div class="link-item" data-id="${el.id}" style="cursor:pointer">
          ${tipoIcon(el.tipo)} <span>${escapeHTML(el.titolo)}</span>
        </div>`).join('');

      linkSugg.querySelectorAll('.link-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const el = stato.elementi.find(e => e.id === id);
          if (!el || formState.collegamenti.includes(id)) return;

          formState.collegamenti.push(id);
          const cont = document.getElementById('links-container');
          const row  = document.createElement('div');
          row.className = 'link-item';
          row.dataset.id = id;
          row.innerHTML = `${tipoIcon(el.tipo)} <span>${escapeHTML(el.titolo)}</span>
            <button class="link-item-remove" data-id="${id}">✕</button>`;
          row.querySelector('.link-item-remove').addEventListener('click', () => {
            formState.collegamenti = formState.collegamenti.filter(c => c !== id);
            row.remove();
          });
          cont.appendChild(row);

          linkSearch.value = '';
          linkSugg.style.display = 'none';
        });
      });
    });
  }

  // Rimozione link esistenti
  document.getElementById('links-container')?.querySelectorAll('.link-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      formState.collegamenti = formState.collegamenti.filter(c => c !== id);
      btn.closest('.link-item')?.remove();
    });
  });

  // Salva — guard anti-doppio-click
  let _staSalvando = false;
  document.getElementById('btn-salva-form')?.addEventListener('click', async () => {
    if (_staSalvando) return; // blocca click multipli
    _staSalvando = true;

    const btnSalva = document.getElementById('btn-salva-form');
    if (btnSalva) { btnSalva.disabled = true; btnSalva.textContent = '⏳ Salvataggio…'; }

    const titolo = document.getElementById('f-titolo')?.value.trim();
    if (!titolo) {
      mostraToast('⚠️ Il titolo è obbligatorio', 'warning');
      _staSalvando = false;
      if (btnSalva) { btnSalva.disabled = false; btnSalva.textContent = '💾 Salva'; }
      return;
    }

    const dati = {
      tipo:        formState.tipo,
      titolo,
      descrizione: document.getElementById('f-desc')?.value || '',
      priorita:    formState.priorita,
      stato:       (() => { const v = document.getElementById('f-stato')?.value; return (!v || v === 'null') ? null : v; })(),
      scadenza:    document.getElementById('f-scadenza')?.value || null,
      tag:         formState.tag,
      immagini:    formState.immagini,
      collegamenti:formState.collegamenti,
      icona:       formState.icona,
      parentId:    formState.parentId,
    };

    try {
      let el;
      if (isModifica) {
        el = await aggiornaElemento(elOrigine.id, dati);
        stato.elementi = stato.elementi.map(e => e.id === el.id ? el : e);
        logModifica(el, 'modifica');
        mostraToast('✅ Elemento aggiornato', 'success');
      } else {
        el = await creaElemento(dati);
        stato.elementi.push(el);
        logModifica(el, 'crea');
        mostraToast(`✅ ${dati.tipo} creata`, 'success');
      }

      await aggiornaBadgeSidebar();
      document.getElementById('modal-form')?.classList.remove('open');

      if (stato.vistaAttiva === 'grafo') aggiornaGrafo(stato.elementi);
      else renderElenco();
    } catch (err) {
      mostraToast('❌ Errore salvataggio: ' + err.message, 'error');
      log(`Errore salvataggio elemento: ${err.message}`, 'errore');
    } finally {
      _staSalvando = false;
      const b = document.getElementById('btn-salva-form');
      if (b) { b.disabled = false; b.textContent = '💾 Salva'; }
    }
  });
}

function setupParentSelector(cont, formState, selfId) {
  const candidati = stato.elementi.filter(e => e.id !== selfId);
  let parentCorrente = candidati.find(e => e.id === formState.parentId) || null;

  function render() {
    if (parentCorrente) {
      cont.innerHTML = `
        <div class="parent-selected-chip">
          <span>${getIcona(parentCorrente)}</span>
          <span style="font-weight:600">${escapeHTML(parentCorrente.titolo)}</span>
          <span style="font-size:.65rem;color:var(--text-muted)">(${parentCorrente.tipo})</span>
          <button class="parent-clear-btn" id="btn-parent-clear" type="button">✕</button>
        </div>`;
      document.getElementById('btn-parent-clear')?.addEventListener('click', () => {
        parentCorrente = null;
        formState.parentId = null;
        render();
      });
    } else {
      cont.innerHTML = `
        <div style="display:flex;gap:8px;flex-direction:column">
          <input class="form-input" id="f-parent-search"
            placeholder="Cerca elemento genitore…" autocomplete="off"
            value="">
          <div id="f-parent-suggestions" style="display:none;background:var(--surface-2);
            border:1px solid var(--border);border-radius:var(--radius-sm);
            max-height:140px;overflow-y:auto;margin-top:-4px"></div>
        </div>`;

      const searchEl = cont.querySelector('#f-parent-search');
      const suggEl   = cont.querySelector('#f-parent-suggestions');

      searchEl?.addEventListener('input', () => {
        const q = searchEl.value.toLowerCase().trim();
        if (!q) { suggEl.style.display = 'none'; return; }
        const ris = candidati.filter(e =>
          e.titolo.toLowerCase().includes(q) || e.tipo.toLowerCase().includes(q)
        ).slice(0, 8);
        if (!ris.length) { suggEl.style.display = 'none'; return; }
        suggEl.style.display = '';
        suggEl.innerHTML = ris.map(e => `
          <div class="link-item" data-pid="${e.id}" style="cursor:pointer">
            <span>${getIcona(e)}</span>
            <span style="font-weight:600">${escapeHTML(e.titolo)}</span>
            <span style="font-size:.65rem;color:var(--text-muted);margin-left:4px">${e.tipo}</span>
          </div>`).join('');
        suggEl.querySelectorAll('.link-item').forEach(item => {
          item.addEventListener('click', () => {
            parentCorrente = candidati.find(e => e.id === item.dataset.pid);
            formState.parentId = parentCorrente?.id || null;
            render();
          });
        });
      });
    }
  }
  render();
}

function aggiungiThumb(dataSrc, nome, idx, formState) {
  const cont = document.getElementById('images-container');
  if (!cont) return;

  const thumb = document.createElement('div');
  thumb.className = 'image-thumb';
  thumb.dataset.index = idx;
  thumb.innerHTML = `
    <img src="${dataSrc}" alt="${escapeHTML(nome)}" loading="lazy">
    <button class="image-thumb-remove" data-remove="${idx}">✕</button>`;

  const btn = thumb.querySelector('.image-thumb-remove');
  btn.addEventListener('click', () => {
    formState.immagini.splice(parseInt(btn.dataset.remove), 1);
    thumb.remove();
  });

  // Inserisci prima del bottone upload
  const uploadBtn = document.getElementById('btn-upload-img');
  cont.insertBefore(thumb, uploadBtn);
}

/* ═══════════════════════════════════════════════════════════
   BOTTOM SHEET CREA (mobile)
═══════════════════════════════════════════════════════════ */
function apriBottomSheetCrea() {
  const overlay = document.getElementById('modal-tipo');
  if (overlay) overlay.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════
   IMPOSTAZIONI
═══════════════════════════════════════════════════════════ */
async function renderImpostazioni() {
  const providerAI    = await getImpostazione('providerAI', 'claude');
  const apiClaude     = await getImpostazione('apiKeyAnthropic', '');
  const apiGemini     = await getImpostazione('apiKeyGemini', '');
  const apiOpenAI     = await getImpostazione('apiKeyOpenAI', '');
  const backupFreq    = await getImpostazione('backupFrequenza', 24);
  const tema          = await getImpostazione('tema', 'dark');
  const fontSize      = await getImpostazione('fontSize', '1x');

  const cont = document.getElementById('view-impostazioni');
  if (!cont) return;

  cont.innerHTML = `
    <div class="settings-view">
      <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:20px;color:var(--text-primary)">
        ⚙️ Impostazioni
      </h2>

      <!-- Aspetto -->
      <div class="settings-section">
        <div class="settings-section-title">🎨 Aspetto</div>

        <div class="settings-item">
          <div class="settings-item-icon">🌓</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Tema</div>
            <div class="settings-item-desc">Scegli il tema dell'interfaccia</div>
          </div>
          <div class="settings-item-ctrl">
            <div class="theme-picker">
              <div class="theme-opt ${tema==='dark' ? 'active' : ''}" data-theme="dark" title="Dark"></div>
              <div class="theme-opt ${tema==='light' ? 'active' : ''}" data-theme="light" title="Light"></div>
              <div class="theme-opt ${tema==='dracula' ? 'active' : ''}" data-theme="dracula" title="Dracula"></div>
            </div>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">🔤</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Dimensione testo</div>
            <div class="settings-item-desc">1X normale, 2X più grande</div>
          </div>
          <div class="settings-item-ctrl">
            <div style="display:flex;gap:6px">
              <button class="btn ${fontSize==='1x' ? 'btn-primary' : 'btn-secondary'}"
                data-fontsize="1x" id="btn-font-1x">1X</button>
              <button class="btn ${fontSize==='2x' ? 'btn-primary' : 'btn-secondary'}"
                data-fontsize="2x" id="btn-font-2x">2X</button>
            </div>
          </div>
        </div>
      </div>

      <!-- AI -->
      <div class="settings-section">
        <div class="settings-section-title">🤖 Intelligenza Artificiale</div>

        <div class="settings-item">
          <div class="settings-item-icon">🧠</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Provider AI</div>
            <div class="settings-item-desc">Quale AI usare nella chat</div>
          </div>
          <div class="settings-item-ctrl">
            <select class="toolbar-select" id="sel-provider" style="padding:6px 12px">
              <option value="claude"  ${providerAI==='claude'  ? 'selected' : ''}>Claude</option>
              <option value="gemini"  ${providerAI==='gemini'  ? 'selected' : ''}>Gemini</option>
              <option value="chatgpt" ${providerAI==='chatgpt' ? 'selected' : ''}>ChatGPT</option>
            </select>
          </div>
        </div>

        <div class="settings-item" id="wrap-api-claude"
          style="display:${providerAI==='claude' ? 'flex' : 'flex'}">
          <div class="settings-item-icon">🟠</div>
          <div class="settings-item-info">
            <div class="settings-item-label">API Key Claude</div>
            <div class="settings-item-desc">
              <a href="https://console.anthropic.com" target="_blank"
                style="color:var(--accent-blue)">console.anthropic.com</a>
            </div>
          </div>
          <div class="settings-item-ctrl" style="flex:1;margin-left:10px">
            <input class="form-input" id="inp-api-claude" type="password"
              value="${apiClaude}" placeholder="sk-ant-…" autocomplete="off">
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">🔵</div>
          <div class="settings-item-info">
            <div class="settings-item-label">API Key Gemini</div>
            <div class="settings-item-desc">
              <a href="https://aistudio.google.com" target="_blank"
                style="color:var(--accent-blue)">aistudio.google.com</a>
            </div>
          </div>
          <div class="settings-item-ctrl" style="flex:1;margin-left:10px">
            <input class="form-input" id="inp-api-gemini" type="password"
              value="${apiGemini}" placeholder="AIza…" autocomplete="off">
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">🟢</div>
          <div class="settings-item-info">
            <div class="settings-item-label">API Key OpenAI</div>
            <div class="settings-item-desc">
              <a href="https://platform.openai.com" target="_blank"
                style="color:var(--accent-blue)">platform.openai.com</a>
            </div>
          </div>
          <div class="settings-item-ctrl" style="flex:1;margin-left:10px">
            <input class="form-input" id="inp-api-openai" type="password"
              value="${apiOpenAI}" placeholder="sk-…" autocomplete="off">
          </div>
        </div>

        <div class="settings-item">
          <div style="width:100%;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-secondary" id="btn-testa-api">🔌 Testa connessioni</button>
            <button class="btn btn-primary" id="btn-salva-api">💾 Salva chiavi API</button>
          </div>
        </div>

        <!-- Risultati test connessione -->
        <div id="test-api-risultati" style="display:none">
          <div style="padding:12px 16px;border-top:1px solid var(--border)">
            <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;
              letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px">
              Risultati test
            </div>
            <div id="test-api-lista" style="display:flex;flex-direction:column;gap:8px"></div>
          </div>
        </div>
      </div>

      <!-- Backup -->
      <div class="settings-section">
        <div class="settings-section-title">💾 Backup & Dati</div>

        <div class="settings-item">
          <div class="settings-item-icon">⏰</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Backup automatico</div>
            <div class="settings-item-desc">Notifica periodica di backup</div>
          </div>
          <div class="settings-item-ctrl">
            <select class="toolbar-select" id="sel-backup-freq" style="padding:6px 12px">
              <option value="0"  ${backupFreq==0  ? 'selected':''}>Disabilitato</option>
              <option value="1"  ${backupFreq==1  ? 'selected':''}>Ogni ora</option>
              <option value="6"  ${backupFreq==6  ? 'selected':''}>Ogni 6 ore</option>
              <option value="12" ${backupFreq==12 ? 'selected':''}>Ogni 12 ore</option>
              <option value="24" ${backupFreq==24 ? 'selected':''}>Ogni giorno</option>
              <option value="72" ${backupFreq==72 ? 'selected':''}>Ogni 3 giorni</option>
            </select>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">📤</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Esporta tutto in JSON</div>
            <div class="settings-item-desc">Scarica un backup completo</div>
          </div>
          <div class="settings-item-ctrl">
            <button class="btn btn-secondary" id="btn-export">📤 Esporta</button>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">📥</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Importa JSON</div>
            <div class="settings-item-desc">Merge intelligente dei dati</div>
          </div>
          <div class="settings-item-ctrl">
            <button class="btn btn-secondary" id="btn-import">📥 Importa</button>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-icon">🗑️</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Reset database</div>
            <div class="settings-item-desc" style="color:var(--danger)">
              Elimina tutti i dati — IRREVERSIBILE
            </div>
          </div>
          <div class="settings-item-ctrl">
            <button class="btn btn-danger" id="btn-reset">🗑️ Reset</button>
          </div>
        </div>
      </div>

      <!-- Ultime modifiche -->
      <div class="settings-section">
        <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>🕐 Ultime modifiche (${getUltimeModifiche().length}/250)</span>
        </div>
        <div id="ultime-mod-list" style="max-height:260px;overflow-y:auto">
          ${renderUltimeModHTML(getUltimeModifiche())}
        </div>
      </div>

      <!-- Log eventi -->
      <div class="settings-section">
        <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>📋 Log eventi (${getLog().length}/250)</span>
          <div style="display:flex;gap:6px">
            <button id="btn-copia-log" style="
              background:none;border:1px solid var(--border);color:var(--text-secondary);
              font-size:.65rem;cursor:pointer;font-family:var(--font-ui);padding:2px 8px;
              border-radius:4px;transition:all var(--transition)
            ">📋 Copia tutto</button>
            <button id="btn-cancella-log" style="
              background:none;border:1px solid var(--border);color:var(--text-muted);
              font-size:.65rem;cursor:pointer;font-family:var(--font-ui);padding:2px 8px;
              border-radius:4px;
            ">🗑️ Cancella</button>
          </div>
        </div>
        <div id="log-container" style="max-height:240px;overflow-y:auto">
          ${renderLogHTML(getLog(50))}
        </div>
        ${getLog().length > 50 ? `
        <div style="padding:8px 14px;border-top:1px solid var(--border)">
          <button class="btn btn-secondary" id="btn-log-tutti"
            style="width:100%;font-size:.72rem;padding:6px">
            Mostra tutte le ${getLog().length} voci
          </button>
        </div>` : ''}
      </div>

      <!-- Help -->
      <div class="settings-section">
        <div class="settings-section-title">❓ Come funziona Groviglio</div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:20px">

          <!-- Gerarchia -->
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--accent-blue);
              text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
              🏗️ Struttura degli elementi
            </div>
            <div style="background:var(--surface-2);border-radius:var(--radius-md);
              padding:14px;font-family:var(--font-mono);font-size:.72rem;
              color:var(--text-secondary);line-height:2">
              <span style="color:var(--type-progetto)">📁 Macroprogetto</span>
              <span style="color:var(--text-muted)"> (es. Lavoro, Domotica)</span><br>
              &nbsp;&nbsp;<span style="color:var(--text-muted)">└──</span>
              <span style="color:var(--type-progetto)">📁 Progetto</span>
              <span style="color:var(--text-muted)"> (es. Channel Engine)</span><br>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <span style="color:var(--text-muted)">├──</span>
              <span style="color:var(--type-nota)">📝 Nota</span>
              <span style="color:var(--text-muted)"> (testo in Markdown)</span><br>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <span style="color:var(--text-muted)">├──</span>
              <span style="color:var(--type-task)">✅ Task</span>
              <span style="color:var(--text-muted)"> (da fare / in corso / fatto)</span><br>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <span style="color:var(--text-muted)">└──</span>
              <span style="color:var(--type-idea)">💡 Idea</span>
              <span style="color:var(--text-muted)"> (bozza → sviluppo → realizzata)</span>
            </div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;line-height:1.6">
              Per assegnare un genitore: apri o crea un elemento → campo <strong style="color:var(--text-primary)">Genitore</strong> → cerca e seleziona.
            </div>
          </div>

          <!-- Viste -->
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--accent-orange);
              text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
              👁️ Le 5 viste disponibili
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${[
                ['≡', 'Elenco', 'Card filtrabili per tipo, priorità, tag. Ricerca istantanea.'],
                ['⬡', 'Grafo', 'Mappa visiva. Archi blu = gerarchia. Tratteggiati = collegamento libero.'],
                ['🌳', 'Albero', 'Gerarchia collassabile. Trascina per spostare gli elementi.'],
                ['📊', 'Tabella', 'Foglio ordinabile con colonne Macro → Progetto → Elemento.'],
                ['💬', 'Chat AI', 'Chiedi all\'AI di analizzare, riassumere o creare note.'],
              ].map(([icon, nome, desc]) => `
                <div style="display:flex;gap:10px;align-items:flex-start;
                  padding:8px;background:var(--surface-2);border-radius:var(--radius-sm)">
                  <span style="font-size:1rem;width:22px;text-align:center;flex-shrink:0">${icon}</span>
                  <div>
                    <div style="font-size:.78rem;font-weight:700;color:var(--text-primary)">${nome}</div>
                    <div style="font-size:.7rem;color:var(--text-muted);margin-top:1px">${desc}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <!-- AI -->
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--type-task);
              text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
              🤖 Chat AI — come si usa
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;font-size:.75rem;
              color:var(--text-secondary);line-height:1.7">
              <div>1️⃣ Vai in <strong style="color:var(--text-primary)">Impostazioni → AI</strong> e incolla la tua chiave API</div>
              <div>2️⃣ Scegli il provider: <strong>Claude</strong> (Anthropic), <strong>Gemini</strong> (Google), <strong>ChatGPT</strong> (OpenAI)</div>
              <div>3️⃣ Premi <strong style="color:var(--text-primary)">🔌 Testa connessioni</strong> per verificare</div>
              <div>4️⃣ Apri la <strong style="color:var(--text-primary)">Chat AI</strong> → pannello 📋 per selezionare le note come contesto</div>
              <div>5️⃣ Nell\'editor Markdown usa <strong style="color:var(--accent-orange)">✨ AI</strong> per formattare il testo</div>
            </div>
          </div>

          <!-- Backup -->
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--success);
              text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
              💾 Backup — cosa sapere
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${[
                ['✅', 'I dati sono salvati localmente nel tuo browser (IndexedDB). Nessun server.'],
                ['✅', 'Fai Export JSON regolarmente: Impostazioni → Esporta. È il tuo backup principale.'],
                ['✅', 'L\'app mostra una notifica automatica per ricordartelo.'],
                ['⚠️', 'Se cancelli i dati del browser o usi "Clear site data" perdi tutto. Esporta prima.'],
                ['⚠️', 'Ogni dispositivo ha il suo database. Per sincronizzare usa Export → Import su altro dispositivo.'],
              ].map(([ico, txt]) => `
                <div style="display:flex;gap:8px;font-size:.72rem;
                  color:var(--text-secondary);line-height:1.5">
                  <span style="flex-shrink:0">${ico}</span>
                  <span>${txt}</span>
                </div>`).join('')}
            </div>
          </div>

          <!-- Aggiornamenti -->
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);
              text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
              🔄 Aggiornamenti
            </div>
            <div style="font-size:.72rem;color:var(--text-secondary);line-height:1.7">
              L\'app controlla automaticamente gli aggiornamenti da GitHub.<br>
              Quando appare il banner <strong style="color:var(--text-primary)">🚀 Aggiornamento disponibile</strong>
              → esporta i dati → premi <strong>Aggiorna</strong>.<br><br>
              Se l\'app non dovesse partire dopo un aggiornamento:
              usa il pulsante <strong style="color:var(--accent-orange)">💾 Esporta tutti i dati</strong>
              nella schermata di recupero automatica, poi clicca <strong>Applica aggiornamento</strong>.
              I dati non vengono mai cancellati dall\'aggiornamento.
            </div>
          </div>

        </div>
      </div>

      <!-- Info -->
      <div class="settings-section">
        <div class="settings-section-title">ℹ️ Informazioni</div>
        <div class="settings-item">
          <div class="settings-item-icon">🦊</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Groviglio</div>
            <div class="settings-item-desc">Versione ${VERSIONE_LOCALE} · Beta</div>
          </div>
          <div class="settings-item-ctrl">
            <a href="https://github.com/Alby210AMRG/groviglio"
              target="_blank" class="btn btn-ghost" style="font-size:.72rem">
              GitHub ↗
            </a>
          </div>
        </div>
        <div class="settings-item">
          <div class="settings-item-icon">📊</div>
          <div class="settings-item-info">
            <div class="settings-item-label">Database</div>
            <div class="settings-item-desc" id="db-stats">Caricamento…</div>
          </div>
        </div>
      </div>
    </div>`;

  // Carica stats DB
  contaElementi().then(c => {
    const el = document.getElementById('db-stats');
    if (el) el.textContent =
      `${c.totale} elementi totali · ${c.nota} note · ${c.idea} idee · ${c.progetto} progetti · ${c.task} task`;
  });

  // Wiring impostazioni
  setupImpostazioniListeners();
}

function setupImpostazioniListeners() {
  // Tema
  document.querySelectorAll('.theme-opt').forEach(opt => {
    opt.addEventListener('click', async () => {
      const tema = opt.dataset.theme;
      document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      await setImpostazione('tema', tema);
      applicaTema(tema);
    });
  });

  // Font size
  ['1x','2x'].forEach(size => {
    document.getElementById(`btn-font-${size}`)?.addEventListener('click', async () => {
      await setImpostazione('fontSize', size);
      applicaFontSize(size);
      document.querySelectorAll('[data-fontsize]').forEach(b => {
        b.classList.toggle('btn-primary', b.dataset.fontsize === size);
        b.classList.toggle('btn-secondary', b.dataset.fontsize !== size);
      });
    });
  });

  // Provider AI
  document.getElementById('sel-provider')?.addEventListener('change', async (e) => {
    await setImpostazione('providerAI', e.target.value);
    setProvider(e.target.value);
    mostraToast(`Provider impostato: ${e.target.value}`, 'info');
  });

  // Test connessioni AI
  document.getElementById('btn-testa-api')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-testa-api');
    const risultatiDiv = document.getElementById('test-api-risultati');
    const lista = document.getElementById('test-api-lista');
    if (!btn || !lista) return;

    // Prima salva le chiavi inserite
    const claude = document.getElementById('inp-api-claude')?.value.trim();
    const gemini = document.getElementById('inp-api-gemini')?.value.trim();
    const openai = document.getElementById('inp-api-openai')?.value.trim();
    if (claude) await setImpostazione('apiKeyAnthropic', claude);
    if (gemini) await setImpostazione('apiKeyGemini', gemini);
    if (openai) await setImpostazione('apiKeyOpenAI', openai);

    btn.disabled = true;
    btn.textContent = '🔄 Testo...';
    risultatiDiv.style.display = '';

    const PROVIDER_INFO = {
      claude:  { label: 'Claude',  avatar: '🟠' },
      gemini:  { label: 'Gemini',  avatar: '🔵' },
      chatgpt: { label: 'ChatGPT', avatar: '🟢' },
    };

    // Mostra spinners
    lista.innerHTML = Object.entries(PROVIDER_INFO).map(([k, v]) => `
      <div id="test-row-${k}" style="display:flex;align-items:center;gap:10px;
        padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:1rem">${v.avatar}</span>
        <span style="font-size:.82rem;font-weight:600;color:var(--text-primary);flex:1">
          ${v.label}
        </span>
        <div class="loading-spinner"></div>
      </div>`).join('');

    const risultati = await testaConnessioni();
    log('Test connessioni AI completato', 'sistema');

    // Aggiorna ogni riga con il risultato
    for (const [provider, res] of Object.entries(risultati)) {
      const info = PROVIDER_INFO[provider];
      const row = document.getElementById(`test-row-${provider}`);
      if (!row) continue;

      const colore = res.ok ? 'var(--success)' : 'var(--danger)';
      const icona  = res.ok ? '✅' : '❌';
      row.innerHTML = `
        <span style="font-size:1rem">${info.avatar}</span>
        <span style="font-size:.82rem;font-weight:600;color:var(--text-primary);flex:1">
          ${info.label}
        </span>
        <span style="font-size:.75rem;color:${colore};font-weight:600">
          ${icona} ${res.msg}
        </span>`;
    }

    btn.disabled = false;
    btn.textContent = '🔌 Testa connessioni';
  });

  // Salva API keys
  document.getElementById('btn-salva-api')?.addEventListener('click', async () => {
    const claude = document.getElementById('inp-api-claude')?.value.trim();
    const gemini = document.getElementById('inp-api-gemini')?.value.trim();
    const openai = document.getElementById('inp-api-openai')?.value.trim();

    if (claude) await setImpostazione('apiKeyAnthropic', claude);
    if (gemini) await setImpostazione('apiKeyGemini', gemini);
    if (openai) await setImpostazione('apiKeyOpenAI', openai);

    mostraToast('✅ Chiavi API salvate', 'success');
  });

  // Backup frequenza
  document.getElementById('sel-backup-freq')?.addEventListener('change', async (e) => {
    await setFrequenzaBackup(parseInt(e.target.value));
    mostraToast('Frequenza backup aggiornata', 'info');
  });

  // Export / Import
  document.getElementById('btn-export')?.addEventListener('click', esportaJSON);
  document.getElementById('btn-import')?.addEventListener('click', importaJSON);

  // Log: copia tutto
  document.getElementById('btn-copia-log')?.addEventListener('click', async () => {
    const testo = logComeTesto();
    try {
      await navigator.clipboard.writeText(testo);
      mostraToast('📋 Log copiato negli appunti', 'success');
    } catch {
      // Fallback per browser che non supportano clipboard API
      const ta = document.createElement('textarea');
      ta.value = testo;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      mostraToast('📋 Log copiato', 'success');
    }
  });

  // Log: cancella
  document.getElementById('btn-cancella-log')?.addEventListener('click', async () => {
    if (!confirm('Cancellare il log eventi?')) return;
    await cancellaLog();
    document.getElementById('log-container').innerHTML = renderLogHTML([]);
    mostraToast('Log cancellato', 'info');
  });

  // Log: mostra tutto
  document.getElementById('btn-log-tutti')?.addEventListener('click', () => {
    const cont = document.getElementById('log-container');
    cont.innerHTML = renderLogHTML(getLog());
    cont.style.maxHeight = '600px';
    document.getElementById('btn-log-tutti').style.display = 'none';
  });

  // Reset
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    const confA = confirm('⚠️ Sei sicuro di voler cancellare TUTTI i dati?\n\nQuesta azione è IRREVERSIBILE.');
    if (!confA) return;
    const confB = prompt('Scrivi CANCELLA per confermare:');
    if (confB?.toUpperCase() !== 'CANCELLA') {
      mostraToast('Reset annullato', 'info');
      return;
    }

    await resetDB();
    stato.elementi = [];
    mostraToast('🗑️ Database resettato', 'warning');
    setTimeout(() => window.location.reload(), 1500);
  });
}

/* ═══════════════════════════════════════════════════════════
   TEMA & FONT
═══════════════════════════════════════════════════════════ */
async function applicaTema(tema) {
  const t = tema || await getImpostazione('tema', 'dark');
  document.documentElement.setAttribute('data-theme', t);
}

async function applicaFontSize(size) {
  const s = size || await getImpostazione('fontSize', '1x');
  document.documentElement.setAttribute('data-fontsize', s);
}

/* ═══════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════ */
function setupSidebar() {
  const menuBtn = document.querySelector('.topbar-menu-btn');
  const overlay = document.querySelector('.sidebar-overlay');
  const sidebar  = document.getElementById('sidebar');

  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.add('mobile-open');
    overlay?.classList.add('visible');
  });

  overlay?.addEventListener('click', chiudiSidebarMobile);

  // Bottone crea sidebar
  document.getElementById('btn-crea-sidebar')?.addEventListener('click', () => {
    apriBottomSheetCrea();
    chiudiSidebarMobile();
  });

  // Modal tipo selezione
  document.querySelectorAll('[data-crea-tipo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.creaTipo;
      document.getElementById('modal-tipo')?.classList.remove('open');
      apriModalNuovo(tipo);
    });
  });
}

function chiudiSidebarMobile() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.querySelector('.sidebar-overlay')?.classList.remove('visible');
}

/* ═══════════════════════════════════════════════════════════
   BADGE SIDEBAR
═══════════════════════════════════════════════════════════ */
async function aggiornaBadgeSidebar() {
  const c = await contaElementi();
  const badgeMap = {
    'badge-totale':   c.totale,
    'badge-nota':     c.nota,
    'badge-idea':     c.idea,
    'badge-progetto': c.progetto,
    'badge-task':     c.task,
  };
  Object.entries(badgeMap).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
export function mostraToast(messaggio, tipo = 'info', durata = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = messaggio;

  container.appendChild(toast);

  const rimuovi = () => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };

  setTimeout(rimuovi, durata);
  toast.addEventListener('click', rimuovi);
}

/* ═══════════════════════════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════════════════════════ */
function apriLightbox(src) {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.querySelector('img').src = src;
  lb.classList.add('open');
  lb.querySelector('.lightbox-close').onclick = () => lb.classList.remove('open');
  lb.onclick = (e) => { if (e.target === lb) lb.classList.remove('open'); };
}

/* ═══════════════════════════════════════════════════════════
   MODALS CHIUSURA
═══════════════════════════════════════════════════════════ */
function setupToast() {
  // Chiudi modal su click overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay')?.classList.remove('open');
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   UTILITÀ
═══════════════════════════════════════════════════════════ */
function tipoIcon(tipo) {
  return { nota: '📝', idea: '💡', progetto: '📁', task: '✅' }[tipo] || '📄';
}

function tipoColore(tipo) {
  return { nota: '#4F7BF7', idea: '#F5A623', progetto: '#36D399', task: '#B57BEE' }[tipo] || '#4F7BF7';
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataRelativa(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ora';
  if (min < 60)  return `${min}m fa`;
  const ore = Math.floor(min / 60);
  if (ore < 24)  return `${ore}h fa`;
  const gg  = Math.floor(ore / 24);
  if (gg  < 7)   return `${gg}g fa`;
  const sett = Math.floor(gg / 7);
  if (sett < 5)  return `${sett} sett. fa`;
  const mesi = Math.floor(gg / 30);
  if (mesi < 12) return `${mesi} mesi fa`;
  return `${Math.floor(mesi / 12)} anni fa`;
}

async function comprimeImmagine(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX = 1920;
      let { width: w, height: h } = img;

      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };

    img.onerror = reject;
    img.src = url;
  });
}

// Esponi metodi pubblici
window.UI = { apriModalNuovo, apriDettaglio, navigaA };
