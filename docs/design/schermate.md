# Schermate

Il disegno vive in Figma, nel file dei mockup (link in `AGENTS.md`). Qui c'è tutto ciò che è una decisione. Le esportazioni stanno in `immagini/`, con il nome del codice.

| Codice | Schermata | Schema | Flussi | Stati da disegnare | Stato |
|---|---|---|---|---|---|
| SC-01 | Panoramica (computer) | A · Barra laterale + contenuto | F5, F16, F17, F18, F20, F21 | Normale (disegnato); vuoto, caricamento, errore, lungo da fare | Bozza approvata |
| SC-02 | Spese previste (computer) | A · Barra laterale + contenuto | Spese previste (nuova sezione) | Normale (disegnato); vuoto, filtro senza risultati da fare | Bozza da rivedere |
| SC-03 | Nuova / modifica spesa prevista (computer) | B · Finestra al centro sopra la pagina | Spese previste | Modifica (disegnato); nuova, errore di compilazione da fare | Bozza da rivedere |
| SC-04 | Obiettivi (computer) | A · Barra laterale + contenuto | Obiettivi (nuova sezione) | Normale (disegnato); vuoto, obiettivo senza traguardo da fare | Bozza da rivedere |
| SC-05 | Movimenti (computer) | A | F9–F12 | Normale (disegnato); vuoto, nessun risultato, caricamento da fare | Bozza da rivedere |
| SC-06 | Conti (computer) | A | F5–F8 | Normale (disegnato); vuoto, archiviati da fare | Bozza da rivedere |
| SC-07 | Analisi (computer) | A | F16–F22 | Normale (disegnato); dati insufficienti (primo mese) da fare | Bozza da rivedere |
| SC-08 | Categorie (computer) | A | F13–F15 | Normale con un ramo aperto (disegnato); entrate, cancellazione con spostamento da fare | Bozza da rivedere |
| SC-09 | Impostazioni (computer) | A | F4, condivisione, sicurezza | Normale (disegnato); salvataggio, errore da fare | Bozza da rivedere |
| SC-10 | Accesso (computer) | C · Finestra centrata senza barra | F1–F3 | Normale ed errore (disegnati); registrazione, password dimenticata da fare | Bozza da rivedere |
| SC-11 | Investimenti (computer) | A | investimenti (nuova sezione, richiesta di Manuel) | Normale (disegnato); nessun investimento, prezzi non aggiornati da fare | Bozza da rivedere |

## Schemi
Le schermate con la stessa struttura. Decisa la struttura di uno schema, le sue schermate ne discendono.

| Schema | Struttura | Schermate |
|---|---|---|
| A · Barra laterale + contenuto | Barra laterale fissa a sinistra (248 px), contenuto a destra con intestazione, numeri chiave, contenuto principale | SC-01, SC-02 |
| B · Finestra al centro | Velo scuro sulla pagina, finestra di 600 px al centro con titolo e ✕, campi, azioni in fondo (Elimina a sinistra, Annulla e Salva a destra) | SC-03 |
| C · Finestra centrata senza barra | Fondo grigio chiaro, scheda di 440 px al centro, nessuna barra laterale | SC-10 |

**Link alle bozze (file Mockup, pagina Wireframe computer):** SC-05 `node-id=27-2` · SC-06 `28-2` · SC-07 `29-2` · SC-08 `30-2` · SC-09 `31-2` · SC-10 `31-205` (errore `31-242`) · SC-11 `33-2`. Immagini in `immagini/SC-05.png` … `SC-11.png`.

**SC-11 – Investimenti:** numeri (valore, messo dentro, guadagno, rendimento), valore nel tempo contro quanto messo dentro, piano mensile da 500 € con avviso quando il mese non lo sostiene, posizioni (dati del foglio Investimenti: 7 quote SWDA, prezzo medio 121,76 €, prezzo 130,47 €), esposizione per tipo, paese e settore, ultime operazioni. Date e prezzi delle singole operazioni e l'andamento dei mesi sono di esempio. La SC-11 usa già la barra laterale a 256 px con i padding dei token.

**Dati di esempio da non prendere per veri:** movimenti di ottobre, saldi dei conti, mesi passati del grafico, prezzo della Nikon, tetto rate 15% e debito massimo 3 mensilità (la regola dell'Excel non ha un numero), email.

## Proposta v2 (2026-10-23, da confermare)
Nella libreria, pagina "Schermate computer", sotto le schermate attuali. Link (`FYIisMC6CZ2HNCKfyGxA2q`): SC-01 v2 `node-id=57-6051` · SC-02 v2 `58-6466` · SC-04 v2 `60-7239` · SC-11 v2 `64-7766` · SC-12 Aggiungi investimento `64-8149` (non quotato: tipo qualsiasi `64-8361`, tipo oro fisico `64-8507`). Contenuti: frame "Contenuti proposta v2" `57-4690`. Decisioni e proposte in `registro.md`.

**Dati di esempio da non prendere per veri (v2):** scadenze di Obiettivo Nikon (marzo 2027) e Dare alla Ele (giugno 2027), mesi del calendario annuali tranne Tari, assicurazione, vacanze e bollo, lingotto d'oro, fondo pensione Cometa.

---

## SC-01 – Panoramica (computer)
**Schema:** A · **Flussi:** da definire · **Wireframe:** https://www.figma.com/design/nl92JsXsGc6X41Fy3ircSn?node-id=6-2 · **Immagine:** `immagini/SC-01.png`

**A cosa serve:** rispondere in un colpo d'occhio a "quanto mi resta davvero questo mese", come il foglio Spese dell'Excel. Contenuto della bozza (approvato da Manuel il 2026-10-22): numeri del mese (entrate, uscite, quota annuali, resta davvero), lista "Da pagare questo mese" con la spunta, dove vanno i soldi, prossime scadenze annuali contro il salvadanaio, rate contro la regola, proiezione a 1 mese / 1 anno / 5 anni. Dati di esempio presi dal file Excel di ottobre 2026.

---

## SC-02 – Spese previste (computer)
**Schema:** A · **Wireframe:** https://www.figma.com/design/nl92JsXsGc6X41Fy3ircSn?node-id=11-2 · **Immagine:** `immagini/SC-02.png`

**A cosa serve:** l'elenco di tutto ciò che esce ogni mese o ogni anno, come le sezioni dell'Excel (fisse, variabili, investimenti, annuali). Da qui si aggiunge e si modifica. *Proposta dell'agente, da confermare:* nuova voce "Spese previste" nella barra laterale, subito dopo Panoramica (da riportare anche in SC-01); totali in alto (al mese, annuali, totale al mese); filtri Tutte / Ogni mese / Ogni anno / Non attive e ricerca; tabella raggruppata con categoria, conto, quando, totale e tua quota (½ se divisa a metà); rate escluse, gestite a parte.

## SC-03 – Nuova / modifica spesa prevista (computer)
**Schema:** B (finestra al centro, scelta di Manuel il 2026-10-22) · **Wireframe:** https://www.figma.com/design/nl92JsXsGc6X41Fy3ircSn?node-id=12-2 · **Immagine:** `immagini/SC-03.png` · Varianti confrontate nella pagina Prove della libreria: `immagini/SC-03-variante-A.png`, `immagini/SC-03-variante-B.png`

**Campi (proposta dell'agente, da confermare):** nome; importo totale; prossima scadenza; con chi la dividi (solo io / a metà / altra quota, con la tua quota calcolata); ogni quanto (ogni mese / ogni anno / ogni N mesi); tipo (fissa / budget variabile / investimento); conto; categoria; note; attiva. Azioni: Elimina (solo chi l'ha creata), Annulla, Salva.

## SC-04 – Obiettivi (computer)
**Schema:** A · **Wireframe:** https://www.figma.com/design/nl92JsXsGc6X41Fy3ircSn?node-id=13-2 · **Immagine:** `immagini/SC-04.png`

**A cosa serve:** vedere quanto è messo da parte e per cosa. Ogni obiettivo grande mostra traguardo, avanzamento, "+ Versa" e "Modifica", e dentro i suoi sotto-obiettivi (ceste con soldi propri) o i suoi traguardi di copertura (quanta parte di ogni emergenza copre il padre, verde con ✓ al 100%, più un riepilogo "copre per intero 5 su 6"). Gli obiettivi senza contenuto stanno in schede compatte in fondo. *Proposta dell'agente, da confermare:* nuova voce "Obiettivi" nella barra laterale dopo Spese previste; obiettivi che contengono qualcosa aperti, gli altri compatti. Dati: obiettivi e traguardi dell'Excel; gli importi messi da parte nel fondo e nel viaggio sono di esempio (nell'Excel sono a zero).

---

## SC-00 – Nome
**Schema:** [A] · **Flussi:** [1, 2] · **Wireframe:** [link al frame] · **Figma:** [link al frame] · **Immagine:** `immagini/SC-00.png`

**A cosa serve:**

### Stati
| Stato | Cosa si vede |
|---|---|
| Normale | |
| Vuoto | |
| Caricamento | |
| Errore | |
| Contenuto lungo | |

### Componenti usati
CMP-00, CMP-00

### Testi
[Titoli, etichette, messaggi di errore definitivi.]
