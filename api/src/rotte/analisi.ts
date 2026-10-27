import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi } from '../errori.ts';
import { type Periodo, periodo, periodoRichiesto, spostaMese } from '../periodo.ts';
import { leggiRate, scadenzaRata } from '../rate.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';
import { portafoglio } from '../investimenti.ts';

// Analisi (F18-F22): quanto resta davvero, risparmio, proiezione, patrimonio,
// "posso permettermelo?" e riepilogo delle rate.

export const rotteAnalisi = Router();

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
// Numeri dentro le frasi: con la virgola, come si leggono in italiano.
const it = (n: number) => String(n).replace('.', ',');
const somma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

// Semaforo del risparmio: verde da 20%, arancio da 10%, sotto rosso.
const semaforo = (pct: number | null) => (pct === null ? null : pct >= 20 ? 'ok' : pct >= 10 ? 'attenzione' : 'errore');

async function stipendio(db: PoolClient): Promise<number> {
  const { rows } = await db.query<{ s: string | null }>('select stipendio_netto::text as s from utenti where id = fp_me()');
  return Number(rows[0]?.s ?? 0);
}

// Il mese pianificato: le spese pesano per intero nel mese in cui cadono (le annuali solo a marzo, se escono a marzo). I budget (decisione 58) non entrano: sono solo una lente sui movimenti.
async function pianoDelMese(db: PoolClient, p: Periodo) {
  const spese = (await speseDelMese(db, p)).filter((s) => s.attiva);
  const rate = (await leggiRate(db)).filter((r) => scadenzaRata(r, p));
  const quota = (s: (typeof spese)[number], importo: number) => (importo * s.mia_percentuale) / 100;
  const fisse = spese.filter((s) => s.tipo === 'fissa' && s.nel_mese);
  const ogniMese = fisse.filter((s) => s.ogni_mesi === 1);
  const investimenti = spese.filter((s) => s.tipo === 'investimento' && s.nel_mese);
  const voci = {
    fisse: somma(fisse, (s) => Number(s.mia_quota)),
    investimenti: somma(investimenti, (s) => Number(s.mia_quota)),
    rate: somma(rate, (r) => Number(r.importo_rata)),
  };
  return {
    voci, ogni_mese: somma(ogniMese, (s) => Number(s.mia_quota)), spese, rate,
    da_pagare: [...fisse, ...investimenti].filter((s) => !s.uscita),
  };
}

// I giroconti del mese (decisione 57): soldi spostati da un conto a un altro che vedi, senza i versamenti dei salvadanai. Per ogni conto con un
// saldo: quanto è uscito verso un altro conto (`usciti`) e quanto è entrato da un altro conto (`entrati`) nel mese, solo dopo il suo saldo di
// partenza (prima è già nel saldo). L'Avanzo non si muove per i giroconti: l'app risomma gli usciti e sottrae gli entrati.
async function girocontiDelMese(db: PoolClient, p: Periodo): Promise<Record<string, { usciti: string; entrati: string }>> {
  const { rows } = await db.query<{ id: string; usciti: string; entrati: string }>(
    `select c.id,
            coalesce(sum(m.importo) filter (where m.da_conto_id = c.id), 0)::text as usciti,
            coalesce(sum(m.importo) filter (where m.a_conto_id = c.id), 0)::text as entrati
       from conti c
       join movimenti_conto m on (m.da_conto_id = c.id or m.a_conto_id = c.id)
      where c.saldo_partenza is not null and c.id <> fp_niente()
        and m.da_conto_id <> fp_niente() and m.a_conto_id <> fp_niente() and m.versamento_id is null
        and m.momento > c.saldo_partenza_il and m.momento >= $1::date and m.momento < $2::date + 1
      group by c.id`, [p.dal, p.al]);
  return Object.fromEntries(rows.map((r) => [r.id, { usciti: cent(Number(r.usciti)), entrati: cent(Number(r.entrati)) }]));
}

// Le uscite scritte a mano del mese (decisione 58): movimenti conto -> «Niente» di causa 'a_mano' o 'budget' (anche senza conto, chiave
// 'senza'), per conto di partenza. Sono le sole uscite del «Usciti» che non vengono da una spunta: le spese e le rate spuntate scrivono
// anch'esse un movimento (causa 'spesa' o 'rata'), ma si contano dalla spunta e qui restano fuori, così nulla è contato due volte.
// Un budget non c'entra: la sua uscita è un movimento come un altro e conta una volta sola, a prescindere da quanti budget la guardano.
async function usciteAMano(db: PoolClient, p: Periodo): Promise<Record<string, { totale: string; quante: number }>> {
  const { rows } = await db.query<{ conto: string | null; totale: string; quante: number }>(
    `select m.da_conto_id as conto, sum(m.importo)::text as totale, count(*)::int as quante
       from movimenti_conto m
      where m.causa in ('budget', 'a_mano') and m.a_conto_id = fp_niente()
        and m.momento >= $1::date and m.momento < $2::date + 1
      group by m.da_conto_id`, [p.dal, p.al]);
  return Object.fromEntries(rows.map((r) => [r.conto ?? 'senza', { totale: cent(Number(r.totale)), quante: r.quante }]));
}

async function riepilogoMese(db: PoolClient, p: Periodo) {
  const s = await stipendio(db);
  const { voci, da_pagare, rate } = await pianoDelMese(db, p);
  const resta = s - voci.fisse - voci.investimenti - voci.rate;
  const risparmio = resta + voci.investimenti;
  const pct = s > 0 ? Math.round((risparmio / s) * 1000) / 10 : null;
  const pagate = new Set((await db.query<{ rata_id: string }>('select rata_id from spunte where rata_id = any($1) and data between $2 and $3',
    [rate.map((r) => r.id), p.dal, p.al])).rows.map((x) => x.rata_id));
  const rateDaPagare = rate.filter((r) => !pagate.has(r.id));
  return {
    periodo: { mese: p.mese, dal: p.dal, al: p.al },
    stipendio: cent(s),
    voci: Object.fromEntries(Object.entries(voci).map(([k, x]) => [k, cent(x)])),
    resta: cent(resta),
    risparmio: cent(risparmio),
    risparmio_percentuale: pct,
    semaforo: semaforo(pct),
    // Da pagare: spese fisse e investimenti non spuntati, più le rate del mese non ancora pagate.
    da_pagare: { numero: da_pagare.length + rateDaPagare.length, totale: cent(somma(da_pagare, (x) => Number(x.mia_quota)) + somma(rateDaPagare, (r) => Number(r.importo_rata))) },
    rate_del_mese: rate.length,
    giroconti_per_conto: await girocontiDelMese(db, p),
    uscite_a_mano_per_conto: await usciteAMano(db, p),
  };
}

rotteAnalisi.get('/mese', async (req, res) => {
  res.json(await conUtente(res.locals.utenteId, async (db) => riepilogoMese(db, await periodoRichiesto(db, req.query.mese))));
});

export async function patrimonio(db: PoolClient) {
  // Solo i portafogli che contano nel patrimonio (non quelli di prova). Titoli e beni senza prezzo non valgono 0 in silenzio: sono contati.
  const p = await portafoglio(db);
  const investimenti = Number(p.valore);
  const debito = somma(await leggiRate(db), (r) => Number(r.residuo));
  return { investimenti: cent(investimenti), debito_rate: cent(debito), totale: cent(investimenti - debito),
    investimenti_senza_prezzo: p.titoli_senza_prezzo + p.beni_senza_prezzo, investimenti_incompleti: p.incompleto };
}

rotteAnalisi.get('/patrimonio', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, patrimonio));
});

// Proiezione del risparmio a 1 mese, 1 anno e 5 anni partendo dal patrimonio
// di oggi: il piano del mese in corso si ripete, le rate finiscono quando finiscono.
rotteAnalisi.get('/proiezione', async (_req, res) => {
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, undefined);
    const s = await stipendio(db);
    const { voci, ogni_mese } = await pianoDelMese(db, p);
    const tutte = (await leggiRate(db)).filter((r) => r.attiva);
    // Si ripete il piano delle spese di ogni mese: le annuali e le una tantum sono promemoria del loro mese.
    const base = s - ogni_mese;
    const partenza = Number((await patrimonio(db)).totale);
    let accumulo = 0;
    const punti: { mesi: number; mese: string; risparmio_mese: string; patrimonio: string }[] = [];
    for (let i = 1; i <= 60; i++) {
      const pm = periodo(spostaMese(p.mese, i - 1), p.inizio);
      const rateMese = somma(tutte.filter((r) => scadenzaRata(r, pm)), (r) => Number(r.importo_rata));
      const risparmioMese = base - rateMese;
      accumulo += risparmioMese;
      if ([1, 12, 60].includes(i) || i % 6 === 0) {
        punti.push({ mesi: i, mese: pm.mese, risparmio_mese: cent(risparmioMese), patrimonio: cent(partenza + accumulo) });
      }
    }
    return { partenza: cent(partenza), punti };
  });
  res.json(risposta);
});

// Rate aperte e rata mensile, con una rata in più se indicata.
async function riepilogoRate(db: PoolClient) {
  const attive = (await leggiRate(db)).filter((r) => r.attiva);
  return { rate_attive: attive.length, rata_mensile: cent(somma(attive, (r) => Number(r.importo_rata))), debito: cent(somma(attive, (r) => Number(r.residuo))) };
}

rotteAnalisi.get('/rate', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, (db) => riepilogoRate(db)));
});
