/* ============================================================
   Groviglio – ai.js
   Chat AI multi-provider: Claude, Gemini, ChatGPT
   ============================================================ */

import { getImpostazione, salvaMessaggioChat, getStoricoChatSessione, cancellaChat } from './db.js';
import { mostraToast } from './ui.js';

/* ─── Stato ───────────────────────────────────────────────── */
let _provider   = 'claude';    // claude | gemini | chatgpt
let _sessione   = 'default';
let _contesto   = [];          // elementi selezionati come contesto
let _isLoading  = false;

const AVATAR = {
  claude:  '🟠',
  gemini:  '🔵',
  chatgpt: '🟢',
  user:    '👤',
};

const PROVIDER_LABEL = {
  claude:  'Claude',
  gemini:  'Gemini',
  chatgpt: 'ChatGPT',
};

/* ─── Init vista chat ─────────────────────────────────────── */
export async function initChat() {
  _provider = await getImpostazione('providerAI', 'claude');
  await caricaStorico();
  setupChatUI();
  aggiornaProviderBadge();
}

function setupChatUI() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  if (!input || !sendBtn) return;

  // Invio con Enter (Shift+Enter = a capo)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inviaMessaggio();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  sendBtn.addEventListener('click', inviaMessaggio);

  // Quick actions
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.prompt || btn.textContent;
      input.focus();
    });
  });

  // Toggle contesto
  const toggleCtx = document.getElementById('chat-toggle-context');
  if (toggleCtx) {
    toggleCtx.addEventListener('click', togglePanelContesto);
  }

  // Cancella chat
  const clearBtn = document.getElementById('chat-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Cancellare la cronologia di questa chat?')) {
        await cancellaChat(_sessione);
        document.getElementById('chat-messages').innerHTML = '';
        mostraToast('Chat cancellata', 'info');
      }
    });
  }
}

/* ─── Invio messaggio ─────────────────────────────────────── */
async function inviaMessaggio() {
  if (_isLoading) return;

  const input = document.getElementById('chat-input');
  const testo = input.value.trim();
  if (!testo) return;

  input.value = '';
  input.style.height = 'auto';

  // Aggiunge bolla utente
  aggiungiBolla({ role: 'user', content: testo });
  await salvaMessaggioChat({ role: 'user', content: testo, provider: _provider, sessione: _sessione });

  // Mostra typing
  const typingId = mostraTyping();
  _isLoading = true;
  document.getElementById('chat-send').disabled = true;

  try {
    const risposta = await chiamaAI(testo);
    rimuoviTyping(typingId);
    aggiungiBolla({ role: 'assistant', content: risposta });
    await salvaMessaggioChat({ role: 'assistant', content: risposta, provider: _provider, sessione: _sessione });
  } catch (err) {
    rimuoviTyping(typingId);
    const msgErr = err.message || 'Errore sconosciuto';
    aggiungiBolla({
      role: 'assistant',
      content: `❌ **Errore:** ${msgErr}\n\nVerifica la chiave API nelle impostazioni.`,
    });
    mostraToast('Errore AI: ' + msgErr, 'error');
  } finally {
    _isLoading = false;
    document.getElementById('chat-send').disabled = false;
  }
}

/* ─── Chiamata AI (router provider) ──────────────────────── */
async function chiamaAI(testo) {
  const contescoTxt = buildContesto();
  const storico = await getStoricoChatSessione(_sessione);
  // Ultimi 10 messaggi per non sforare il contesto
  const messaggiRecenti = storico.slice(-10).map(m => ({
    role: m.role,
    content: m.content,
  }));

  switch (_provider) {
    case 'claude':  return chiamaClaude(testo, messaggiRecenti, contescoTxt);
    case 'gemini':  return chiamaGemini(testo, messaggiRecenti, contescoTxt);
    case 'chatgpt': return chiamaChatGPT(testo, messaggiRecenti, contescoTxt);
    default: throw new Error('Provider AI non configurato');
  }
}

/* ─── System prompt contestuale ──────────────────────────── */
function buildContesto() {
  if (!_contesto.length) return '';

  const desc = _contesto
    .map(el =>
      `### ${el.tipo.toUpperCase()}: ${el.titolo}\n${el.descrizione || '(nessuna descrizione)'}` +
      (el.tag.length ? `\nTag: ${el.tag.join(', ')}` : '')
    )
    .join('\n\n---\n\n');

  return `\n\n## CONTESTO APPUNTI SELEZIONATI:\n${desc}`;
}

function buildSystemPrompt(contesto) {
  return `Sei un assistente integrato in Groviglio, una web app per la gestione di appunti, idee, progetti e task organizzati come un grafo.

Puoi aiutare l'utente a:
- Rispondere a domande sui suoi appunti
- Riassumere note e idee
- Suggerire collegamenti tra elementi correlati
- Creare nuove note (rispondi con formato JSON se richiesto)
- Generare idee e sviluppare concetti
- Analizzare progetti e task

Rispondi sempre in italiano. Sii conciso ma completo. Usa il markdown per formattare le risposte.${contesto}`;
}

/* ─── Claude API ──────────────────────────────────────────── */
async function chiamaClaude(testo, storico, contesto) {
  const apiKey = await getImpostazione('apiKeyAnthropic', '');
  if (!apiKey) throw new Error('Chiave API Claude non configurata');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 1500,
      system:     buildSystemPrompt(contesto),
      messages: [
        ...storico,
        { role: 'user', content: testo },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Errore HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '(nessuna risposta)';
}

/* ─── Gemini API ──────────────────────────────────────────── */
async function chiamaGemini(testo, storico, contesto) {
  const apiKey = await getImpostazione('apiKeyGemini', '');
  if (!apiKey) throw new Error('Chiave API Gemini non configurata');

  // Converti storico in formato Gemini
  const contents = storico.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  contents.push({ role: 'user', parts: [{ text: testo }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(contesto) }] },
        contents,
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Errore HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(nessuna risposta)';
}

/* ─── ChatGPT API ─────────────────────────────────────────── */
async function chiamaChatGPT(testo, storico, contesto) {
  const apiKey = await getImpostazione('apiKeyOpenAI', '');
  if (!apiKey) throw new Error('Chiave API OpenAI non configurata');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: buildSystemPrompt(contesto) },
        ...storico,
        { role: 'user', content: testo },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Errore HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '(nessuna risposta)';
}

/* ─── UI helpers ──────────────────────────────────────────── */

function aggiungiBolla(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const wrap = document.createElement('div');
  wrap.className = `chat-bubble-wrap ${msg.role === 'user' ? 'user' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = msg.role === 'user' ? AVATAR.user : AVATAR[_provider];

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  // Markdown rendering per le risposte AI
  if (msg.role === 'assistant' && window.marked) {
    bubble.innerHTML = window.marked.parse(msg.content || '');
  } else {
    bubble.textContent = msg.content || '';
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  container.appendChild(wrap);

  // Scroll in fondo
  container.scrollTop = container.scrollHeight;
}

function mostraTyping() {
  const container = document.getElementById('chat-messages');
  if (!container) return null;

  const id = 'typing-' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble-wrap';
  wrap.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = AVATAR[_provider];

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;

  return id;
}

function rimuoviTyping(id) {
  if (!id) return;
  document.getElementById(id)?.remove();
}

async function caricaStorico() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = '';
  const storico = await getStoricoChatSessione(_sessione);

  // Mostra ultimi 30 messaggi
  const recenti = storico.slice(-30);
  for (const msg of recenti) {
    aggiungiBolla(msg);
  }

  if (recenti.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="height:100%;justify-content:center">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">Chat AI</div>
        <div class="empty-state-sub">Chiedi qualcosa sui tuoi appunti, fai creare note, collega idee.</div>
      </div>`;
  }
}

function aggiornaProviderBadge() {
  const badge = document.getElementById('provider-badge');
  if (!badge) return;

  const dot   = badge.querySelector('.provider-dot');
  const label = badge.querySelector('.provider-label');

  if (dot) {
    dot.className = `provider-dot provider-${_provider}`;
  }
  if (label) {
    label.textContent = PROVIDER_LABEL[_provider] || _provider;
  }
}

function togglePanelContesto() {
  const panel = document.querySelector('.chat-context-panel');
  if (panel) panel.classList.toggle('hidden');
}

/* ─── Contesto note ───────────────────────────────────────── */
export function setContenutoContesto(elementi) {
  _contesto = elementi || [];
  aggiornaListaContesto();
}

function aggiornaListaContesto() {
  const lista = document.getElementById('context-list');
  if (!lista) return;

  lista.innerHTML = _contesto.map(el => `
    <div class="context-item selected" data-id="${el.id}">
      <span>${tipoIcon(el.tipo)}</span>
      <span class="context-item-title">${el.titolo}</span>
    </div>
  `).join('');
}

export async function populaListaContesto(elementi) {
  const lista = document.getElementById('context-list');
  if (!lista) return;

  lista.innerHTML = elementi.map(el => {
    const sel = _contesto.some(c => c.id === el.id);
    return `
      <div class="context-item ${sel ? 'selected' : ''}" data-id="${el.id}">
        <span>${tipoIcon(el.tipo)}</span>
        <span class="context-item-title">${el.titolo}</span>
      </div>`;
  }).join('');

  lista.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const el = elementi.find(e => e.id === id);
      if (!el) return;

      if (item.classList.toggle('selected')) {
        _contesto = [..._contesto.filter(c => c.id !== id), el];
      } else {
        _contesto = _contesto.filter(c => c.id !== id);
      }
    });
  });
}

/* ─── Cambio provider (da impostazioni) ──────────────────── */
export function setProvider(provider) {
  _provider = provider;
  aggiornaProviderBadge();
}

/* ─── Util ────────────────────────────────────────────────── */
function tipoIcon(tipo) {
  const icons = { nota: '📝', idea: '💡', progetto: '📁', task: '✅' };
  return icons[tipo] || '📄';
}
