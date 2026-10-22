# Tokens

I componenti usano solo token semantici. I token vivono come variabili nella libreria Figma (collezioni **Primitivi**, nascosta alla pubblicazione; **Colore**, con i modi Chiaro e Scuro; **Dimensioni**). Nel codice il nome resta lo stesso: `spazio/blocco` → `var(--spazio-blocco)`, `colore/testo/secondario` → `var(--testo-secondario)`.

> **Stato:** approvati da Manuel e **creati nella libreria** il 2026-10-22: collezione *Primitivi* (65 valori, nascosta alla pubblicazione), *Colore* (35 token, modi Chiaro e Scuro, alias ai primitivi), *Dimensioni* (41 token, alias alla scala), stili di effetto `ombra/comparsa` e `ombra/finestra`. Ogni token ha l'ambito giusto (fondi, testi, contorni, gap, raggi, misure) e il nome per il codice (`var(--…)`). Foglio di riepilogo nella pagina **Token** della libreria (`immagini/token-colori-chiaro.png`, `token-colori-scuro.png`, `token-dimensioni.png`). Stili di testo creati il 2026-10-22 con IBM Plex Sans (vedi Tipografia).

## Primitivi
Non si usano direttamente nei componenti.

**Grigi**
| Token | Valore |
|---|---|
| grigio/0 | #FFFFFF |
| grigio/50 | #F5F5F5 |
| grigio/100 | #F0F0F0 |
| grigio/150 | #EBEBEB |
| grigio/200 | #D9D9D9 |
| grigio/400 | #8C8C8C |
| grigio/500 | #6B6B6B |
| grigio/600 | #525252 |
| grigio/900 | #1A1A1A |
| scuro/950 · 900 · 850 · 800 · 700 · 600 | #111315 · #16191D · #1B1F24 · #262B31 · #2E343B · #6E7781 |
| scuro/testo-300 · 400 · 100 | #B3B3B3 · #8F96A0 · #F2F2F2 |

**Colori**
| Famiglia | 50 (fondo tenue) | 300 | 500 | 700 (testo) | Scuro: fondo tenue · testo/riempimento |
|---|---|---|---|---|---|
| ardesia (accento) | #EEF2F6 | #8FB0CF | #3B5B7A | — | #22303D · #9DBAD6 / #8FB0CF |
| verde (ok) | #F0FDF4 | — | #16A34A | #15803D | #12291A · #4ADE80 / #22C55E |
| arancio (attenzione) | #FFF7ED | — | #EA580C | #C2410C | #2F1D10 · #FB923C / #F97316 |
| rosso (errore) | #FEF2F2 | #FCA5A5 | #DC2626 | #B91C1C | #2E1517 · #F87171 / #EF4444 |

**Dimensioni:** 0 · 2 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64.

## Semantici · colore
| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| sfondo/pagina | #FFFFFF | #111315 | fondo della pagina |
| sfondo/barra-laterale | #F5F5F5 | #16191D | colonna di navigazione, fondo dell'accesso |
| sfondo/scheda | #FFFFFF | #1B1F24 | schede e finestre |
| sfondo/tenue | #F0F0F0 | #262B31 | scelte a segmenti, riquadri, tessere neutre |
| sfondo/accento | #3B5B7A | #8FB0CF | pulsante primario, spunta fatta, interruttore acceso |
| sfondo/accento-tenue | #EEF2F6 | #22303D | voce del menu attiva, tessere, etichette |
| sfondo/ok-tenue · attenzione-tenue · errore-tenue | #F0FDF4 · #FFF7ED · #FEF2F2 | #12291A · #2F1D10 · #2E1517 | esiti, numeri con stato |
| sfondo/velo | #000000 al 40% | #000000 al 60% | sotto la finestra |
| testo/primario | #1A1A1A | #F2F2F2 | contenuto principale |
| testo/secondario | #525252 | #B3B3B3 | note, categorie, etichette dei campi |
| testo/terziario | #6B6B6B | #8F96A0 | segnaposto, informazioni accessorie |
| testo/su-accento | #FFFFFF | #0F1A24 | testo sui pulsanti primari |
| testo/accento | #3B5B7A | #9DBAD6 | voce attiva, collegamenti |
| testo/ok · attenzione · errore | #15803D · #C2410C · #B91C1C | #4ADE80 · #FB923C · #F87171 | stati |
| bordo/scheda | #D9D9D9 | #2E343B | contorno decorativo delle schede |
| bordo/controllo | #8C8C8C | #6E7781 | contorno di campi, tendine, pulsanti secondari (≥ 3:1) |
| bordo/separatore | #EBEBEB | #262B31 | linee tra le righe |
| bordo/errore | #DC2626 | #F87171 | campo con errore |
| bordo/focus | #3B5B7A | #9DBAD6 | anello di focus |
| icona/predefinita | #525252 | #B3B3B3 | icone del menu e delle righe |
| icona/tenue | #6B6B6B | #8F96A0 | icone accessorie, icone ereditate |
| icona/su-accento | #FFFFFF | #0F1A24 | icone sui pulsanti primari (aggiunto alla creazione) |
| icona/accento | #3B5B7A | #9DBAD6 | icona della voce attiva, tessere (aggiunto alla creazione) |
| icona/ok · attenzione · errore | #15803D · #C2410C · #B91C1C | #4ADE80 · #FB923C · #F87171 | icone di stato (aggiunti alla creazione) |
| avanzamento/traccia | #EBEBEB | #2E343B | fondo di barre e anelli |
| avanzamento/accento | #3B5B7A | #8FB0CF | avanzamento normale |
| avanzamento/ok · attenzione · errore | #15803D · #C2410C · #DC2626 | #22C55E · #F97316 · #EF4444 | avanzamento con stato |
| sfondo/accento-hover | #2F4A64 | #B4CBE0 | pulsante primario al passaggio del mouse (aggiunto costruendo CMP-03) |
| sfondo/hover | #F2F2F2 | #262B31 | pulsanti secondari, voci e righe al passaggio del mouse (aggiunto costruendo CMP-03) |
| sfondo/controllo-spento | #8C8C8C | #6E7781 | interruttore spento (≥ 3:1; aggiunto costruendo CMP-08) |
| sfondo/pomello | #FFFFFF | #F2F2F2 | pomello dell'interruttore (aggiunto costruendo CMP-08) |

Significato dei colori (proposta nel registro): **verde** a posto o raggiunto, **arancio** attenzione, **rosso** superato o negativo. Ogni stato ha sempre anche un testo, mai solo il colore.

## Spazi
Ogni spazio ha un ruolo e il ruolo ha un solo valore. Più il legame è stretto, meno spazio c'è (guida §6.4, `componenti.md`).

**Gap (legame tra pezzi vicini)**
| Token | Valore | Ruolo |
|---|---|---|
| spazio/testo | 4 | testo che si legge insieme: titolo e sottotitolo, etichetta e campo |
| spazio/elenco | 4 | voci impilate che si evidenziano (menu, righe selezionabili) |
| spazio/icona | 8 | icona e testo; pezzi che si leggono come uno |
| spazio/pillole | 8 | etichette e criteri affiancati |
| spazio/colonne | 12 | colonne di una riga, campi affiancati |
| spazio/blocco | 16 | blocchi dello stesso contenitore; schede affiancate |
| spazio/gruppo | 24 | sezioni e blocchi della pagina |

**Padding (ruolo del contenitore o anatomia dell'elemento)**
| Token | Valore | Ruolo |
|---|---|---|
| margine/pagina | 32 | area dei contenuti |
| margine/barra-laterale | 16 | colonna di navigazione |
| margine/scheda | 24 | schede |
| margine/finestra | 32 | finestre e accesso |
| margine/riquadro | 12 × 16 | riquadri tenui dentro una scheda |
| margine/controllo | 8 × 12 | campi, tendine (verticale × orizzontale). In Figma i padding a due valori sono due token: `-v` (sopra e sotto) e `-h` (ai lati) |
| margine/voce | 8 × 12 | voci del menu, righe selezionabili |
| margine/pulsante | 8 × 16 | pulsanti (pulsanti, campi, tendine e voci del menu sono tutti alti 37: una riga di testo + 8 sopra e sotto; il contorno sta dentro) |
| margine/etichetta | 4 × 8 | etichette e criteri |
| margine/riga | 12 × 0 | righe di elenco separate da una linea |

## Semantici · dimensioni e movimento
| Token | Valore | Uso |
|---|---|---|
| raggio/controllo | 8 | pulsanti, campi, voci, riquadri, tessere |
| raggio/scheda | 12 | schede |
| raggio/finestra | 16 | finestre |
| raggio/pillola | 999 | etichette, criteri, interruttore |
| misura/icona-piccola · media · grande | 16 · 20 · 24 | icone |
| misura/tessera-piccola · media · grande | 28 · 32 · 40 | tessere icona |
| misura/bersaglio | 24 (consigliato 44) | zona cliccabile minima (WCAG 2.2 SC 2.5.8) |
| misura/avanzamento | 8 | altezza delle barre |
| larghezza/barra-laterale | 256 | barra laterale (oggi 248, proposta di portarla sulla scala) |
| larghezza/finestra | 600 | finestra al centro |
| larghezza/accesso | 448 | scheda di accesso (oggi 440) |
| durata/rapida · normale | 120 ms · 200 ms | evidenziazioni, aperture; spente con "riduci movimento" |

**Aggiunti costruendo i componenti**
| Token | Valore | Uso |
|---|---|---|
| margine/gruppo-controlli | 4 | padding della scelta a segmenti attorno alle opzioni |
| raggio/controllo-interno | 4 | opzioni dentro la scelta a segmenti, angoli delle barre del grafico |
| misura/bordo · bordo-forte | 1 · 2 | spessore di contorni e linee; linee dei grafici e anello di focus |
| misura/interruttore-larghezza · altezza | 36 · 20 | interruttore |
| misura/pomello · pomello-margine | 16 · 2 | pomello dell'interruttore e spazio attorno |
| misura/spunta | 20 | quadrato della spunta (la zona cliccabile resta `misura/bersaglio`) |
| misura/avatar-piccolo · grande | 32 · 48 | avatar |
| misura/rientro-albero · rientro-albero-doppio | 32 · 64 | rientro delle categorie di secondo e terzo livello |
| opacita/disattivato | 45 % | componenti disattivati |

## Tipografia
Stili di testo per ruolo. Nessun testo senza stile. Scala: 12 · 14 · 16 · 20 · 24 · 30 (oggi nelle bozze ci sono 12 grandezze).

**Carattere: IBM Plex Sans** (scelta di Manuel, 2026-10-22, tra sei alternative nella pagina Prove, `immagini/prova-caratteri.png`). Token `carattere/famiglia` → `var(--carattere-famiglia)`, collegato a tutti gli stili. **Stili creati nella libreria**, campionario nella pagina Token (`immagini/stili-di-testo.png`).

Nel codice ogni stile è una classe che usa il token del carattere: `Titolo/Pagina` → `.stile-titolo-pagina { font-family: var(--carattere-famiglia); font-size: 30px; font-weight: 700; line-height: 1.2 }`. Il prefisso `stile-` evita la confusione con i colori dei testi (`--testo-primario`).

| Stile | Carattere · grandezza · peso · interlinea | Uso |
|---|---|---|
| Titolo/Pagina | IBM Plex Sans · 30 · Bold · 120% | titolo della schermata |
| Numero/Grande | IBM Plex Sans · 24 · Bold · 120% | numeri chiave, saldi, totali |
| Logo | IBM Plex Sans · 20 · Bold · 120% | nome dell'app |
| Titolo/Scheda | IBM Plex Sans · 16 · SemiBold · 140% | titoli delle schede e delle finestre |
| Corpo/Normale | IBM Plex Sans · 14 · Regular · 150% | testo, valori dei campi, voci del menu |
| Corpo/Forte | IBM Plex Sans · 14 · SemiBold · 150% | nomi delle voci, pulsanti, importi |
| Dettaglio/Normale | IBM Plex Sans · 12 · Regular · 140% | note, categoria sotto il nome, aiuti |
| Dettaglio/Forte | IBM Plex Sans · 12 · Medium · 140% | etichette dei campi e dei numeri, etichette a pillola (aggiunto alla creazione) |
| Etichetta/Gruppo | IBM Plex Sans · 12 · SemiBold · 140% · maiuscolo · spaziatura +4% | intestazioni dei gruppi e delle tabelle |

## Ombre ed elevazione
| Token | Valore | Uso |
|---|---|---|
| ombra/nessuna | — | schede: hanno il contorno, non l'ombra |
| ombra/comparsa | 0 8 24 · nero 6% | menu a tendina, scheda di accesso |
| ombra/finestra | 0 12 40 · nero 18% | finestra al centro |

## Scala z-index
| Livello | Token | Uso |
|---|---|---|
| 0 | livello/contenuto | contenuto base |
| 10 | livello/fisso | barra laterale |
| 100 | livello/comparsa | tendine, suggerimenti |
| 200 | livello/velo | velo |
| 210 | livello/finestra | finestra al centro |
| 300 | livello/avviso | messaggi temporanei |

## Fondi dei controlli sulle superfici
Un fondo di controllo non è mai uguale a una superficie su cui può comparire, in nessun tema.
- `sfondo/tenue` (segmenti, riquadri) compare su `sfondo/scheda` e `sfondo/pagina`, mai su `sfondo/barra-laterale` (sarebbe quasi uguale).
- L'opzione scelta di una scelta a segmenti ha `sfondo/scheda` **e** `bordo/controllo`, così non dipende solo dal fondo.

## Verifica contrasti
Almeno WCAG AA: 4,5:1 per il testo, 3:1 per icone e contorni. Calcolati il 2026-10-22.

| Coppia | Chiaro | Scuro |
|---|---|---|
| testo/primario su sfondo/pagina | 17,40:1 ✓ | 16,63:1 ✓ |
| testo/secondario su sfondo/scheda | 7,81:1 ✓ | 7,90:1 ✓ |
| testo/terziario su sfondo/scheda | 5,33:1 ✓ | 5,55:1 ✓ |
| testo/terziario su sfondo/tenue | 4,68:1 ✓ | 4,78:1 ✓ |
| testo/secondario su sfondo/barra-laterale | 7,17:1 ✓ | 8,41:1 ✓ |
| testo/accento su sfondo/accento-tenue | 6,30:1 ✓ | 6,69:1 ✓ |
| testo/su-accento su sfondo/accento | 7,09:1 ✓ | 7,77:1 ✓ |
| testo/ok su sfondo/ok-tenue | 4,79:1 ✓ | 8,88:1 ✓ |
| testo/attenzione su sfondo/attenzione-tenue | 4,88:1 ✓ | 7,12:1 ✓ |
| testo/errore su sfondo/errore-tenue | 5,91:1 ✓ | 6,14:1 ✓ |
| bordo/controllo su sfondo/scheda | 3,36:1 ✓ | 3,64:1 ✓ |
| icona/predefinita su sfondo/barra-laterale | 7,17:1 ✓ | 8,41:1 ✓ |
| avanzamento/accento su traccia | 5,94:1 ✓ | 5,55:1 ✓ |
| avanzamento/errore su traccia | 4,05:1 ✓ | 3,34:1 ✓ |
| avanzamento/ok su traccia | con #16A34A 2,76:1 ✗ → **#15803D ≈ 4,3:1 ✓** | 5,52:1 ✓ |
| avanzamento/attenzione su traccia | con #EA580C 2,99:1 ✗ → **#C2410C ≈ 4,2:1 ✓** | 4,48:1 ✓ |
