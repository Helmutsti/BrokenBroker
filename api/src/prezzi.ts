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
// Un prezzo di chiusura per giorno (data YYYY-MM-DD), dal più vecchio.
export type SerieFonte = { valuta: string; punti: { data: string; prezzo: number }[] };

export interface FontePrezzi {
  nome: string;
  // Ultimo prezzo di un simbolo, nella valuta di quotazione (valuta già normalizzata: GBP, non GBp).
  prezzo(simbolo: string): Promise<PrezzoFonte | null>;
  // Euro per 1 unità di `valuta`.
  cambio(valuta: string): Promise<number | null>;
  // Chiusure giornaliere dal giorno `dal` a oggi (valuta normalizzata come per `prezzo`).
  storico(simbolo: string, dal: string): Promise<SerieFonte | null>;
  // Euro per 1 unità di `valuta`, giorno per giorno dal giorno `dal`.
  storicoCambio(valuta: string, dal: string): Promise<Map<string, number> | null>;
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

// Le chiusure giornaliere di un simbolo dal giorno `dal`: il giorno è quello della borsa (con il suo fuso).
async function serieYahoo(simbolo: string, dal: string): Promise<{ valuta: string; punti: { data: string; prezzo: number }[] } | null> {
  try {
    const da = Math.floor(Date.parse(`${dal}T00:00:00Z`) / 1000);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?period1=${da}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const ris = (await r.json())?.chart?.result?.[0];
    const tempi: number[] = ris?.timestamp ?? [];
    const chiusure: (number | null)[] = ris?.indicators?.quote?.[0]?.close ?? [];
    const scarto = Number(ris?.meta?.gmtoffset ?? 0);
    if (typeof ris?.meta?.currency !== 'string') return null;
    const punti = tempi.flatMap((t, i) => {
      const p = Number(chiusure[i]);
      return Number.isFinite(p) && p > 0 ? [{ data: new Date((t + scarto) * 1000).toISOString().slice(0, 10), prezzo: p }] : [];
    });
    return { valuta: ris.meta.currency as string, punti };
  } catch {
    return null;
  }
}

// Londra e Johannesburg quotano in centesimi (GBp, GBX, ZAc).
function normalizza(valuta: string): { valuta: string; diviso: number } {
  if (valuta === 'GBp' || valuta === 'GBX') return { valuta: 'GBP', diviso: 100 };
  if (valuta === 'ZAc') return { valuta: 'ZAR', diviso: 100 };
  return { valuta: valuta.toUpperCase(), diviso: 1 };
}

export const fonteYahoo: FontePrezzi = {
  nome: 'yahoo',
  async prezzo(simbolo) {
    const g = await graficoYahoo(simbolo);
    if (!g) return null;
    const n = normalizza(g.valuta);
    return { prezzo: g.prezzo / n.diviso, valuta: n.valuta };
  },
  async cambio(valuta) {
    if (valuta === 'EUR') return 1;
    const g = await graficoYahoo(`EUR${valuta}=X`);   // unità di valuta per 1 euro
    return g ? 1 / g.prezzo : null;
  },
  async storico(simbolo, dal) {
    const s = await serieYahoo(simbolo, dal);
    if (!s) return null;
    const n = normalizza(s.valuta);
    return { valuta: n.valuta, punti: s.punti.map((p) => ({ data: p.data, prezzo: p.prezzo / n.diviso })) };
  },
  async storicoCambio(valuta, dal) {
    if (valuta === 'EUR') return new Map();
    const s = await serieYahoo(`EUR${valuta}=X`, dal);
    return s ? new Map(s.punti.map((p) => [p.data, 1 / p.prezzo])) : null;
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

// Lo storico dei prezzi (decisione 65): per ogni titolo comprato, le chiusure giornaliere dal primo acquisto (al massimo 10 anni) a
// ieri; il prezzo di oggi resta quello letto da aggiornaPrezzi. Si scarica da `dal` quando lo storico manca o un acquisto più vecchio lo
// anticipa, altrimenti solo i giorni dopo l'ultimo prezzo salvato. Non sovrascrive i prezzi già salvati (anche quelli scritti a mano).
// In valuta estera ogni giorno usa il cambio di quel giorno (o l'ultimo prima). Un titolo si riscarica al massimo ogni 6 ore (nei fine
// settimana l'ultimo prezzo resta prima di ieri), 10 minuti dopo un errore.
const RIPROVA_STORICO_MS = 10 * 60 * 1000;
const RILEGGI_STORICO_MS = 6 * 60 * 60 * 1000;
const prossimoStorico = new Map<string, number>();
export async function aggiornaStorico(db: PoolClient, ids: string[]) {
  if (!ids.length) return;
  const ieri = aggiungiGiorni(oggi(), -1);
  const limite = aggiungiGiorni(oggi(), -3650);
  const titoli = (await db.query<{ id: string; simbolo: string; storico_dal: string | null; primo: string; ultimo: string | null }>(
    `select t.id, t.simbolo, to_char(t.storico_dal, 'YYYY-MM-DD') as storico_dal,
            to_char(greatest(min(l.acquistato_il)::date, $2::date), 'YYYY-MM-DD') as primo,
            (select to_char(max(p.data), 'YYYY-MM-DD') from prezzi p where p.titolo_id = t.id and p.data < current_date) as ultimo
       from titoli t join lotti l on l.titolo_id = t.id
      where t.id = any($1) and t.simbolo is not null
      group by t.id`, [ids, limite])).rows;
  const daFare = titoli.flatMap((t) => {
    if ((prossimoStorico.get(t.id) ?? 0) > Date.now()) return [];
    const completo = t.storico_dal !== null && t.storico_dal <= t.primo;
    if (completo && t.ultimo !== null && t.ultimo >= ieri) return [];
    return [{ ...t, dal: completo && t.ultimo ? aggiungiGiorni(t.ultimo, 1) : t.primo, completo }];
  });
  if (!daFare.length) return;
  const serie = await Promise.all(daFare.map(async (t) => ({ t, s: await fonte.storico(t.simbolo, t.dal) })));
  const valute = [...new Set(serie.flatMap(({ s }) => (s && s.valuta !== 'EUR' ? [s.valuta] : [])))];
  const dalMinimo = daFare.map((t) => t.dal).sort()[0];
  const cambi = new Map(await Promise.all(valute.map(async (v) => [v, await fonte.storicoCambio(v, aggiungiGiorni(dalMinimo, -10))] as const)));
  for (const { t, s } of serie) {
    const cambio = s ? (s.valuta === 'EUR' ? new Map<string, number>() : cambi.get(s.valuta)) : null;
    if (!s || !cambio) { prossimoStorico.set(t.id, Date.now() + RIPROVA_STORICO_MS); continue; }
    prossimoStorico.set(t.id, Date.now() + RILEGGI_STORICO_MS);
    const giorniCambio = [...cambio.keys()].sort();
    const cambioAl = (data: string) => {
      if (s.valuta === 'EUR') return 1;
      let ultimo: number | null = null;
      for (const g of giorniCambio) { if (g > data) break; ultimo = cambio.get(g)!; }
      return ultimo;
    };
    const righe = s.punti.filter((p) => p.data >= t.dal && p.data <= ieri).flatMap((p) => {
      const c = cambioAl(p.data);
      return c ? [[p.data, (p.prezzo * c).toFixed(4), p.prezzo.toFixed(4), c.toFixed(6)]] : [];
    });
    if (righe.length) {
      await db.query(
        `insert into prezzi (titolo_id, data, prezzo, valuta, prezzo_valuta, cambio, fonte, aggiornato_il)
         select $1, r.data::date, r.prezzo::numeric, $2, r.prezzo_valuta::numeric, r.cambio::numeric, $3, now()
           from jsonb_to_recordset($4::jsonb) as r(data text, prezzo text, prezzo_valuta text, cambio text)
         on conflict (titolo_id, data) do nothing`,
        [t.id, s.valuta, fonte.nome, JSON.stringify(righe.map(([data, prezzo, prezzo_valuta, cambio]) => ({ data, prezzo, prezzo_valuta, cambio })))]);
    }
    if (!t.completo) await db.query('update titoli set storico_dal = $2 where id = $1', [t.id, t.primo]);
  }
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
