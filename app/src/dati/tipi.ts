// Forme delle risposte dell'API (importi come testo decimale, date AAAA-MM-GG).

export type Profilo = { id: string; email: string; nome: string; stipendio_netto: string | null; giorno_paga: number | null; inizio_mese: number; creato_il: string;
  sul_conto: string | null; sul_conto_al: string | null };

// Un conto ha UN saldo, uguale per chi lo vede (decisione 47): `saldo` è l'attuale (saldo di partenza scritto a mano + movimenti dopo),
// null se non è stato scritto un saldo di partenza; `saldo_aggiornato_il` è l'ultima volta che è cambiato (data e ora).
export type Conto = { id: string; nome: string; icona: string; archiviato: boolean; mio: boolean; condiviso: boolean;
  saldo_partenza: string | null; saldo_partenza_il: string | null; saldo: string | null; saldo_aggiornato_il: string | null;
  // Decisione 52: `nei_salvadanai` = i soldi dei salvadanai che stanno su questo conto (solo quelli che vedi), `liberi` = saldo - nei_salvadanai (null senza saldo, può essere negativo).
  nei_salvadanai: string; liberi: string | null };
export type CausaMovimento = 'spesa' | 'rata' | 'versamento' | 'giroconto' | 'budget' | 'a_mano';
// Un movimento ha una sorgente e una destinazione (decisione 51): `da` e `a` sono i nomi dei conti; «Niente» (il conto nascosto che raccoglie le
// uscite e da cui arrivano le entrate) non ha nome, lo dicono `da_niente` / `a_niente`. In Conti `importo` ha il segno visto da quel conto.
export type MovimentoConto = { id: string; importo: string; momento: string; data: string; causa: CausaMovimento; descrizione: string; utente: string | null; conta: boolean;
  da: string | null; a: string | null; da_niente: boolean; a_niente: boolean };
// La pagina Movimenti: `importo` è positivo, `segno` dice se per il filtro scelto entra (+1), esce (-1) o resta tra i tuoi conti (0, un giroconto).
// `da_senza_conto` = uscita di budget senza conto; un conto che non vedi (giroconto di un'altra persona) ha id e nome vuoti.
export type MovimentoElenco = MovimentoConto & { da_senza_conto: boolean; da_conto_id: string | null; a_conto_id: string | null; da_icona: string | null; a_icona: string | null; segno: -1 | 0 | 1; budget_id: string | null;
  // Decisione 53: scritto a mano da chi guarda e non in un mese passato = si cambia e si toglie; categoria delle uscite a mano.
  modificabile: boolean; categoria_id: string | null; categoria: string | null };
export type ElencoMovimenti = { movimenti: MovimentoElenco[]; mesi: string[]; mese_in_corso: string };

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
  alimenta_obiettivo_id: string | null; // promemoria di questo salvadanaio: la spunta fa il versamento della quota del mese (decisione 51)
  bloccato_da: Blocco | null; // nasce da un salvadanaio: promemoria o spesa creata al raggiungimento
  scadenza: string | null; nel_mese: boolean; uscita: boolean;
  mia_percentuale: number; mia_quota: string; quote?: { utente_id: string; nome: string; percentuale: string }[];
};
export type Periodo = { mese: string; dal: string; al: string };
export type ElencoSpese = { periodo: Periodo; spese: Spesa[] };
export type UscitaBudget = { id: string; budget_id: string | null; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };
export type SpesaContata = { id: string; nome: string; importo: string; conto_id: string | null; conto: string | null };
// Un budget (decisioni 49, 51 e 57): uno per categoria, senza modi. Una cifra da tenere sotto controllo: lo speso (uscite della categoria da tutti i conti
// più le spese spuntate) si conta sempre, anche oltre la cifra (`sforo`). Nessun promemoria né conti: è una lente sui movimenti della categoria.
export type Budget = {
  id: string; categoria_id: string; categoria: string; categoria_padre: string | null; nome: string; icona: string | null; colore: string | null;
  importo: string; attivo: boolean; note: string | null;
  mia: boolean; condiviso: boolean; creato_da: string | null; mia_percentuale: number; mia_quota: string;
  speso: string; speso_per_conto: Record<string, string>; speso_da_spese: string; sforo: string;
  uscite: UscitaBudget[]; spese_contate: SpesaContata[];
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
  // Giroconti del mese per conto con un saldo (decisione 57): quanto è uscito verso un altro conto e quanto è entrato da un altro conto.
  giroconti_per_conto: Record<string, { usciti: string; entrati: string }>;
  // Uscite scritte a mano del mese per conto di partenza ('senza' = senza conto), decisione 58: quanto è uscito oltre alle spunte.
  uscite_a_mano_per_conto: Record<string, { totale: string; quante: number }>;
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
export type Condivisione = { id: string; mia: boolean; voce: 'conto' | 'spesa' | 'obiettivo' | 'budget'; voce_id: string; nome: string | null; proprietario: string; condiviso_con: string; condiviso_con_id: string; proprietario_id: string };
export type PersonaSistema = { id: string; nome: string };
