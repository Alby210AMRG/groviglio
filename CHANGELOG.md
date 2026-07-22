# 📋 Changelog Groviglio

Tutte le modifiche rilevanti vengono documentate qui.  
Formato: `[versione] – data – descrizione`

---

## [1.0.2] – 2025-01-03

### 🐛 Fix
- **Aggiornamento automatico senza consenso**: il SW chiamava `skipWaiting()` all'install e `controllerchange` ricaricava la pagina automaticamente. Ora il nuovo SW resta in stato "waiting" finché l'utente preme "Aggiorna" nel banner.
- **CSS mobile**: fix chip filtri che traboccavano, backup banner riposizionato, spaziature touch ottimizzate, safe area iPhone corretta.

### ✨ Nuove funzionalità
- **Log eventi** (250 voci): traccia tutte le azioni dell'app in Impostazioni
- **Ultime 10 modifiche**: accesso rapido agli elementi recentemente modificati
- **logger.js**: nuovo modulo dedicato a log e storia modifiche

### 🔧 Tecnico
- `sw.js`: rimosso `skipWaiting()` da install; aggiunto solo su messaggio esplicito `SKIP_WAITING`
- `app.js`: rimosso listener `controllerchange` con auto-reload
- `updater.js`: aggiornamento corretto — banner → utente clicca → SW aggiornato → reload
- `ui.js`: integrato `logModifica()` su crea/modifica/elimina

---

## [1.0.1] – 2025-01-02

### 🐛 Fix
- Primo tentativo fix CSS mobile (incompleto — risolto in 1.0.2)

---

## [1.0.0] – 2025-01-01

### 🎉 Prima versione beta

- PWA offline-first installabile su Android/iOS/PC
- Vista Elenco con filtri per tipo, priorità, tag
- Vista Grafo con Cytoscape.js (hover, focus mode, pannello nodo)
- Modal Crea/Modifica con editor Markdown, tag, priorità, immagini, collegamenti
- Chat AI multi-provider: Claude, Gemini, ChatGPT (API key utente)
- IndexedDB: CRUD completo, ricerca, filtri
- Export/Import JSON con merge intelligente
- Backup automatico con notifica banner
- Controllo aggiornamenti da GitHub via version.json
- 3 temi: Dark (default), Light, Dracula
- Font size 1X / 2X
- Service Worker Cache-First
- Deploy automatico su GitHub Pages via Actions

---

## Template per prossime versioni

```
## [X.Y.Z] – YYYY-MM-DD

### 🐛 Fix
-

### ✨ Nuove funzionalità
-

### 🔧 Tecnico
-

### ⚠️ Breaking changes
-
```

---

## [1.0.3] – 2025-01-04

### 🐛 Fix
- **Gemini**: aggiornato modello da `gemini-2.0-flash-exp` (deprecato) a `gemini-2.5-flash`
- **stato "null"**: il campo stato veniva salvato come stringa `"null"` invece di `null` per le Note

### ✨ Nuove funzionalità
- **Test connessione AI**: pulsante "🔌 Testa connessioni" nelle Impostazioni → verifica Claude, Gemini, ChatGPT con risposta in tempo reale
- Salvataggio automatico delle chiavi prima del test

### 🔧 Tecnico
- `js/ai.js`: modello Gemini aggiornato + funzioni `testaConnessioni()`, `_testaClaude()`, `_testaGemini()`, `_testaChatGPT()`
- `js/ui.js`: integrato pulsante test con spinner e risultati colorati; fix salvataggio stato

---

## [1.0.4] – 2025-01-05

### 🐛 Fix
- **Gemini**: modello aggiornato a `gemini-2.0-flash` (GA, disponibile a tutti)
- **Errori AI**: ora tracciati nel log eventi con tipo `errore`

### ✨ Nuove funzionalità
- **Banner aggiornamento live**: usa Page Visibility API + evento `online` → il banner appare anche senza riavviare l'app, con minimo 5 min tra un check e l'altro
- **Log eventi compatto**: tabella densa con icona, tipo colorato, messaggio, timestamp
- **Copia log**: pulsante "📋 Copia tutto" copia il log come testo negli appunti
- **Ultime modifiche a 250**: da 10 a 250, con badge colorati NUOVO/MOD/ELIMINATO
- **Toolbar Markdown**: 11 bottoni (Grassetto, Corsivo, H1, H2, Lista, Lista num., Checklist, Codice, Link, Citazione, ?)
- **Cheatsheet Markdown**: pannello collassabile con guida rapida per chi non conosce Markdown

### 🔧 Tecnico
- `updater.js`: aggiunto listener `visibilitychange` e `online`
- `logger.js`: render tabellare compatto, `logComeTesto()`, debounce persistenza, MAX_MOD=250
- `ai.js`: errori catchati e loggati con `log(...,'errore')`

---

## [1.0.5] – 2025-01-06

### ✨ Nuove funzionalità
- **Pulsante ✨ AI nell'editor Markdown**: apre un panel inline con:
  - Testo precompilato dall'editor (modificabile)
  - Campo istruzioni aggiuntive opzionale (es. "aggiungi titoli", "formatta come lista")
  - Indicatore provider attivo con avatar e stato chiave
  - Anteprima doppia: raw Markdown + rendering visuale
  - Azioni: ✅ Sostituisci / ➕ Aggiungi in fondo / 🔄 Rigenera / ✕ Annulla
- Errori AI nel panel loggati in log eventi con tipo `errore`

### 🔧 Tecnico
- `js/ai.js`: `formattaInMarkdown(testo, istruzioni, provider)` + `getProviderStatus()`
- `js/ui.js`: listener completo AI panel, gestione stati loading/error/success
- `css/app.css`: animazione panel, stili raw/preview, responsive mobile

---

## [1.0.6] – 2025-01-07

### 🐛 Fix critico
- **Note duplicate al salvataggio**: ogni apertura del modal aggiungeva un nuovo listener sul bottone Salva senza rimuovere quello precedente. Al 3° salvataggio → 3 note create simultaneamente.
  - **Soluzione 1**: clonazione del bottone Salva ad ogni apertura modal → elimina tutti i listener accumulati
  - **Soluzione 2**: guard `_staSalvando` anti-doppio-click → se il salvataggio è già in corso, i click successivi vengono ignorati
  - **Soluzione 3**: bottone disabilitato durante il salvataggio con feedback "⏳ Salvataggio…"
- Errori di salvataggio ora loggati nel log eventi

### 🔧 Tecnico aggiunto in REGOLE_ORO
- Mai aggiungere `addEventListener` su elementi DOM persistenti senza prima rimuovere i listener precedenti
- Usare sempre `cloneNode(true) + replaceChild` per reset listener su bottoni riutilizzati

---

## [1.1.0] – 2025-01-08

### ✨ Nuove funzionalità
- **Gerarchia elementi**: campo `parentId` su ogni elemento. Struttura: Macroprogetto → Progetto → Nota/Task/Idea
- **Vista Albero**: albero collassabile con drag & drop per spostare elementi, azioni rapide per tipo
- **Vista Tabella**: colonne Macroprogetto / Progetto / Titolo / Tipo / Priorità / Stato / Scadenza, ordinabile
- **Icon Picker**: 60+ emoji in 6 categorie (Lavoro, Progetto, Idee, Task, Natura, Personale) per personalizzare ogni elemento
- **Selettore Genitore**: campo "Genitore" nel form crea/modifica con ricerca e selezione
- **Breadcrumb in card**: le card mostrano il padre (es. "📁 Channel Engine ›")
- **Import .md**: bottone 📂 nella toolbar Markdown per importare file .md locali
- **Grafo migliorato**: archi gerarchici (solidi blu) distinti da collegamenti liberi (tratteggiati grigi)

### 🐛 Fix
- **Gemini**: tornato a `gemini-2.5-flash` (stesso modello che funziona in Amici FC)

### 🔧 Tecnico
- `db.js`: DB_VERSION → 2, indice `parentId`, `creaElemento` + `buildAlbero()`, `getElementiFigli()`
- `js/tree.js`: nuovo modulo vista albero con drag & drop
- `js/tableview.js`: nuovo modulo vista tabella ordinabile/filtrabile
- `js/icons.js`: libreria icone emoji con picker interattivo
- `ui.js`: integra tree, table, icon picker, parent selector, import .md, breadcrumb card
- `graph.js`: edge type `gerarchia` vs `libero` con stili distinti

### 📋 Aggiornamento REGOLE_ORO
- Mai aggiungere addEventListener su elementi DOM persistenti senza reset preventivo
- Per gerarchie in IndexedDB usare Adjacency List (parentId) — max 3 livelli in beta
