# Funzioni e flussi

Cosa deve permettere di fare l'interfaccia (funzioni) e il percorso per farlo (flussi). Vengono prima dei componenti e delle schermate: un componente nasce perché un flusso lo chiede. Superfici: computer (pagina web, barra laterale a sinistra) e telefono (app iPhone) · Comandi: mouse e tastiera sul computer, tocco e gesti sul telefono.

## Funzioni
Le decide l'utente. Primo giro (decisione del 2026-10-22): **basi più analisi**.

| # | Funzione | Gruppo |
|---|---|---|
| F1 | Registrarsi con email, nome e password | Accesso |
| F2 | Entrare con email e password | Accesso |
| F3 | Uscire | Accesso |
| F4 | Impostare stipendio netto e giorno di paga | Profilo |
| F5 | Vedere i conti con il saldo attuale | Conti |
| F6 | Creare un conto | Conti |
| F7 | Modificare o archiviare un conto | Conti |
| F8 | Cancellare un conto (solo chi l'ha creato) | Conti |
| F9 | Inserire una spesa o un'entrata in pochi tocchi, con conto e categoria proposti in base all'esercente | Movimenti |
| F10 | Vedere i movimenti con i filtri (periodo, conto, categoria, ricerca) | Movimenti |
| F11 | Modificare o cancellare un movimento | Movimenti |
| F12 | Spostare soldi tra due conti | Movimenti |
| F13 | Vedere l'albero delle categorie | Categorie |
| F14 | Creare, rinominare o spostare una categoria, con colore e icona | Categorie |
| F15 | Cancellare una categoria spostando le sue voci su un'altra | Categorie |
| F16 | Vedere quanto resta davvero questo mese | Analisi |
| F17 | Vedere la percentuale di risparmio, con semaforo | Analisi |
| F18 | Vedere la proiezione dei risparmi a 1 mese, 1 anno, 5 anni | Analisi |
| F19 | Chiedere "posso permettermelo?" per un acquisto, anche a rate | Analisi |
| F20 | Controllare le rate rispetto alle proprie regole | Analisi |
| F21 | Vedere le prossime uscite annuali rispetto al salvadanaio | Analisi |
| F22 | Vedere lo storico mese per mese e il patrimonio | Analisi |

## Regole di navigazione
- **Computer:** barra laterale a sinistra, sempre visibile, **più piena di quella del telefono** (decisione di Manuel, 2026-10-22). Contenuto: in cima il pulsante *+ Aggiungi spesa*; sezioni *Panoramica, Spese previste, Obiettivi, Movimenti, Conti, Analisi, Categorie*; in fondo *Profilo* (apre Impostazioni) ed *Esci* (decisione di Manuel, 2026-10-22; uguale in tutte le schermate).
- **Principio:** il mese si gestisce spuntando le spese previste, come nell'Excel; i movimenti singoli sono facoltativi (decisione di Manuel, 2026-10-22).
- **Telefono:** barra in basso con le sezioni principali e un pulsante **+** al centro per aggiungere una spesa (decisione di Manuel, 2026-10-22).
- **Barra del telefono:** Panoramica · Movimenti · **+** · Conti · Analisi. Categorie, profilo e uscita stanno in **Impostazioni**, che si apre dall'icona del profilo in alto nella Panoramica (decisione di Manuel, 2026-10-22).
- [Da decidere: come si apre il dettaglio di una voce e come si torna indietro.]

## Flussi
| # | Flusso | Funzioni | Percorso |
|---|---|---|---|
| 1 | | F1 | [Da dove si parte → cosa si preme → dove si arriva. Casi vuoti ed errori compresi] |

## Schermate che ne derivano
[I luoghi dei flussi: diventano le voci di `schermate.md` con il loro codice `SC-`.]
