# 🏅 Regole d'Oro – Groviglio

Principi e lezioni apprese durante lo sviluppo.  
Da aggiornare ad ogni rilascio quando si impara qualcosa di nuovo.

---

## 🔄 Processo di rilascio (SEMPRE questi 4 file insieme)

Ogni modifica al codice richiede obbligatoriamente l'aggiornamento di:

| File | Perché |
|---|---|
| `version.json` | Incrementa versione → trigger banner aggiornamento |
| `sw.js` | Aggiorna `CACHE_NAME` → browser scarica nuovi asset |
| `js/updater.js` | Aggiorna `VERSION_LOCALE` → confronto corretto |
| File modificato | Il contenuto effettivo della modifica |

**⚠️ Mai aggiornare solo il CSS/JS senza aggiornare anche i 3 file di versione.**

---

## 🚫 Errori da non ripetere

### ❌ skipWaiting() automatico nel Service Worker
**Problema**: chiamare `self.skipWaiting()` nell'evento `install` + ascoltare `controllerchange`
con `window.location.reload()` causa aggiornamento automatico senza consenso utente.  
**Soluzione**: `skipWaiting()` SOLO su messaggio esplicito `SKIP_WAITING` dall'app, inviato
solo quando l'utente preme il pulsante "Aggiorna" nel banner.

### ❌ Aggiornare solo i file visibili
**Problema**: caricare `app.css` su GitHub senza aggiornare `version.json` e `sw.js`
→ il browser usa la vecchia cache → nessun cambiamento visibile.  
**Soluzione**: sempre i 4 file insieme (vedi sopra).

### ❌ Upload da browser GitHub per cartelle con punto (`.github/`)
**Problema**: l'upload drag-and-drop su GitHub ignora le cartelle che iniziano con `.`  
**Soluzione**: creare i file direttamente dall'editor GitHub o usare GitHub Desktop.

---

## ✅ Principi architetturali

### Offline-first prima di tutto
- Ogni funzionalità deve funzionare **senza internet**
- Le immagini in beta sono base64 in IndexedDB (max 1920px, 75% quality)
- Google Drive sync pianificato per v2 — non compromettere l'offline per aggiungerlo prima

### Sync tra dispositivi
- In beta: solo Export/Import JSON manuale
- L'architettura dati (UUID per ID, `updatedAt` per merge) è già predisposta per sync futuro
- Merge intelligente: vince il record con `updatedAt` più recente

### Aggiornamenti
- `version.json` è l'unica fonte di verità per la versione remota
- Il confronto è semantico: `1.2.3` > `1.2.2` (non string comparison)
- L'utente **deve sempre confermare** un aggiornamento — mai forzato

### Service Worker
- Strategia Cache-First per tutti gli asset statici
- Strategia Network-First SOLO per `version.json` (deve sempre essere fresco)
- Le API AI (Anthropic, Google, OpenAI) non vengono mai intercettate dal SW

### Sicurezza
- Le API key sono salvate in IndexedDB localmente
- L'export JSON **non include** mai le API key (campo escluso esplicitamente)
- Nessun dato utente viene inviato a server propri

---

## 📐 Convenzioni codice

### File JS
- Moduli ES6 (`import/export`) ovunque
- Ogni modulo ha una responsabilità unica
- Funzioni pubbliche esportate, helper privati non esportati

### CSS
- Tutte le variabili colore in `:root` per tema
- I 3 temi (`dark`, `light`, `dracula`) sono attributi `data-theme` sull'`<html>`
- Mobile-first nei media query

### IndexedDB
- Tutti gli ID sono UUID (`crypto.randomUUID()`)
- Ogni elemento ha `createdAt` e `updatedAt` in formato ISO 8601
- Il campo `_driveId` e `_driveSyncAt` sono già nel schema per il futuro Drive sync

### Versioning
- Formato: `MAJOR.MINOR.PATCH` (semver)
- PATCH: fix bug, piccole modifiche UI
- MINOR: nuove funzionalità retrocompatibili  
- MAJOR: cambiamenti strutturali, breaking changes

---

## 🗺️ Roadmap tecnica

| Versione | Feature |
|---|---|
| 1.x | Bug fix, miglioramenti UI/UX |
| 1.1 | Colori nodi personalizzabili, onboarding con dati esempio |
| 1.2 | Sub-task nei progetti, scadenze con reminder |
| 2.0 | Google Drive sync immagini (OAuth2) |
| 2.1 | Tipi elementi completamente custom |
| 3.0 | Sync multi-dispositivo real-time |

---

*Aggiornato a: v1.0.2*
