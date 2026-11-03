import type { PoolClient } from 'pg';
import { type Periodo, aggiungiMesi, meseDi, mesiTra, oggi } from './periodo.ts';

// Rate mensili: dalla prima scadenza, una al mese per numero_rate mesi.

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string;
  numero_rate: number; prima_scadenza: string; conto_id: string | null; conto: string | null; chiusa: boolean;
  ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
  // Quanto costa la rata al mese e all'anno (le rate sono private: è tutta tua).
  al_mese: string; all_anno: string;
};

export function arricchisci(r: Omit<Rata, 'ultima_scadenza' | 'pagate' | 'rimanenti' | 'residuo' | 'attiva' | 'al_mese' | 'all_anno'>, al = oggi()): Rata {
  const ultima = aggiungiMesi(r.prima_scadenza, r.numero_rate - 1);
  let pagate = r.prima_scadenza > al ? 0 : Math.min(r.numero_rate, mesiTra(r.prima_scadenza, al) + 1);
  if (pagate > 0 && aggiungiMesi(r.prima_scadenza, pagate - 1) > al) pagate--;
  const rimanenti = r.chiusa ? 0 : r.numero_rate - pagate;
  return {
    ...r, ultima_scadenza: ultima, pagate, rimanenti,
    residuo: (rimanenti * Number(r.importo_rata)).toFixed(2),
    attiva: !r.chiusa && ultima >= al,
    al_mese: Number(r.importo_rata).toFixed(2), all_anno: (Number(r.importo_rata) * 12).toFixed(2),
  };
}

export async function leggiRate(db: PoolClient, soloId?: string): Promise<Rata[]> {
  const { rows } = await db.query(
    `select id, oggetto, finanziaria, importo_totale::text as importo_totale, importo_rata::text as importo_rata,
            numero_rate, prima_scadenza, conto_id, (select nome from conti where id = rate.conto_id) as conto, chiusa
       from rate where ($1::uuid is null or id = $1) order by chiusa, prima_scadenza`, [soloId ?? null]);
  return rows.map((r) => arricchisci(r));
}

// La scadenza della rata nel periodo, se c'è.
export function scadenzaRata(r: Rata, p: Periodo): string | null {
  if (r.chiusa) return null;
  const k = Math.max(0, mesiTra(r.prima_scadenza, p.dal));
  for (const i of [k - 1, k, k + 1]) {
    if (i < 0 || i >= r.numero_rate) continue;
    const d = aggiungiMesi(r.prima_scadenza, i);
    if (d >= p.dal && d <= p.al) return d;
  }
  return null;
}

// Una spunta di una rata: `data` è il giorno in cui è uscita; `per_mese` (giorno 1 del mese personale della scadenza che paga) c'è per le spunte
// nuove (si può pagare in anticipo); le vecchie senza `per_mese` valgono per la scadenza del mese personale in cui cadono.
export type SpuntaRata = { data: string; per_mese: string | null };

export async function spunteDelleRate(db: PoolClient, ids: string[]): Promise<Map<string, SpuntaRata[]>> {
  const { rows } = await db.query<SpuntaRata & { rata_id: string }>(
    'select rata_id, data::text as data, per_mese::text as per_mese from spunte where rata_id = any($1)', [ids]);
  const m = new Map<string, SpuntaRata[]>();
  for (const x of rows) m.set(x.rata_id, [...(m.get(x.rata_id) ?? []), x]);
  return m;
}

// `rimanenti` e `residuo` come li vede il periodo, coerenti con le spunte: le scadenze non spuntate dalla «rata in corso» (compresa) in poi.
export function conSpunte(r: Rata, spunte: SpuntaRata[], p: Periodo): Rata {
  const rimanenti = rimanentiDaSpunte(r, spunte, p);
  return { ...r, rimanenti, residuo: (rimanenti * Number(r.importo_rata)).toFixed(2) };
}

function rimanentiDaSpunte(r: Rata, spunte: SpuntaRata[], p: Periodo): number {
  const corso = statoRata(r, spunte, p).in_corso;
  if (!corso) return 0;
  const inizio = Number(p.dal.slice(8, 10));
  let n = 0;
  for (let i = corso.numero - 1; i < r.numero_rate; i++) {
    const mese = meseDi(aggiungiMesi(r.prima_scadenza, i), inizio);
    if (!spunte.some((x) => (x.per_mese ? x.per_mese.slice(0, 7) : meseDi(x.data, inizio)) === mese)) n++;
  }
  return n;
}

export type StatoRata = {
  // La «rata in corso» vista dal periodo: la prima scadenza dal periodo in poi non ancora pagata, oppure pagata proprio con una spunta
  // contata in questo periodo (così resta spuntata). `mese` è il mese personale (AAAA-MM) della scadenza.
  in_corso: { numero: number; scadenza: string; mese: string } | null; pagata: boolean;
  // Le scadenze che contano nelle spese di questo periodo (importo_rata ciascuna) e quante sono già pagate.
  contate: number; contate_pagate: number;
};

// REGOLA: ogni scadenza conta nel mese personale in cui cade, TRANNE se pagata in anticipo (spunta fatta in un mese personale prima di quello
// della scadenza): allora conta nel mese in cui è stata spuntata, e non più in quello della scadenza (mai due volte).
export function statoRata(r: Rata, spunte: SpuntaRata[], p: Periodo): StatoRata {
  const vuoto: StatoRata = { in_corso: null, pagata: false, contate: 0, contate_pagate: 0 };
  if (r.chiusa) return vuoto;
  const inizio = Number(p.dal.slice(8, 10));
  const stato = { ...vuoto };
  for (let i = 0; i < r.numero_rate; i++) {
    const scadenza = aggiungiMesi(r.prima_scadenza, i);
    const mese = meseDi(scadenza, inizio);
    const s = spunte.find((x) => (x.per_mese ? x.per_mese.slice(0, 7) : meseDi(x.data, inizio)) === mese);
    const delMese = s && meseDi(s.data, inizio) < mese ? meseDi(s.data, inizio) : mese; // il mese in cui conta
    if (delMese === p.mese) { stato.contate++; if (s) stato.contate_pagate++; }
    if (!stato.in_corso && scadenza >= p.dal && (!s || delMese === p.mese)) {
      stato.in_corso = { numero: i + 1, scadenza, mese };
      stato.pagata = !!s;
    }
  }
  return stato;
}
