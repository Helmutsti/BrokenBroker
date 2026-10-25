# Flussi del telefono

Flussi completi dell'app sul telefono (390×844, tema scuro), disegnati in Figma e valutati sul codice reale (`app/src`). Analisi è esclusa per ora.

**Figma:** file Mockup (`nl92JsXsGc6X41Fy3ircSn`), pagina «Mobile · flussi completi» (id `92:2`). Una sezione per flusso, passi numerati, sotto ogni passo le note Tocca / Gesto / Bottone / Accessibilità, a destra la Valutazione. Bordo arancione = dove si tocca; bordo azzurro + etichetta PROPOSTA = non esiste ancora nell'app.

## Principi (richiesta di Manuel)
- Semplice e accessibile; organizzato per flussi.
- Swipe dove ha senso, **mai da solo**: ogni gesto ha un bottone o una riga toccabile equivalente.
- Occhi stanchi: tema scuro, colori poco luminosi, niente bianchi (fondo `#111315`, schede `#1B1F24`, testo `#F2F2F2`, accento `#8FB0CF`).
- Bersagli ≥ 44 px, etichette scritte (non solo colore).

## Stato attuale dell'app (letto dal codice)
- Navigazione: barra in basso con 6 voci (soglia 720 px), testata con Impostazioni ed Esci. Non c'è il «+» centrale previsto in `flussi.md`.
- **Nessun gesto**: niente swipe sulle righe, niente «tira per aggiornare», niente cambio mese a scorrimento. Si usano solo tocchi.
- I moduli si aprono a schermo pieno (`Finestra`, `FinestraModulo`) con Annulla/Salva fissi in basso.
- Il tema segue il sistema (`useColorScheme`), non c'è una scelta nell'app.

## Tabella dei flussi

| Id | Flusso | Sezione Figma | Passi (tocchi) | Gesto proposto | Bottone sempre presente |
|---|---|---|---|---|---|
| A | Entrare nell'app | `93:2` | Apertura, Accesso, errore, Spese (3) | nessuno | Accedi |
| B | Segnare una spesa come uscita | `93:329` | Scorri alla lista, spunta, annulla, modifica (1-2) | sinistra = Modifica/Elimina; swipe su titolo = mese; tira = aggiorna | spunta, tocco riga, ‹ ›, Aggiorna |
| C | Aggiungere una spesa prevista (anche con salvadanaio) | `94:2` | Aggiungi, modulo, salvadanaio, dove lo metto, salva (4 + 3) | trascina giù = chiudi | + flottante, ×, Annulla, Salva |
| D | Aggiungere/modificare una rata | `94:701` | Aggiungi rata, modulo, lista, modifica/chiusa (5) | destra = pagata; sinistra = Modifica/Elimina | spunta, tocco riga |
| E | Scrivere quanto c'è sul conto | `95:2` | Carta, campo, Salva (3) | nessuno | la carta (con matita) e «Aggiorna il saldo» |
| F | Versare, creare/modificare salvadanai e sotto-salvadanai | `95:525` | Aggiungi quota, Salva (2); nuovo salvadanaio (6+) | destra = Versa; sinistra = Modifica/Elimina | «Versa», matita, Aggiungi sotto-salvadanaio |
| G | Aggiungere un investimento e aggiornare i prezzi | `97:2` | Tipo, ricerca, campi, Salva (7-8); prezzi (3 + 1 campo per titolo) | tira giù = prezzi automatici | Aggiorna i prezzi automatici, Correggi a mano |
| H | Gestire le categorie | `97:661` | Crea (5), modifica (3), elimina (4, confuso) | destra = sottocategoria; sinistra = Modifica/Elimina | matita, freccia, tocco sul nome |
| I | Gestire un conto | `98:2` | Crea (4), condividi (3), archivia (3) | sinistra = Condividi/Archivia | interruttori nel modulo |
| J | Impostazioni ed uscire | `98:492` | Apri (1), salva (3), esci (1) | swipe dal bordo = indietro | icona, ‹ Indietro, Esci |

Sezione di riepilogo con le priorità: `99:2`.

## Problemi trovati

| # | Problema | Dove | Gravità |
|---|---|---|---|
| P1 | La barra riassuntiva che compare scorrendo le Spese ha i **colori invertiti**: nel tema scuro è un blocco **bianco** (`#F2F2F2`). Usa `createPortal(document.body)`, `IntersectionObserver` e `position: fixed`: **funziona solo sul web**, non su iPhone. | `Panoramica.tsx` | Alta |
| P2 | Il tema segue il telefono: nessuna scelta «sempre scuro» nell'app. | `tema/tema.tsx`, Impostazioni | Alta |
| P3 | La lista delle spese inizia dopo circa 700 px (numeri, 2 pulsanti, filtri Raggruppa/Ordina). | `Panoramica.tsx` | Alta |
| P4 | «Aggiungi una spesa/rata» stanno solo in cima e spariscono scorrendo. | `Panoramica.tsx` | Alta |
| P5 | Modulo spesa con circa 12 campi, obbligatori e facoltativi mescolati. | `SpesePreviste.tsx` | Alta |
| P6 | Eliminare una categoria in uso fallisce (409) e solo dopo compare «Sposta su»; serve premere Elimina due volte. | `Categorie.tsx` | Alta |
| P7 | Versare in un salvadanaio: si apre toccando barra, titolo o cifra, nessuno con aspetto di pulsante; link di testo ravvicinati; «Dividi per spesa» e «Aggiungi tutte le annuali» agiscono subito. | `Obiettivi.tsx` | Alta/Media |
| P8 | Esci è a un tocco, senza conferma, accanto all'icona Impostazioni (senza testo). | `TestataCompatta` | Alta |
| P9 | Aggiorna prezzi chiede un campo per titolo anche se i prezzi arrivano da soli. | `Investimenti.tsx` | Alta |
| P10 | Spuntare non dà conferma né «Annulla». | `Panoramica.tsx` | Media |
| P11 | Elimina (rata, conto, salvadanaio) non chiede conferma né dice cosa succede alle voci collegate. | vari | Media |
| P12 | La carta «Sul conto oggi» non sembra un pulsante; nulla avvisa che il saldo è vecchio. | `Panoramica.tsx` | Media |
| P13 | Testi molto piccoli (11-12 px) nella barra in basso e nelle note; barra a 6 voci da 60 px. | `BarraInferiore` | Media |
| P14 | Accesso: la tastiera può coprire il pulsante (da verificare su iPhone); sessione scaduta senza spiegazione. | `Accesso.tsx`, `App.tsx` | Media/Bassa |
| P15 | Impostazioni: un «Salva» per scheda, nessuna freccia indietro, nessuna voce attiva nella barra. | `Impostazioni.tsx` | Media |
| P16 | Nessun gesto in tutta l'app. | ovunque | (richiesta di Manuel) |

## Modifiche proposte (in ordine di priorità)

**Alta**
1. Barra riassuntiva in tema scuro (`#262B31`, testo chiaro), riscritta per funzionare anche su iPhone (P1).
2. Scelta «Sempre scuro» in Impostazioni; controllare che non resti nessun bianco (P2).
3. Spese: Raggruppa/Ordina in un menu «Vista»; la lista parte subito (P3).
4. Pulsante «+» flottante (spesa/rata) (P4).
5. Modulo spesa in due livelli: Nome, Importo, Ogni quanto; il resto in «Altre opzioni» (P5).
6. Elimina categoria: mostrare subito «Sposta su» con il conteggio delle voci (P6).
7. Salvadanai: pulsante «Versa» pieno; swipe a destra = Versa (P7).
8. Conferma «Vuoi uscire?» ed Esci anche in fondo alle Impostazioni (P8).
9. Prezzi: tirare giù per aggiornare i dati automatici + bottone; a mano solo per chi non ha prezzo (P9).

**Media**
10. Swipe a sinistra sulla riga di spesa = Modifica/Elimina (con tocco sempre presente).
11. Messaggio «Segnata · Annulla» per 5 secondi (P10).
12. Conferma prima di ogni Elimina, con il conteggio delle voci coinvolte (P11).
13. Carta del saldo con matita e avviso oltre 7 giorni (P12).
14. Testi ≥ 13 px e supporto al testo grande di iOS (P13).
15. Schermata di accesso che scorre con la tastiera (P14).
16. Un solo Salva nelle Impostazioni, fisso in basso (P15).
17. Riepilogo vivo nel modulo rata (totale, ultima rata) e campo «Rate già pagate».

**Bassa**
18. Cambiare mese con swipe sul titolo; tirare per aggiornare con «Aggiorna».
19. Trascinare giù per chiudere i moduli (× e Annulla restano).
20. Swipe sul conto: Condividi/Archivia; swipe dal bordo = indietro.
21. «Sessione scaduta» all'accesso; PMC spiegato sotto il campo.

## Da decidere (Manuel)
1. I gesti richiedono `react-native-gesture-handler`: una dipendenza in più, contro «dipendenze ridotte». Si accetta?
2. Aggiungere con il «+» flottante, con i pulsanti in cima, o entrambi?
3. Tema: sempre scuro fisso o scelta a tre voci?
4. Barra in basso: 6 voci strette o 5 voci con «Altro»? Analisi resta fuori.
5. Barra riassuntiva delle Spese: scura e fissa, oppure tolta?
