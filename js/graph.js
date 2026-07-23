/* ============================================================
   Groviglio – graph.js
   Vista grafo con Cytoscape.js
   ============================================================ */

let _cy = null;
let _elementi = [];
let _modalApriElemento = null;

const TIPO_COLORI = {
  macroprogetto: '#FF4500',
  nota:          '#4F7BF7',
  idea:          '#F5A623',
  progetto:      '#36D399',
  task:          '#B57BEE',
};

const TIPO_ICONE = {
  macroprogetto: '🏛️',
  nota:          '📝',
  idea:          '💡',
  progetto:      '📁',
  task:     '✅',
};

/* ─── Init ────────────────────────────────────────────────── */
export function initGrafo(elementi, onApriElemento) {
  _elementi = elementi;
  _modalApriElemento = onApriElemento;

  if (!window.cytoscape) {
    console.error('[Grafo] Cytoscape non caricato');
    return;
  }

  const container = document.getElementById('cy');
  if (!container) return;

  // Distruggi istanza precedente
  if (_cy) { _cy.destroy(); _cy = null; }

  // Pre-calcola livello gerarchico e numero figli per ogni nodo
  const idSet    = new Set(elementi.map(e => e.id));
  const figliMap = {};  // id → numero figli diretti
  for (const el of elementi) {
    if (el.parentId && idSet.has(el.parentId)) {
      figliMap[el.parentId] = (figliMap[el.parentId] || 0) + 1;
    }
  }

  function getLivello(el, mappa, profondita = 0) {
    if (!el.parentId || !idSet.has(el.parentId)) return profondita;
    if (profondita > 10) return profondita; // evita loop
    const padre = elementi.find(e => e.id === el.parentId);
    return padre ? getLivello(padre, mappa, profondita + 1) : profondita;
  }

  const livelloMap = {};
  for (const el of elementi) {
    livelloMap[el.id] = getLivello(el, elementi);
  }

  const nodes = elementi.map(el => {
    const livello   = livelloMap[el.id] || 0;
    const nFigli    = figliMap[el.id] || 0;
    const isRadice  = !el.parentId || !idSet.has(el.parentId);

    // Dimensione nodo: radice grande, con figli media, foglia piccola
    const size = isRadice && nFigli > 0 ? 90
               : nFigli > 0             ? 70
               : 50;

    return {
      data: {
        id:        el.id,
        label:     el.titolo,
        tipo:      el.tipo,
        priorita:  el.priorita,
        colore:    el.coloreCustom || TIPO_COLORI[el.tipo] || '#4F7BF7',
        icona:     el.icona || TIPO_ICONE[el.tipo] || '📄',
        completato:el.completato || false,
        livello,
        nFigli,
        isRadice:  isRadice ? 1 : 0,
        size,
      }
    };
  });

  const archiSet = new Set();
  const edges = [];

  // Archi da parentId (gerarchia) — solidi, blu
  for (const el of elementi) {
    if (el.parentId && elementi.some(e => e.id === el.parentId)) {
      const chiave = `hier-${el.parentId}--${el.id}`;
      if (!archiSet.has(chiave)) {
        archiSet.add(chiave);
        edges.push({
          data: {
            id:     chiave,
            source: el.parentId,
            target: el.id,
            tipo:   'gerarchia',
          }
        });
      }
    }
  }

  // Archi da collegamenti[] (liberi) — tratteggiati, grigi
  for (const el of elementi) {
    for (const targetId of (el.collegamenti || [])) {
      const chiave = [el.id, targetId].sort().join('--');
      if (!archiSet.has(chiave) && elementi.some(e => e.id === targetId)) {
        archiSet.add(chiave);
        edges.push({
          data: {
            id:     `edge-${chiave}`,
            source: el.id,
            target: targetId,
            tipo:   'libero',
          }
        });
      }
    }
  }

  _cy = window.cytoscape({
    container,
    elements: { nodes, edges },
    style: buildStile(),
    layout: {
      name:            'cose',
      idealEdgeLength: 150,
      nodeOverlap:     30,
      padding:         40,
      randomize:       false,
      componentSpacing:80,
      nodeRepulsion:   () => 4500,
      edgeElasticity:  () => 80,
      nestingFactor:   1.5,
      gravity:         0.25,
      numIter:         1000,
      initialTemp:     250,
      coolingFactor:   0.99,
      minTemp:         1,
    },
    userZoomingEnabled:   true,
    userPanningEnabled:   true,
    boxSelectionEnabled:  false,
    selectionType:        'single',
    minZoom: 0.2,
    maxZoom: 4,
  });

  setupEventiGrafo();
  setupToolbarGrafo();
}

/* ─── Stile Cytoscape ─────────────────────────────────────── */
function buildStile() {
  return [
    // ── Nodo base ──────────────────────────────────────────
    {
      selector: 'node',
      style: {
        'width':              'data(size)',
        'height':             'data(size)',
        'background-color':   'data(colore)',
        'background-opacity': 0.85,
        'border-width':       2,
        'border-color':       'data(colore)',
        'border-opacity':     0.5,
        'label':              'data(label)',
        'text-valign':        'bottom',
        'text-halign':        'center',
        'color':              '#EEF2FF',
        'font-size':          11,
        'font-family':        'Outfit, sans-serif',
        'font-weight':        600,
        'text-margin-y':      8,
        'text-max-width':     110,
        'text-wrap':          'ellipsis',
        'overlay-padding':    8,
        'z-index':            10,
        'shadow-blur':        8,
        'shadow-color':       'data(colore)',
        'shadow-opacity':     0.3,
        'shadow-offset-x':    0,
        'shadow-offset-y':    3,
        'transition-property':'width, height, border-width, shadow-opacity, opacity',
        'transition-duration':'220ms',
        'text-outline-width': 2,
        'text-outline-color': '#0D0F18',
        'text-outline-opacity': 0.8,
      }
    },

    // ── Radici (macroprogetti) ──────────────────────────────
    {
      selector: 'node[isRadice=1][nFigli>0]',
      style: {
        'border-width':   4,
        'border-color':   'data(colore)',
        'border-opacity': 1,
        'shadow-blur':    20,
        'shadow-opacity': 0.6,
        'font-size':      13,
        'font-weight':    700,
        'z-index':        20,
        // Bordo doppio simulato con outline
        'outline-width':  3,
        'outline-color':  'data(colore)',
        'outline-opacity': 0.25,
      }
    },

    // ── Nodi con figli ma non radice ───────────────────────
    {
      selector: 'node[nFigli>0][isRadice=0]',
      style: {
        'border-width':   3,
        'border-opacity': 0.8,
        'shadow-blur':    12,
        'shadow-opacity': 0.45,
        'font-size':      12,
      }
    },

    // ── Foglie (nodi senza figli) ──────────────────────────
    {
      selector: 'node[nFigli=0]',
      style: {
        'border-width':   1.5,
        'border-opacity': 0.4,
        'shadow-blur':    5,
        'shadow-opacity': 0.2,
        'font-size':      10,
      }
    },

    // ── Stili per tipo ─────────────────────────────────────
    // Macroprogetto: stella — top-level, massima visibilità
    {
      selector: 'node[tipo="macroprogetto"]',
      style: {
        'shape':          'star',
        'border-width':   4,
        'border-opacity': 1,
        'shadow-blur':    30,
        'shadow-opacity': 0.8,
        'font-size':      14,
        'font-weight':    800,
      }
    },

    // Progetto: forma rettangolare arrotondata
    {
      selector: 'node[tipo="progetto"]',
      style: {
        'shape': 'round-rectangle',
        'border-width': 3,
      }
    },

    // Task: forma rombo
    {
      selector: 'node[tipo="task"]',
      style: {
        'shape': 'round-rectangle',
        'border-style': 'dashed',
        'border-width': 2,
      }
    },

    // Idea: forma esagonale
    {
      selector: 'node[tipo="idea"]',
      style: {
        'shape': 'hexagon',
      }
    },

    // Nota: forma cerchio (default, stile base)
    {
      selector: 'node[tipo="nota"]',
      style: {
        'shape': 'ellipse',
      }
    },

    // ── Selezione ──────────────────────────────────────────
    {
      selector: 'node:selected',
      style: {
        'border-width':   5,
        'border-color':   '#F47C3C',
        'shadow-color':   '#F47C3C',
        'shadow-opacity': 0.9,
        'shadow-blur':    28,
        'z-index':        30,
        'outline-width':  4,
        'outline-color':  '#F47C3C',
        'outline-opacity': 0.3,
      }
    },

    // ── Hover ──────────────────────────────────────────────
    {
      selector: 'node:hover',
      style: {
        'border-width':   4,
        'border-opacity': 1,
        'shadow-opacity': 0.7,
        'shadow-blur':    18,
        'cursor':         'pointer',
        'z-index':        25,
      }
    },

    // ── Completato ─────────────────────────────────────────
    {
      selector: 'node[completato=1]',
      style: {
        'background-opacity': 0.35,
        'border-opacity':     0.25,
        'color':              '#4A5278',
        'text-outline-opacity': 0,
      }
    },

    // ── Dimmed (hover vicini) ──────────────────────────────
    {
      selector: 'node.dimmed',
      style: { 'opacity': 0.15 }
    },
    {
      selector: 'node.focused',
      style: { 'opacity': 1 }
    },

    // ── Archi base ─────────────────────────────────────────
    {
      selector: 'edge',
      style: {
        'width':              1.5,
        'line-color':         '#2E3250',
        'curve-style':        'bezier',
        'opacity':            0.6,
        'transition-property':'opacity, width, line-color',
        'transition-duration':'200ms',
      }
    },

    // ── Archi gerarchici — solidi, colorati, con freccia ──
    {
      selector: 'edge[tipo="gerarchia"]',
      style: {
        'line-color':           '#4F7BF7',
        'target-arrow-color':   '#4F7BF7',
        'target-arrow-shape':   'triangle',
        'target-arrow-size':    8,
        'arrow-scale':          1.2,
        'width':                2.5,
        'opacity':              0.75,
        'curve-style':          'bezier',
      }
    },

    // ── Archi liberi — tratteggiati, grigi ────────────────
    {
      selector: 'edge[tipo="libero"]',
      style: {
        'line-style':        'dashed',
        'line-dash-pattern': [6, 3],
        'line-color':        '#4A5278',
        'width':             1.5,
        'opacity':           0.45,
      }
    },

    // ── Archi selezionati ──────────────────────────────────
    {
      selector: 'edge:selected, edge.highlighted',
      style: {
        'width':      3,
        'line-color': '#F47C3C',
        'opacity':    1,
      }
    },

    {
      selector: 'edge.dimmed',
      style: { 'opacity': 0.05 }
    },
  ];
}

/* ─── Eventi ──────────────────────────────────────────────── */
function setupEventiGrafo() {
  if (!_cy) return;

  // Clic su nodo → apri pannello dettaglio
  _cy.on('tap', 'node', (event) => {
    const node = event.target;
    const el   = _elementi.find(e => e.id === node.id());
    if (el) mostraPannelloNodo(el, node);
  });

  // Doppio clic → apri modal completo
  _cy.on('dblclick dbltap', 'node', (event) => {
    const node = event.target;
    const el   = _elementi.find(e => e.id === node.id());
    if (el && _modalApriElemento) _modalApriElemento(el);
  });

  // Clic su sfondo → deseleziona, chiudi pannello
  _cy.on('tap', (event) => {
    if (event.target === _cy) {
      chiudiPannelloNodo();
      _cy.elements().removeClass('dimmed focused');
    }
  });

  // Hover nodo → evidenzia vicini
  _cy.on('mouseover', 'node', (event) => {
    const node = event.target;
    const vicini = node.neighborhood();

    _cy.elements().addClass('dimmed');
    node.removeClass('dimmed').addClass('focused');
    vicini.removeClass('dimmed').addClass('focused');
  });

  _cy.on('mouseout', 'node', () => {
    _cy.elements().removeClass('dimmed focused');
  });
}

/* ─── Toolbar grafo ───────────────────────────────────────── */
function setupToolbarGrafo() {
  document.getElementById('graph-zoom-in')?.addEventListener('click', () => {
    _cy?.zoom({ level: _cy.zoom() * 1.25, renderedPosition: grafoCenter() });
  });

  document.getElementById('graph-zoom-out')?.addEventListener('click', () => {
    _cy?.zoom({ level: _cy.zoom() * 0.8, renderedPosition: grafoCenter() });
  });

  document.getElementById('graph-fit')?.addEventListener('click', () => {
    _cy?.fit(60);
  });

  document.getElementById('graph-layout')?.addEventListener('click', () => {
    if (!_cy) return;
    _cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 600,
      idealEdgeLength: 150,
      nodeRepulsion: () => 4500,
    }).run();
  });

  document.getElementById('graph-focus-mode')?.addEventListener('click', () => {
    const sel = _cy?.$(`:selected`);
    if (sel?.length) {
      attivaFocusMode(sel.first());
    }
  });
}

function grafoCenter() {
  const cont = document.getElementById('cy-container');
  if (!cont) return { x: 400, y: 300 };
  const r = cont.getBoundingClientRect();
  return { x: r.width / 2, y: r.height / 2 };
}

/* ─── Focus mode ──────────────────────────────────────────── */
export function attivaFocusMode(node) {
  if (!_cy) return;
  const vicini = node.neighborhood().add(node);
  _cy.elements().addClass('dimmed');
  vicini.removeClass('dimmed').addClass('focused');
  _cy.animate({ fit: { eles: vicini, padding: 60 } }, { duration: 500 });
}

/* ─── Pannello dettaglio nodo ─────────────────────────────── */
function mostraPannelloNodo(el, node) {
  const panel = document.getElementById('node-detail-panel');
  if (!panel) return;

  panel.innerHTML = `
    <button class="node-panel-close" id="node-panel-close">✕</button>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="card-type-icon" style="background:${TIPO_COLORI[el.tipo]}22;">
        ${TIPO_ICONE[el.tipo]}
      </div>
      <div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.06em;color:${TIPO_COLORI[el.tipo]};margin-bottom:2px">
          ${el.tipo}
        </div>
        <div style="font-size:.9rem;font-weight:700;line-height:1.3">
          ${el.titolo}
        </div>
      </div>
    </div>
    ${el.descrizione ? `
      <div style="font-size:.75rem;color:var(--text-secondary);line-height:1.5;
        margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:3;
        -webkit-box-orient:vertical;overflow:hidden">
        ${el.descrizione}
      </div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${el.tag.map(t => `<span class="tag">#${t}</span>`).join('')}
      <span class="priority-btn" style="font-size:.62rem;padding:2px 8px;border-radius:99px;
        background:var(--surface-3);color:var(--text-muted)">${el.priorita}</span>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" style="flex:1;font-size:.75rem;padding:7px"
        onclick="document.dispatchEvent(new CustomEvent('apriElemento', {detail:'${el.id}'}))">
        Apri
      </button>
      <button class="btn btn-secondary" style="font-size:.75rem;padding:7px"
        onclick="document.dispatchEvent(new CustomEvent('focusNodo', {detail:'${el.id}'}))">
        Focus
      </button>
    </div>
    ${el.collegamenti.length > 0 ? `
      <div style="margin-top:12px;font-size:.68rem;font-weight:700;
        letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">
        Collegato a (${el.collegamenti.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${el.collegamenti.slice(0,4).map(cId => {
          const cEl = _elementi.find(e => e.id === cId);
          if (!cEl) return '';
          return `
            <div class="connected-node-chip"
              onclick="document.dispatchEvent(new CustomEvent('apriElemento', {detail:'${cEl.id}'}))">
              ${TIPO_ICONE[cEl.tipo]} ${cEl.titolo}
            </div>`;
        }).join('')}
        ${el.collegamenti.length > 4 ?
          `<div style="font-size:.68rem;color:var(--text-muted)">
            +${el.collegamenti.length - 4} altri
          </div>` : ''}
      </div>` : ''}
  `;

  panel.classList.add('visible');

  document.getElementById('node-panel-close')?.addEventListener('click', chiudiPannelloNodo);
}

function chiudiPannelloNodo() {
  document.getElementById('node-detail-panel')?.classList.remove('visible');
}

/* ─── Aggiorna grafo ──────────────────────────────────────── */
export function aggiornaGrafo(elementi) {
  if (!_cy) return;
  _elementi = elementi;

  // Aggiorna nodi esistenti, aggiungi nuovi
  for (const el of elementi) {
    const node = _cy.$(`#${el.id}`);
    if (node.length) {
      node.data({
        label:    el.titolo,
        colore:   el.coloreCustom || TIPO_COLORI[el.tipo] || '#4F7BF7',
        priorita: el.priorita,
        completato: el.completato ? 1 : 0,
      });
    } else {
      _cy.add({
        group: 'nodes',
        data: {
          id:       el.id,
          label:    el.titolo,
          tipo:     el.tipo,
          priorita: el.priorita,
          colore:   el.coloreCustom || TIPO_COLORI[el.tipo] || '#4F7BF7',
          icona:    TIPO_ICONE[el.tipo] || '📄',
          completato: el.completato ? 1 : 0,
        }
      });
    }
  }

  // Rimuovi nodi non più presenti
  const ids = new Set(elementi.map(e => e.id));
  _cy.nodes().forEach(n => {
    if (!ids.has(n.id())) _cy.remove(n);
  });

  // Ricalcola archi
  _cy.edges().remove();
  const archiSet = new Set();
  for (const el of elementi) {
    for (const targetId of (el.collegamenti || [])) {
      const chiave = [el.id, targetId].sort().join('--');
      if (!archiSet.has(chiave) && ids.has(targetId)) {
        archiSet.add(chiave);
        _cy.add({
          group: 'edges',
          data: { id: `edge-${chiave}`, source: el.id, target: targetId }
        });
      }
    }
  }
}

export function evidenziaNodo(id) {
  if (!_cy) return;
  const node = _cy.$(`#${id}`);
  if (!node.length) return;

  _cy.animate({ fit: { eles: node, padding: 120 } }, { duration: 400 });
  _cy.$(`:selected`).unselect();
  node.select();
}

export function distruggiGrafo() {
  if (_cy) { _cy.destroy(); _cy = null; }
}
