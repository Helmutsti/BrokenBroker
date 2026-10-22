import type { PoolClient } from 'pg';
import { type Periodo, aggiungiMesi, mesiTra, oggi } from './periodo.ts';

// Rate mensili: dalla prima scadenza, una al mese per numero_rate mesi.

export type Rata = {
  id: string; oggetto: string; finanziaria: string | null; importo_totale: string | null; importo_rata: string;
  numero_rate: number; prima_scadenza: string; conto_id: string | null; categoria_id: string | null; chiusa: boolean;
  ultima_scadenza: string; pagate: number; rimanenti: number; residuo: string; attiva: boolean;
};

export function arricchisci(r: Omit<Rata, 'ultima_scadenza' | 'pagate' | 'rimanenti' | 'residuo' | 'attiva'>, al = oggi()): Rata {
  const ultima = aggiungiMesi(r.prima_scadenza, r.numero_rate - 1);
  let pagate = r.prima_scadenza > al ? 0 : Math.min(r.numero_rate, mesiTra(r.prima_scadenza, al) + 1);
  if (pagate > 0 && aggiungiMesi(r.prima_scadenza, pagate - 1) > al) pagate--;
  const rimanenti = r.chiusa ? 0 : r.numero_rate - pagate;
  return {
    ...r, ultima_scadenza: ultima, pagate, rimanenti,
    residuo: (rimanenti * Number(r.importo_rata)).toFixed(2),
    attiva: !r.chiusa && ultima >= al,
  };
}

export async function leggiRate(db: PoolClient, soloId?: string): Promise<Rata[]> {
  const { rows } = await db.query(
    `select id, oggetto, finanziaria, importo_totale::text as importo_totale, importo_rata::text as importo_rata,
            numero_rate, prima_scadenza, conto_id, categoria_id, chiusa
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
