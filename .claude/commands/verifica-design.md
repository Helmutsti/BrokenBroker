---
description: Controlla che componenti e mockup usino solo istanze, token e stili di ruolo (guida design-figma §6.9)
---

Verifica dei disegni. Sola lettura: non modificare nulla, né in Figma né nel repository. Carica la skill figma-use prima di usare `use_figma`.

File da controllare (link e ID delle pagine in `AGENTS.md`, sezione Design):
- Libreria: pagine "Componenti base" e "Componenti composti": solo i nodi dentro i componenti (COMPONENT e varianti), saltando i nodi dentro un'istanza.
- Mockup, tutte le pagine: solo i frame il cui nome inizia con `SC-`.
- Mai la pagina Prove: lì le copie staccate sono volute.

Una chiamata `use_figma` per pagina, lanciate in parallelo; in ognuna `figma.skipInvisibleInstanceChildren = false`.

Controlli:
1. **Spazi:** `paddingLeft/Right/Top/Bottom` e `itemSpacing` diversi da 0 non legati a una variabile, o legati a un primitivo.
2. **Raggi e misure:** `cornerRadius`, larghezze e altezze fisse dei controlli non legati a una variabile, dove il progetto ha il token.
3. **Testi:** testi senza stile (`textStyleId` vuoto) o con uno stile che non è nella tabella "Tipografia" di `tokens.md`. Un testo con più stili è ammesso solo se ogni pezzo ha uno stile in tabella.
4. **Colori:** riempimenti e contorni SOLID visibili non legati a una variabile.
5. **Copie staccate (solo mockup):** frame con il nome di un componente della libreria che non sono istanze.

Risultato: una tabella per file, "Controllo | Problemi | Esempi" (al massimo 5 esempi, come `Componente / nodo.proprietà = valore`), poi il totale. Se è tutto a posto, una riga: "Nessun problema". Nessuna correzione e nessun commento: le correzioni si decidono dopo, con chi decide (vedi `AGENTS.md`).
