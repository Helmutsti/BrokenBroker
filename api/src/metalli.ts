import type { PoolClient } from 'pg';
import { aggiungiGiorni, oggi } from './periodo.ts';
import { fonte } from './prezzi.ts';

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

// Lo storico delle quotazioni (decisione 65), per il guadagno nel tempo: gold-api.com lo dà solo con una chiave, quindi i giorni passati
// vengono da Yahoo Finance (i future COMEX, in dollari per oncia, convertiti in euro con il cambio di ogni giorno); il giorno di oggi resta
// quello di gold-api.com. Per ogni metallo richiesto si scarica dal giorno più vecchio che serve (al massimo 10 anni) se lo storico non
// arriva fin lì, altrimenti solo i giorni dopo l'ultimo salvato. Non sovrascrive le quotazioni già salvate. Un metallo si riscarica al
// massimo ogni 6 ore (10 minuti dopo un errore).
const SIMBOLI_STORICO: Record<Metallo, string> = { XAU: 'GC=F', XAG: 'SI=F', XPT: 'PL=F', XPD: 'PA=F' };
const FONTE_STORICO = 'yahoo';
const prossimoStorico = new Map<Metallo, number>();
export async function aggiornaStoricoMetalli(db: PoolClient, richiesti: { metallo: Metallo; dal: string }[]) {
  const ieri = aggiungiGiorni(oggi(), -1), limite = aggiungiGiorni(oggi(), -3650);
  const serve = new Map<Metallo, string>();
  for (const r of richiesti) {
    const d = r.dal < limite ? limite : r.dal.slice(0, 10);
    if (!serve.has(r.metallo) || d < serve.get(r.metallo)!) serve.set(r.metallo, d);
  }
  const salvati = new Map((await db.query<{ metallo: Metallo; primo: string; ultimo: string }>(
    `select metallo, min(data)::text as primo, max(data)::text as ultimo from quotazioni_metalli
      where data < current_date and fonte = $1 group by metallo`, [FONTE_STORICO])).rows.map((r) => [r.metallo, r]));
  const daFare = [...serve].flatMap(([metallo, dal]) => {
    if ((prossimoStorico.get(metallo) ?? 0) > Date.now()) return [];
    const s = salvati.get(metallo);
    // Il primo giorno salvato può cadere qualche giorno dopo quello richiesto (fine settimana, feste).
    if (!s || s.primo > aggiungiGiorni(dal, 7)) return [{ metallo, dal }];
    return s.ultimo >= ieri ? [] : [{ metallo, dal: aggiungiGiorni(s.ultimo, 1) }];
  });
  if (!daFare.length) return;
  const dalMinimo = daFare.map((x) => x.dal).sort()[0];
  const [serie, cambi] = await Promise.all([
    Promise.all(daFare.map(async (x) => ({ ...x, s: await fonte.storico(SIMBOLI_STORICO[x.metallo], x.dal) }))),
    fonte.storicoCambio('USD', aggiungiGiorni(dalMinimo, -10)),
  ]);
  const giorniCambio = cambi ? [...cambi.keys()].sort() : [];
  const cambioAl = (data: string) => {
    let ultimo: number | null = null;
    for (const g of giorniCambio) { if (g > data) break; ultimo = cambi!.get(g)!; }
    return ultimo;
  };
  for (const { metallo, dal, s } of serie) {
    if (!s || s.valuta !== 'USD' || !cambi) { prossimoStorico.set(metallo, Date.now() + 10 * 60 * 1000); continue; }
    const righe = s.punti.filter((p) => p.data >= dal && p.data <= ieri).flatMap((p) => {
      const c = cambioAl(p.data);
      return c ? [{ data: p.data, euro_grammo: ((p.prezzo * c) / GRAMMI_ONCIA).toFixed(4) }] : [];
    });
    if (righe.length) {
      await db.query(
        `insert into quotazioni_metalli (metallo, data, euro_grammo, fonte)
         select $1, r.data::date, r.euro_grammo::numeric, $2 from jsonb_to_recordset($3::jsonb) as r(data text, euro_grammo text)
         on conflict (metallo, data) do nothing`, [metallo, FONTE_STORICO, JSON.stringify(righe)]);
    }
    prossimoStorico.set(metallo, Date.now() + 6 * 60 * 60 * 1000);
  }
}

// Tutte le quotazioni salvate, per l'andamento nel tempo.
export async function storicoMetalli(db: PoolClient): Promise<Map<Metallo, { data: string; euro_grammo: number }[]>> {
  const rows = (await db.query<{ metallo: Metallo; data: string; euro_grammo: string }>(
    'select metallo, data, euro_grammo::text as euro_grammo from quotazioni_metalli order by metallo, data')).rows;
  const per = new Map<Metallo, { data: string; euro_grammo: number }[]>();
  for (const r of rows) per.set(r.metallo, [...(per.get(r.metallo) ?? []), { data: r.data, euro_grammo: Number(r.euro_grammo) }]);
  return per;
}
