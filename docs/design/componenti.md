# Componenti

I componenti vivono nella libreria Figma: pagina **Componenti base** e pagina **Componenti composti**, con la sezione **Parti interne** (link in `AGENTS.md`). Ogni componente usa solo token semantici e ha un'anteprima in modo scuro.

> **Stato:** inventario ricavato dalle bozze SC-01…SC-10 (2026-10-22). *Proposta dell'agente, da confermare.* Nessun componente è ancora costruito.

## Il principio: contenitori e contenuti

Regola di Manuel, coerente con la guida §6.4:

- **Un contenuto non ha padding né margini.** Testi, icone, barre, gruppi di testo: stanno dove li mette il contenitore, e così si possono usare in qualsiasi contenitore.
- **Un contenitore ha padding e gap.** Il padding viene dal suo **ruolo** (tabella sotto), il gap dal **legame** tra i pezzi che dispone.
- **Un elemento con bordo visibile** (fondo, contorno, evidenziazione) ha il padding della sua anatomia: un pulsante o un campo hanno sempre il loro spazio interno.
- **I figli riempiono la larghezza** del contenitore e non hanno margini propri.
- In Figma: auto-layout (verticale = colonna, orizzontale = riga) con padding e gap da token. Nel codice: `div` con `display: flex`, padding e `gap` sul contenitore, nessun `margin` sui figli. Stessi nomi dei token.

### Due mattoni di disposizione (non componenti)
| Mattone | Figma | Codice | Proprietà |
|---|---|---|---|
| **Colonna** | auto-layout verticale | `display:flex; flex-direction:column` | gap da token di legame, padding solo se è un contenitore con ruolo |
| **Riga** | auto-layout orizzontale | `display:flex; flex-direction:row; align-items:center` | come sopra; i figli che si allargano = `FILL` / `flex:1` |

### Spazi dei contenitori (ruoli → padding)
| Ruolo | Dove | Padding | Gap dentro | Raggio |
|---|---|---|---|---|
| **Pagina** | area a destra della barra laterale | 32 | gruppo (24) tra i blocchi della pagina | — |
| **Barra laterale** | colonna di navigazione | 16 | elenco (4) tra le voci; gruppo (24) tra logo, azione e voci | — |
| **Scheda** | contenitori con contorno (Numeri, Da pagare, Obiettivo, Conto…) | 24 | blocco (16) tra titolo, contenuto e azioni | 12 |
| **Riquadro** | fondo tenue dentro una scheda (esito, orizzonte, risultato) | 12 · 16 | testo (4) | 8 |
| **Finestra** | finestra al centro, accesso | 32 | blocco (16) tra i campi; gruppo (24) tra titolo, modulo e azioni | 16 |
| **Elenco in scheda** | righe di tabella o elenco dentro una scheda | 0 (la riga ha il suo) | 0: le righe si separano con una linea | — |

### Legami tra pezzi vicini (→ gap)
| Legame | Esempi | Gap |
|---|---|---|
| Testo che si legge insieme | titolo e sottotitolo, nome e categoria, etichetta e campo | **testo** 4 |
| Voci impilate che si evidenziano | voci del menu, righe selezionabili | **elenco** 4 |
| Icona e testo, pezzi che si leggono come uno | icona + etichetta, spunta + icona + nome | **icona** 8 |
| Pillole affiancate | etichette, criteri | **pillole** 8 |
| Colonne di una riga, campi affiancati | nome · conto · importo; stipendio · giorno di paga | **colonne** 12 |
| Blocchi diversi nello stesso contenitore | titolo scheda, contenuto, azioni; campi di un modulo | **blocco** 16 |
| Sezioni con un titolo proprio, blocchi della pagina | Numeri / Riga centrale / Proiezione; gruppi di conti | **gruppo** 24 |

Regole di controllo: fuori non meno che dentro (gap tra schede 16 ≤ padding scheda 24); al massimo due spazi dal bordo al primo contenuto (scheda + riga); raggi concentrici.

---

## Inventario

Codici in ordine di costruzione, dal basso (guida §6.1).

| Codice | Componente | Tipo | Usato in | Stato |
|---|---|---|---|---|
| CMP-01 | Icona (`Icona/<nome>`, 16 · 20 · 24) | base | ovunque | Approvato |
| CMP-02 | Tessera icona (icona su fondo tenue: 28 · 32 · 40; toni accento, neutro, ok, attenzione, errore) | base | categorie, numeri, titoli, conti, obiettivi | Costruito, da approvare |
| CMP-03 | Pulsante (primario, secondario, testo, pericolo; icona facoltativa) | base | ovunque | Costruito |
| CMP-04 | Pulsante solo icona (modifica, chiudi) | base | SC-03, SC-08 | Costruito |
| CMP-05 | Campo di testo (etichetta, valore, icona prima/dopo, aiuto, errore) | base | SC-03, SC-07, SC-09, SC-10 | Costruito |
| CMP-06 | Tendina (campo con freccia, con o senza etichetta) | base | SC-03, SC-05, SC-07 | Costruito |
| CMP-07 | Scelta a segmenti | base | SC-02, SC-03, SC-07, SC-08 | Costruito |
| CMP-08 | Interruttore | base | SC-03, SC-09 | Costruito |
| CMP-09 | Spunta (fatta / da fare; zona cliccabile ≥ 24) | base | SC-01 | Costruito |
| CMP-10 | Etichetta (neutra, accento, condivisa; icona facoltativa) | base | SC-04, SC-05, SC-06 | Costruito |
| CMP-11 | Criterio (pillola selezionabile) | base | SC-07 | Costruito |
| CMP-12 | Barra di avanzamento (accento, ok, attenzione, errore) | base | SC-01, SC-04 | Costruito |
| CMP-13 | Anello di avanzamento | base | SC-01 | Costruito |
| CMP-14 | Avatar (iniziale o icona) | base | SC-09 | Costruito |
| CMP-15 | Esito (ok, attenzione, errore, informazione) | base | SC-01, SC-04, SC-07, SC-10 | Costruito |
| CMP-16 | Separatore | base | SC-01, SC-03, SC-10 | Costruito |
| CMP-20 | Barra laterale | composto | tutte tranne SC-10 | Costruito |
| CMP-21 | Intestazione di pagina (titolo, sottotitolo, azioni) | composto | tutte tranne SC-10 | Costruito |
| CMP-22 | Scheda (contenitore con titolo e icona facoltativi) | composto | ovunque | Costruito |
| CMP-23 | Numero chiave | composto | SC-01, SC-02, SC-05, SC-07 | Costruito |
| CMP-24 | Voce da spuntare | composto | SC-01 | Costruito |
| CMP-25 | Voce budget | composto | SC-01 | Costruito |
| CMP-26 | Riga spesa prevista | composto | SC-02 | Costruito |
| CMP-27 | Riga movimento | composto | SC-05 | Costruito |
| CMP-28 | Scheda conto | composto | SC-06 | Costruito |
| CMP-29 | Riga di avanzamento (sotto-obiettivo, traguardo di copertura, categoria di spesa) | composto | SC-01, SC-04 | Costruito |
| CMP-30 | Testata obiettivo | composto | SC-04 | Costruito |
| CMP-31 | Riga categoria (albero) | composto | SC-08 | Costruito |
| CMP-32 | Finestra | composto | SC-03, SC-10 | Costruito |
| CMP-33 | Barra dei filtri | composto | SC-02, SC-05 | Costruito |
| CMP-34 | Grafico mese per mese | composto | SC-07 | Costruito |
| CMP-35 | Riga rata | composto | SC-07 | Costruito |
| CMP-36 | Riga controllo (regola rispettata o no) | composto | SC-07 | Costruito |
| CMP-37 | Grafico a linea (valore e messo dentro) | composto | SC-11 | Costruito |
| CMP-38 | Riga posizione (titolo, quote, prezzi, valore, guadagno, peso) | composto | SC-11 | Costruito |
| CMP-39 | Scheda esposizione (per tipo, paese, settore) | composto | SC-11 | Costruito |
| CMP-40 | Riga operazione (acquisto o vendita) | composto | SC-11 | Costruito |

### Parti interne
- **Voce della barra laterale** (4 varianti) → dentro CMP-20.
- **Contenuto (segnaposto)** → nella proprietà "Contenuto" di CMP-22 e CMP-32; si scambia con il componente da mostrare.
- **Selettore periodo** → usato in CMP-33 e nell'intestazione della Panoramica.
- **Mese del grafico** (due barre: entrate e uscite) → dentro CMP-34.
- **Voce della scheda esposizione** → dentro CMP-39.
- **Opzione** della scelta a segmenti → dentro CMP-07.
- **Intestazione di tabella** → dentro le schede con elenco (SC-02, SC-08) (non ancora costruita).
- **Riga di giorno** (data + somma) → dentro l'elenco dei movimenti (SC-05) (non ancora costruita).

### Superfici su cui compare ogni componente
| Componente | Pagina (bianco) | Barra laterale (grigio chiaro) | Scheda (bianco con contorno) | Riquadro tenue | Finestra / velo |
|---|---|---|---|---|---|
| Pulsante | ✓ | ✓ (primario) | ✓ | — | ✓ |
| Campo, tendina | ✓ (filtri) | — | ✓ | — | ✓ |
| Scelta a segmenti | ✓ | — | ✓ | — | ✓ |
| Tessera icona | — | — | ✓ | ✓ | ✓ |
| Etichetta | — | — | ✓ | — | — |
| Esito | — | — | ✓ | — | ✓ |
| Barra / anello di avanzamento | — | — | ✓ | ✓ | — |

Il fondo dei controlli tenui (segmenti, riquadri) non è mai uguale alla superficie su cui sta.

### Regole generali nate costruendo
- **Un'istanza che usa il colore del componente non si sovrascrive.** Si sostituisce il colore solo quando serve un token diverso; riassegnare lo stesso token lascia in Figma il colore di ripiego (nero) e rompe il tema scuro. Trovato su CMP-01, vale per tutti.
- **Ogni icona è una sola forma chiamata "Forma", colorata con il riempimento.** Così, quando un componente scambia l'icona con la proprietà "Icona", il colore sostituito resta (Figma ritrova il livello con lo stesso nome). Con i tratti separati di Lucide il colore tornava al grigio predefinito. Trovato costruendo CMP-02, corretto alla fonte in CMP-01.
- **Una proprietà di scambio impone la sua icona predefinita a tutte le varianti.** Dopo averla collegata, in ogni variante si rimette la misura giusta dell'icona interna; la sua proprietà "Misura" resta visibile nel pannello del componente che la contiene. Trovato su CMP-02.
- **Le proprietà di testo hanno un solo valore predefinito per tutte le varianti.** Per mostrare varianti con testi diversi si mette accanto un riquadro "Esempi con testi veri" con istanze. Trovato su CMP-27.
- **Ogni pagina dei componenti ha in fondo l'"Anteprima tema scuro"**, con le varianti principali in modo Scuro: si controlla lì dopo ogni modifica.

---

## CMP-01 – Icona
**Tipo:** base · **Usato in:** tutte le schermate · **Figma:** libreria, pagina Componenti base, sezione "CMP-01 · Icona" · **Immagini:** `immagini/CMP-01-icone.png`, `immagini/CMP-01-anteprima.png`

**Scopo:** un segno riconoscibile per sezioni, azioni, stati e categorie.
**Quando usarlo:** accanto a un testo (voce del menu, pulsante, riga) o dentro una tessera icona (CMP-02).
**Quando non usarlo:** da sola come unica informazione, senza testo vicino o etichetta accessibile; ingrandita oltre 24 (per le icone grandi si usa la tessera).

### Varianti e dimensioni
- 86 set `Icona/<nome>` (Lucide, licenza MIT): navigazione, azioni, stati, finanza, categorie e obiettivi. Elenco completo nella libreria.
- Proprietà: **Misura** = 16 · 20 · 24 (token `misura/icona-piccola · media · grande`). Si cambia la misura con la proprietà, mai ridimensionando.
- Struttura: ogni variante contiene **una sola forma "Forma"** (i tratti Lucide trasformati in contorno e uniti), colorata con il **riempimento**.
- Colore: token `icona/predefinita` sul riempimento di "Forma". Nelle istanze si sostituisce solo con `icona/tenue`, `icona/accento`, `icona/su-accento`, `icona/ok`, `icona/attenzione`, `icona/errore`.
- Spessore: equivale al tratto 2 a 24 px, in proporzione nelle misure più piccole.
- Nessun padding: è un contenuto, la mette in posizione il suo contenitore.

### Stati
| Stato | Descrizione |
|---|---|
| Default | `icona/predefinita` |
| Hover · Focus · Attivo · Disabilitato | Non previsti sull'icona: li gestisce il componente che la contiene (pulsante, voce del menu) cambiando il token del colore |
| Errore | `icona/errore`, sempre con un testo vicino |
| Caricamento | Non previsto |

### Accessibilità
- **Tastiera:** l'icona non riceve il focus; lo riceve il controllo che la contiene.
- **Lettori di schermo:** decorativa accanto a un testo (`aria-hidden="true"`); se è l'unico contenuto di un pulsante, il pulsante ha `aria-label`.
- **Contrasti** (≥ 3:1, verificati in `tokens.md`): predefinita 7,17:1 su barra laterale in chiaro, 8,41:1 in scuro; tutti i token di stato ≥ 4,5:1 sulle loro superfici.

### Esempi
- ✅ Corretto: icona 20 accanto alla voce del menu, colore ereditato; `icona/ok` accanto a "100% ✓".
- ❌ Scorretto: icona ridimensionata a mano a 18 px; colore scritto a mano; icona da sola per dire "errore".

---

## CMP-02 – Tessera icona
**Tipo:** base · **Usato in:** SC-01, SC-02, SC-04…SC-09, SC-11 · **Figma:** libreria, pagina Componenti base, sezione "CMP-02 · Tessera icona" · **Immagine:** `immagini/CMP-02-tessera.png`

**Scopo:** rendere riconoscibile a colpo d'occhio una categoria, un numero chiave, un titolo, un conto o un obiettivo.
**Quando usarlo:** in testa a righe, schede e numeri, quando l'icona deve "pesare" di più di un'icona semplice.
**Quando non usarlo:** dentro pulsanti e voci del menu (lì va l'icona semplice, CMP-01); come pulsante (non è cliccabile da sola).

### Varianti e dimensioni
- **Misura:** Piccola 28 (icona 16) · Media 32 (icona 20) · Grande 40 (icona 24) — token `misura/tessera-*` e `misura/icona-*`.
- **Tono:** Accento (`sfondo/accento-tenue` + `icona/accento`) · Neutro (`sfondo/tenue` + `icona/predefinita`) · Ok · Attenzione · Errore (fondo tenue e icona del loro stato).
- **Superficie:** Tenue · **Su colore** (`sfondo/scheda`), da usare quando la tessera sta su una scheda già colorata dello stesso tono, così il fondo non si confonde.
- **Proprietà:** **Icona** (scambio tra le 86 icone di CMP-01); la **Misura** dell'icona interna è visibile nel pannello e va lasciata uguale a quella della tessera.
- Raggio `raggio/controllo`; l'icona è centrata, senza padding: la misura della tessera ne definisce l'anatomia.
- 30 varianti.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Come da tono |
| Hover · Focus · Attivo · Disabilitato | Non previsti: la tessera non è interattiva; lo stato lo dà la riga o la scheda che la contiene |
| Errore | Tono Errore |
| Caricamento | Non previsto |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** decorativa (`aria-hidden="true"`); il significato è nel testo accanto.
- **Contrasti:** icona su fondo, chiaro e scuro, ≥ 4,5:1 per tutti i toni (stesse coppie dei testi di stato in `tokens.md`); neutro 6,9:1.

### Esempi
- ✅ Corretto: Media / Accento con l'icona della categoria accanto al nome di una spesa; Grande / Errore / Su colore sulla scheda rossa di "Resta davvero".
- ❌ Scorretto: Errore / Tenue su una scheda già rossa (fondo uguale alla superficie); icona da 20 in una tessera Piccola.

---

## CMP-03 – Pulsante
**Tipo:** base · **Usato in:** tutte le schermate · **Figma:** libreria, pagina Componenti base, sezione "CMP-03 · Pulsante"

**Scopo:** far partire un'azione, per esempio salvare, aggiungere o confermare.
**Quando usarlo:** per ogni azione che si fa con un clic o con Invio. In ogni schermata o finestra ce n'è un solo Primario.
**Quando non usarlo:** per un'azione che si riduce a un'icona: lì si usa il pulsante solo icona (CMP-04).

### Varianti e dimensioni
- **Tipo:** Primario (fondo `sfondo/accento`, testo `testo/su-accento`, icona `icona/su-accento`; hover `sfondo/accento-hover`) · Secondario (contorno `bordo/controllo` 1 px, testo `testo/primario`; hover `sfondo/hover`) · Testo (senza fondo, testo `testo/accento`; hover `sfondo/hover`) · Pericolo (testo `testo/errore`, icona `icona/errore`; hover `sfondo/errore-tenue`).
- **Stato:** Default, Hover, Focus, Disattivato. In totale sono 16 varianti (4 tipi × 4 stati).
- **Proprietà:** **Etichetta** (testo) · **Con icona** (sì / no) · **Icona** (scambio tra le icone di CMP-01, misura 20).
- **Misure:** altezza 45 px; padding `margine/pulsante` 12 × 16; gap `spazio/icona` 8; raggio `raggio/controllo` 8; testo in stile Corpo/Forte.
- La zona cliccabile è ampia: copre tutto il pulsante, non solo il testo.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Colori del tipo scelto |
| Hover | Il fondo passa al colore di hover del tipo |
| Focus | Anello `bordo/focus` 2 px all'esterno del pulsante |
| Attivo | Non previsto: il componente non ha uno stato separato per il clic |
| Disabilitato | Opacità `opacita/disattivato` 45%; non si può premere |
| Errore | Non previsto: un errore si mostra vicino al campo o al testo che lo riguarda, non sul pulsante |
| Caricamento | Non previsto: nelle bozze il pulsante non mostra un caricamento |

### Accessibilità
- **Tastiera:** si raggiunge con Tab e si attiva con Invio o Spazio. Il focus è sempre visibile.
- **Lettori di schermo:** il nome del pulsante è il suo testo. Se c'è un'icona accanto al testo, è decorativa (`aria-hidden="true"`).
- **Contrasti:** il testo su fondo accento ha un contrasto di 7,09:1.

### Esempi
- ✅ Corretto: un solo Primario "Salva" in fondo a una finestra, con icona 20 e testo; altezza 45 px.
- ❌ Scorretto: due Primari nella stessa finestra; pulsante alto meno di 45 px; colori scritti a mano invece dei token.

---

## CMP-04 – Pulsante solo icona
**Tipo:** base · **Usato in:** SC-03 (chiudi), SC-08 (modifica) · **Figma:** libreria, pagina Componenti base, sezione "CMP-04 · Pulsante solo icona"

**Scopo:** far partire un'azione che si capisce dalla sola icona, come chiudere o modificare.
**Quando usarlo:** quando l'icona basta a far capire l'azione e lo spazio è stretto.
**Quando non usarlo:** quando l'azione non è chiara dall'icona: lì va il pulsante con testo (CMP-03).

### Varianti e dimensioni
- **Tipo:** Secondario (con contorno) · Fantasma (senza contorno).
- **Stato:** Default, Hover, Focus, Disattivato. In totale sono 8 varianti (2 tipi × 4 stati).
- **Proprietà:** **Icona** (scambio tra le icone di CMP-01).
- **Misure:** padding 12 su tutti i lati, icona 20, zona cliccabile 44 × 44.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Colori del tipo scelto |
| Hover | Il fondo passa al colore di hover del tipo, come in CMP-03 |
| Focus | Anello `bordo/focus` 2 px all'esterno del pulsante |
| Attivo | Non previsto: il componente non ha uno stato separato per il clic |
| Disabilitato | Opacità `opacita/disattivato` 45%; non si può premere |
| Errore | Non previsto: l'icona da sola non porta un errore; se serve, lo dice il testo accanto |
| Caricamento | Non previsto: nelle bozze il pulsante non mostra un caricamento |

### Accessibilità
- **Tastiera:** si raggiunge con Tab e si attiva con Invio o Spazio. Il focus è sempre visibile.
- **Lettori di schermo:** il nome deve essere scritto nel codice con `aria-label`, obbligatorio, per esempio "Chiudi" o "Modifica".
- **Contrasti:** l'icona usa i colori già verificati in CMP-01.

### Esempi
- ✅ Corretto: icona di chiusura con `aria-label="Chiudi"`, misura 44 × 44, in alto a destra di una finestra.
- ❌ Scorretto: icona di modifica senza nome per i lettori di schermo; zona cliccabile di 32 × 32.

---

## CMP-05 – Campo di testo
**Tipo:** base · **Usato in:** SC-03, SC-07, SC-09, SC-10 · **Figma:** libreria, pagina Componenti base, sezione "CMP-05 · Campo di testo"

**Scopo:** far scrivere un valore, come un importo, un nome o una data.
**Quando usarlo:** per un valore che l'utente scrive da sé.
**Quando non usarlo:** per una scelta tra valori già dati: lì vanno la tendina (CMP-06) o la scelta a segmenti (CMP-07).

### Varianti e dimensioni
- **Struttura:** etichetta sopra (Dettaglio/Forte, `testo/secondario`); casella con padding `margine/controllo` 12 × 12, gap 8, raggio 8, contorno `bordo/controllo` 1 px, fondo `sfondo/scheda`; aiuto sotto (Dettaglio/Normale). Gap tra le parti `spazio/testo` 4.
- **Stato:** Default, Vuoto, Focus, Errore, Disattivato.
- **Proprietà:** **Etichetta** · **Valore** · **Aiuto** · **Con aiuto** · **Con icona prima** · **Con icona dopo** · **Icona prima** · **Icona dopo** (icone 16).
- **Misure:** larghezza 320. Nell'uso riempie il contenitore.
- L'etichetta è sempre visibile. Il segnaposto non è un'etichetta.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Contorno `bordo/controllo` 1 px, fondo `sfondo/scheda` |
| Vuoto | Segnaposto in `testo/terziario`, che sparisce appena si scrive |
| Focus | Contorno `bordo/focus` 2 px |
| Errore | Contorno `bordo/errore` 2 px; l'aiuto in `testo/errore` spiega come correggere |
| Disattivato | Fondo `sfondo/tenue`, opacità 45% |
| Hover | Non previsto: il campo cambia solo con il focus |
| Attivo | Non previsto: il campo non ha uno stato separato |
| Caricamento | Non previsto: il campo non mostra un caricamento |

### Accessibilità
- **Tastiera:** Tab entra nella casella. Il focus è sempre visibile.
- **Lettori di schermo:** l'etichetta è collegata alla casella. Un errore è annunciato con `aria-describedby` e `aria-invalid`.
- **Contrasti:** il segnaposto è un testo leggero. Va usato solo come suggerimento, mai come etichetta.

### Esempi
- ✅ Corretto: etichetta "Importo" sopra, casella a 320 px, errore "Inserisci un importo maggiore di zero" in `testo/errore`.
- ❌ Scorretto: segnaposto usato al posto dell'etichetta; errore mostrato solo con il colore rosso, senza testo; campo fisso a 600 px invece di riempire il contenitore.

---

## CMP-06 – Tendina
**Tipo:** base · **Usato in:** SC-03, SC-05, SC-07 · **Figma:** libreria, pagina Componenti base, sezione "CMP-06 · Tendina"

**Scopo:** scegliere un valore da un elenco a discesa.
**Quando usarlo:** quando le scelte sono molte, o non stanno comodamente in un gruppo sempre visibile.
**Quando non usarlo:** per 2, 3 o 4 scelte da vedere tutte insieme: lì va la scelta a segmenti (CMP-07). Per un testo libero va il campo di testo (CMP-05).

### Varianti e dimensioni
- Come il campo di testo (CMP-05), con una freccia in giù fissa a destra.
- **Stato:** Default, Aperta (contorno focus), Disattivato.
- **Proprietà:** **Etichetta** · **Con etichetta** (i filtri non ce l'hanno) · **Valore** · **Con icona prima** · **Icona prima**.
- Nell'uso riempie il contenitore.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Come il campo di testo in stato Default, con la freccia |
| Aperta | Contorno `bordo/focus` 2 px, elenco aperto |
| Focus | Contorno `bordo/focus` 2 px, come nello stato Aperta |
| Disattivato | Opacità 45%; non si può aprire |
| Hover | Non previsto: nelle bozze la tendina non ha uno stato di hover |
| Errore | Non previsto: nelle bozze la tendina non ha uno stato di errore; per le scelte obbligatorie valgono le regole del campo di testo (CMP-05) |
| Attivo | Non previsto: lo stato Aperta copre il caso |
| Caricamento | Non previsto: l'elenco è già nel componente |

### Accessibilità
- **Tastiera:** Tab entra nella tendina, Invio o Spazio la apre, le frecce scelgono la voce, Esc la chiude. Il focus è sempre visibile.
- **Lettori di schermo:** il nome viene dall'etichetta. Nei filtri, senza etichetta visibile, il nome va scritto nel codice con `aria-label`.
- **Contrasti:** gli stessi del campo di testo (CMP-05).

### Esempi
- ✅ Corretto: tendina "Categoria" con etichetta sopra e freccia a destra; nei filtri, la tendina senza etichetta con `aria-label="Categoria"`.
- ❌ Scorretto: tendina per due sole scelte, che stanno meglio nella scelta a segmenti; tendina senza nome per i lettori di schermo.

---

## CMP-07 – Scelta a segmenti
**Tipo:** base · **Usato in:** SC-02, SC-03, SC-07, SC-08 · **Figma:** libreria, pagina Componenti base, sezione "CMP-07 · Scelta a segmenti"

**Scopo:** scegliere una sola opzione tra poche, tutte visibili insieme.
**Quando usarlo:** quando le opzioni sono 2, 3 o 4 e conviene vederle tutte.
**Quando non usarlo:** con più di 4 opzioni (usare la tendina, CMP-06). Per far partire un'azione (CMP-03). Per un sì o un no (CMP-08).

### Varianti e dimensioni
- **Parte interna "Opzione":** Selezionata (fondo `sfondo/scheda` e contorno `bordo/controllo`, testo Corpo/Forte in `testo/accento`) · Normale (testo `testo/secondario`) · Hover (fondo `sfondo/hover`). Padding `margine/voce` 8 × 12, raggio `raggio/controllo-interno` 4.
- **Componente:** Opzioni = 2, 3 o 4. Fondo `sfondo/tenue`, padding `margine/gruppo-controlli` 4, gap `spazio/elenco` 4, raggio 8 (raggi concentrici: 8 − 4 = 4).
- Le opzioni sono istanze esposte: si cambiano testo e stato di ciascuna.
- La scelta non dipende solo dal colore: si distingue anche dal contorno e dal peso del testo.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Una opzione Selezionata e le altre Normale |
| Hover | L'opzione sotto il puntatore prende il fondo `sfondo/hover` |
| Focus | Proposta: anello `bordo/focus` 2 px sull'opzione con il focus, come negli altri controlli. Da confermare, perché nelle bozze non è definito |
| Attivo | Non previsto: il clic cambia direttamente la scelta |
| Disabilitato | Non previsto nelle bozze |
| Errore | Non previsto: la scelta non dà errori; se è obbligatoria, lo dice il testo vicino |
| Caricamento | Non previsto: le opzioni sono sempre disponibili |

### Accessibilità
- **Tastiera:** Tab entra nel gruppo, le frecce cambiano opzione. Nel codice è un `role="radiogroup"`.
- **Lettori di schermo:** il gruppo ha un nome, dato dal testo vicino. Ogni opzione dice se è selezionata.
- **Contrasti:** la selezione si vede anche dal contorno e dal peso del testo, non solo dal colore.

### Esempi
- ✅ Corretto: tre opzioni "Mese / Anno / Tutto" con la prima Selezionata, contorno e testo in grassetto.
- ❌ Scorretto: sei opzioni in segmenti, che in una riga stretta non ci stanno; selezione indicata solo dal colore di fondo.

---

## CMP-08 – Interruttore
**Tipo:** base · **Usato in:** SC-03, SC-09 · **Figma:** libreria, pagina Componenti base, sezione "CMP-08 · Interruttore"

**Scopo:** accendere o spegnere una funzione, con effetto subito.
**Quando usarlo:** per un sì o un no che si applica appena si cambia, come le notifiche.
**Quando non usarlo:** per scegliere tra più opzioni (CMP-07). Per confermare un'azione (CMP-03).

### Varianti e dimensioni
- **Valore:** Acceso (fondo `sfondo/accento`) · Spento (fondo `sfondo/controllo-spento`).
- **Stato:** Default, Focus, Disattivato. In totale sono 6 varianti (2 valori × 3 stati).
- **Misure:** larghezza `misura/interruttore-larghezza` 36 × altezza `misura/interruttore-altezza` 20. Pomello `misura/pomello` 16, colore `sfondo/pomello`, margine del pomello `misura/pomello-margine` 2. Raggio a pillola.
- Il testo che lo descrive sta accanto, nel componente che lo contiene.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Colore del valore scelto |
| Focus | Proposta: anello `bordo/focus` 2 px attorno all'interruttore. Da confermare, perché nelle bozze non è definito |
| Disattivato | Opacità 45%; non si può cambiare |
| Hover | Non previsto nelle bozze |
| Attivo | Non previsto: Acceso e Spento sono già i due stati |
| Errore | Non previsto: un interruttore non dà errori |
| Caricamento | Non previsto: il cambio è immediato |

### Accessibilità
- **Tastiera:** Tab lo raggiunge, Spazio cambia il valore. Il focus è sempre visibile.
- **Lettori di schermo:** nel codice è un `role="switch"` con `aria-checked`. Il testo che lo descrive è collegato.
- **Contrasti:** il passaggio tra acceso e spento si vede anche dalla posizione del pomello, non solo dal colore.

### Esempi
- ✅ Corretto: interruttore a destra del testo "Notifiche", nello stato Acceso, con `aria-checked="true"`.
- ❌ Scorretto: interruttore senza testo accanto; interruttore usato per scegliere tra tre opzioni.

---

## CMP-09 – Spunta
**Tipo:** base · **Usato in:** SC-01 (lista da spuntare) · **Figma:** libreria, pagina Componenti base, sezione "CMP-09 · Spunta"

**Scopo:** segnare una voce di una lista come fatta o da fare.
**Quando usarlo:** in una lista di cose da fare, dove l'utente spunta le voci una per una.
**Quando non usarlo:** per scegliere criteri con le pillole (CMP-11). Per un sì o un no che si applica subito (CMP-08).

### Varianti e dimensioni
- **Valore:** Fatta (quadratino `sfondo/accento` con segno "check" 16 in `icona/su-accento`) · Da fare (fondo `sfondo/scheda`, contorno `bordo/controllo` 2 px).
- **Stato:** Default, Hover (`sfondo/hover` sulla zona cliccabile), Focus (anello), Disattivato. In totale sono 8 varianti (2 valori × 4 stati).
- **Misure:** quadratino 16 (`misura/spunta`), segno 12 (`misura/segno-spunta`). Zona cliccabile 24 × 24 (`misura/bersaglio`, come richiede WCAG 2.2, criterio 2.5.8).
- **Consiglio:** rendere cliccabile tutta la riga, non solo il quadratino.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Fatta o Da fare |
| Hover | Fondo `sfondo/hover` sulla zona cliccabile |
| Focus | Anello di focus visibile attorno al quadratino |
| Disattivato | Opacità 45%; non si può cambiare |
| Attivo | Non previsto: la spunta cambia direttamente valore |
| Errore | Non previsto: la spunta non dà errori |
| Caricamento | Non previsto: il cambio è immediato |

### Accessibilità
- **Tastiera:** Tab raggiunge la voce, Spazio cambia il valore. Il focus è sempre visibile.
- **Lettori di schermo:** nel codice è una casella di spunta vera (`checkbox`), con il nome dato dal testo della voce.
- **Contrasti:** la zona cliccabile è di almeno 24 × 24 px. Fatta si distingue da Da fare anche dal segno "check", non solo dal colore.

### Esempi
- ✅ Corretto: riga intera cliccabile, con spunta 20 e testo accanto; Fatta con il segno "check".
- ❌ Scorretto: solo il quadratino da 16 px è cliccabile; Fatta indicata solo dal colore verde, senza segno.

---

## CMP-10 – Etichetta
**Tipo:** base · **Usato in:** SC-04, SC-05, SC-06 · **Figma:** libreria, pagina Componenti base, sezione "CMP-10 · Etichetta"

**Scopo:** dare in una parola o due l'informazione su un elemento, con un tono che la rende riconoscibile.
**Quando usarlo:** per qualificare un elemento con una parola breve, come il suo stato o il suo tipo.
**Quando non usarlo:** per un'azione: non è cliccabile, si usa il pulsante (CMP-03). Per un messaggio lungo: si usa l'esito (CMP-15).

### Varianti e dimensioni
- **Tono:** Neutro · Accento · Ok · Attenzione · Errore. Ogni tono ha il suo fondo tenue e il suo testo, in Dettaglio/Forte.
- **Proprietà:** **Testo** · **Con icona** · **Icona** (icona 16).
- **Misure:** padding `margine/etichetta` 4 × 8; gap `spazio/testo` 4; raggio a pillola.
- Non è cliccabile.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Colori del tono scelto |
| Hover | Non previsto: l'etichetta non è cliccabile |
| Focus | Non previsto: l'etichetta non riceve il focus |
| Attivo | Non previsto: l'etichetta non è interattiva |
| Disabilitato | Non previsto: l'etichetta non è interattiva |
| Errore | Non è uno stato ma un tono: vedi Varianti |
| Caricamento | Non previsto: l'etichetta mostra un'informazione già pronta |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il testo si legge così com'è. Se c'è un'icona, è decorativa (`aria-hidden="true"`).
- **Contrasti:** il tono non si capisce solo dal colore, perché il testo dice sempre cosa significa.

### Esempi
- ✅ Corretto: etichetta Ok con icona e testo "In regola", nel riepilogo di un conto.
- ❌ Scorretto: etichetta usata come pulsante; etichetta Errore per un dettaglio lungo, che è un compito dell'esito (CMP-15).

---

## CMP-11 – Criterio
**Tipo:** base · **Usato in:** SC-07 ("Posso permettermelo?") · **Figma:** libreria, pagina Componenti base, sezione "CMP-11 · Criterio"

**Scopo:** scegliere uno o più criteri, uno per volta, con una pillola che si attiva.
**Quando usarlo:** per criteri che si possono scegliere insieme, dove più di uno può essere vero.
**Quando non usarlo:** per una sola scelta tra poche opzioni (CMP-07). Per una voce di lista da spuntare (CMP-09).

### Varianti e dimensioni
- **Valore:** Scelto (fondo `sfondo/accento-tenue`, contorno accento, segno "check", testo Corpo/Forte in accento) · Non scelto (contorno `bordo/controllo`, testo `testo/secondario`).
- **Stato:** Default, Hover, Focus. In totale sono 6 varianti (2 valori × 3 stati).
- **Proprietà:** **Testo**.
- **Misure:** padding `margine/voce` 8 × 12; raggio a pillola.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Scelto o Non scelto |
| Hover | Colore di hover non ancora definito nelle bozze: da scegliere prima di costruire |
| Focus | Anello di focus visibile, come negli altri controlli |
| Attivo | Non previsto: il clic cambia direttamente la scelta |
| Disabilitato | Non previsto nelle bozze |
| Errore | Non previsto: il criterio non dà errori |
| Caricamento | Non previsto: il cambio è immediato |

### Accessibilità
- **Tastiera:** Tab raggiunge la pillola, Spazio cambia la scelta. Il focus è sempre visibile.
- **Lettori di schermo:** nel codice è una casella di spunta (`checkbox`), con il testo come nome. Lo stato "scelto" viene annunciato.
- **Contrasti:** Scelto si riconosce dal segno "check" e dal contorno, non solo dal colore.

### Esempi
- ✅ Corretto: pillola "Ho già il fondo di emergenza" con segno "check", contorno e testo in accento.
- ❌ Scorretto: pillola scelta solo con il colore; pillola cliccabile senza casella di spunta nel codice.

---

## CMP-12 – Barra di avanzamento
**Tipo:** base · **Usato in:** SC-01, SC-04, SC-07, SC-11 · **Figma:** libreria, pagina Componenti base, sezione "CMP-12 · Barra di avanzamento"

**Scopo:** mostrare quanta strada è stata fatta verso un traguardo.
**Quando usarlo:** per un obiettivo, un limite o un budget con un traguardo chiaro, quando c'è spazio in larghezza.
**Quando non usarlo:** per un numero senza traguardo. In uno spazio stretto, per un budget, si usa l'anello (CMP-13).

### Varianti e dimensioni
- **Tono:** Accento · Ok · Attenzione · Errore (colori `avanzamento/*`). Traccia `avanzamento/traccia`.
- **Misure:** altezza `misura/avanzamento` 8; raggio a pillola.
- **Proprietà:** **Valore**, cioè la larghezza della parte piena. Si imposta in ogni istanza; nel codice è una `width` in percentuale.
- Riempie il contenitore.
- **Da decidere:** il riempimento delle barre non si può ancora cambiare istanza per istanza (vedi registro).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Tono scelto sulla traccia |
| Errore | Tono Errore, con il testo che dice cosa è andato storto |
| Hover | Non previsto: la barra non è interattiva |
| Focus | Non previsto: la barra non riceve il focus |
| Attivo | Non previsto: la barra non è interattiva |
| Disabilitato | Non previsto: la barra non è interattiva |
| Caricamento | Non previsto: la barra mostra un valore già calcolato |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** nel codice è un `role="progressbar"` con `aria-valuenow`. Lo stato va scritto anche a parole o in percentuale, come richiede WCAG 1.4.1.
- **Contrasti:** riempimento e traccia hanno un contrasto di almeno 3:1. In chiaro, verde e arancio usano apposta il tono scuro.

### Esempi
- ✅ Corretto: barra Accento al 60% con il testo "150 € su 250 €" sopra.
- ❌ Scorretto: barra verde senza nessun testo; barra con riempimento chiaro su traccia quasi bianca.

---

## CMP-13 – Anello di avanzamento
**Tipo:** base · **Usato in:** SC-01 (budget) · **Figma:** libreria, pagina Componenti base, sezione "CMP-13 · Anello di avanzamento"

**Scopo:** mostrare in forma compatta quanto di un budget è stato usato.
**Quando usarlo:** accanto a un importo, dove c'è poco spazio in larghezza.
**Quando non usarlo:** da solo, senza testo. Per un avanzamento largo si usa la barra (CMP-12).

### Varianti e dimensioni
- **Tono:** come la barra (Accento · Ok · Attenzione · Errore).
- **Misure:** misura 20.
- **Proprietà:** l'arco del livello **Valore** si imposta in ogni istanza.
- Va sempre accompagnato da testo, per esempio "205 / 250 €".

### Stati
| Stato | Descrizione |
|---|---|
| Default | Tono scelto sull'arco |
| Errore | Tono Errore, con il testo accanto che dice cosa è andato storto |
| Hover | Non previsto: l'anello non è interattivo |
| Focus | Non previsto: l'anello non riceve il focus |
| Attivo | Non previsto: l'anello non è interattivo |
| Disabilitato | Non previsto: l'anello non è interattivo |
| Caricamento | Non previsto: l'anello mostra un valore già calcolato |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il testo accanto dà il valore, quindi l'anello è decorativo (`aria-hidden="true"`).
- **Contrasti:** valgono le stesse regole della barra (CMP-12).

### Esempi
- ✅ Corretto: anello 20 in Accento con "205 / 250 €" accanto.
- ❌ Scorretto: anello senza testo; anello usato al posto di una barra larga per l'intera pagina.

---

## CMP-14 – Avatar
**Tipo:** base · **Usato in:** SC-09 · **Figma:** libreria, pagina Componenti base, sezione "CMP-14 · Avatar"

**Scopo:** rappresentare una persona con la sua iniziale o con un'icona.
**Quando usarlo:** accanto al nome di una persona.
**Quando non usarlo:** per una foto: il componente non prevede immagini, solo iniziale o icona. Per una categoria, si usa la tessera icona (CMP-02).

### Varianti e dimensioni
- **Tipo:** Iniziale · Icona.
- **Misura:** Piccola 32 (`misura/avatar-piccolo`) · Grande 48 (`misura/avatar-grande`).
- **Colori:** fondo `sfondo/accento-tenue`, con l'iniziale o l'icona in accento.
- **Proprietà:** **Iniziale**.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Iniziale o icona su fondo tenue |
| Hover | Non previsto: l'avatar non è interattivo |
| Focus | Non previsto: l'avatar non riceve il focus |
| Attivo | Non previsto: l'avatar non è interattivo |
| Disabilitato | Non previsto: l'avatar non è interattivo |
| Errore | Non previsto: l'avatar non dà errori |
| Caricamento | Non previsto: l'avatar mostra un'iniziale già pronta |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** se il nome della persona è accanto, l'avatar è decorativo (`aria-hidden="true"`). Se è da solo, ha un `aria-label` con il nome della persona.
- **Contrasti:** l'iniziale è in accento su fondo `sfondo/accento-tenue`. Il contrasto va verificato in `tokens.md` prima di costruire.

### Esempi
- ✅ Corretto: avatar Piccolo con iniziale "M", accanto al nome della persona.
- ❌ Scorretto: avatar senza nome accanto e senza `aria-label`; avatar Grande dentro una riga di lista.

---

## CMP-15 – Esito
**Tipo:** base · **Usato in:** SC-01, SC-04, SC-07, SC-10 · **Figma:** libreria, pagina Componenti base, sezione "CMP-15 · Esito"

**Scopo:** dire in una riga com'è andata un'azione o un controllo.
**Quando usarlo:** dopo un'azione o un controllo, per dire se è andata bene, se c'è da fare attenzione, se c'è un errore o per dare un'informazione.
**Quando non usarlo:** per una parola breve su un elemento (CMP-10). Per un'azione da fare (CMP-03).

### Varianti e dimensioni
- **Tono:** Ok (icona cerchio con spunta, `circle-check`) · Attenzione (icona cerchio con punto esclamativo, `circle-alert`) · Errore (icona cerchio con croce, `circle-x`) · Informazione (icona info).
- Fondo tenue del tono; testo in Dettaglio/Forte del tono.
- **Misure:** padding `margine/riquadro` 12 × 16; gap `spazio/icona` 8; raggio 8. Riempie la larghezza.
- **Proprietà:** **Testo**.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Tono scelto |
| Errore | Tono Errore: usa il ruolo `alert` nel codice |
| Hover | Non previsto: il riquadro informa, non si clicca |
| Focus | Non previsto: il riquadro non riceve il focus |
| Attivo | Non previsto: il riquadro non è interattivo |
| Disabilitato | Non previsto: il riquadro non è interattivo |
| Caricamento | Non previsto: l'esito compare quando l'azione è finita |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** nel codice ha `role="status"` per Ok, Attenzione e Informazione; per gli errori ha `role="alert"`.
- **Contrasti:** il significato sta nel testo, non solo nell'icona. L'icona è decorativa (`aria-hidden="true"`).

### Esempi
- ✅ Corretto: esito Ok "Budget rispettato: hai speso 205 € su 250 €", con icona cerchio con spunta.
- ❌ Scorretto: tono Errore usato per un consiglio, che sarebbe Attenzione; esito di errore con `role="status"`; solo l'icona, senza testo.

---

## CMP-16 – Separatore
**Tipo:** base · **Usato in:** SC-01, SC-03, SC-10 · **Figma:** libreria, pagina Componenti base, sezione "CMP-16 · Separatore"

**Scopo:** separare visivamente due parti dello stesso contenitore.
**Quando usarlo:** tra due gruppi di contenuto dentro lo stesso contenitore, quando lo spazio da solo non basta a farli distinguere.
**Quando non usarlo:** per separare schede o sezioni della pagina: lì basta il gap. Non si usa per decorare.

### Varianti e dimensioni
- Linea alta `misura/bordo` 1, colore `bordo/separatore`. Riempie la larghezza.
- Una sola linea orizzontale: nessuna variante.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Linea `bordo/separatore` |
| Hover | Non previsto: il separatore non è interattivo |
| Focus | Non previsto: il separatore non riceve il focus |
| Attivo | Non previsto: il separatore non è interattivo |
| Disabilitato | Non previsto: il separatore non è interattivo |
| Errore | Non previsto: il separatore non porta informazioni |
| Caricamento | Non previsto: il separatore è sempre uguale |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** è decorativo. Nel codice è un `<hr>` oppure il bordo del contenitore.
- **Contrasti:** non serve un contrasto minimo, perché la linea non porta informazioni.

### Esempi
- ✅ Corretto: linea tra il riepilogo e le azioni in fondo a una finestra.
- ❌ Scorretto: linea tra due schede (lì basta il gap); linea doppia o colorata a mano.

---

## CMP-20 – Barra laterale
**Tipo:** composto · **Usato in:** tutte tranne SC-10 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-20 · Barra laterale"

**Scopo:** navigare tra le sezioni dell'app dal computer.
**Quando usarlo:** nelle schermate del computer, sempre visibile a sinistra.
**Quando non usarlo:** nelle schermate senza navigazione, cioè in SC-10.

### Varianti e dimensioni
- Contiene il logo, l'azione principale "Aggiungi spesa", le sezioni (Panoramica, Spese previste, Obiettivi, Movimenti, Conti, Investimenti, Analisi, Categorie) e, in fondo, il profilo ed "Esci".
- Per segnare la sezione attiva si mette Stato = Attiva nella sua voce.
- Misure: larghezza `larghezza/barra-laterale`, padding `margine/barra-laterale`, fondo `sfondo/barra-laterale`.
- Gap `spazio/gruppo` tra logo, azione e sezioni; `spazio/elenco` tra le voci.
- Nelle schermate riempie l'altezza.
- Le voci sono istanze esposte.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Una voce Attiva, le altre Normale |
| Hover | Non previsto qui: lo stato è sulla singola voce del menu |
| Focus | Non previsto qui: il focus va sulla singola voce |
| Attivo | Non previsto qui: la voce attiva è già segnata |
| Disabilitato | Non previsto: la barra non si disattiva |
| Errore | Non previsto: la barra non dà errori |
| Caricamento | Non previsto: le voci sono sempre pronte |

### Accessibilità
- **Tastiera:** Tab passa tra le voci del menu, Invio apre la voce.
- **Lettori di schermo:** nel codice è un `<nav>` con un elenco di link. La voce attiva ha `aria-current="page"`.
- **Contrasti:** testi e icone usano i colori del menu (CMP-01).

### Esempi
- ✅ Corretto: voce "Panoramica" con Stato Attiva e `aria-current="page"` nel codice.
- ❌ Scorretto: sezione attiva segnata solo dal colore, senza `aria-current`.

---

## CMP-21 – Intestazione di pagina
**Tipo:** composto · **Usato in:** tutte tranne SC-10 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-21 · Intestazione di pagina"

**Scopo:** dire in cima alla pagina dove si è, con titolo, sottotitolo e azioni.
**Quando usarlo:** in cima a ogni pagina.
**Quando non usarlo:** dentro una scheda o una finestra: lì il titolo sta nella scheda (CMP-22) o nella finestra (CMP-32).

### Varianti e dimensioni
- **Proprietà:** Titolo, Sottotitolo [testo]; Con sottotitolo, Con azione secondaria, Con azione principale [sì/no].
- Gap `spazio/blocco` tra titoli e azioni; `spazio/testo` tra titolo e sottotitolo.
- Riempie la larghezza.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Con o senza sottotitolo e azioni |
| Hover | Non previsto: l'intestazione è solo testo e azioni |
| Focus | Non previsto qui: il focus va sui pulsanti delle azioni (CMP-03) |
| Attivo | Non previsto: l'intestazione non è interattiva |
| Disabilitato | Non previsto: l'intestazione non si disattiva |
| Errore | Non previsto: l'intestazione non dà errori |
| Caricamento | Non previsto: il titolo è già pronto |

### Accessibilità
- **Tastiera:** le azioni si raggiungono con Tab (CMP-03).
- **Lettori di schermo:** nel codice il titolo è l'`h1`, quindi ce n'è uno solo per pagina.
- **Contrasti:** titolo e sottotitolo usano i token di testo del progetto.

### Esempi
- ✅ Corretto: titolo "Panoramica" con sottotitolo e l'azione principale a destra.
- ❌ Scorretto: intestazione dentro una scheda; titolo di pagina scritto come `h2`.

---

## CMP-22 – Scheda
**Tipo:** composto · **Usato in:** ovunque · **Figma:** libreria, pagina Componenti composti, sezione "CMP-22 · Scheda"

**Scopo:** contenere un blocco di informazioni con un titolo.
**Quando usarlo:** per ogni gruppo di contenuti con un titolo, come Numeri, Da pagare, Obiettivo o Conto.
**Quando non usarlo:** per una riga di tabella o di elenco: quelle hanno il loro spazio, come elenco in scheda.

### Varianti e dimensioni
- **Proprietà:** Titolo, Nota [testo]; Con titolo, Con tessera, Con nota [sì/no]; Contenuto [scambio].
- Fondo `sfondo/scheda`, contorno `bordo/scheda`, raggio `raggio/scheda`, padding `margine/scheda`, gap `spazio/blocco`.
- Titolo: tessera piccola (CMP-02), stile Titolo/Scheda e nota.
- Il contenuto si scambia con il componente da mostrare (parte Contenuto).
- Nell'uso riempie la larghezza.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Con o senza titolo, tessera e nota |
| Hover | Non previsto: la scheda non ha uno stato di passaggio, lo dà il contenuto |
| Focus | Non previsto: il focus va su ciò che la scheda contiene |
| Attivo | Non previsto: la scheda non è interattiva |
| Disabilitato | Non previsto: la scheda non si disattiva |
| Errore | Non previsto: gli errori stanno nei campi o nell'esito (CMP-15) |
| Caricamento | Non previsto: la scheda mostra il contenuto già pronto |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** nel codice è un `<section>` con titolo `h2`.
- **Contrasti:** fondo e contorno usano i token della scheda; i testi dentro seguono le regole dei loro componenti.

### Esempi
- ✅ Corretto: scheda "Obiettivo" con tessera piccola, titolo, contenuto e azioni in fondo.
- ❌ Scorretto: scheda dentro un'altra scheda; titolo scritto come `h1`.

---

## CMP-23 – Numero chiave
**Tipo:** composto · **Usato in:** SC-01, SC-02, SC-05, SC-07 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-23 · Numero chiave"

**Scopo:** mostrare un numero importante con la sua etichetta e una nota.
**Quando usarlo:** per un numero che si legge subito, come un totale o un saldo.
**Quando non usarlo:** per un numero dentro una tabella o una lista: lì ci sono le colonne.

### Varianti e dimensioni
- **Proprietà:** Etichetta, Valore, Nota [testo]; Con nota [sì/no]; Tono [Normale, Ok, Attenzione, Errore] (4 varianti).
- La tessera è esposta: si cambia l'icona. Il tono Errore ha fondo rosso tenue e tessera "su colore" (CMP-02).
- Padding `margine/scheda`; gap `spazio/icona` tra tessera e testi; `spazio/testo` tra etichetta, valore e nota.
- Il valore è in stile Numero/Grande. Nell'uso riempie la colonna.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Tono scelto |
| Hover | Non previsto: il numero non è interattivo |
| Focus | Non previsto: il numero non riceve il focus |
| Attivo | Non previsto: il numero non è interattivo |
| Disabilitato | Non previsto: il numero non si disattiva |
| Errore | È un tono, vedi Varianti |
| Caricamento | Non previsto: il numero è già calcolato |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il testo si legge nell'ordine etichetta, valore, nota.
- **Contrasti:** il tono Errore dice il problema nel testo, non solo nel colore.

### Esempi
- ✅ Corretto: "Da pagare" con valore grande, tono Errore e nota che spiega cosa fare.
- ❌ Scorretto: numero senza etichetta; tono Errore senza nota.

---

## CMP-24 – Voce da spuntare
**Tipo:** composto · **Usato in:** SC-01 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-24 · Voce da spuntare"

**Scopo:** segnare una spesa prevista del mese come fatta o da fare.
**Quando usarlo:** nella lista delle spese del mese, nella Panoramica.
**Quando non usarlo:** in una tabella con colonne: lì va la riga spesa prevista (CMP-26).

### Varianti e dimensioni
- **Proprietà:** Nome, Conto, Importo [testo]; Icona [scambio]; Stato [Da fare, Fatta] (2 varianti).
- Fatta: i testi sono in colore secondario.
- Padding `margine/voce-v` sopra e sotto; gap `spazio/colonne` tra voce, conto e importo; `spazio/icona` tra spunta, icona e nome.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Da fare o Fatta |
| Hover | Non previsto qui: lo stato è sulla spunta (CMP-09) |
| Focus | Non previsto qui: il focus è sulla spunta (CMP-09) |
| Attivo | Non previsto: la spunta cambia subito |
| Disabilitato | Non previsto: la voce non si disattiva |
| Errore | Non previsto: la voce non dà errori |
| Caricamento | Non previsto: il cambio è immediato |

### Accessibilità
- **Tastiera:** Tab raggiunge la spunta, Spazio la cambia.
- **Lettori di schermo:** nel codice tutta la riga è una casella di spunta con etichetta (il nome della voce).
- **Contrasti:** Fatta si distingue anche dal segno "check" (CMP-09), non solo dal colore.

### Esempi
- ✅ Corretto: voce "Affitto" con conto e importo, Fatta con i testi in secondario.
- ❌ Scorretto: solo il quadratino è cliccabile.

---

## CMP-25 – Voce budget
**Tipo:** composto · **Usato in:** SC-01 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-25 · Voce budget"

**Scopo:** mostrare un budget del mese che si riempie con le spese.
**Quando usarlo:** nella lista dei budget del mese (SC-01).
**Quando non usarlo:** per un obiettivo con un traguardo da raggiungere: lì va la riga di avanzamento (CMP-29).

### Varianti e dimensioni
- **Proprietà:** Nome, Nota, Conto, Importo [testo]; Icona [scambio]; Stato [Normale, Attenzione (oltre l'80%), Superato] (3 varianti).
- Contiene: anello (CMP-13), icona della categoria, nome, barra (CMP-12), quanto resta, conto, usato / tetto.
- Anello e barra prendono il tono dello stato.
- Stesse colonne di CMP-24, così le righe si allineano.
- **Da decidere:** il riempimento delle barre non si può ancora cambiare istanza per istanza (vedi registro).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Normale. Attenzione (oltre l'80%) e Superato cambiano il tono |
| Hover | Non previsto: la voce mostra solo il suo stato |
| Focus | Non previsto nei dati |
| Attivo | Non previsto: la voce non cambia con il clic |
| Disabilitato | Non previsto: la voce non si disattiva |
| Errore | Superato usa il tono Errore, con il testo che dice quanto si è superato il tetto |
| Caricamento | Non previsto: il valore è già calcolato |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** l'anello è decorativo; il testo "usato / tetto" dà il valore (CMP-13).
- **Contrasti:** Attenzione e Superato si leggono anche dal testo, non solo dal colore.

### Esempi
- ✅ Corretto: budget "Spesa" in Attenzione con "205 / 250 €" scritto accanto all'anello.
- ❌ Scorretto: anello giallo senza testo; righe che non si allineano con la voce da spuntare (CMP-24).

---

## CMP-26 – Riga spesa prevista
**Tipo:** composto · **Usato in:** SC-02 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-26 · Riga spesa prevista"

**Scopo:** una riga della tabella delle spese previste.
**Quando usarlo:** nella tabella delle spese previste, una riga per spesa e la riga del totale.
**Quando non usarlo:** nella lista della Panoramica: lì va la voce da spuntare (CMP-24).

### Varianti e dimensioni
- **Proprietà:** Nome, Categoria, Conto, Quando, Totale, Tua quota [testo]; Tipo [Voce, Riassunto] (2 varianti).
- **Voce:** tessera della categoria esposta, nome, categoria, conto, quando, totale, tua quota.
- **Riassunto:** è la riga "Totale del mese" in fondo alla tabella: solo nome, totale e tua quota, senza tessera.
- Padding `margine/riga-v`, linea `bordo/separatore` sotto, gap `spazio/colonne`.
- Colonne a larghezza fissa, per allinearsi in tabella.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Voce o Riassunto |
| Hover | Non previsto: la riga non ha azioni |
| Focus | Non previsto: la riga non ha azioni |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: la riga non dà errori |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** nel codice è una riga di tabella; le intestazioni stanno nell'intestazione di tabella (non ancora costruita).
- **Contrasti:** la tessera usa i contrasti di CMP-02.

### Esempi
- ✅ Corretto: riga Voce con la tessera della categoria e le colonne allineate all'intestazione; riga Riassunto "Totale del mese" senza tessera.
- ❌ Scorretto: riassunto con la tessera; colonne di larghezza diversa da una riga all'altra.

---

## CMP-27 – Riga movimento
**Tipo:** composto · **Usato in:** SC-05 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-27 · Riga movimento"

**Scopo:** un movimento del conto nell'elenco dei movimenti.
**Quando usarlo:** nell'elenco dei movimenti, sotto la riga di giorno.
**Quando non usarlo:** per una spesa prevista: lì vanno la voce da spuntare (CMP-24) o la riga spesa prevista (CMP-26).

### Varianti e dimensioni
- **Proprietà:** Esercente, Categoria, Conto, Importo [testo]; Con etichetta [sì/no]; Tipo [Uscita, Entrata (importo verde), Trasferimento (tessera neutra)] (3 varianti).
- Contiene: tessera della categoria, esercente e categoria, etichetta (da dove viene: Budget, Condiviso…), conto, importo.
- Tessera ed etichetta sono esposte.
- Padding `margine/riga-v`, linea sotto, gap `spazio/colonne`.
- L'importo è in stile Corpo/Forte, allineato a destra, con il segno.
- Accanto c'è il riquadro "Esempi con testi veri", con istanze che hanno testi diversi per ogni variante.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Uscita, Entrata o Trasferimento |
| Hover | Non previsto: la riga non ha azioni nei dati |
| Focus | Non previsto: la riga non ha azioni nei dati |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: la riga non dà errori |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** l'etichetta e il segno dell'importo si leggono nel testo.
- **Contrasti:** l'entrata si distingue dal segno, non solo dal verde.

### Esempi
- ✅ Corretto: Entrata con importo verde e segno, etichetta "Condiviso" accanto al conto.
- ❌ Scorretto: entrata senza segno, distinta solo dal verde; etichetta con solo un'icona.

---

## CMP-28 – Scheda conto
**Tipo:** composto · **Usato in:** SC-06 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-28 · Scheda conto"

**Scopo:** mostrare un conto con il suo saldo e aprire il suo dettaglio.
**Quando usarlo:** nella lista dei conti (SC-06).
**Quando non usarlo:** per un conto dentro un elenco di movimenti: lì basta il nome del conto (riga movimento, CMP-27).

### Varianti e dimensioni
- **Proprietà:** Nome, Tipo, Saldo, Nota [testo]; Condiviso [sì/no].
- La tessera è l'icona del tipo di conto: corrente (landmark), digitale (smartphone), investimenti (trending-up), contanti (banknote).
- Contiene: nome, tipo, etichetta Condiviso, saldo (stile Numero/Grande), nota con freccia.
- Padding `margine/scheda`, gap `spazio/blocco`; testata con gap `spazio/colonne`.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Conto con o senza Condiviso |
| Hover | Non previsto nei dati |
| Focus | Va sul link o sul pulsante che copre la scheda |
| Attivo | Non previsto: la scheda non cambia con il clic |
| Disabilitato | Non previsto: la scheda non si disattiva |
| Errore | Non previsto: la scheda non dà errori |
| Caricamento | Non previsto: la scheda mostra dati già pronti |

### Accessibilità
- **Tastiera:** tutta la scheda è un link o un pulsante.
- **Lettori di schermo:** nel codice la scheda è un link o un pulsante, con il nome del conto e il saldo nel testo.
- **Contrasti:** il tipo di conto è scritto nel testo; la tessera lo conferma soltanto.

### Esempi
- ✅ Corretto: scheda "Conto corrente" con la tessera del tipo corrente, saldo grande ed etichetta Condiviso se serve.
- ❌ Scorretto: la stessa icona per tutti i tipi di conto; scheda cliccabile solo sul saldo.

---

## CMP-29 – Riga di avanzamento
**Tipo:** composto · **Usato in:** SC-01, SC-04 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-29 · Riga di avanzamento"

**Scopo:** mostrare a che punto è una voce verso il suo traguardo.
**Quando usarlo:** per sotto-obiettivi, traguardi di copertura e categorie di spesa.
**Quando non usarlo:** per un budget con un tetto: lì va la voce budget (CMP-25).

### Varianti e dimensioni
- **Proprietà:** Nome, Importo, Percentuale [testo]; Icona [scambio]; Stato [In corso, Completo (verde con ✓), Attenzione] (3 varianti).
- Contiene: nome, importo, barra (CMP-12) e percentuale, sempre scritta.
- Padding `margine/voce-v`, gap `spazio/colonne`.
- Accanto c'è il riquadro "Esempi con testi veri", con istanze che hanno testi diversi per ogni variante.
- **Da decidere:** il riempimento delle barre non si può ancora cambiare istanza per istanza (vedi registro).

### Stati
| Stato | Descrizione |
|---|---|
| Default | In corso |
| Hover | Non previsto: la riga non è interattiva |
| Focus | Non previsto: la riga non riceve il focus |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: per un problema si usa lo stato Attenzione |
| Caricamento | Non previsto: il valore è già calcolato |

Completo ha il colore verde e il segno ✓; Attenzione ha il tono di attenzione.

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** la barra è una `progressbar` (CMP-12) e la percentuale è scritta nel testo.
- **Contrasti:** Completo ha il segno ✓, non solo il verde.

### Esempi
- ✅ Corretto: "Fondo emergenza" con barra e "60%" scritto accanto, stato In corso.
- ❌ Scorretto: barra senza percentuale; Completo solo verde, senza ✓.

---

## CMP-30 – Testata obiettivo
**Tipo:** composto · **Usato in:** SC-04 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-30 · Testata obiettivo"

**Scopo:** la parte alta della scheda di un obiettivo.
**Quando usarlo:** in cima alla scheda di un obiettivo.
**Quando non usarlo:** fuori da una scheda: va dentro una scheda (CMP-22), sotto le righe di avanzamento (CMP-29).

### Varianti e dimensioni
- **Proprietà:** Nome, Descrizione, Valore, Percentuale [testo]; Condiviso [sì/no].
- Contiene: tessera, nome, etichetta Condiviso, descrizione, valore su traguardo, percentuale, barra, azioni Versa e Modifica.
- Gap `spazio/blocco` tra testata, barra e azioni; `spazio/colonne` nella testata; `spazio/icona` tra le azioni.
- Va dentro una Scheda (CMP-22) con le righe di avanzamento (CMP-29).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Con o senza Condiviso |
| Hover | Non previsto qui: lo stato è sui pulsanti Versa e Modifica (CMP-03) |
| Focus | Non previsto qui: il focus è sui pulsanti Versa e Modifica (CMP-03) |
| Attivo | Non previsto: la testata non è interattiva |
| Disabilitato | Non previsto: la testata non si disattiva |
| Errore | Non previsto: la testata non dà errori |
| Caricamento | Non previsto: la testata mostra dati già pronti |

### Accessibilità
- **Tastiera:** Versa e Modifica si raggiungono con Tab (CMP-03).
- **Lettori di schermo:** il nome è scritto nel testo accanto alla tessera.
- **Contrasti:** valore e percentuale sono testo; la barra li ripete.

### Esempi
- ✅ Corretto: testata con tessera, nome "Vacanza", descrizione, valore su traguardo, percentuale, barra e azioni Versa e Modifica in fondo.
- ❌ Scorretto: azioni con solo icona e senza nome; testata senza percentuale scritta.

---

## CMP-31 – Riga categoria
**Tipo:** composto · **Usato in:** SC-08 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-31 · Riga categoria"

**Scopo:** una riga dell'albero delle categorie.
**Quando usarlo:** nell'albero delle categorie (SC-08), una riga per categoria o sottocategoria.
**Quando non usarlo:** per una lista piatta di categorie: l'albero ha rientri e frecce che lì non servono.

### Varianti e dimensioni
- 18 varianti: 3 livelli × 3 rami × 2 icone.
- **Proprietà:** Nome, Sottocategorie, Speso, Nome colore [testo]; Livello [0, 1, 2]; Ramo [Aperto, Chiuso, Foglia]; Icona [Propria (tessera accento), Ereditata dal padre (tessera neutra, icona tenue)].
- Contiene: freccia apri/chiudi, tessera, nome e numero di sottocategorie, colore, speso, pulsante modifica.
- Rientro `misura/rientro-albero` (32) per il livello 1 e `misura/rientro-albero-doppio` (64) per il livello 2.
- Padding `margine/voce`, gap `spazio/colonne`.
- Il colore delle categorie è ancora da scegliere.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Aperto, Chiuso o Foglia |
| Hover | Non previsto nei dati |
| Focus | Va sulla riga dell'albero |
| Attivo | Non previsto: la riga non cambia con il clic |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: la riga non dà errori |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** le frecce si muovono nell'albero.
- **Lettori di schermo:** nel codice è `role="treeitem"` con `aria-expanded` e `aria-level`.
- **Contrasti:** Aperto e Chiuso si distinguono dalla freccia, non solo dal colore.

### Esempi
- ✅ Corretto: categoria di livello 1 Chiusa, con freccia, tessera accento e pulsante modifica.
- ❌ Scorretto: rientro fatto a mano invece delle misure; riga senza `aria-expanded`.

---

## CMP-32 – Finestra
**Tipo:** composto · **Usato in:** SC-03, SC-10 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-32 · Finestra"

**Scopo:** una finestra al centro dello schermo, per modificare o creare qualcosa.
**Quando usarlo:** per creare o modificare un elemento senza lasciare la pagina.
**Quando non usarlo:** per una pagina intera: lì va la pagina.

### Varianti e dimensioni
- **Proprietà:** Titolo [testo]; Con tessera, Con elimina [sì/no]; Contenuto [scambio].
- Sopra la pagina c'è un velo (`sfondo/velo`).
- Titolo con la X di chiusura (CMP-04), contenuto, azioni in fondo: Elimina a sinistra, Annulla e Salva a destra.
- Misure: larghezza `larghezza/finestra`, padding `margine/finestra`, raggio `raggio/finestra`, ombra `ombra/finestra`.
- Gap `spazio/gruppo` tra titolo, contenuto e azioni; `spazio/colonne` tra le azioni.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Con o senza tessera e pulsante Elimina |
| Hover | Non previsto: la finestra non è interattiva nel suo insieme |
| Focus | Resta dentro la finestra (vedi Accessibilità) |
| Attivo | Non previsto: la finestra non cambia con il clic |
| Disabilitato | Non previsto: la finestra non si disattiva |
| Errore | Non previsto: gli errori stanno nei campi (CMP-05) |
| Caricamento | Non previsto nei dati |

### Accessibilità
- **Tastiera:** il focus resta dentro la finestra; Esc la chiude; alla chiusura il focus torna al pulsante che l'ha aperta.
- **Lettori di schermo:** nel codice è `role="dialog"` con `aria-modal`.
- **Contrasti:** il velo e le azioni seguono i token dei pulsanti (CMP-03).

### Esempi
- ✅ Corretto: finestra "Modifica spesa" con la X in alto a destra, Elimina a sinistra, Annulla e Salva a destra.
- ❌ Scorretto: finestra senza `role="dialog"`; Salva messo a sinistra di Annulla.

---

## CMP-33 – Barra dei filtri
**Tipo:** composto · **Usato in:** SC-02, SC-05 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-33 · Barra dei filtri"

**Scopo:** filtrare una lista con periodo, tendine e ricerca, tutto su una riga.
**Quando usarlo:** sopra le liste lunghe, come le spese previste (SC-02) e i movimenti (SC-05).
**Quando non usarlo:** per scegliere tra 2, 3 o 4 opzioni: lì va la scelta a segmenti (CMP-07).

### Varianti e dimensioni
- Contiene: Periodo (Selettore periodo), tre tendine senza etichetta (conto, categoria, tipo), uno spazio, la ricerca.
- Gap `spazio/colonne`.
- Tutte le istanze sono esposte: si cambiano i valori e si nascondono i filtri che non servono.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Tutti i filtri visibili o nascosti secondo l'uso |
| Hover | Non previsto qui: lo stato è sulle singole tendine (CMP-06) e sulla ricerca |
| Focus | Non previsto qui: il focus è sulle singole tendine (CMP-06) e sulla ricerca |
| Attivo | Non previsto: la barra non cambia con il clic |
| Disabilitato | Non previsto: la barra non si disattiva |
| Errore | Non previsto: i filtri non danno errori |
| Caricamento | Non previsto: i filtri sono sempre pronti |

### Accessibilità
- **Tastiera:** Tab passa da un filtro all'altro.
- **Lettori di schermo:** le tendine senza etichetta hanno il nome in `aria-label` (CMP-06).
- **Contrasti:** valgono quelli del campo di testo (CMP-05) e della tendina (CMP-06).

### Esempi
- ✅ Corretto: barra con Periodo, tendina "Conto" con `aria-label="Conto"` e ricerca.
- ❌ Scorretto: filtri che non servono lasciati visibili; tendina senza nome.

---

## CMP-34 – Grafico mese per mese
**Tipo:** composto · **Usato in:** SC-07 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-34 · Grafico mese per mese"

**Scopo:** confrontare entrate e uscite di ogni mese.
**Quando usarlo:** per vedere l'andamento di più mesi insieme.
**Quando non usarlo:** per il valore di un portafoglio nel tempo: lì va il grafico a linea (CMP-37).

### Varianti e dimensioni
- Contiene una coppia di barre per ogni mese (parte Mese del grafico), con legenda.
- Le entrate sono verdi (avanzamento/ok), le uscite sono in avanzamento/accento.
- I mesi sono distribuiti su tutta la larghezza. I mesi futuri hanno barre grigie basse (avanzamento/traccia).
- Linea di base `bordo/separatore`.
- Gap `spazio/blocco` tra legenda e grafico.
- Va dentro una Scheda (CMP-22).
- **Da decidere:** il riempimento delle barre non si può ancora cambiare istanza per istanza (vedi registro).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Mesi passati con le due barre, mesi futuri in grigio |
| Hover | Non previsto: il grafico non è interattivo |
| Focus | Non previsto: il grafico non riceve il focus |
| Attivo | Non previsto: il grafico non è interattivo |
| Disabilitato | Non previsto: il grafico non si disattiva |
| Errore | Non previsto: il grafico non dà errori |
| Caricamento | Non previsto: il grafico mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** nel codice c'è una tabella dei dati per chi usa il lettore di schermo.
- **Contrasti:** entrate e uscite si distinguono anche dalla legenda, non solo dal colore.

### Esempi
- ✅ Corretto: grafico con legenda sopra, mesi futuri grigi, tabella dei dati per il lettore di schermo.
- ❌ Scorretto: grafico senza legenda; mesi futuri con barre colorate come quelli passati.

---

## CMP-35 – Riga rata
**Tipo:** composto · **Usato in:** SC-07 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-35 · Riga rata"

**Scopo:** mostrare una rata: quando finisce e quanto si paga al mese.
**Quando usarlo:** nella pagina "Posso permettermelo?" (SC-07), dove servono le rate in corso.
**Quando non usarlo:** per una spesa normale: lì va la riga movimento (CMP-27).

### Varianti e dimensioni
- **Proprietà:** Nome, Fine, Rata [testo].
- Contiene: icona carta, nome, quando finisce, rata al mese.
- Padding `margine/riga-v`, linea sotto, gap `spazio/colonne`.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Rata in corso |
| Hover | Non previsto: la riga non è interattiva |
| Focus | Non previsto: la riga non riceve il focus |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: la riga non dà errori |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** l'icona è decorativa; il testo dice nome, fine e rata.
- **Contrasti:** il testo porta il dato; l'icona conferma solo il tipo.

### Esempi
- ✅ Corretto: "Prestito auto", fine nel 2028, rata al mese scritta a destra.
- ❌ Scorretto: rata senza la data di fine.

---

## CMP-36 – Riga controllo
**Tipo:** composto · **Usato in:** SC-07 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-36 · Riga controllo"

**Scopo:** dire se una regola è rispettata o no.
**Quando usarlo:** nella lista delle regole di "Posso permettermelo?" (SC-07).
**Quando non usarlo:** per l'esito di un'azione: lì va l'esito (CMP-15).

### Varianti e dimensioni
- **Proprietà:** Testo [testo]; Esito [Rispettata (icona circle-check, icona/ok), Non rispettata (icona circle-x, icona/errore)] (2 varianti).
- Gap `spazio/icona` tra icona e testo.
- Nelle liste il contenitore usa gap `spazio/elenco`.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Rispettata o Non rispettata |
| Hover | Non previsto: la riga informa, non si clicca |
| Focus | Non previsto: la riga non riceve il focus |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non rispettata: icona e colore di errore, con il testo |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** l'icona è decorativa; il testo dice se la regola è rispettata.
- **Contrasti:** il significato sta nel testo e nell'icona, mai solo nel colore.

### Esempi
- ✅ Corretto: "Ho il fondo di emergenza", Rispettata con icona circle-check e testo.
- ❌ Scorretto: solo un pallino verde, senza testo.

---

## CMP-37 – Grafico a linea
**Tipo:** composto · **Usato in:** SC-11 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-37 · Grafico a linea"

**Scopo:** mostrare come cambiano nel tempo il valore del portafoglio e i soldi messi dentro.
**Quando usarlo:** per confrontare il valore del portafoglio con quanto è stato versato.
**Quando non usarlo:** per entrate e uscite mese per mese: lì va il grafico mese per mese (CMP-34).

### Varianti e dimensioni
- Linea piena (avanzamento/accento): valore del portafoglio.
- Linea tratteggiata (testo/terziario): soldi messi dentro.
- Spessore `misura/bordo-forte`, griglia `bordo/separatore`, legenda ed etichette dei mesi.
- Gap `spazio/blocco`.
- Va dentro una Scheda (CMP-22).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Le due linee con legenda |
| Hover | Non previsto: il grafico non è interattivo |
| Focus | Non previsto: il grafico non riceve il focus |
| Attivo | Non previsto: il grafico non è interattivo |
| Disabilitato | Non previsto: il grafico non si disattiva |
| Errore | Non previsto: il grafico non dà errori |
| Caricamento | Non previsto: il grafico mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** la forma delle linee è il dato. Nel codice il grafico è in SVG, con una tabella dei dati accanto.
- **Contrasti:** le due linee si distinguono anche dal tratteggio, non solo dal colore.

### Esempi
- ✅ Corretto: linea piena e tratteggiata, con legenda e tabella accanto.
- ❌ Scorretto: due linee distinte solo per colore; grafico senza tabella dei dati.

---

## CMP-38 – Riga posizione
**Tipo:** composto · **Usato in:** SC-11 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-38 · Riga posizione"

**Scopo:** mostrare un titolo del portafoglio con quote, prezzi, valore e guadagno.
**Quando usarlo:** nell'elenco dei titoli del portafoglio (SC-11).
**Quando non usarlo:** per un acquisto o una vendita: lì va la riga operazione (CMP-40).

### Varianti e dimensioni
- **Proprietà:** Titolo, Codice, Quote, Prezzo medio, Prezzo oggi, Valore, Importo guadagno, Peso [testo]; Guadagno [Positivo (testo/ok, freccia su), Negativo (testo/errore, freccia giù)] (2 varianti).
- Il guadagno ha il segno e la freccia.
- Padding `margine/riga-v`, linea sotto, gap `spazio/colonne`.
- Colonne numeriche allineate a destra.
- Accanto c'è il riquadro "Esempi con testi veri", con istanze che hanno testi diversi per ogni variante.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Positivo o Negativo |
| Hover | Non previsto: la riga non ha azioni nei dati |
| Focus | Non previsto: la riga non ha azioni nei dati |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Negativo usa il colore di errore, con segno e freccia giù |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il guadagno ha il segno e la freccia nel testo.
- **Contrasti:** il guadagno non si capisce solo dal colore.

### Esempi
- ✅ Corretto: titolo con guadagno Positivo: testo in tono ok, segno e freccia in su.
- ❌ Scorretto: guadagno solo verde o rosso, senza freccia; colonne numeriche allineate a sinistra.

---

## CMP-39 – Scheda esposizione
**Tipo:** composto · **Usato in:** SC-11 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-39 · Scheda esposizione"

**Scopo:** mostrare come è distribuito il portafoglio per tipo, paese o settore.
**Quando usarlo:** per vedere la distribuzione del portafoglio per tipo, paese o settore.
**Quando non usarlo:** per un solo titolo: lì va la riga posizione (CMP-38).

### Varianti e dimensioni
- **Proprietà:** Titolo [testo].
- Contiene: titolo e voci (parte Voce della scheda esposizione), ognuna con barra e peso.
- Padding `margine/scheda`, gap `spazio/blocco` tra titolo e voci, `spazio/elenco` tra le voci.
- **Da decidere:** il riempimento delle barre non si può ancora cambiare istanza per istanza (vedi registro).

### Stati
| Stato | Descrizione |
|---|---|
| Default | Il titolo con le sue voci |
| Hover | Non previsto: la scheda non è interattiva |
| Focus | Non previsto: la scheda non riceve il focus |
| Attivo | Non previsto: la scheda non è interattiva |
| Disabilitato | Non previsto: la scheda non si disattiva |
| Errore | Non previsto: la scheda non dà errori |
| Caricamento | Non previsto: la scheda mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il peso è scritto accanto a ogni barra, così la barra non è l'unica informazione.
- **Contrasti:** il peso è testo.

### Esempi
- ✅ Corretto: "Per paese", con la voce "Italia" con barra e peso scritto.
- ❌ Scorretto: barre senza peso scritto.

---

## CMP-40 – Riga operazione
**Tipo:** composto · **Usato in:** SC-11 · **Figma:** libreria, pagina Componenti composti, sezione "CMP-40 · Riga operazione"

**Scopo:** mostrare un acquisto o una vendita nello storico delle operazioni.
**Quando usarlo:** nell'elenco delle operazioni (SC-11).
**Quando non usarlo:** per una posizione del portafoglio: lì va la riga posizione (CMP-38).

### Varianti e dimensioni
- **Proprietà:** Titolo, Dettaglio, Quote, Totale [testo]; Tipo [Acquisto (tessera accento, freccia in entrata), Vendita (tessera neutra, freccia in uscita)] (2 varianti).
- Contiene: tessera con freccia, titolo, data e conto, quote per prezzo, totale.
- Il tipo è scritto nel titolo, non solo nel colore.
- Padding `margine/riga-v`, linea sotto, gap `spazio/colonne`.
- Accanto c'è il riquadro "Esempi con testi veri", con istanze che hanno testi diversi per ogni variante.

### Stati
| Stato | Descrizione |
|---|---|
| Default | Acquisto o Vendita |
| Hover | Non previsto: la riga non ha azioni nei dati |
| Focus | Non previsto: la riga non ha azioni nei dati |
| Attivo | Non previsto: la riga non è interattiva |
| Disabilitato | Non previsto: la riga non si disattiva |
| Errore | Non previsto: la riga non dà errori |
| Caricamento | Non previsto: la riga mostra dati già pronti |

### Accessibilità
- **Tastiera:** non riceve il focus.
- **Lettori di schermo:** il tipo è nel titolo; la freccia è decorativa.
- **Contrasti:** Acquisto e Vendita si distinguono dal testo, non solo dalla tessera.

### Esempi
- ✅ Corretto: titolo che dice "Acquisto", con tessera accento e freccia in entrata.
- ❌ Scorretto: acquisto e vendita distinti solo dal colore della tessera.
