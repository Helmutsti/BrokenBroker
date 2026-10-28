// Forme delle risposte dell'API (importi come testo decimale, date AAAA-MM-GG).

export type Profilo = { id: string; email: string; nome: string; stipendio_netto: string | null; giorno_paga: number | null; inizio_mese: number; creato_il: string;
  sul_conto: string | null; sul_conto_al: string | null }; // il saldo in alto, scritto a mano (decisione 59)

// Un conto è solo un'etichetta (decisione 59): nome e icona, per dire dove sta una spesa, una rata, un salvadanaio o un movimento.
export type Conto = { id: string; nome: string; icona: string; archiviato: boolean };
// Un movimento (decisione 59): un'entrata o un'uscita scritta a mano (o registrata da un budget), `importo` positivo. Il conto è solo
// un'etichetta; `modificabile` = scritto da chi guarda; la categoria c'è solo per le uscite.
export type TipoMovimento = 'entrata' | 'uscita';
export type Movimento = { id: string; tipo: TipoMovimento; importo: string; momento: string; data: string; descrizione: string;
  conto_id: string | null; conto: string | null; conto_icona: string | null; categoria_id: string | null; categoria: string | null; budget_id: string | null;
  utente: string | null; modificabile: boolean };
export type ElencoMovimenti = { movimenti: Movimento[]; mesi: string[]; mese_in_corso: string };

export type Categoria = { id: string; proprietario_id: string; padre_id: string | null; nome: string; tipo: 'uscita' | 'entrata'; colore: string | null; icona: string | null; ordine: number; figli?: Categoria[];
  budget?: { id: string; importo: string; attivo: boolean } | null }; // il budget della categoria, se c'è (decisioni 49 e 51)

// Voci collegate (decisioni 37 e 50): il promemoria di un salvadanaio e la spesa creata al raggiungimento si cambiano dal salvadanaio; `campi` sono quelli bloccati.
export type Blocco = { tipo: 'salvadanaio'; id: string; nome: string; campi: string[] };
export type TipoSpesa = 'fissa' | 'investimento';
export type Spesa = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean; giorno_mese: number | null; conto_id: string | null; conto: string | null;
  categoria_id: string | null; categoria: string | null; categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: TipoSpesa; attiva: boolean; note: string | null; mia: boolean; condivisa: boolean;
  nuova: boolean; creata_da: string | null; // ricevuta e non ancora aperta né categorizzata (decisione 43); chi l'ha creata
  alimenta_obiettivo_id: string | null; // promemoria di questo salvadanaio: la spunta è solo un segno (decisione 59)
  bloccato_da: Blocco | null; // nasce da un salvadanaio: promemoria o spesa creata al raggiungimento
  scadenza: string | null; nel_mese: boolean; uscita: boolean;
  mia_percentuale: number; mia_quota: string; quote?: { utente_id: string; nome: string; percentuale: string }[];
};
export type Periodo = { mese: string; dal: string; al: string };
export type ElencoSpese = { periodo: Periodo; spese: Spesa[] };
export type UscitaBudget = { id: string; budget_id: string | null; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };
// Un budget (decisioni 49, 57 e 59): uno per categoria. Una cifra da tenere sotto controllo: lo speso (le uscite scritte in Movimenti con la sua
// categoria, o registrate dal budget, nel mese) si conta sempre, anche oltre la cifra (`sforo`). Con i movimenti è uno strumento a parte.
export type Budget = {
  id: string; categoria_id: string; categoria: string; categoria_padre: string | null; nome: string; icona: string | null; colore: string | null;
  importo: string; attivo: boolean; note: string | null;
  mia: boolean; condiviso: boolean; creato_da: string | null; mia_percentuale: number; mia_quota: string;
  speso: string; speso_per_conto: Record<string, string>; sforo: string;
  uscite: UscitaBudget[];
};
export type ElencoBudget = { periodo: Periodo; budget: Budget[] };

export type Traguardo = { id: string; nome: string; importo: string; ordine: number; percentuale: number };
export type Obiettivo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null; crea_spesa: boolean; spesa_creata_id: string | null; icona: string | null; nascosto: boolean;
  // Conto del salvadanaio: quello scelto (conto_proprio_id) o, se manca, quello del padre (conto_ereditato).
  conto_proprio_id: string | null; conto_id: string | null; conto: string | null; conto_icona: string | null; conto_ereditato: boolean;
  mio: boolean; condiviso: boolean; versato: string; saldo: string; traguardo_effettivo: string | null; percentuale: number | null;
  traguardi: Traguardo[]; figli: Obiettivo[];
  // Il promemoria «Mostra nelle spese»: `importo` è la quota di questo mese, `importo_fisso` la cifra scritta (usata senza scadenza o traguardo).
  alimentato_da: { id: string; importo: string; importo_fisso: string; automatica: boolean; ogni_mesi: number | null; conto_id: string | null } | null;
  // Se è uno spostamento tra i liberi del superiore e un sotto-salvadanaio (decisione 46): l'altro salvadanaio e se è il superiore di questo.
  versamenti?: { id: string; data: string; importo: string; utente: string; spostamento_con?: string | null; spostamento_con_padre?: boolean }[];
};

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string; numero_rate: number; prima_scadenza: string;
  conto_id: string | null; categoria_id: string | null; chiusa: boolean; ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
  scadenza?: string | null; pagata?: boolean; // con ?mese=
};


export type RiepilogoMese = {
  periodo: Periodo; stipendio: string;
  voci: { fisse: string; periodiche_mensilizzate: string; investimenti: string; rate: string };
  resta: string; risparmio: string; risparmio_percentuale: number | null; semaforo: 'ok' | 'attenzione' | 'errore' | null;
  da_pagare: { numero: number; totale: string }; rate_del_mese: number;
};
export type Patrimonio = { investimenti: string; debito_rate: string; totale: string; investimenti_senza_prezzo?: number; investimenti_incompleti?: boolean };
export type Proiezione = { partenza: string; punti: { mesi: number; mese: string; risparmio_mese: string; patrimonio: string }[] };
export type ControlloRate = { rate_attive: number; rata_mensile: string; debito: string };


export type Titolo = { id: string; isin: string | null; ticker: string | null; nome: string; tipo: string; simbolo: string | null; borsa: string | null; valuta?: string | null };
export type StatoPrezzo = 'ok' | 'vecchio' | 'mancante';
// Una posizione: un titolo in un portafoglio (una sola riga: quantità totale, PCM = prezzo medio di carico).
export type Posizione = Titolo & {
  titolo_id: string; portafoglio_id: string; portafoglio: string | null; quantita: string; prezzo_medio: string; costo: string;
  prezzo: string | null; prezzo_al: string | null; prezzo_fonte: 'yahoo' | 'mano' | null; prezzo_aggiornato_il: string | null;
  stato: StatoPrezzo; valore: string | null; guadagno: string | null; guadagno_percentuale: number | null; peso: number | null;
};
export type PrezzoLetto = { prezzo: string; prezzo_valuta: string | null; valuta: string; data: string; fonte: string | null; aggiornato_il: string | null; stato: StatoPrezzo };
export type TipoBene = 'fondo_pensione' | 'crowdfunding' | 'societa' | 'immobile' | 'altro' | 'metallo';
export type Bene = {
  id: string; portafoglio_id: string; portafoglio: string | null; nome: string; tipo: TipoBene; costo: string; valore: string | null; valore_al: string | null; valore_automatico: boolean;
  stato: StatoPrezzo; data_acquisto: string | null; dove: string | null; catalogo: { codice: string; nome: string; metallo: string; unita: 'grammi' | 'pezzi' } | null;
  quantita: string | null; purezza: string | null; grammi_fini: string | null; euro_grammo: string | null;
  guadagno: string | null; guadagno_percentuale: number | null; peso?: number | null;
};
type Avvisi = { titoli_senza_prezzo: number; titoli_prezzo_vecchio: number; beni_senza_prezzo: number; beni_prezzo_vecchio: number; incompleto: boolean };
export type Portafoglio = Avvisi & {
  id: string; nome: string; icona: string; conta_nel_patrimonio: boolean; creato_il: string;
  valore: string; costo: string; guadagno: string; guadagno_percentuale: number | null; posizioni: number; beni: number; vuoto: boolean;
};
export type PortafoglioDettaglio = Omit<Portafoglio, 'posizioni' | 'beni'> & { posizioni: Posizione[]; beni: Bene[] };
export type PortafoglioGenerale = Avvisi & {
  valore: string; valore_titoli: string; valore_beni: string; costo: string; messo_dentro: string; guadagno: string; guadagno_percentuale: number | null;
  posizioni: Posizione[]; beni: Bene[];
};
export type PuntoAndamento = { al: string; mese: string; valore: string; messo_dentro: string };
export type Esposizione = Record<'classe' | 'area' | 'settore', { voce: string; peso: number }[]>;
// La riga di una posizione (tabella `lotti`, nome storico): prezzo = PCM, data e ora = ultimo acquisto.
export type Lotto = { id: string; titolo_id: string; titolo: string; isin: string | null; ticker: string | null; portafoglio_id: string; portafoglio: string; quantita: string; prezzo: string; controvalore: string; acquistato_il: string; data: string; ora: string };
export type VoceCatalogo = {
  codice: string; nome: string; metallo: string; metallo_nome: string; unita: 'grammi' | 'pezzi'; grammi_fini: string | null; purezza_predefinita: string | null;
  euro_grammo: string | null; quotazione_al: string | null; stato: StatoPrezzo; valore_unitario: string | null;
};

export type Persona = { id: string; nome: string; email: string; io: boolean };
export type Condivisione = { id: string; mia: boolean; voce: 'spesa' | 'obiettivo' | 'budget'; voce_id: string; nome: string | null; proprietario: string; condiviso_con: string; condiviso_con_id: string; proprietario_id: string };
export type PersonaSistema = { id: string; nome: string };
