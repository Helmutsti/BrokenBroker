# Finanza personale – Decisioni

Documento delle decisioni del progetto. Si aggiorna a ogni scelta.

## Scopo

Un'app per capire il proprio tenore di vita: quanto si risparmia davvero dopo 1 mese, 1 anno, 5 anni, e un "indice" per capire se una spesa è sostenibile o quanto intacca il risparmio, anche quando i soldi ci sono o si può pagare a rate.

Nasce dal file `Finanza personale.xlsx` (Desktop), che oggi contiene: spese mensili/annuali/variabili/rate, salvadanai su Trade Republic (spese annuali, fondi emergenza, obiettivi), portafoglio ETF, due registri giornalieri abbandonati, una vecchia analisi con grafici a torta.

## Tappe

1. Struttura del database ✔
2. Funzioni esposte dall'API ✔ (proposta)
3. Database e API in Docker, con istruzioni per reinstallarli ✔ (tutte le funzioni della proposta, 60 prove automatiche)
4. Disegno su Figma ✔ per il computer (libreria completa, 11 schermate con i componenti); telefono rinviato
5. Sviluppo dell'app (iPhone + web) ← **siamo qui**: versione per computer fatta (tutte le sezioni); iPhone da provare su un Mac
6. Passaggio a Vercel + Neon

## Decisioni prese

| # | Tema | Decisione |
|---|------|-----------|
| 1 | Lettura automatica spese (Wallet) | Rimandata. Per ora i movimenti si inseriscono a mano: l'inserimento deve essere velocissimo, con categoria e conto proposti. |
| 2 | Tipo di app | App iPhone + pagina web, in React Native. L'app deve essere pronta da installare, ma per ora non si installa sul telefono. |
| 3 | Dove gira | Vercel (pagina web + funzioni). |
| 4 | Database | Neon (Postgres). Uso sempre con internet. |
| 5 | Utenti | Multi-utente. Per ora due persone. Ognuno ha i suoi dati privati: l'altro vede solo ciò che gli viene concesso. |
| 6 | Cosa si condivide | Spese, obiettivi, conti. Il resto (rate, investimenti, fondi emergenza, regole, fotografia di fine mese) resta privato. |
| 7 | Livelli di condivisione | Nessun livello. Una voce è **privata** oppure **condivisa**: se è condivisa, è una collaborazione e entrambi vedono e modificano tutto. |
| 8 | Categorie | Gerarchiche (es. Casa › Veicoli › Assicurazione), personalizzabili con colore e icona. Niente etichette libere. Ogni utente ha le sue; una voce condivisa si vede con la categoria di chi l'ha creata. |
| 9 | Cartella progetto | `Desktop\finanza-personale` |
| 10 | Categorie iniziali | L'app crea per ogni utente, al primo accesso, l'elenco standard qui sotto; poi è tutto personalizzabile. |
| 11 | Fase iniziale | Database (Postgres) e API girano in Docker, con istruzioni per reinstallarli su un'altra macchina. Vercel + Neon (decisioni 3 e 4) restano la destinazione successiva: Neon è Postgres, quindi il passaggio è diretto. |
| 12 | Linguaggio delle funzioni | Node.js con TypeScript (stesso linguaggio dell'app React Native). |
| 13 | Framework API | Express. |
| 14 | Accesso al database | SQL scritto a mano, dipendenze ridotte al minimo: solo il driver Postgres (`pg`). Le modifiche alla struttura sono file `.sql` numerati, applicati da un piccolo script. |
| 15 | Accesso all'app | Email e password, gestite dall'API (password protette con hash). Sull'iPhone, in seguito, sblocco con Face ID. Solo accesso, niente registrazione dall'app: gli account si creano con un comando (`scripts/crea-utente.ts`). |
| 16 | Cancellare una voce condivisa | Solo chi l'ha creata e condivisa può cancellarla o smettere di condividerla. L'altra persona può modificarla, ma non eliminarla. |
| 17 | Cosa costruire per primo | Le basi: Docker, database completo, accesso, conti, categorie, movimenti. Il resto a pezzi. |
| 18 | Figma | Nuovo file con proposta di layout, barra laterale a sinistra, versione desktop e mobile. |
| 19 | Cuore dell'app | La lista delle spese previste del mese con la spunta "uscito", come nel foglio Spese dell'Excel. Registrare i singoli movimenti è facoltativo (spese fuori lista). Tecnicamente la spunta crea un movimento collegato alla spesa prevista per quel mese. Approvato sulla bozza della Panoramica. |
| 21 | Spese una tantum | Si usano entrambe le strade: **obiettivo con scadenza** per le spese da preparare, **spesa prevista "una volta sola"** per quelle che arrivano e basta. Ogni obiettivo ha la spunta **"Crea spesa al raggiungimento"**: se è attiva, quando l'obiettivo arriva al traguardo l'app crea la sua spesa prevista una tantum, pagata dall'obiettivo (non pesa sul margine del mese). Database aggiornato (migrazione 006). |
| 22 | Strumenti dell'app | React Native puro (senza Expo). Web con react-native-web impacchettato da Vite; navigazione con React Navigation. Accesso salvato nella memoria del browser sul web e con react-native-keychain su iPhone; dati con `fetch`, nessuna libreria per i dati. Il progetto iPhone si prepara da Windows ma si prova solo su un Mac con Xcode. |
| 23 | Inizio del mese | Impostazione a parte nel profilo ("il mese parte il giorno…"), indipendente dal giorno di paga. |
| 24 | Rate | Si inserisce il numero di rate oppure la data finale, con la data della prima: l'app calcola l'altro. |
| 20 | Obiettivi | Annidabili (un obiettivo può contenere altri obiettivi) e non legati a un conto. Il fondo di emergenza è un obiettivo con i suoi sotto-obiettivi. Traguardo e scadenza facoltativi (la scadenza serve al futuro calendario). Condividere un obiettivo condivide anche quelli che contiene. Database aggiornato (migrazione 004). Dentro un obiettivo: **sotto-obiettivi** (ceste con soldi propri, il padre ne fa la somma) e **traguardi di copertura** (un importo senza soldi; mostrano quanta parte ne copre il padre, ognuno da solo, al massimo 100%). |

**Scelte tecniche fatte durante la costruzione** (Postgres 17 e Node 24 in Docker): password protette con scrypt incluso in Node; sessioni con token salvato solo come impronta, valide 30 giorni; un movimento su un conto condiviso lo può cancellare chi l'ha inserito o il proprietario del conto; una "spesa condivisa" può essere una spesa prevista oppure un singolo movimento (*da confermare*). Dettagli e comandi in `INSTALLAZIONE.md`.

## Categorie iniziali (approvate)

- **Casa:** affitto, bollette (luce, gas, internet e telefono), Tari, manutenzione, arredamento
- **Cibo:** supermercato, ristoranti, pranzo fuori, bar, consegne a domicilio
- **Trasporti:** carburante, assicurazione, bollo, revisione e manutenzione, parcheggio e box, mezzi pubblici, pedaggi
- **Abbonamenti:** streaming, musica, software, cloud, telefono
- **Svago:** uscite, hobby, viaggi e vacanze, libri e giochi
- **Salute e cura:** farmacia, visite, ottico, cura personale, sport
- **Shopping:** vestiti, tecnologia, regali
- **Animali:** cibo, veterinario
- **Finanza:** rate, commissioni, tasse, risparmio e investimenti
- **Lavoro:** domini e siti, strumenti di lavoro
- **Altro**
- **Entrate:** stipendio, rimborsi, regali ricevuti, altre entrate

(Nota: "bollette" ha sottocategorie proprie, quindi l'albero arriva a tre livelli.)

## Struttura del database – prima proposta

Importi in euro con due decimali (`numeric(12,2)`). La visibilità è imposta dal database (Row Level Security).

**Persone e condivisione**
- `utenti` – nome, email, stipendio netto, giorno di paga
- `condivisioni` – tipo voce (conto / spesa / obiettivo), id voce, proprietario, condiviso con (se la riga esiste, la voce è in collaborazione)

**Soldi di tutti i giorni**
- `conti` – proprietario, nome, tipo, saldo di partenza e data; saldo attuale calcolato dai movimenti
- `categorie` – proprietario, nome, categoria padre, colore, icona
- `spese_previste` – proprietario, nome, importo, frequenza (ogni N mesi, vuota = una volta sola), prossima scadenza, conto, categoria, tipo (fissa / budget variabile / investimento), attiva, obiettivo che la paga (facoltativo)
- `quote` – voce (spesa prevista o movimento), utente, percentuale
- `movimenti` – conto, data, importo, esercente, descrizione, categoria, inserito da, origine (manuale / import), collegamenti opzionali a spesa prevista, rata, obiettivo; i trasferimenti tra conti sono due movimenti collegati
- "chi deve cosa" – calcolato da quote e pagamenti reali

**Impegni e risparmi**
- `rate` – proprietario, oggetto, finanziaria, totale, importo rata, numero rate, prima scadenza, conto
- `obiettivi` – proprietario, nome, obiettivo padre (annidamento), traguardo e scadenza facoltativi, "crea spesa al raggiungimento", spesa già creata
- `versamenti` – obiettivo, utente, data, importo
- `traguardi_copertura` – obiettivo, nome, importo, ordine (la percentuale coperta si calcola dal padre, al massimo 100%)

**Investimenti**
- `titoli` – ISIN, ticker, nome, tipo
- `operazioni` – titolo, conto, data, acquisto/vendita, quantità, prezzo, commissioni
- `prezzi` – titolo, data, prezzo
- `esposizioni` – titolo, dimensione (area / settore), voce, peso

**Regole e analisi**
- `regole` – proprietario, tipo (max rate contemporanee, tetto rate, max mensilità di debito), valore
- `prove_acquisto` – oggetto, prezzo, a rate sì/no, numero rate, vita utile, criteri della spesa utile, esito
- `chiusure_mensili` – utente, mese, entrate, uscite, risparmio, patrimonio

## Funzioni dell'API – prima proposta

**Accesso e profilo** – accedere, leggere/modificare il profilo (stipendio netto, giorno di paga).

**Conti** – elenco con saldo attuale, creare, modificare, cancellare.

**Categorie** – albero completo, creare, modificare (nome, padre, colore, icona), cancellare spostando le voci su un'altra categoria.

**Spese previste** – elenco, creare, modificare, cancellare, prossime scadenze.

**Movimenti** – elenco con filtri (periodo, conto, categoria), inserimento veloce, modifica, cancellazione, trasferimento tra conti, suggerimento di categoria e conto a partire dall'esercente.

**Quote e chi deve cosa** – saldo tra le due persone, segnare un debito come saldato.

**Rate** – elenco, creare, modificare, chiudere, calendario delle rate per mese.

**Obiettivi e salvadanai** – elenco con avanzamento, creare, modificare, cancellare, aggiungere un versamento.

**Investimenti** – titoli, operazioni di acquisto/vendita, aggiornamento prezzi, portafoglio (valore, guadagno, esposizione per area e settore).

**Condivisione** – condividere o smettere di condividere un conto, una spesa o un obiettivo; elenco di ciò che è condiviso.

**Regole** – leggere e modificare le proprie regole.

**Analisi**
- quanto resta davvero questo mese (stipendio − fisse − variabili − rate − quota mensile delle annuali)
- percentuale di risparmio con semaforo
- proiezione a 1 mese, 1 anno, 5 anni (tiene conto della fine delle rate)
- "posso permettermelo?" (costo mensile reale, peso sul margine, mesi di risparmio, rispetto delle regole, 7 criteri, esito)
- controllo delle rate rispetto alle regole
- prossime uscite annuali rispetto al salvadanaio
- chiusura del mese e storico mese per mese
- patrimonio (conti + salvadanai + investimenti − rate da pagare)

## Sul tavolo

- Riempimento delle barre nei componenti Figma (rinviato: "poi lo implementeremo"; nell'app le barre sono già vere).
- Colori delle categorie: ancora da scegliere.
- Icone delle categorie standard: applicate come da proposta del registro (migrazione 008), da confermare.
- Pubblicare la libreria Figma (lo fa Manuel da Figma), così le schermate si possono spostare nel file dei mockup.
- Prima prova dell'app su iPhone (serve un Mac con Xcode).

## Rimandato

- Investimenti avanzati (idee di Manuel, 2026-10-22): prezzi e composizioni da fonti ufficiali; investimenti manuali; ricerca di un titolo con prezzo medio di carico impostato a mano; portafogli simulati salvati come "idee di investimento" e valutati su intervalli di tempo. Il database ha già titoli, operazioni, prezzi ed esposizioni; per le idee serviranno tabelle nuove.

- Lettura automatica delle spese (Wallet / comando rapido iPhone / open banking).
