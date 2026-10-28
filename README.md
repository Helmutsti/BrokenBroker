# BrokenBroker

App di finanza personale per capire il proprio tenore di vita: quanto si risparmia davvero, se una spesa è sostenibile, come vanno rate, obiettivi e investimenti. Pensata per due persone che vivono insieme: ognuna ha i suoi dati privati e può condividere spese, budget e obiettivi.

Oggi c'è la versione per **computer** (pagina web). La versione per iPhone usa lo stesso codice ma va ancora provata su un Mac.

## Cosa fa

- **Panoramica** del mese, come il foglio Excel: il saldo che scrivi tu, le spese previste da spuntare quando escono (la spunta è solo un segno), quanto deve ancora uscire e quanto resta davvero.
- **Spese previste** ogni mese, ogni N mesi o una volta sola, divise a metà o con altre quote con l'altra persona.
- **Obiettivi** annidabili, con sotto-obiettivi e traguardi di copertura (es. il fondo di emergenza).
- **Movimenti** e **budget** come strumento a parte, **conti** come etichette, **investimenti** con prezzo medio di carico, **analisi** con "posso permettermelo?" e controllo delle rate, **categorie** con icone.

## Installare su un computer

Serve solo **Docker** (Docker Desktop su Windows e macOS, Docker Engine su Linux).

1. Scarica il progetto:
   ```
   git clone https://github.com/Helmutsti/BrokenBroker.git
   cd BrokenBroker
   ```
2. Crea il file delle impostazioni dall'esempio:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - Linux e macOS: `cp .env.example .env`
3. Apri `.env` e scrivi due password lunghe e diverse in `DB_ADMIN_PASSWORD` e `APP_DB_PASSWORD` (solo lettere, numeri, `-` e `_`). Il file `.env` resta solo su quel computer: non va condiviso né caricato su GitHub.
4. Avvia tutto:
   ```
   docker compose up -d --build
   ```
   La prima volta Docker scarica Postgres, costruisce API e app, crea il database e lo prepara.
5. Crea gli account (uno per persona). Il comando stampa la password, generata a caso:
   ```
   docker compose exec api node scripts/crea-utente.ts nome@esempio.it Nome
   ```
6. Apri **http://localhost:8080** e accedi: le categorie di base sono già pronte. Dall'app non ci si può registrare.

Per farlo usare anche alla seconda persona dalla stessa rete, si apre `http://<indirizzo-del-computer>:8080` da un altro dispositivo.

## Uso di tutti i giorni

| Cosa | Comando |
|---|---|
| Fermare | `docker compose stop` |
| Riavviare | `docker compose start` |
| Aggiornare a una versione nuova | `git pull` e poi `docker compose up -d --build` |

I dati stanno nel database dentro Docker e restano anche dopo stop e aggiornamenti. **Backup** e **spostamento su un altro computer** sono spiegati in [INSTALLAZIONE.md](INSTALLAZIONE.md).

Porte usate (si cambiano in `.env`): app `8080`, API `3000`, database `5433` (solo da quel computer).

## Per chi sviluppa

- `api/`: API in Node 24 + TypeScript + Express, database Postgres 17 con le regole di visibilità nel database. Prove: `node api/prove/prove-funzioni.mjs` con l'API avviata.
- `app/`: app in React Native; sul web con react-native-web e Vite. In sviluppo: `cd app`, `npm install`, `npm run web` (http://localhost:5173, usa l'API in Docker).
- `docs/design/`: flussi, schermate, componenti, token e registro del design (Figma).
- `DECISIONI.md`: scopo, tappe e decisioni del progetto. `AGENTS.md`: istruzioni per gli assistenti di programmazione.
- Dati di prova per vedere l'app piena: `node api/prove/dati-esempio.mjs` (credenziali di prova in cima al file, solo per uso locale).
