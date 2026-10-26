// Forme delle risposte dell'API (importi come testo decimale, date AAAA-MM-GG).

export type Profilo = { id: string; email: string; nome: string; stipendio_netto: string | null; giorno_paga: number | null; inizio_mese: number; creato_il: string;
  sul_conto: string | null; sul_conto_al: string | null };

// I conti sono un elenco di nomi con un'icona; il saldo («Sul conto oggi», scritto a mano) è quello di chi guarda.
export type Conto = { id: string; nome: string; icona: string; archiviato: boolean; mio: boolean; condiviso: boolean; saldo: string | null; saldo_al: string | null };

export type Categoria = { id: string; proprietario_id: string; padre_id: string | null; nome: string; tipo: 'uscita' | 'entrata'; colore: string | null; icona: string | null; ordine: number; figli?: Categoria[] };

// Voci collegate (decisione 37): ciò che nasce dall'altro si cambia solo dall'origine; `campi` sono quelli bloccati.
export type Blocco = { tipo: 'spesa' | 'salvadanaio'; id: string; nome: string; campi: string[] };
export type TipoSpesa = 'fissa' | 'budget' | 'investimento';
export type Spesa = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean; conto_id: string | null; conto: string | null;
  categoria_id: string | null; categoria: string | null; categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: TipoSpesa; attiva: boolean; note: string | null; obiettivo_id: string | null; mia: boolean; condivisa: boolean;
  alimenta_obiettivo_id: string | null; // "mettici da parte": spuntata, versa in questo salvadanaio
  bloccato_da: Blocco | null; // nasce da un salvadanaio: promemoria o spesa creata al raggiungimento
  scadenza: string | null; nel_mese: boolean; uscita: boolean;
  mia_percentuale: number; mia_quota: string; quota_mensile: string; quote?: { utente_id: string; nome: string; percentuale: string }[];
};
export type Periodo = { mese: string; dal: string; al: string };
export type ElencoSpese = { periodo: Periodo; spese: Spesa[] };

export type Traguardo = { id: string; nome: string; importo: string; ordine: number; percentuale: number };
export type Obiettivo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null; crea_spesa: boolean; spesa_creata_id: string | null; icona: string | null; nascosto: boolean;
  bloccato_da: Blocco | null; // nasce da una spesa
  mio: boolean; condiviso: boolean; versato: string; saldo: string; traguardo_effettivo: string | null; percentuale: number | null;
  traguardi: Traguardo[]; figli: Obiettivo[];
  paga_spesa: { id: string; nome: string; ogni_mesi: number; importo: string; prossima: string; senza_giorno: boolean } | null;
  alimentato_da: { id: string; importo: string; ogni_mesi: number | null; conto_id: string | null } | null;
  versamenti?: { id: string; data: string; importo: string; utente: string }[];
};

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string; numero_rate: number; prima_scadenza: string;
  conto_id: string | null; categoria_id: string | null; chiusa: boolean; ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
  scadenza?: string | null; pagata?: boolean; // con ?mese=
};


export type RiepilogoMese = {
  periodo: Periodo; stipendio: string;
  voci: { fisse: string; periodiche_mensilizzate: string; budget: string; investimenti: string; rate: string };
  resta: string; risparmio: string; risparmio_percentuale: number | null; semaforo: 'ok' | 'attenzione' | 'errore' | null;
  da_pagare: { numero: number; totale: string }; budget_residuo: string; rate_del_mese: number;
};
export type Patrimonio = { investimenti: string; debito_rate: string; totale: string };
export type Proiezione = { partenza: string; punti: { mesi: number; mese: string; risparmio_mese: string; patrimonio: string }[] };
export type ControlloRate = { rate_attive: number; rata_mensile: string; debito: string };


export type Titolo = { id: string; isin: string | null; ticker: string | null; nome: string; tipo: string; simbolo: string | null; borsa: string | null };
export type Posizione = Titolo & { conto_id: string | null; conto: string | null; quote: string; prezzo_medio: string | null; prezzo: string | null; prezzo_del: string | null; costo: string; valore: string; guadagno: string; guadagno_percentuale: number | null; peso: number };
export type TipoBene = 'fondo_pensione' | 'crowdfunding' | 'societa' | 'immobile' | 'oro' | 'altro';
export type Bene = {
  id: string; nome: string; tipo: TipoBene; costo: string; valore: string; valore_al: string; data_acquisto: string | null; conto_id: string | null; conto: string | null;
  forma: 'lingotto' | 'moneta' | null; purezza: string | null; peso_grammi: string | null; dove: string | null;
  guadagno: string; guadagno_percentuale: number | null; peso: number; valore_automatico: boolean;
};
export type QuotazioneOro = { euro_grammo: number; data: string; fonte: string };
export type Portafoglio = { valore: string; valore_titoli: string; costo: string; messo_dentro: string; guadagno: string; guadagno_percentuale: number | null; posizioni: Posizione[]; beni: Bene[] };
export type PuntoAndamento = { al: string; mese: string; valore: string; messo_dentro: string };
export type Esposizione = Record<'classe' | 'area' | 'settore', { voce: string; peso: number }[]>;
export type Operazione = { id: string; titolo_id: string; titolo: string; isin: string; ticker: string | null; conto_id: string | null; data: string; verso: 'acquisto' | 'vendita'; quantita: string; prezzo: string; commissioni: string; controvalore: string };

export type Persona = { id: string; nome: string; email: string; io: boolean };
export type Condivisione = { id: string; mia: boolean; voce: 'conto' | 'spesa' | 'obiettivo'; voce_id: string; nome: string | null; proprietario: string; condiviso_con: string; condiviso_con_id: string; proprietario_id: string };
export type PersonaSistema = { id: string; nome: string };
