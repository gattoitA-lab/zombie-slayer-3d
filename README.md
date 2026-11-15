# 🧟 Zombie Slayer 3D

Sparatutto survival 3D nel browser: ondate di zombie, eroi, torri, negozio e modalità online con lobby e riconnessione automatica.

Il gioco è un singolo file `index.html` (Three.js caricato da CDN tramite import map): nessuna build, nessuna dipendenza da installare.

## 🎮 Gioca

**Online:** https://gattoitA-lab.github.io/zombie-slayer-3d/

In locale basta aprire `index.html` con un server statico, ad esempio:

```bash
npx serve .
```

## 🔄 Aggiornare il gioco

Il repository è la fonte unica del gioco: ogni push su `main` ripubblica automaticamente il sito su GitHub Pages (workflow in `.github/workflows/pages.yml`).

```bash
# dopo una modifica a index.html
git add index.html
git commit -m "Aggiornamento gioco"
git push
```

Dopo circa un minuto la nuova versione è online. In collaborazione, chi lavora al gioco aggiorna `index.html`, fa commit e push: la pubblicazione è automatica per entrambi.

## 📁 Struttura

| File | Descrizione |
| --- | --- |
| `index.html` | Tutto il gioco (HTML, CSS, JS) |
| `.github/workflows/pages.yml` | Pubblicazione automatica su GitHub Pages |

## ⚠️ Note

- Il salvataggio dei progressi e le lobby online tra dispositivi diversi richiedono la configurazione Firebase dentro `index.html` (`FIREBASE_CONFIG`). Senza config, account e monete restano nel browser e le lobby funzionano tra schede dello stesso browser.
- La grafica 3D usa WebGL, quindi serve un browser aggiornato.
