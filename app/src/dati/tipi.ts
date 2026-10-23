// Forme delle risposte dell'API (importi come testo decimale, date AAAA-MM-GG).

export type Profilo = { id: string; email: string; nome: string; stipendio_netto: string | null; giorno_paga: number | null; inizio_mese: number; creato_il: string;
  sul_conto: string | null; sul_conto_al: string | null; obiettivo_annuali: string | null };

export type TipoConto = 'corrente' | 'carta' | 'risparmio' | 'investimenti' | 'contanti' | 'digitale';
export type Conto = { id: string; nome: string; tipo: TipoConto; saldo_iniziale: string; data_saldo_iniziale: string; archiviato: boolean; mio: boolean; condiviso: boolean; saldo: string };

export type Categoria = { id: string; proprietario_id: string; padre_id: string | null; nome: string; tipo: 'uscita' | 'entrata'; colore: string | null; icona: string | null; ordine: number; figli?: Categoria[] };

export type Movimento = {
  id: string; conto_id: string; data: string; importo: string; esercente: string | null; descrizione: string | null; categoria_id: string | null;
  inserito_da: string; origine: string; spesa_prevista_id: string | null; rata_id: string | null; obiettivo_id: string | null; trasferimento_id: string | null;
};

export type TipoSpesa = 'fissa' | 'budget' | 'investimento';
export type Spesa = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; conto_id: string | null; conto: string | null;
  categoria_id: string | null; categoria: string | null; categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: TipoSpesa; attiva: boolean; note: string | null; obiettivo_id: string | null; mia: boolean; condivisa: boolean;
  alimenta_obiettivo_id: string | null; // "mettici da parte": spuntata, versa in questo salvadanaio
  pagato: string; movimento_id: string | null; speso: string | null; scadenza: string | null; nel_mese: boolean; uscita: boolean;
  mia_percentuale: number; mia_quota: string; quota_mensile: string; quote?: { utente_id: string; nome: string; percentuale: string }[];
};
export type Periodo = { mese: string; dal: string; al: string };
export type ElencoSpese = { periodo: Periodo; spese: Spesa[] };

export type Traguardo = { id: string; nome: string; importo: string; ordine: number; percentuale: number };
export type Obiettivo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null; crea_spesa: boolean; spesa_creata_id: string | null;
  mio: boolean; condiviso: boolean; versato: string; saldo: string; traguardo_effettivo: string | null; percentuale: number | null;
  traguardi: Traguardo[]; figli: Obiettivo[];
  paga_spesa: { id: string; nome: string; ogni_mesi: number; importo: string; prossima: string } | null;
  alimentato_da: { id: string; importo: string; ogni_mesi: number | null; conto_id: string | null } | null;
  versamenti?: { id: string; data: string; importo: string; utente: string }[];
};

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string; numero_rate: number; prima_scadenza: string;
  conto_id: string | null; categoria_id: string | null; chiusa: boolean; ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
  scadenza?: string | null; pagata?: boolean; // con ?mese=
};

export type Regole = { max_rate_contemporanee?: number; tetto_rate_percentuale?: number; max_mensilita_debito?: number };
export type Controllo = { regola: string; valore: number; limite: number; rispettata: boolean; testo: string };

export type RiepilogoMese = {
  periodo: Periodo; stipendio: string;
  voci: { fisse: string; periodiche_mensilizzate: string; budget: string; investimenti: string; rate: string };
  resta: string; risparmio: string; risparmio_percentuale: number | null; semaforo: 'ok' | 'attenzione' | 'errore' | null;
  da_pagare: { numero: number; totale: string }; budget_residuo: string; rate_del_mese: number;
  reali: { entrate: string; uscite: string; saldo: string };
};
export type MeseStorico = { mese: string; dal: string; al: string; entrate: string; uscite: string; risparmio: string };
export type Patrimonio = { conti: string; investimenti: string; debito_rate: string; totale: string };
export type Proiezione = { partenza: string; punti: { mesi: number; mese: string; risparmio_mese: string; patrimonio: string }[] };
export type ControlloRate = { rate_attive: number; rata_mensile: string; debito: string; controlli: Controllo[] };
export type EsitoAcquisto = { costo_mensile: string; rata: string | null; margine: string; peso_sul_margine: number | null; mesi_di_risparmio: number | null; regole: Controllo[]; esito: 'si' | 'attenzione' | 'no' };

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
export type Condivisione = { id: string; mia: boolean; voce: 'conto' | 'spesa' | 'movimento' | 'obiettivo'; voce_id: string; nome: string | null; proprietario: string; condiviso_con: string; condiviso_con_id: string; proprietario_id: string };
