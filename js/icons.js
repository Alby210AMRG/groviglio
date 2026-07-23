/* ============================================================
   Groviglio – icons.js v1.1.0
   Libreria icone emoji per personalizzazione elementi
   ============================================================ */

export const ICON_CATS = {
  'Lavoro':    ['💼','📊','📈','📉','💰','🏢','📋','📌','🗓️','📎','🖇️','📁','📂','🗂️','📑','📃','📄','🗃️'],
  'Progetto':  ['🏗️','🔩','📐','🗺️','🎯','🚀','⚙️','🔧','🛠️','🔨','🔬','🧪','🔭','💻','🖥️','📱'],
  'Idee':      ['💡','✨','🌟','💫','🔮','🧠','🎨','🖌️','🎭','🎪','🎠','🌈','🦋','🌀','⚡','🌊'],
  'Task':      ['✅','☑️','📝','✏️','🖊️','📍','🔔','🔑','⏰','⏳','🏃','💪','🎯','🏆','🥇','🎖️'],
  'Natura':    ['🌱','🌿','🍀','🌸','🌺','🌻','🌾','🍃','🌳','🌲','🌴','🍄','🌍','🌏','🏔️','🏝️'],
  'Personale': ['❤️','🏠','👤','🎵','📚','🎓','🏋️','🌅','☕','🍕','🎮','🎬','📷','✈️','🚗','⭐'],
};

export const TUTTI_ICONE = Object.values(ICON_CATS).flat();

/** Icona default per tipo (se nessuna icona custom) */
export const TIPO_ICONA_DEFAULT = {
  macroprogetto: '🏛️',
  nota:     '📝',
  idea:     '💡',
  progetto: '📁',
  task:     '✅',
};

/** Restituisce l'icona da mostrare: custom → default tipo */
export function getIcona(elemento) {
  return elemento.icona || TIPO_ICONA_DEFAULT[elemento.tipo] || '📄';
}

/**
 * Renderizza il componente Icon Picker nel container dato
 * @param {HTMLElement} container
 * @param {string|null} iconaCorrente
 * @param {(icona:string|null)=>void} onChange
 */
export function renderIconPicker(container, iconaCorrente, onChange) {
  let catCorrente = 'Lavoro';
  let iconaSelezionata = iconaCorrente;

  function render() {
    const iconeVisibili = ICON_CATS[catCorrente] || TUTTI_ICONE;
    container.innerHTML = `
      <div class="icon-picker-wrap">
        <button type="button" class="icon-picker-trigger" id="ip-trigger" title="Scegli icona">
          ${iconaSelezionata || '🔧'}
        </button>
        <div class="icon-picker-popup" id="ip-popup">
          <input class="icon-picker-search" id="ip-search" placeholder="Cerca emoji…" autocomplete="off">
          <div class="icon-picker-cats">
            ${Object.keys(ICON_CATS).map(cat => `
              <button type="button" class="icon-cat-btn ${cat === catCorrente ? 'active' : ''}"
                data-cat="${cat}">${cat}</button>
            `).join('')}
          </div>
          <div class="icon-grid" id="ip-grid">
            ${iconeVisibili.map(ic => `
              <button type="button" class="icon-grid-btn ${ic === iconaSelezionata ? 'active' : ''}"
                data-icon="${ic}" title="${ic}">${ic}</button>
            `).join('')}
          </div>
          <button type="button" class="icon-remove-btn" id="ip-remove">
            ✕ Rimuovi icona custom
          </button>
        </div>
      </div>`;

    // Toggle popup
    const trigger = container.querySelector('#ip-trigger');
    const popup   = container.querySelector('#ip-popup');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.classList.toggle('open');
    });

    // Chiudi cliccando fuori
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) popup.classList.remove('open');
    }, { once: false });

    // Categorie
    container.querySelectorAll('.icon-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        catCorrente = btn.dataset.cat;
        render();
        container.querySelector('#ip-popup').classList.add('open');
      });
    });

    // Ricerca
    const searchEl = container.querySelector('#ip-search');
    searchEl?.addEventListener('input', (e) => {
      e.stopPropagation();
      const q = e.target.value.toLowerCase();
      const grid = container.querySelector('#ip-grid');
      if (!grid) return;
      const icone = q ? TUTTI_ICONE : (ICON_CATS[catCorrente] || []);
      grid.innerHTML = icone.map(ic => `
        <button type="button" class="icon-grid-btn ${ic === iconaSelezionata ? 'active' : ''}"
          data-icon="${ic}">${ic}</button>
      `).join('');
      grid.querySelectorAll('.icon-grid-btn').forEach(b => {
        b.addEventListener('click', (ev) => seleziona(ev, b.dataset.icon));
      });
    });

    // Click icona
    container.querySelectorAll('.icon-grid-btn').forEach(btn => {
      btn.addEventListener('click', (e) => seleziona(e, btn.dataset.icon));
    });

    // Rimuovi
    container.querySelector('#ip-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      iconaSelezionata = null;
      onChange(null);
      render();
    });
  }

  function seleziona(e, icona) {
    e.stopPropagation();
    iconaSelezionata = icona;
    onChange(icona);
    render();
    container.querySelector('#ip-popup').classList.remove('open');
  }

  render();
}
