# 🧟 Zombie Slayer 3D

Sparatutto survival 3D nel browser: ondate di zombie, eroi, torri, negozio e modalità online con lobby e riconnessione automatica.

Il gioco è un singolo file `index.html` (Three.js caricato da CDN tramite import map): nessuna build, nessuna dipendenza da installare.

## 🎮 Gioca

**Online:** https://gattoita-lab.github.io/zombie-slayer-3d/

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

- L'online tra dispositivi funziona senza configurazione tramite un broker MQTT pubblico (`broker.emqx.io`): crea una lobby e condividi codice o link. Le stanze sono pubbliche sul broker, quindi non condividere dati personali.
- Gli account sono cloud (`CLOUD_API`, backend in `cloud/`): lo stesso nome e la stessa password funzionano su PC, tablet e telefono e i progressi si sincronizzano. La password non lascia il dispositivo: il browser calcola un verifier PBKDF2 e il server conserva solo il suo hash. Senza connessione l'accesso all'account non è disponibile; la modalità ospite resta locale.
- Firebase (`FIREBASE_CONFIG`) resta opzionale come alternativa: se compilato ha la precedenza sul backend incluso.
- Gli account creati prima di questa versione restano locali: alla prima registrazione cloud con lo stesso nome e password il salvataggio locale viene copiato nell'account cloud.
- La grafica 3D usa WebGL, quindi serve un browser aggiornato.
