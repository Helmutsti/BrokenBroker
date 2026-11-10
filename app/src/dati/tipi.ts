// Forme delle risposte dell'API (importi come testo decimale, date AAAA-MM-GG).

export type Profilo = { id: string; email: string; nome: string; stipendio_netto: string | null; giorno_paga: number | null; inizio_mese: number; creato_il: string };

// Il saldo unico (decisione 72): una sola cifra scritta a mano. `effettivo` è quella cifra meno le uscite delle spunte fatte dopo averla scritta.
export type Saldo = { sul_conto: string | null; scritto_il: string | null; uscite_spuntate: string; effettivo: string | null };

// Un conto (decisione 72): solo un'etichetta, con nome e icona. Si può archiviare.
export type Conto = { id: string; nome: string; icona: string; archiviato: boolean };
export type Categoria = { id: string; proprietario_id: string; padre_id: string | null; nome: string; tipo: 'uscita' | 'entrata'; colore: string | null; icona: string | null; ordine: number; figli?: Categoria[];
  n_uscite?: number }; // quante uscite (transazioni) hanno questa categoria

// Un gruppo: cartella per raccogliere le spese, solo etichetta con nome e icona.
export type Gruppo = { id: string; nome: string; icona: string };

export type TipoSpesa = 'fissa' | 'investimento';
export type Spesa = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean; giorno_mese: number | null; conto_id: string | null; conto: string | null; gruppo_id: string | null; gruppo: string | null; gruppo_icona: string | null;
  categoria_id: string | null; categoria: string | null; categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: TipoSpesa; attiva: boolean; note: string | null; mia: boolean; condivisa: boolean;
  nuova: boolean; creata_da: string | null; // ricevuta e non ancora aperta né categorizzata (decisione 43); chi l'ha creata
  scadenza: string | null; nel_mese: boolean; uscita: boolean;
  scadenza_in_corso: string | null; // annuali e una tantum: mese (AAAA-MM) della scadenza in corso; `uscita` dice se è già pagata, anche in anticipo
  mia_percentuale: number; mia_quota: string; al_mese: string; all_anno: string; // la tua quota al mese e all'anno
  // La cesta delle non mensili (decisione 73): quanto hai raccolto (solo un numero, anche sotto zero).
  raccolto: string;
  quota_spuntata: boolean; pagata_il: string | null; // non mensili: la quota del mese è spuntata; giorno in cui è stata segnata pagata la scadenza in corso
  quote?: { utente_id: string; nome: string; percentuale: string }[];
};
export type Periodo = { mese: string; dal: string; al: string };
export type ElencoSpese = { periodo: Periodo; spese: Spesa[] };

export type Traguardo = { id: string; nome: string; importo: string; ordine: number; percentuale: number };
// Un salvadanaio (decisione 72): libero, annidabile (`padre_id`). `dentro` comprende i sotto-salvadanai, `versato` è la parte propria. È un obiettivo, senza legami con le spese.
export type Salvadanaio = {
  id: string; padre_id: string | null; nome: string; icona: string; versato: string; dentro: string;
  traguardo: string | null; traguardo_scritto: string | null; scadenza: string | null; percentuale: number | null;
  mancano: string | null; mesi: number | null; metti_al_mese: string | null;
  traguardi: Traguardo[]; figli: Salvadanaio[];
};

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string; numero_rate: number; prima_scadenza: string;
  conto_id: string | null; conto: string | null; chiusa: boolean; ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
  al_mese: string; all_anno: string;
  scadenza?: string | null; numero?: number | null; pagata?: boolean; contate?: number; contate_pagate?: number; // con ?mese=
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
  // Decisione 68: `prezzo_medio` e `prezzo` sono allineati alla banca se `allineata`; `pcm_borsa` e `prezzo_borsa` sono quelli di Yahoo.
  pcm_borsa: string; prezzo_borsa: string | null; allineata: boolean;
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
export type Condivisione = { id: string; mia: boolean; voce: 'spesa'; voce_id: string; nome: string | null; proprietario: string; condiviso_con: string; condiviso_con_id: string; proprietario_id: string };
export type PersonaSistema = { id: string; nome: string };
