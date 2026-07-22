/* ============================================================
   Groviglio – ui.js
   Gestione completa UI: viste, modal, filtri, tema
   ============================================================ */

import {
  getElementi, creaElemento, aggiornaElemento, eliminaElemento,
  cercaElementi, filtraElementi, contaElementi,
  getImpostazione, setImpostazione, resetDB
} from './db.js';
import { initGrafo, aggiornaGrafo, evidenziaNodo } from './graph.js';
import { initChat, populaListaContesto, setProvider } from './ai.js';
import { esportaJSON, importaJSON } from './export.js';
import { backupManuale, setFrequenzaBackup } from './backup.js';
import { VERSIONE_LOCALE } from './updater.js';

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

  // Carica dati
  stato.elementi = await getElementi();
  await aggiornaBadgeSidebar();

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

  let statoHTML = '';
  if (el.tipo === 'progetto' || el.tipo === 'idea') {
    const cls = `stato-${el.stato}`;
    const lbl = {
      attivo: 'Attivo', pausato: 'Pausato', concluso: 'Concluso',
      bozza: 'Bozza', sviluppo: 'In sviluppo', realizzata: 'Realizzata'
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

  return `
    <div class="card" data-id="${el.id}" data-type="${el.tipo}">
      <div class="card-header">
        ${checkboxHTML}
        <div class="card-type-icon">${tipoIcon(el.tipo)}</div>
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
          ${nCollegamenti > 0 ? `
            <span class="card-links-count">
              🔗 ${nCollegamenti}
            </span>` : ''}
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
  const title   = document.getElementById('modal-form-title');
  if (!overlay || !body) return;

  if (title) title.textContent = isModifica ? `Modifica ${el.tipo}` : 'Nuovo elemento';

  body.innerHTML = formHTML(el);
  setupFormListeners(el, isModifica);
  overlay.classList.add('open');
}

function formHTML(el) {
  const tagsStr = (el.tag || []).join(' ');

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
    <!-- Tipo -->
    <div class="form-field">
      <div class="form-label">Tipo</div>
      <div class="type-selector">
        ${['nota','idea','progetto','task'].map(t => `
          <button class="type-btn ${el.tipo === t ? 'active' : ''}" data-type="${t}">
            <span class="type-btn-icon">${tipoIcon(t)}</span>
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`).join('')}
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
      <div class="md-editor-tabs">
        <button class="md-tab active" data-tab="edit">Scrivi</button>
        <button class="md-tab" data-tab="preview">Anteprima</button>
      </div>
      <textarea id="f-desc" class="form-textarea" placeholder="Descrizione in markdown…"
        style="border-radius:0 var(--radius-sm) var(--radius-sm) var(--radius-sm)"
        >${escapeHTML(el.descrizione || '')}</textarea>
      <div id="f-desc-preview" class="md-preview" style="display:none">
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
  };

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

  // Salva
  document.getElementById('btn-salva-form')?.addEventListener('click', async () => {
    const titolo = document.getElementById('f-titolo')?.value.trim();
    if (!titolo) {
      mostraToast('⚠️ Il titolo è obbligatorio', 'warning');
      return;
    }

    const dati = {
      tipo:        formState.tipo,
      titolo,
      descrizione: document.getElementById('f-desc')?.value || '',
      priorita:    formState.priorita,
      stato:       document.getElementById('f-stato')?.value || null,
      scadenza:    document.getElementById('f-scadenza')?.value || null,
      tag:         formState.tag,
      immagini:    formState.immagini,
      collegamenti:formState.collegamenti,
    };

    try {
      let el;
      if (isModifica) {
        el = await aggiornaElemento(elOrigine.id, dati);
        stato.elementi = stato.elementi.map(e => e.id === el.id ? el : e);
        mostraToast('✅ Elemento aggiornato', 'success');
      } else {
        el = await creaElemento(dati);
        stato.elementi.push(el);
        mostraToast(`✅ ${dati.tipo} creata`, 'success');
      }

      await aggiornaBadgeSidebar();
      document.getElementById('modal-form')?.classList.remove('open');

      if (stato.vistaAttiva === 'grafo') aggiornaGrafo(stato.elementi);
      else renderElenco();
    } catch (err) {
      mostraToast('❌ Errore salvataggio: ' + err.message, 'error');
    }
  });
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
          <div style="width:100%;display:flex;justify-content:flex-end">
            <button class="btn btn-primary" id="btn-salva-api">💾 Salva chiavi API</button>
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
