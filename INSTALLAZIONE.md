# Installazione di database, API e app

Fase iniziale: database (Postgres 17) e API (Node 24 + Express) girano in Docker sulla stessa macchina; l'app per il computer si avvia con Node (sezione in fondo).

## Cosa serve

- Docker con Docker Compose (Docker Desktop su Windows/macOS, Docker Engine su Linux).
- Questa cartella del progetto, copiata sulla macchina.

Nient'altro: Node e Postgres sono dentro i container.

## Prima installazione

1. Apri un terminale nella cartella del progetto.
2. Crea il file delle impostazioni partendo dall'esempio:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - Linux/macOS: `cp .env.example .env`
3. Apri `.env` e metti due password lunghe e diverse in `DB_ADMIN_PASSWORD` e `APP_DB_PASSWORD`.
   Usa solo lettere, numeri, `-` e `_` (finiscono dentro un indirizzo di connessione).
4. Avvia tutto:
   ```
   docker compose up -d --build
   ```
   Docker scarica Postgres, costruisce l'API, crea tabelle e regole, poi avvia l'API.
5. Controlla che risponda:
   ```
   curl http://localhost:3000/salute
   ```
   Risposta attesa: `{"stato":"ok"}`

## Creare gli account

Dall'app ci si può solo accedere. Gli account si creano così (il comando stampa la password generata):

```
docker compose exec api node scripts/crea-utente.ts nome@esempio.it Nome
```

## Uso quotidiano

| Cosa | Comando |
|------|---------|
| Fermare | `docker compose stop` |
| Riavviare | `docker compose start` |
| Vedere i messaggi dell'API | `docker compose logs -f api` |
| Aggiornare dopo una modifica al codice o al database | `docker compose up -d --build` |

Le modifiche alla struttura del database sono i file in `api/db/migrazioni/`: a ogni avvio vengono applicati solo quelli nuovi, nell'ordine dei numeri.

I dati stanno nel volume Docker `dati_db`: sopravvivono a stop, riavvii e ricostruzioni. Si perdono solo con `docker compose down -v` (da non usare se non si vuole cancellare tutto).

## Backup

Crea un file con tutto il database:

```
mkdir backup
docker compose exec -T db pg_dump -U fp_admin -d finanza --format=custom > backup/finanza.dump
```

Su Windows PowerShell 5.1 il simbolo `>` può rovinare i file binari: usa invece

```
docker compose exec -T db pg_dump -U fp_admin -d finanza --format=custom -f /tmp/finanza.dump
docker compose cp db:/tmp/finanza.dump backup/finanza.dump
```

## Spostare tutto su un'altra macchina

1. Sulla macchina vecchia fai il backup (sopra).
2. Copia sulla macchina nuova la cartella del progetto, compresi `.env` e `backup/finanza.dump`.
   Senza `node_modules`: non serve.
3. Sulla macchina nuova avvia il database e prepara struttura e ruolo dell'API
   (serve prima del ripristino, perché il backup contiene i permessi di quel ruolo):
   ```
   docker compose up -d db
   docker compose run --rm --build migrazioni
   ```
4. Ripristina i dati (sostituisce la struttura vuota appena creata):
   ```
   docker compose cp backup/finanza.dump db:/tmp/finanza.dump
   docker compose exec db pg_restore -U fp_admin -d finanza --clean --if-exists --no-owner /tmp/finanza.dump
   ```
5. Avvia il resto:
   ```
   docker compose up -d --build
   ```
   Le migrazioni vedono che sono già applicate e non toccano i dati.

## Guardare i dati con un client SQL

Il database è raggiungibile solo da questa macchina su `localhost:5433`
(database `finanza`, utente `fp_admin`, password `DB_ADMIN_PASSWORD`).
Attenzione: come amministratore si vedono i dati di tutti, senza le regole di visibilità.

## Prova veloce dell'API

```
# registrazione (crea anche le categorie standard) → restituisce un token
curl -X POST http://localhost:3000/accesso/registrazione -H "Content-Type: application/json" \
     -d '{"email":"io@esempio.it","nome":"Io","password":"una-password-lunga"}'

# con il token ottenuto
curl http://localhost:3000/categorie -H "Authorization: Bearer <token>"
```

## Prove automatiche

Le prove creano utenti nuovi, quindi vogliono la registrazione aperta: si avvia l'API con `REGISTRAZIONE_APERTA=si` nel file `.env` (da togliere dopo, e da non usare su un database con dati veri). Con l'API avviata:

```
node api/prove/prove-funzioni.mjs
```

Crea ogni volta due utenti nuovi e prova spese previste, spunte, budget, condivisione e quote, obiettivi, rate, regole, investimenti e analisi.
`api/prove/prove-basi.mjs` (accesso, conti, categorie, movimenti) e `api/prove/prove-obiettivi-db.mjs` (regole del database sugli obiettivi) vogliono come argomento la cartella del progetto.

Dati di prova per vedere l'app piena: `node api/prove/dati-esempio.mjs` (le credenziali di prova sono scritte in cima al file).

## App per il computer (pagina web)

L'app è in `app/` (React Native; sul web con react-native-web e Vite). Serve Node 24 sulla macchina.

```
cd app
npm install
npm run web
```

Apri `http://localhost:5173`. In sviluppo le chiamate a `/api` vanno all'API in Docker sulla porta 3000.
Per usarla senza Node basta `docker compose up -d --build`: il servizio `app` costruisce la pagina e la serve su `http://localhost:8080` (porta `APP_PORTA` in `.env`), passando le chiamate `/api` all'API.
Per costruire la versione da pubblicare: `npm run build:web` (risultato in `app/dist`). Controllo dei tipi: `npm run check`.
La versione per iPhone usa lo stesso codice (`app/index.js`); il progetto iOS va generato e provato su un Mac con Xcode.

## Funzioni disponibili in questa fase

| Metodo | Indirizzo | Cosa fa |
|--------|-----------|---------|
| GET | `/salute` | controllo che API e database rispondano |
| POST | `/accesso/registrazione` | nuovo utente (email, nome, password ≥ 10 caratteri) + categorie standard; chiusa se `REGISTRAZIONE_APERTA` non è `si` |
| POST | `/accesso/accesso` | accesso con email e password → token valido 30 giorni |
| POST | `/accesso/uscita` | chiude la sessione |
| GET, PATCH | `/profilo` | nome, stipendio netto, giorno di paga, giorno di inizio del mese (`inizio_mese`, 1-28) |
| GET, POST | `/conti` | elenco con saldo attuale (`?archiviati=true` per vedere anche gli archiviati), nuovo conto |
| GET, PATCH, DELETE | `/conti/:id` | dettaglio, modifica, cancellazione (solo il proprietario) |
| GET, POST | `/categorie` | albero (`?formato=elenco` per la lista piatta), nuova categoria |
| PATCH, DELETE | `/categorie/:id` | modifica (nome, padre, colore, icona, ordine), cancellazione (`?sposta_su=<id>` se in uso) |
| GET, POST | `/movimenti` | elenco con filtri (`dal`, `al`, `conto_id`, `categoria_id`, `cerca`, `limite`, `salta`), inserimento veloce |
| GET | `/movimenti/suggerimento?esercente=` | conto e categoria usati l'ultima volta con quell'esercente |
| POST | `/movimenti/trasferimento` | spostamento tra due conti |
| GET, PATCH, DELETE | `/movimenti/:id` | dettaglio, modifica, cancellazione |
| GET | `/categorie/spese?mese=` | speso nel mese per categoria (senza sottocategorie) |
| GET, POST | `/spese-previste` | elenco con lo stato nel mese (`?mese=AAAA-MM`, `?solo_mese=true`), nuova spesa (fissa, budget, investimento; ogni N mesi o una volta sola) |
| GET, PATCH, DELETE | `/spese-previste/:id` | dettaglio con le quote, modifica, cancellazione (solo chi l'ha creata) |
| POST, DELETE | `/spese-previste/:id/spunta` | spunta "uscito" del mese (crea o toglie il movimento collegato; se la paga un obiettivo, preleva dall'obiettivo) |
| PUT | `/spese-previste/:id/quote` | divisione tra le persone (`[{utente_id, percentuale}]`, somma 100; vuoto = di base) |
| GET, POST | `/condivisioni` | cosa è condiviso; condividere un conto, una spesa, un movimento o un obiettivo con un'email |
| DELETE | `/condivisioni/:id` | smettere di condividere (solo chi ha condiviso) |
| GET | `/persone` | io e le persone con cui c'è una condivisione |
| GET, POST | `/obiettivi` | albero con saldo, traguardo, percentuale e traguardi di copertura; nuovo obiettivo |
| GET, PATCH, DELETE | `/obiettivi/:id` | dettaglio con i versamenti, modifica, cancellazione |
| POST | `/obiettivi/:id/versamenti` | mettere via (positivo) o prelevare (negativo); crea la spesa al traguardo se richiesto |
| DELETE | `/obiettivi/versamenti/:id` | cancella un versamento |
| POST | `/obiettivi/:id/traguardi` | nuovo traguardo di copertura |
| PATCH, DELETE | `/obiettivi/traguardi/:id` | modifica o cancella un traguardo |
| GET, POST | `/rate` | elenco con rate pagate, rimanenti e debito; nuova rata (numero di rate oppure ultima scadenza) |
| GET, PATCH, DELETE | `/rate/:id` | dettaglio, modifica, cancellazione |
| GET, PUT | `/regole` | regole sulle rate (massimo aperte, tetto in % dello stipendio, mensilità di debito) |
| GET | `/investimenti/portafoglio` | posizioni (lotti sommati, prezzo medio di carico), beni, valore, guadagno, peso, titoli senza prezzo; solo i portafogli che contano nel patrimonio (`?portafoglio_id=` per uno solo) |
| GET | `/investimenti/andamento?mesi=` | valore e soldi messi dentro a fine mese (`?settimane=`, `?portafoglio_id=`) |
| GET | `/investimenti/esposizione` | distribuzione per tipo, area, settore |
| GET, POST | `/investimenti/titoli` | cerca (`?cerca=`) o aggiunge un titolo (ISIN) |
| PUT | `/investimenti/titoli/:id/prezzi` | prezzo di un giorno, inserito a mano |
| POST | `/investimenti/titoli/:id/prezzi/leggi` | «Leggi dalla borsa»: scarta il prezzo di oggi e rilegge da Yahoo (502 se non risponde) |
| PUT | `/investimenti/titoli/:id/esposizioni` | composizione per tipo, area o settore |
| GET, POST | `/investimenti/portafogli` | elenco con totali; nuovo portafoglio |
| GET, PATCH, DELETE | `/investimenti/portafogli/:id` | dettaglio con posizioni e beni, modifica (nome, icona, `conta_nel_patrimonio`), cancellazione (solo se vuoto, altrimenti 409) |
| GET, POST | `/investimenti/lotti` | lotti di una posizione (`?titolo_id=&portafoglio_id=`); nuovo lotto (un acquisto, con data e ora) |
| PATCH, DELETE | `/investimenti/lotti/:id` | modifica o cancella un lotto |
| PATCH, DELETE | `/investimenti/posizioni` | sposta in un altro portafoglio o toglie tutti i lotti di un titolo |
| GET, POST | `/investimenti/beni` | beni non quotati o con prezzo di mercato (voce del catalogo) |
| PATCH, DELETE | `/investimenti/beni/:id` | modifica o cancella un bene |
| GET | `/investimenti/catalogo` | oro, argento, platino, palladio e monete, con la quotazione spot |
| GET | `/investimenti/metalli/quotazioni` | quotazione spot dei quattro metalli |
| GET | `/analisi/mese?mese=` | quanto resta davvero, risparmio e semaforo, da pagare, entrate e uscite reali |
| GET | `/analisi/storico?mesi=` | entrate e uscite mese per mese |
| GET | `/analisi/patrimonio` | conti + investimenti − rate da pagare |
| GET | `/analisi/proiezione` | patrimonio fra 1 mese, 1 anno, 5 anni (contando la fine delle rate) |
| GET | `/analisi/rate` | controllo delle rate rispetto alle regole |
| POST | `/analisi/posso-permettermelo` | prova di un acquisto: costo mensile, peso sul margine, regole, esito |

Tutte tranne `/salute`, registrazione e accesso richiedono l'intestazione `Authorization: Bearer <token>`.
Importi come testo decimale (`"-12.50"`): negativi le uscite, positivi le entrate. Date `AAAA-MM-GG`.
