import type { PoolClient } from 'pg';
import { oggi } from './periodo.ts';

// Quotazione dell'oro in euro per grammo di oro fino. Si legge da gold-api.com
// (gratuita, senza chiave: prezzo dell'oncia troy in euro) al massimo una volta
// al giorno e si salva in quotazioni_oro; se la fonte non risponde vale
// l'ultima salvata.

const FONTE = 'gold-api.com';
const INDIRIZZO = 'https://api.gold-api.com/price/XAU/EUR';
const GRAMMI_ONCIA = 31.1034768;
const RIPROVA_DOPO_MS = 15 * 60 * 1000;

export type Quotazione = { euro_grammo: number; data: string; fonte: string };

let ultimoTentativo = 0;

async function leggiDallaFonte(): Promise<number | null> {
  try {
    const r = await fetch(INDIRIZZO, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { price?: unknown; currency?: unknown };
    const oncia = Number(j.price);
    return j.currency === 'EUR' && Number.isFinite(oncia) && oncia > 0 ? oncia / GRAMMI_ONCIA : null;
  } catch {
    return null;
  }
}

export async function quotazioneOro(db: PoolClient): Promise<Quotazione | null> {
  const ultima = async () => (await db.query<{ euro_grammo: string; data: string; fonte: string }>(
    'select euro_grammo::text as euro_grammo, data, fonte from quotazioni_oro order by data desc limit 1')).rows[0];
  let q = await ultima();
  if ((!q || q.data < oggi()) && Date.now() - ultimoTentativo > RIPROVA_DOPO_MS) {
    ultimoTentativo = Date.now();
    const euro = await leggiDallaFonte();
    if (euro) {
      await db.query(`insert into quotazioni_oro (data, euro_grammo, fonte) values ($1, $2, $3)
                      on conflict (data) do update set euro_grammo = excluded.euro_grammo, fonte = excluded.fonte`, [oggi(), euro.toFixed(4), FONTE]);
      q = await ultima();
    }
  }
  return q ? { euro_grammo: Number(q.euro_grammo), data: q.data, fonte: q.fonte } : null;
}

// Tutte le quotazioni salvate, per l'andamento nel tempo.
export async function storicoOro(db: PoolClient) {
  return (await db.query<{ data: string; euro_grammo: string }>('select data, euro_grammo::text as euro_grammo from quotazioni_oro order by data')).rows
    .map((r) => ({ data: r.data, euro_grammo: Number(r.euro_grammo) }));
}

// Grammi di oro fino di un oggetto: peso × purezza in millesimi.
export const grammiFini = (peso: string | null, purezza: string | null) =>
  peso && purezza ? (Number(peso) * Number(purezza)) / 1000 : null;
