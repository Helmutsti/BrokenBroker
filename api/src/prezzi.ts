import type { PoolClient } from 'pg';
import { nonTrovato } from './errori.ts';
import { cercaSulMercato } from './mercato.ts';
import { aggiungiGiorni, oggi } from './periodo.ts';

// Prezzi dei titoli presi da soli: il primo giorno si legge subito (all'aggiunta di un acquisto e a ogni
// caricamento dei dati), poi una volta al giorno per titolo; «Leggi dalla borsa» rilegge a richiesta.
// La fonte è nascosta dietro FontePrezzi: per cambiarla basta scrivere un'altra
// implementazione e assegnarla a `fonte`. Oggi è Yahoo Finance (pubblica, senza
// chiave, non ufficiale). Un titolo senza simbolo di borsa lo cerca una volta
// dall'ISIN, preferendo Milano. I prezzi si salvano sempre in euro (prezzi.prezzo):
// se il titolo quota in un'altra valuta si converte col cambio della fonte, salvato
// in `cambi` una volta al giorno; prezzo originale, valuta e cambio restano in prezzi.
// Un prezzo scritto a mano per oggi vale fino a domani.

export type PrezzoFonte = { prezzo: number; valuta: string };

export interface FontePrezzi {
  nome: string;
  // Ultimo prezzo di un simbolo, nella valuta di quotazione (valuta già normalizzata: GBP, non GBp).
  prezzo(simbolo: string): Promise<PrezzoFonte | null>;
  // Euro per 1 unità di `valuta`.
  cambio(valuta: string): Promise<number | null>;
}

async function graficoYahoo(simbolo: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    const prezzo = Number(meta?.regularMarketPrice);
    return Number.isFinite(prezzo) && prezzo > 0 && typeof meta?.currency === 'string' ? { prezzo, valuta: meta.currency as string } : null;
  } catch {
    return null;
  }
}

export const fonteYahoo: FontePrezzi = {
  nome: 'yahoo',
  async prezzo(simbolo) {
    const g = await graficoYahoo(simbolo);
    if (!g) return null;
    // Londra e Johannesburg quotano in centesimi (GBp, GBX, ZAc).
    if (g.valuta === 'GBp' || g.valuta === 'GBX') return { prezzo: g.prezzo / 100, valuta: 'GBP' };
    if (g.valuta === 'ZAc') return { prezzo: g.prezzo / 100, valuta: 'ZAR' };
    return { prezzo: g.prezzo, valuta: g.valuta.toUpperCase() };
  },
  async cambio(valuta) {
    if (valuta === 'EUR') return 1;
    const g = await graficoYahoo(`EUR${valuta}=X`);   // unità di valuta per 1 euro
    return g ? 1 / g.prezzo : null;
  },
};

export const fonte: FontePrezzi = fonteYahoo;

// Una lettura dalla fonte per titolo alla volta: chi arriva mentre un'altra è in corso (l'app fa più
// richieste insieme dopo ogni modifica) aspetta la stessa risposta, invece di saltare il titolo e
// vederlo «mancante». Dopo un errore si riprova non prima di 2 minuti; dopo un successo la risposta
// vale 30 secondi (serve a chi ha un'altra transazione che non vede ancora il prezzo salvato).
const RIPROVA_DOPO_ERRORE_MS = 2 * 60 * 1000;
const VALE_DOPO_SUCCESSO_MS = 30 * 1000;
type TitoloDaLeggere = { id: string; isin: string | null; ticker: string | null; simbolo: string | null };
type Letto = { simbolo: string | null; borsa: string | null; prezzo: PrezzoFonte | null };
const letture = new Map<string, { promessa: Promise<Letto>; fine: number | null }>();

async function leggiDallaFonte(t: TitoloDaLeggere): Promise<Letto> {
  let simbolo = t.simbolo;
  let borsa: string | null = null;
  if (!simbolo && (t.isin || t.ticker)) {
    // Titolo senza simbolo di borsa: lo si ricava dall'ISIN (o, se manca, dal ticker) con la ricerca Yahoo.
    const trovati = await cercaSulMercato((t.isin ?? t.ticker)!);
    const trovato = t.isin ? trovati.find((x) => x.simbolo) : trovati.find((x) => x.simbolo && x.ticker?.toUpperCase() === t.ticker!.toUpperCase());
    if (trovato) { simbolo = trovato.simbolo; borsa = trovato.borsa; }
  }
  return { simbolo, borsa, prezzo: simbolo ? await fonte.prezzo(simbolo) : null };
}

function lettura(t: TitoloDaLeggere, ignoraBlocco: boolean): Promise<Letto> {
  const e = letture.get(t.id);
  if (e && !ignoraBlocco && (e.fine === null || Date.now() < e.fine)) return e.promessa;
  const nuova: { promessa: Promise<Letto>; fine: number | null } = { promessa: null as never, fine: null };
  nuova.promessa = leggiDallaFonte(t).catch((): Letto => ({ simbolo: t.simbolo, borsa: null, prezzo: null })).then((l) => {
    nuova.fine = Date.now() + (l.prezzo ? VALE_DOPO_SUCCESSO_MS : RIPROVA_DOPO_ERRORE_MS);
    return l;
  });
  letture.set(t.id, nuova);
  return nuova.promessa;
}

// Cambio di oggi (euro per 1 unità): dalla tabella, altrimenti dalla fonte; se la
// fonte non risponde vale l'ultimo salvato.
async function cambioDi(db: PoolClient, valuta: string): Promise<number | null> {
  if (valuta === 'EUR') return 1;
  const oggiIso = oggi();
  const letto = async () => (await db.query<{ euro_per_uno: string; data: string }>(
    'select euro_per_uno::text as euro_per_uno, data from cambi where valuta = $1 order by data desc limit 1', [valuta])).rows[0];
  let c = await letto();
  if (!c || c.data < oggiIso) {
    const nuovo = await fonte.cambio(valuta);
    if (nuovo) {
      await db.query(`insert into cambi (valuta, data, euro_per_uno, fonte) values ($1, $2, $3, $4)
                      on conflict (valuta, data) do update set euro_per_uno = excluded.euro_per_uno, fonte = excluded.fonte`, [valuta, oggiIso, nuovo.toFixed(6), fonte.nome]);
      c = await letto();
    }
  }
  return c ? Number(c.euro_per_uno) : null;
}

// Salva quello che la fonte ha dato: simbolo ricavato, valuta, cambio e prezzo in euro. Vero se il prezzo è salvato.
// `sovrascrivi`: per «Leggi dalla borsa», che sostituisce anche un prezzo scritto a mano.
async function salva(db: PoolClient, t: TitoloDaLeggere, l: Letto, sovrascrivi: boolean): Promise<boolean> {
  if (l.simbolo && l.simbolo !== t.simbolo) {
    await db.query('update titoli set simbolo = $2, borsa = coalesce(borsa, $3) where id = $1 and simbolo is null and not exists (select 1 from titoli where simbolo = $2)', [t.id, l.simbolo, l.borsa]);
  }
  if (!l.prezzo) return false;
  await db.query('update titoli set valuta = $2 where id = $1 and valuta is distinct from $2', [t.id, l.prezzo.valuta]);
  const cambio = await cambioDi(db, l.prezzo.valuta);
  // Senza cambio un prezzo in valuta estera non si può esprimere in euro: resta «mancante».
  if (!cambio) return false;
  await db.query(`insert into prezzi (titolo_id, data, prezzo, valuta, prezzo_valuta, cambio, fonte, aggiornato_il) values ($1, $2, $3, $4, $5, $6, $7, now())
                  on conflict (titolo_id, data) ${sovrascrivi
                    ? 'do update set prezzo = excluded.prezzo, valuta = excluded.valuta, prezzo_valuta = excluded.prezzo_valuta, cambio = excluded.cambio, fonte = excluded.fonte, aggiornato_il = now()'
                    : 'do nothing'}`,
    [t.id, oggi(), (l.prezzo.prezzo * cambio).toFixed(4), l.prezzo.valuta, l.prezzo.prezzo.toFixed(4), cambio.toFixed(6), fonte.nome]);
  return true;
}

// Legge il prezzo di oggi dei titoli che non ce l'hanno (anche scritto a mano: quello vale fino a domani).
export async function aggiornaPrezzi(db: PoolClient, ids: string[]) {
  if (!ids.length) return;
  const daFare = (await db.query<TitoloDaLeggere>(
    `select t.id, t.isin, t.ticker, t.simbolo from titoli t
      where t.id = any($1) and not exists (select 1 from prezzi p where p.titolo_id = t.id and p.data = $2)`, [ids, oggi()])).rows;
  // Le richieste alla fonte sono in parallelo; le scritture sul database una alla volta (stessa connessione).
  const letti = await Promise.all(daFare.map(async (t) => ({ t, l: await lettura(t, false) })));
  for (const { t, l } of letti) await salva(db, t, l, false);
}

export type PrezzoLetto = { prezzo: string; prezzo_valuta: string | null; valuta: string; data: string; fonte: string | null; aggiornato_il: string | null; stato: StatoPrezzo };

// «Leggi dalla borsa»: rilegge subito un titolo, senza blocchi, e scarta il prezzo di oggi (anche scritto a mano).
// Se la fonte non risponde non cambia nulla e si restituisce null (il prezzo scritto a mano resta).
export async function rileggiPrezzo(db: PoolClient, id: string): Promise<PrezzoLetto | null> {
  const t = (await db.query<TitoloDaLeggere>('select id, isin, ticker, simbolo from titoli where id = $1', [id])).rows[0];
  if (!t) throw nonTrovato('Titolo');
  const l = await lettura(t, true);
  if (!(await salva(db, t, l, true))) return null;
  return (await db.query<PrezzoLetto>(
    `select prezzo::text as prezzo, prezzo_valuta::text as prezzo_valuta, valuta, data, fonte, aggiornato_il, 'ok' as stato from prezzi where titolo_id = $1 and data = $2`, [id, oggi()])).rows[0] ?? null;
}

// Stato di un prezzo (o di una quotazione) datato `al`:
//  - 'mancante' se non c'è;
//  - 'vecchio' se è più vecchio di 3 giorni lavorativi (lun-ven, senza considerare le feste:
//    il prezzo di venerdì è ancora 'ok' fino a mercoledì, giovedì diventa 'vecchio');
//  - 'ok' altrimenti.
export const SOGLIA_GIORNI_LAVORATIVI = 3;
export type StatoPrezzo = 'ok' | 'vecchio' | 'mancante';
export function statoPrezzo(al: string | null | undefined): StatoPrezzo {
  if (!al) return 'mancante';
  const fine = oggi();
  let lavorativi = 0;
  for (let g = al; g < fine && lavorativi <= SOGLIA_GIORNI_LAVORATIVI; ) {
    g = aggiungiGiorni(g, 1);
    const giorno = new Date(`${g}T00:00:00Z`).getUTCDay();
    if (giorno !== 0 && giorno !== 6) lavorativi++;
  }
  return lavorativi > SOGLIA_GIORNI_LAVORATIVI ? 'vecchio' : 'ok';
}
