# AGENTS.md – BrokenBroker

Istruzioni per gli agenti IA che lavorano su questo progetto.

## Il progetto
App di finanza personale (iPhone + pagina web) per capire il proprio tenore di vita: quanto si risparmia davvero, se una spesa è sostenibile, come vanno rate, obiettivi e investimenti. Per due persone che vivono insieme, ognuna con i propri dati privati e alcune voci condivise. Scopo, tappe e decisioni: `DECISIONI.md`.

## Design

Il lavoro grafico segue la skill **design-figma** (il metodo è nel file `guida.md` della skill). Questa sezione contiene solo i dati di questo progetto. Dove una regola qui sotto è diversa dalla guida, vale questa.

### File Figma
| File | Link | Note |
|---|---|---|
| Libreria (design system) | https://www.figma.com/design/FYIisMC6CZ2HNCKfyGxA2q | Pagine: Moodboard, Direzioni, Token, Componenti base, Componenti composti, Prove |
| Mockup (file di lavoro) | https://www.figma.com/design/nl92JsXsGc6X41Fy3ircSn | Usa la libreria pubblicata. Frame delle schermate con il codice `SC-`. Pagine: Wireframe computer, Wireframe telefono (le pagine dei mockup si aggiungono al passo 6) |

ID delle pagine (per i controlli automatici):
| Pagina | File | ID |
|---|---|---|
| Moodboard | Libreria | 0:1 |
| Direzioni | Libreria | 1:2 |
| Token | Libreria | 1:3 |
| Componenti base | Libreria | 1:4 |
| Componenti composti | Libreria | 1:5 |
| Prove | Libreria | 1:6 – esclusa dai controlli |
| Wireframe computer | Mockup | 0:1 |
| Wireframe telefono | Mockup | 2:2 |

### Documenti del design
Cartella: `docs/design/` (flussi, moodboard, tokens, componenti, schermate, registro, immagini).

### Codici
`SC-` schermate · `CMP-` componenti

### Verifica
Comando: `/verifica-design` (`.claude/commands/verifica-design.md`). Da lanciare dopo ogni giro di modifiche e prima di chiudere una fase di disegno.

### Come si lavora
- **Livello di controllo di base:** passo per passo (per la costruzione dei componenti: a tappe, decisione di Manuel del 2026-10-22)
- **Chi decide:** Manuel
- **Lingua dei nomi** in Figma e nel codice: italiano
- **Nomi dei token nel codice:** il nome Figma senza la collezione, con `-` al posto di `/`: `sfondo/pagina` → `var(--sfondo-pagina)`, `spazio/blocco` → `var(--spazio-blocco)`, `margine/pulsante-h` → `var(--margine-pulsante-h)`. Già scritto come "code syntax" su ogni variabile.
- **Stili di testo nel codice:** classi `.stile-<nome>` (es. `Titolo/Pagina` → `.stile-titolo-pagina`), con `font-family: var(--carattere-famiglia)` (IBM Plex Sans).
- **Disposizione:** in Figma auto-layout, nel codice `div` in `display:flex` con padding e `gap` sul contenitore e nessun `margin` sui figli (regola di Manuel, `docs/design/componenti.md`).
- **Superfici:** computer (pagina web, barra laterale a sinistra) e telefono (app iPhone).

### Eccezioni del progetto
[Nessuna per ora.]

## Codice
- **API:** Node 24 + TypeScript (eseguito senza compilazione) + Express 5, cartella `api/`. Dipendenze ridotte al minimo: solo `express` e `pg`.
- **Database:** Postgres 17, SQL scritto a mano. Struttura e regole di visibilità (Row Level Security) in `api/db/migrazioni/` (file numerati, applicati da `api/scripts/migra.ts`).
- **Avvio:** `docker compose up -d --build` dalla cartella del progetto. Istruzioni complete, backup e spostamento su altra macchina: `INSTALLAZIONE.md`.
- **Controllo dei tipi:** `npm run check` nella cartella `api/`.
- **Convenzioni:** nomi in italiano; importi come testo decimale (uscite negative); date `AAAA-MM-GG`; ogni richiesta autenticata gira in una transazione con `app.utente_id` impostato (`conUtente` in `api/src/db.ts`).
- **Prove dell'API:** `node api/prove/prove-funzioni.mjs` con l'API avviata (dati di prova: `api/prove/dati-esempio.mjs`).
- **App iPhone + web:** cartella `app/`. React Native puro; web con react-native-web impacchettato da Vite (`npm run web`, porta 5173, `/api` va all'API), navigazione con React Navigation (navigatore con barra laterale in `src/App.tsx`), dati con `fetch` (`src/dati/api.ts`, ricarica automatica dopo ogni modifica). Token in `src/tema/token.ts` copiati dalla libreria Figma; componenti in `src/componenti/` con gli stessi nomi e misure della libreria (CMP-xx); schermate in `src/schermate/`. File `.web.ts` per ciò che cambia tra web e iPhone (sessione, indirizzo API). Controllo dei tipi: `npm run check` in `app/`.
- **Attenzione su Windows:** non modificare file con `Get-Content`/`Set-Content` di PowerShell 5.1: leggono in ANSI e rovinano le lettere accentate. Usare lo strumento di modifica.
