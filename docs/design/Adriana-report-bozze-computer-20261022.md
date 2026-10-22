# Report QA Accessibilità — BrokenBroker, bozze per computer (Figma)
**Tester:** Adriana (QA accessibilità e conformità normativa)
**Data:** 2026-10-22
**Tipo interfaccia:** web app (finanza personale, due utenti)
**Target demografico specificato:** non specificato, audit con criteri standard
**Viewport audit:** 1440 px, desktop (bozze in bianco e grigi con accento)
**Regime normativo applicabile:** uso privato, nessun obbligo (non PA, non servizio al pubblico EAA). WCAG raccomandato.
**Standard tecnico di riferimento:** WCAG 2.1 AA (con riferimenti a WCAG 2.2 e consigli AAA)
**Sessione:** misure da script su SC-01 Panoramica, SC-02 Spese previste, SC-03 Modifica spesa (solo la finestra), SC-04 Obiettivi: contrasto di 375 testi, icone, bordi dei controlli, grandezze dei caratteri, colori, spazi, zone cliccabili.

> Nota di metodo: la skill nasce per pagine web nel browser. Qui l'audit è fatto sulle bozze Figma: struttura semantica, tastiera, screen reader e comportamento si potranno verificare solo nel codice. Le note su questi punti sono indicazioni per lo sviluppo.

---

## BUG CRITICI
Nessuno.

## FALLIMENTI UX

- **Tutte le schermate — troppe grandezze di carattere**
  - Cosa ho osservato: 12 grandezze (11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28 px).
  - Principio *Refactoring UI*: "Establish a type scale".
  - 🔴 Minimo: ridurle a una scala fissa.
  - 🟢 Consiglio: stili di testo per ruolo sulla scala 12 / 14 / 16 / 18 / 20 / 24 / 30, da creare nella fase dei token. **Rimandato alla fase dei token** (scelta di Manuel: niente correzioni a occhio).

- **Tutte le schermate — spazi senza sistema**
  - Cosa ho osservato: 10 valori di gap (0, 2, 4, 6, 8, 10, 12, 16, 18, 24) e 16 di padding (2…32).
  - Principio *Refactoring UI*: "Establish a spacing and sizing system"; guida design §6.4 (padding e gap dal ruolo del contenitore e dal legame tra i pezzi).
  - 🔴 Minimo: una scala (4, 8, 12, 16, 24, 32) e spazi semantici per ruolo.
  - 🟢 Consiglio: inventario dei ruoli (elenco, pannello, finestra; legami elemento, icona, blocco, gruppo) prima dei componenti. **Rimandato alla fase dei token.**

## VIOLAZIONI ACCESSIBILITÀ

- **Tutte le schermate — testi grigi sotto contrasto** · ✅ corretto
  - Principio POUR: Perceivable — SC 1.4.3 Contrast (Minimum), AA
  - Evidenza misurata: #808080 su #FFFFFF = 3,98:1 (47 testi: conti, intestazioni dei gruppi, note); #8C8C8C su bianco = 3,35:1 (testo segnaposto della ricerca).
  - 🔴 Minimo legale: 4,5:1. **Fatto:** tre livelli di testo, primario #1A1A1A (17:1), secondario #525252 (7,8:1), terziario #6B6B6B (5,3:1). I grigi dei testi passano da 9 a 3.
  - 🟢 Consiglio: tenere il terziario solo per informazioni davvero secondarie; il secondario è già AAA (7:1).

- **SC-01 — rosso su fondo rosa** · ✅ corretto
  - SC 1.4.3, AA. Evidenza: #DC2626 su #FEF2F2 = 4,41:1 (nota 12 px "Si spende più di quanto entra").
  - 🔴 Minimo: **fatto**, i testi rossi diventano #B91C1C (≈ 5,9:1 su rosa, 6,5:1 su bianco); il rosso #DC2626 resta per barre e anelli.
  - 🟢 Consiglio: stessa regola per tutti i colori di significato: tono scuro per i testi, tono pieno per le barre.

- **Campi, ricerca, pulsanti secondari — contorni troppo chiari** · ✅ corretto
  - Principio POUR: Perceivable — SC 1.4.11 Non-text Contrast, AA
  - Evidenza: contorno #C7C7C7 su bianco ≈ 1,7:1 (caselle della finestra, ricerca, Annulla, Modifica, Versa, cambio mese).
  - 🔴 Minimo: **fatto**, contorno #8C8C8C (3,35:1).
  - 🟢 Consiglio: nello stato focus, anello di 2 px nel colore di accento a 2 px di distanza (SC 2.4.7 / 2.4.11).

- **SC-02 / SC-03 — icona "Altre voci" troppo chiara** · ✅ corretto
  - SC 1.4.11, AA. Evidenza: #999999 su bianco = 2,85:1. **Fatto:** #6B6B6B.

- **SC-01 — spunta da 18 × 18 px**
  - Principio POUR: Operable — WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA
  - Evidenza: quadratino 18 × 18, sotto i 24 × 24.
  - 🔴 Minimo: nel codice l'intera riga (o almeno 24 × 24 attorno alla spunta) deve essere la zona cliccabile. Da annotare sul componente "Voce da spuntare".
  - 🟢 Consiglio: zona cliccabile 44 × 44 (AAA SC 2.5.5).

- **Stato attivo dei filtri e delle scelte a segmenti** — da verificare nel codice
  - SC 1.4.11 / 1.4.1: l'opzione scelta ha fondo bianco su grigio #F0F0F0 (1,1:1); si distingue però anche per peso del testo e colore di accento, quindi non dipende solo dal fondo.
  - 🟢 Consiglio: aggiungere un contorno sottile all'opzione scelta e `aria-pressed` / `role="radiogroup"` nel codice.

- **Colori di significato (verde, arancio, rosso)** — conforme, da mantenere
  - SC 1.4.1 Use of Color, A: ogni stato ha anche un testo ("Sforato di 15 €", "100% ✓", "Copre per intero…"), non solo il colore. Va mantenuto nei componenti.

## PROBLEMI ESTETICI

- **Nove grigi diversi per i testi** · ✅ ridotti a tre (vedi sopra).
- **Ombre:** due livelli soltanto (pannello a destra nella prova, finestra al centro). Coerente; da formalizzare come scala di profondità nei token.

## NOTE MINORI
- Le cifre in verde della proiezione (22 px grassetto, #15803D su #F2F2F2 = 4,49:1) contano come testo grande, quindi la soglia è 3:1: conformi.
- Da verificare nel codice: struttura dei titoli (un `h1` per schermata), barra laterale come `nav` con `aria-current`, finestra con `role="dialog"`, focus intrappolato e ritorno al pulsante che l'ha aperta, Esc per chiudere, messaggi di stato con `role="status"`.

---

## Sintesi prioritaria e verdetto di conformità

**Livello WCAG 2.1 AA stimato (sulle bozze):** parzialmente conforme → dopo le correzioni, conforme per contrasti di testi, icone e contorni; resta la zona cliccabile della spunta (WCAG 2.2) da risolvere nel componente.
- SC violati prima delle correzioni: A: 0 | AA: 2 (1.4.3, 1.4.11) + WCAG 2.2 AA: 1 (2.5.8)

**Conformità normativa:**
- EAA / EN 301 549: non applicabile (uso privato).
- Legge Stanca / AgID: non applicabile.

**Top 3 priorità da sistemare per il minimo:**
1. Zona cliccabile della spunta ≥ 24 × 24 (nel componente).
2. Anello di focus visibile su tutti i controlli (nei componenti).
3. Semantica nel codice: titoli, navigazione, finestra.

**Top 3 consigli oltre il minimo:**
1. Scala tipografica e stili di testo per ruolo.
2. Spazi semantici per ruolo (contenitore / contenuto) con la stessa logica in Figma e nel codice (flex con padding e gap sul contenitore).
3. Colori di significato con due toni, testo scuro e riempimento pieno, nei token.

**Aree non testate e perché:** tastiera, screen reader, zoom al 200%, ridisposizione a 320 px, errori dei moduli: le bozze non sono interattive; si verificano nel codice. Le schermate ancora da disegnare (Movimenti, Conti, Analisi, Categorie, Profilo, accesso) seguiranno già queste regole.
