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
| 15 | Accesso all'app | Email e password, gestite dall'API (password protette con hash). Solo accesso, niente registrazione dall'app: gli account si creano con un comando (`scripts/crea-utente.ts`). |
| 16 | Cancellare una voce condivisa | Solo chi l'ha creata e condivisa può cancellarla o smettere di condividerla. L'altra persona può modificarla, ma non eliminarla. |
| 17 | Cosa costruire per primo | Le basi: Docker, database completo, accesso, conti, categorie, movimenti. Il resto a pezzi. |
| 18 | Figma | Nuovo file con proposta di layout, barra laterale a sinistra, versione desktop e mobile. |
| 19 | Cuore dell'app | La lista delle spese previste del mese con la spunta "uscito", come nel foglio Spese dell'Excel. Registrare i singoli movimenti è facoltativo (spese fuori lista). Tecnicamente la spunta crea un movimento collegato alla spesa prevista per quel mese. Approvato sulla bozza della Panoramica. |
| 21 | Spese una tantum | Si usano entrambe le strade: **obiettivo con scadenza** per le spese da preparare, **spesa prevista "una volta sola"** per quelle che arrivano e basta. Ogni obiettivo ha la spunta **"Crea spesa al raggiungimento"**: se è attiva, quando l'obiettivo arriva al traguardo l'app crea la sua spesa prevista una tantum, pagata dall'obiettivo (non pesa sul margine del mese). Database aggiornato (migrazione 006). |
| 22 | Strumenti dell'app | React Native puro (senza Expo). Web con react-native-web impacchettato da Vite; navigazione con React Navigation. Accesso salvato nella memoria del browser sul web e con react-native-keychain su iPhone; dati con `fetch`, nessuna libreria per i dati. Il progetto iPhone si prepara da Windows ma si prova solo su un Mac con Xcode. |
| 23 | Inizio del mese | Impostazione a parte nel profilo ("il mese parte il giorno…"), indipendente dal giorno di paga. |
| 24 | Rate | Si inserisce il numero di rate oppure la data finale, con la data della prima: l'app calcola l'altro. |
| 25 | Interfaccia v2 | Spese del mese separate dalle annuali, obiettivi in ordine di scadenza con quanto versare al mese, portafoglio al centro negli investimenti (bozze v2 approvate il 2026-10-23). |
| 26 | Investimenti non quotati | Un investimento è un **titolo quotato** (quantità e prezzo medio di carico) o **non quotato** (costo e valore attuale scritti a mano). L'oro fisico è un tipo di non quotato e non sta in nessun portafoglio. Il valore dell'oro si calcola da peso, purezza e quotazione dell'oro (gold-api.com, salvata ogni giorno: migrazioni 010 e 011); per tutti i non quotati c'è la data di acquisto. |
| 27 | Situazione, non storico | L'app serve a tenere aggiornata la situazione di oggi, non a registrare lo storico delle operazioni: un investimento si corregge (quantità, prezzo medio di carico, portafoglio) invece di registrare acquisti e vendite. Prezzi dei titoli e quotazione dell'oro arrivano da soli (Yahoo Finance, gold-api.com). |
| 28 | Tre fogli | L'app segue i 3 fogli dell'Excel: **Mese** (foglio Spese: sul conto oggi − devono uscire = avanzo, spunte come segno), **Salvadanai** (foglio Trade Republic: le spese annuali si riempiono di un dodicesimo al mese fino alla scadenza; fondo emergenza e obiettivi completi), **Investimenti**; più **Categorie**. Conti, Movimenti e Analisi restano in Impostazioni. Supera la decisione 19 sul movimento creato dalla spunta. |
| 29 | Salvadanai da spese | Ogni obiettivo può avere sia traguardi di copertura sia sotto-obiettivi. Con **"Mettici da parte"** un obiettivo diventa una voce di Spese (ogni mese o ogni anno, cifra proposta e modificabile): spuntata, la cifra entra nel salvadanaio e si divide tra i sotto-obiettivi secondo quanto serve a ciascuno. Le **spese annuali** sono un salvadanaio unico con un sotto-obiettivo per spesa (data e traguardo dalla spesa) e una voce mensile in Spese che lo riempie (migrazione 014). La sezione "Mese" si chiama **Spese**. |
| 30 | Via i movimenti | L'app non tiene entrate e uscite: serve ad annotare le spese e a organizzare i soldi (richiesta di Manuel del 2026-10-24). Eliminati i movimenti, i trasferimenti, i saldi dei conti e il grafico entrate/uscite di Analisi. I **conti** restano come elenco con nome e icona (niente tipo). La spunta resta solo un segno; i budget si spuntano come le altre voci. Le uscite per categoria si calcolano dalle spese spuntate. Torna **Conti** nella barra laterale (con Analisi). Migrazione 015 (copia di sicurezza prima di applicarla). |
| 31 | Icone a griglia | Gli obiettivi (salvadanai) e i conti hanno un'icona scelta dall'utente. Le scelte di icona e di categoria sono **tendine a griglia**, non elenchi. |
| 32 | Spese biennali | Si aggiunge la cadenza **ogni 2 anni** (24 mesi) accanto a mese, anno e ogni N mesi. |
| 33 | Contenitore delle spese annuali | Il salvadanaio delle spese annuali è facoltativo: l'utente lo **usa o no** e lo **mostra o nasconde**. Ogni salvadanaio può essere nascosto (migrazione 015). |
| 34 | Salvadanai a mano, annuali semplici | Le spese annuali (e biennali…) non entrano da sole in un salvadanaio: si vedono **al mese** e, nel mese giusto, **per intero**; se le paga un salvadanaio, la spunta preleva da lì. Ogni salvadanaio ha **"Ricordami di metterci dei soldi"** (ogni mese, 3, 6, 12): una voce in Spese, da versare. La spunta del promemoria è solo un segno e non muove soldi. I soldi si versano a mano; **"Aggiungi quota mensile"** apre il versamento con la quota già scritta (modificabile) e spunta il promemoria del mese; cancellare il versamento toglie la spunta (migrazione 017). Supera le decisioni 29 e 33 per la parte automatica.
| 35 | Categorie contano le spese | La pagina Categorie somma le **spese previste del mese** (non i movimenti, non solo le spuntate), i **budget per intero** (sono una stima) e le rate in scadenza. I promemoria dei salvadanai non sono spese. |
| 36 | Excel come riferimento | Le **annuali contano ogni mese con la quota mensilizzata** (importo / ogni_mesi), non l'importo intero: la spunta vuol dire "quota messa da parte", vale in ogni mese e non muove soldi; nel mese di uscita la riga mostra anche l'importo intero come informazione. Il contenitore delle annuali non ha un promemoria suo; il prelievo quando la spesa esce si scrive a mano con "Togli". In Spese **"Quanto mettere su ogni conto"**: per conto, quanto serve per le voci non spuntate e il totale del mese. In Categorie e Analisi il **peso sullo stipendio**. (La nota sui versamenti è stata provata e tolta: migrazioni 018 e 019.) Supera la parte "annuali nel mese" della decisione 34 e il prelievo automatico alla spunta.
| 37 | Voci collegate | Ciò che nasce dall'altro è bloccato e si modifica dall'origine; le voci indipendenti restano libere. **a)** Un sotto-salvadanaio creato da "Dividi per spesa" (figlio del salvadanaio delle annuali, pagato da una spesa) nasce dalla spesa: nome, traguardo, scadenza, "dentro un altro", "crea spesa", promemoria ed Elimina si cambiano dalla spesa; restano liberi icona, nascosto, versamenti e traguardi di copertura. **b)** Il promemoria di un salvadanaio e la spesa creata al raggiungimento del traguardo nascono dal salvadanaio: nome, importo, frequenza, scadenza, tipo, salvadanaio pagante (e conto per il promemoria) ed Elimina si cambiano dal salvadanaio; restano libere categoria, note, attiva e divisione. **c)** Il salvadanaio delle "Spese annuali" non ha il "Ricordami": la quota mensile è la somma delle annuali che contiene (in Spese, box Annuali). L'API risponde 409 a chi prova lo stesso (anche creando un promemoria su a o c). |
| 38 | Spesa: scadenza senza anno | Nel modulo della spesa la scadenza non mostra né chiede l'anno: due scelte facoltative, **Giorno** (1-31) e **Mese**. Giorno+mese = ogni anno (o ogni N mesi) in quel giorno; solo giorno = quel giorno di ogni mese; solo mese = «marzo», senza giorno (colonna `senza_giorno`, migrazione 020; si salva il giorno 1, ordinamento col giorno 1, si mostra solo il mese); niente = mensile senza giorno. L'anno lo sceglie l'app (prima occorrenza da oggi). Cadenza >1 mese o una volta sola: serve almeno il mese; ogni mese: il mese non serve. Le rate tengono l'anno. Il modulo: «Attiva» in alto accanto al titolo (prop `intestazioneDestra`), «Con chi la dividi» in un box separato in fondo, «Pagata dal salvadanaio» diventa «Monitora con un salvadanaio» (nomi di campi e API invariati). |
| 39 | Salvadanaio nato dalla spesa | Una spesa non si collega a un salvadanaio **esistente**: ne crea uno **nuovo** dal suo modulo («Salvadanaio per questa spesa»), e l'utente sceglie dove metterlo: **da solo**, **sotto un salvadanaio esistente** (tuo e non nato da una spesa; compaiono anche i salvadanai nascosti) o **dentro un nuovo contenitore** libero creato al momento. Nome e icona sono quelli della spesa; traguardo = la tua quota solo per annuali e una tantum (le mensili non ne hanno); scadenza = prossima uscita (vuota se «senza giorno»). Per un'annuale di base va sotto «Spese annuali», se c'è. L'API accetta `nuovo_salvadanaio: { padre_id?, contenitore? }` in POST e PATCH di `/spese-previste`; `obiettivo_id` accetta solo `null` (scollega i vecchi collegamenti; non quelli nati dalla spesa). Colonna `obiettivi.da_spesa` (migrazione 021): un salvadanaio con `da_spesa` e una spesa che lo paga è bloccato come nella decisione 37 a, **ovunque sia nell'albero**; eliminata la spesa torna libero. Anche il «dove» (`padre_id`) è bloccato: per spostarlo si elimina la spesa (dubbio aperto). Supera la tendina «Monitora con un salvadanaio» della 38. |
| 20 | Salvadanai | Annidabili (un salvadanaio può contenerne altri) e non legati a un conto. Il fondo di emergenza è un salvadanaio con i suoi sotto-salvadanai. Traguardo e scadenza facoltativi (la scadenza serve al futuro calendario). Condividere un salvadanaio condivide anche quelli che contiene. Database aggiornato (migrazione 004). Dentro un salvadanaio: **sotto-salvadanai** (con soldi propri, il padre ne fa la somma) e **traguardi di copertura** (un importo senza soldi; mostrano quanta parte ne copre il padre, ognuno da solo, al massimo 100%). |

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
- `conti` – proprietario, nome, icona, archiviato (niente tipo né saldo: decisione 30)
- `categorie` – proprietario, nome, categoria padre, colore, icona
- `spese_previste` – proprietario, nome, importo, frequenza (ogni N mesi, vuota = una volta sola), prossima scadenza, conto, categoria, tipo (fissa / budget variabile / investimento), attiva, obiettivo che la paga (facoltativo)
- `quote` – spesa prevista, utente, percentuale
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

**Conti** – elenco con nome e icona, creare, modificare, archiviare, cancellare.

**Categorie** – albero completo, creare, modificare (nome, padre, colore, icona), cancellare spostando le voci su un'altra categoria.

**Spese previste** – elenco, creare, modificare, cancellare, prossime scadenze.

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
- Icone delle categorie standard: applicate come da proposta del registro (migrazione 008), da confermare.
- Pubblicare la libreria Figma (lo fa Manuel da Figma), così le schermate si possono spostare nel file dei mockup.
- Prima prova dell'app su iPhone (serve un Mac con Xcode).

## Rimandato

- Investimenti avanzati (idee di Manuel, 2026-10-22): prezzi e composizioni da fonti ufficiali; investimenti manuali; ricerca di un titolo con prezzo medio di carico impostato a mano; portafogli simulati salvati come "idee di investimento" e valutati su intervalli di tempo. Il database ha già titoli, operazioni, prezzi ed esposizioni; per le idee serviranno tabelle nuove.

- Lettura automatica delle spese (Wallet / comando rapido iPhone / open banking).
