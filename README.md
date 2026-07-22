# 🦊 Groviglio – Appunti a Grafo, Ovunque

> PWA offline-first per gestire appunti, idee, progetti e task come un grafo visivo.

**🌐 App live:** https://Alby210AMRG.github.io/groviglio

---

## ✨ Funzionalità

| Feature | Stato |
|---|---|
| 📝 Note / Idee / Progetti / Task | ✅ |
| 🔗 Vista a Grafo (Cytoscape.js) | ✅ |
| 📋 Vista Elenco con filtri | ✅ |
| 🤖 Chat AI (Claude / Gemini / ChatGPT) | ✅ |
| 💾 Offline-first (Service Worker) | ✅ |
| 📦 IndexedDB locale | ✅ |
| 📤 Export / Import JSON | ✅ |
| 🔔 Backup automatico con notifica | ✅ |
| 🚀 Aggiornamenti da GitHub | ✅ |
| 🎨 3 temi: Dark / Light / Dracula | ✅ |
| 📱 Installabile (PWA) Android/iOS/PC | ✅ |

---

## 🚀 Deploy

Il deploy è automatico su GitHub Pages tramite GitHub Actions.  
Ogni push su `main` aggiorna l'app live.

**Setup manuale GitHub Pages:**
1. Settings → Pages → Source: **GitHub Actions**
2. Il workflow `.github/workflows/deploy.yml` fa il resto

---

## 🤖 Configurazione AI

Nelle Impostazioni dell'app inserisci la tua API key:

| Provider | Dove ottenerla |
|---|---|
| Claude | [console.anthropic.com](https://console.anthropic.com) |
| Gemini | [aistudio.google.com](https://aistudio.google.com) |
| ChatGPT | [platform.openai.com](https://platform.openai.com) |

Le chiavi API sono salvate **solo localmente** su IndexedDB e non vengono mai inviate a server diversi dall'API del provider scelto.

---

## 📁 Struttura

```
groviglio/
├── index.html          # App shell PWA
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline-first)
├── version.json        # Versione per aggiornamenti automatici
├── css/
│   └── app.css         # Design system completo (3 temi)
├── js/
│   ├── app.js          # Entry point + boot
│   ├── db.js           # IndexedDB layer
│   ├── ui.js           # Gestione UI, viste, modal
│   ├── graph.js        # Vista grafo Cytoscape.js
│   ├── ai.js           # Chat AI multi-provider
│   ├── export.js       # Import/Export JSON
│   ├── backup.js       # Backup automatico
│   └── updater.js      # Aggiornamenti da GitHub
├── icons/              # Icone PWA (72→512px)
└── .github/
    └── workflows/
        └── deploy.yml  # Auto-deploy GitHub Pages
```

---

## 🔄 Aggiornare la versione

1. Modifica `version.json` con la nuova versione
2. Push su `main`
3. L'app notificherà automaticamente gli utenti

---

## 💾 Backup

L'app notifica periodicamente di effettuare un backup.  
Esporta/importa tutto in JSON da **Impostazioni → Backup & Dati**.

---

## 🗺️ Roadmap

- [ ] **v1.1** – Colori nodi personalizzabili per tipo
- [ ] **v1.2** – Sub-task nei progetti
- [ ] **v2.0** – Sync Google Drive per immagini
- [ ] **v2.1** – Tipi elementi completamente custom
- [ ] **v3.0** – Multi-device sync

---

*Fatto con 🦊 e tanta passione*
