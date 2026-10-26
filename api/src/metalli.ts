import type { PoolClient } from 'pg';
import { oggi } from './periodo.ts';

// Quotazioni SPOT dei metalli preziosi in euro per grammo di metallo fino. Si
// leggono da gold-api.com (gratuita, senza chiave: prezzo dell'oncia troy in euro)
// al massimo una volta al giorno per metallo e si salvano in quotazioni_metalli;
// se la fonte non risponde vale l'ultima salvata.

export const METALLI = { XAU: 'Oro', XAG: 'Argento', XPT: 'Platino', XPD: 'Palladio' } as const;
export type Metallo = keyof typeof METALLI;
export const metalloValido = (m: string): m is Metallo => m in METALLI;

const FONTE = 'gold-api.com';
const GRAMMI_ONCIA = 31.1034768;
const RIPROVA_DOPO_MS = 15 * 60 * 1000;

export type Quotazione = { metallo: Metallo; euro_grammo: number; data: string; fonte: string };

const ultimoTentativo = new Map<string, number>();

async function leggiDallaFonte(metallo: Metallo): Promise<number | null> {
  try {
    const r = await fetch(`https://api.gold-api.com/price/${metallo}/EUR`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { price?: unknown; currency?: unknown };
    const oncia = Number(j.price);
    return j.currency === 'EUR' && Number.isFinite(oncia) && oncia > 0 ? oncia / GRAMMI_ONCIA : null;
  } catch {
    return null;
  }
}

// L'ultima quotazione di ciascun metallo richiesto (aggiornata se è di un giorno passato).
export async function quotazioniMetalli(db: PoolClient, metalli: Metallo[] = Object.keys(METALLI) as Metallo[]): Promise<Map<Metallo, Quotazione>> {
  const ultime = async () => (await db.query<{ metallo: Metallo; euro_grammo: string; data: string; fonte: string }>(
    `select distinct on (metallo) metallo, euro_grammo::text as euro_grammo, data, fonte
       from quotazioni_metalli where metallo = any($1) order by metallo, data desc`, [metalli])).rows;
  let righe = await ultime();
  const aggiornate = new Set(righe.filter((r) => r.data >= oggi()).map((r) => r.metallo));
  const daFare = metalli.filter((m) => !aggiornate.has(m) && Date.now() - (ultimoTentativo.get(m) ?? 0) > RIPROVA_DOPO_MS);
  if (daFare.length) {
    // Letture in parallelo, scritture una alla volta (stessa connessione).
    const lette = await Promise.all(daFare.map(async (m) => { ultimoTentativo.set(m, Date.now()); return [m, await leggiDallaFonte(m)] as const; }));
    for (const [m, euro] of lette) {
      if (euro) await db.query(`insert into quotazioni_metalli (metallo, data, euro_grammo, fonte) values ($1, $2, $3, $4)
                                on conflict (metallo, data) do update set euro_grammo = excluded.euro_grammo, fonte = excluded.fonte`, [m, oggi(), euro.toFixed(4), FONTE]);
    }
    righe = await ultime();
  }
  return new Map(righe.map((r) => [r.metallo, { metallo: r.metallo, euro_grammo: Number(r.euro_grammo), data: r.data, fonte: r.fonte }]));
}

// Tutte le quotazioni salvate, per l'andamento nel tempo.
export async function storicoMetalli(db: PoolClient): Promise<Map<Metallo, { data: string; euro_grammo: number }[]>> {
  const rows = (await db.query<{ metallo: Metallo; data: string; euro_grammo: string }>(
    'select metallo, data, euro_grammo::text as euro_grammo from quotazioni_metalli order by metallo, data')).rows;
  const per = new Map<Metallo, { data: string; euro_grammo: number }[]>();
  for (const r of rows) per.set(r.metallo, [...(per.get(r.metallo) ?? []), { data: r.data, euro_grammo: Number(r.euro_grammo) }]);
  return per;
}
