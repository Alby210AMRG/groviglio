/* ============================================================
   Groviglio – tree.js v1.1.0
   Vista ad Albero gerarchica
   ============================================================ */

import { buildAlbero, aggiornaElemento } from './db.js';
import { getIcona } from './icons.js';
import { log } from './logger.js';

const TIPO_COLORI = {
  nota:     'var(--type-nota)',
  idea:     'var(--type-idea)',
  progetto: 'var(--type-progetto)',
  task:     'var(--type-task)',
};

let _callbacks = {};
const _aperto = new Set();

export function initTreeView(callbacks) {
  _callbacks = callbacks;
}

export async function renderAlbero() {
  const container = document.getElementById('tree-container');
  if (!container) return;
  const albero = await buildAlbero();

  if (!albero.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌳</div>
        <div class="empty-state-title">Albero vuoto</div>
        <div class="empty-state-sub">Crea elementi e assegna loro un genitore per vederli qui.</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  for (const nodo of albero) {
    container.appendChild(buildNodo(nodo, 0));
  }
  setupDragDrop(container);
}

function buildNodo(nodo, livello) {
  const haFigli  = nodo.figli?.length > 0;
  const isAperto = _aperto.has(nodo.id) || (livello === 0 && haFigli);
  if (isAperto && haFigli) _aperto.add(nodo.id);

  const icona  = getIcona(nodo);
  const colore = TIPO_COLORI[nodo.tipo] || 'var(--accent-blue)';

  const el = document.createElement('div');
  el.className = 'tree-node';
  el.dataset.id = nodo.id;

  let indentHTML = '';
  for (let i = 0; i < livello; i++) {
    indentHTML += `<div class="tree-indent-line"></div>`;
  }

  el.innerHTML = `
    <div class="tree-row" data-id="${nodo.id}" draggable="true">
      <div class="tree-indent" style="display:flex">${indentHTML}</div>
      <button class="tree-toggle ${haFigli ? (isAperto ? 'open' : '') : 'leaf'}" type="button">▶</button>
      <div class="tree-icon">${icona}</div>
      <div class="tree-title">${escH(nodo.titolo)}</div>
      <div class="tree-badges">
        <span class="tree-tipo-badge" style="background:${colore}22;color:${colore}">${nodo.tipo}</span>
        ${haFigli ? `<span style="font-size:.6rem;color:var(--text-muted);margin-left:2px">(${nodo.figli.length})</span>` : ''}
      </div>
      <div class="tree-actions">
        <button class="tree-action-btn" data-action="apri" title="Apri">👁️</button>
        <button class="tree-action-btn" data-action="modifica" title="Modifica">✏️</button>
        <button class="tree-action-btn" data-action="elimina" title="Elimina">🗑️</button>
      </div>
    </div>
    <div class="tree-drop-target" data-drop-parent="${nodo.id}"></div>
    <div class="tree-children" style="display:${haFigli && isAperto ? '' : 'none'}"></div>`;

  const childrenDiv = el.querySelector('.tree-children');
  const toggle      = el.querySelector('.tree-toggle');
  const row         = el.querySelector('.tree-row');

  const popolaFigli = () => {
    if (childrenDiv.children.length) return;
    for (const f of (nodo.figli || [])) {
      childrenDiv.appendChild(buildNodo(f, livello + 1));
    }
  };

  if (isAperto && haFigli) popolaFigli();

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!haFigli) return;
    const nowOpen = !_aperto.has(nodo.id);
    if (nowOpen) {
      _aperto.add(nodo.id);
      toggle.classList.add('open');
      childrenDiv.style.display = '';
      popolaFigli();
    } else {
      _aperto.delete(nodo.id);
      toggle.classList.remove('open');
      childrenDiv.style.display = 'none';
    }
  });

  row.addEventListener('click', (e) => {
    if (e.target.closest('.tree-actions') || e.target === toggle) return;
    _callbacks.apriElemento?.(nodo.id);
  });

  row.querySelector('[data-action="apri"]')?.addEventListener('click', (e) => {
    e.stopPropagation(); _callbacks.apriElemento?.(nodo.id);
  });
  row.querySelector('[data-action="modifica"]')?.addEventListener('click', (e) => {
    e.stopPropagation(); _callbacks.apriModalModifica?.(nodo);
  });
  row.querySelector('[data-action="elimina"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Eliminare "${nodo.titolo}"?${haFigli ? `\n\n⚠️ I ${nodo.figli.length} figli torneranno alla radice.` : ''}`)) return;
    await _callbacks.eliminaElemento?.(nodo.id);
    renderAlbero();
  });

  return el;
}

function setupDragDrop(container) {
  let dragId = null;

  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[draggable="true"]');
    if (!row) return;
    dragId = row.dataset.id;
    setTimeout(() => row.closest('.tree-node').style.opacity = '.4', 0);
  });

  container.addEventListener('dragend', () => {
    dragId = null;
    container.querySelectorAll('.tree-node').forEach(n => n.style.opacity = '');
    container.querySelectorAll('.tree-drop-target').forEach(t => t.classList.remove('active'));
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dt = e.target.closest('.tree-drop-target');
    container.querySelectorAll('.tree-drop-target').forEach(t => t.classList.remove('active'));
    if (dt) dt.classList.add('active');
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const dt = e.target.closest('.tree-drop-target');
    if (!dt || !dragId || dt.dataset.dropParent === dragId) return;
    await aggiornaElemento(dragId, { parentId: dt.dataset.dropParent });
    log('Spostato elemento albero', 'sistema');
    renderAlbero();
  });
}

function escH(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
