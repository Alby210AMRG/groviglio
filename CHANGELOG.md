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
