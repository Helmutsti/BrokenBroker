import type { PoolClient } from 'pg';
import { cercaSulMercato } from './mercato.ts';
import { oggi } from './periodo.ts';

// Prezzi dei titoli presi da soli da Yahoo Finance (ricerca pubblica, senza
// chiave), al massimo una volta al giorno per titolo. Un titolo senza simbolo di
// borsa lo cerca una volta dall'ISIN, preferendo Milano. Si salvano solo i prezzi
// in euro: gli altri restano da scrivere a mano. Un prezzo scritto a mano per
// oggi vale fino a domani.

const RIPROVA_DOPO_MS = 15 * 60 * 1000;
const tentativi = new Map<string, number>();

async function prezzoDaYahoo(simbolo: string): Promise<number | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    const prezzo = Number(meta?.regularMarketPrice);
    return meta?.currency === 'EUR' && Number.isFinite(prezzo) && prezzo > 0 ? prezzo : null;
  } catch {
    return null;
  }
}

export async function aggiornaPrezzi(db: PoolClient, ids: string[]) {
  if (!ids.length) return;
  const oggiIso = oggi();
  const daFare = (await db.query<{ id: string; isin: string | null; simbolo: string | null }>(
    `select t.id, t.isin, t.simbolo from titoli t
      where t.id = any($1) and not exists (select 1 from prezzi p where p.titolo_id = t.id and p.data = $2)`, [ids, oggiIso])).rows
    .filter((t) => Date.now() - (tentativi.get(t.id) ?? 0) > RIPROVA_DOPO_MS);
  await Promise.all(daFare.map(async (t) => {
    tentativi.set(t.id, Date.now());
    let simbolo = t.simbolo;
    if (!simbolo && t.isin) {
      const trovato = (await cercaSulMercato(t.isin)).find((x) => x.simbolo);
      if (trovato) {
        simbolo = trovato.simbolo;
        await db.query('update titoli set simbolo = $2, borsa = coalesce(borsa, $3) where id = $1 and simbolo is null and not exists (select 1 from titoli where simbolo = $2)',
          [t.id, simbolo, trovato.borsa]);
      }
    }
    const prezzo = simbolo ? await prezzoDaYahoo(simbolo) : null;
    if (prezzo) await db.query('insert into prezzi (titolo_id, data, prezzo) values ($1, $2, $3) on conflict (titolo_id, data) do nothing', [t.id, oggiIso, prezzo.toFixed(4)]);
  }));
}
