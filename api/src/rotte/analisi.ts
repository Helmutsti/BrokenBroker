import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi } from '../errori.ts';
import { type Periodo, periodo, periodoRichiesto, spostaMese } from '../periodo.ts';
import { leggiRate, scadenzaRata } from '../rate.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';
import { portafoglio } from './investimenti.ts';
import { leggiRegole } from './regole.ts';

// Analisi (F18-F22): quanto resta davvero, risparmio, proiezione, patrimonio,
// "posso permettermelo?" e controllo delle rate rispetto alle regole.

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

// Entrate e uscite reali di un periodo sui conti propri (trasferimenti esclusi).
async function movimentiDel(db: PoolClient, p: Periodo) {
  const { rows } = await db.query<{ entrate: string; uscite: string }>(
    `select coalesce(sum(m.importo) filter (where m.importo > 0), 0)::text as entrate,
            coalesce(-sum(m.importo) filter (where m.importo < 0), 0)::text as uscite
       from movimenti m join conti c on c.id = m.conto_id
      where c.proprietario_id = fp_me() and m.trasferimento_id is null and m.data between $1 and $2`, [p.dal, p.al]);
  return { entrate: Number(rows[0].entrate), uscite: Number(rows[0].uscite) };
}

// Il mese pianificato: le spese pagate da un obiettivo non pesano sul margine;
// le spese ogni N mesi pesano per la loro quota mensile; i budget per il tetto
// (o per lo speso, se lo supera).
async function pianoDelMese(db: PoolClient, p: Periodo) {
  const spese = (await speseDelMese(db, p)).filter((s) => s.attiva && !s.obiettivo_id);
  const rate = (await leggiRate(db)).filter((r) => scadenzaRata(r, p));
  const quota = (s: (typeof spese)[number], importo: number) => (importo * s.mia_percentuale) / 100;
  const fisse = spese.filter((s) => s.tipo === 'fissa' && s.nel_mese && (s.ogni_mesi === 1 || s.ogni_mesi === null));
  const periodiche = spese.filter((s) => s.tipo === 'fissa' && s.ogni_mesi !== null && s.ogni_mesi > 1);
  const budget = spese.filter((s) => s.tipo === 'budget');
  const investimenti = spese.filter((s) => s.tipo === 'investimento' && s.nel_mese);
  const voci = {
    fisse: somma(fisse, (s) => Number(s.mia_quota)),
    periodiche_mensilizzate: somma(periodiche, (s) => Number(s.quota_mensile)),
    budget: somma(budget, (s) => quota(s, Math.max(Number(s.importo), Number(s.speso ?? 0)))),
    investimenti: somma(investimenti, (s) => Number(s.mia_quota)),
    rate: somma(rate, (r) => Number(r.importo_rata)),
  };
  return {
    voci, spese, rate,
    da_pagare: [...fisse, ...investimenti].filter((s) => !s.uscita),
    budget_dettaglio: budget,
  };
}

async function riepilogoMese(db: PoolClient, p: Periodo) {
  const s = await stipendio(db);
  const { voci, da_pagare, budget_dettaglio, rate } = await pianoDelMese(db, p);
  const resta = s - voci.fisse - voci.periodiche_mensilizzate - voci.budget - voci.investimenti - voci.rate;
  const risparmio = resta + voci.investimenti;
  const pct = s > 0 ? Math.round((risparmio / s) * 1000) / 10 : null;
  const reali = await movimentiDel(db, p);
  const pagate = new Set((await db.query<{ rata_id: string }>('select distinct rata_id from movimenti where rata_id = any($1) and data between $2 and $3',
    [rate.map((r) => r.id), p.dal, p.al])).rows.map((x) => x.rata_id));
  const rateDaPagare = rate.filter((r) => !pagate.has(r.id));
  const budgetResiduo = somma(budget_dettaglio, (b) => Math.max(0, Number(b.importo) - Number(b.speso ?? 0)) * b.mia_percentuale / 100);
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
    budget_residuo: cent(budgetResiduo),
    rate_del_mese: rate.length,
    reali: { entrate: cent(reali.entrate), uscite: cent(reali.uscite), saldo: cent(reali.entrate - reali.uscite) },
  };
}

rotteAnalisi.get('/mese', async (req, res) => {
  res.json(await conUtente(res.locals.utenteId, async (db) => riepilogoMese(db, await periodoRichiesto(db, req.query.mese))));
});

// Mese per mese (?mesi=12, fino al mese richiesto): entrate e uscite reali.
rotteAnalisi.get('/storico', async (req, res) => {
  const mesi = v.intero(req.query as Record<string, unknown>, 'mesi', 1, 60) ?? 12;
  const storico = await conUtente(res.locals.utenteId, async (db) => {
    const ultimo = await periodoRichiesto(db, req.query.mese);
    const out = [];
    for (let i = mesi - 1; i >= 0; i--) {
      const p = periodo(spostaMese(ultimo.mese, -i), ultimo.inizio);
      const r = await movimentiDel(db, p);
      out.push({ mese: p.mese, dal: p.dal, al: p.al, entrate: cent(r.entrate), uscite: cent(r.uscite), risparmio: cent(r.entrate - r.uscite) });
    }
    return out;
  });
  res.json(storico);
});

export async function patrimonio(db: PoolClient) {
  const { rows } = await db.query<{ conti: string }>(
    `select coalesce(sum(c.saldo_iniziale + coalesce((select sum(m.importo) from movimenti m
                                                    where m.conto_id = c.id and m.data >= c.data_saldo_iniziale), 0)), 0)::text as conti
       from conti c where c.proprietario_id = fp_me() and not c.archiviato`);
  const investimenti = Number((await portafoglio(db)).valore);
  const debito = somma(await leggiRate(db), (r) => Number(r.residuo));
  const conti = Number(rows[0].conti);
  return { conti: cent(conti), investimenti: cent(investimenti), debito_rate: cent(debito), totale: cent(conti + investimenti - debito) };
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
    const { voci } = await pianoDelMese(db, p);
    const tutte = (await leggiRate(db)).filter((r) => r.attiva);
    const base = s - voci.fisse - voci.periodiche_mensilizzate - voci.budget;
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

// Controllo delle rate rispetto alle regole, con una rata in più se indicata.
async function controlloRate(db: PoolClient, nuovaRata = 0, nuovoDebito = 0) {
  const regole = await leggiRegole(db);
  const s = await stipendio(db);
  const attive = (await leggiRate(db)).filter((r) => r.attiva);
  const numero = attive.length + (nuovaRata > 0 ? 1 : 0);
  const mensile = somma(attive, (r) => Number(r.importo_rata)) + nuovaRata;
  const debito = somma(attive, (r) => Number(r.residuo)) + nuovoDebito;
  const controlli = [];
  if (regole.max_rate_contemporanee !== undefined) {
    controlli.push({ regola: 'max_rate_contemporanee', valore: numero, limite: regole.max_rate_contemporanee,
      rispettata: numero <= regole.max_rate_contemporanee,
      testo: `Rate aperte: ${numero}, la tua regola dice massimo ${regole.max_rate_contemporanee}` });
  }
  if (regole.tetto_rate_percentuale !== undefined && s > 0) {
    const pct = Math.round((mensile / s) * 1000) / 10;
    controlli.push({ regola: 'tetto_rate_percentuale', valore: pct, limite: regole.tetto_rate_percentuale,
      rispettata: pct <= regole.tetto_rate_percentuale,
      testo: `Le rate pesano il ${it(pct)}% dello stipendio, la tua regola dice massimo ${it(regole.tetto_rate_percentuale)}%` });
  }
  if (regole.max_mensilita_debito !== undefined && s > 0) {
    const m = Math.round((debito / s) * 10) / 10;
    controlli.push({ regola: 'max_mensilita_debito', valore: m, limite: regole.max_mensilita_debito,
      rispettata: m <= regole.max_mensilita_debito,
      testo: `Debito da pagare: ${it(m)} mensilità, la tua regola dice massimo ${it(regole.max_mensilita_debito)}` });
  }
  return { rate_attive: attive.length, rata_mensile: cent(mensile), debito: cent(debito), controlli };
}

rotteAnalisi.get('/rate', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, (db) => controlloRate(db)));
});

// "Posso permettermelo?" Corpo: { prezzo, a_rate?, numero_rate?, vita_utile_mesi? }.
rotteAnalisi.post('/posso-permettermelo', async (req, res) => {
  const c = v.corpo(req.body);
  const prezzo = Number(v.importo(c, 'prezzo', true));
  if (prezzo <= 0) throw new ErroreApi(400, 'Il prezzo deve essere positivo');
  const aRate = v.booleano(c, 'a_rate') ?? false;
  const numero = aRate ? v.intero(c, 'numero_rate', 1, 600, true)! : 0;
  const vita = v.intero(c, 'vita_utile_mesi', 1, 600);
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, undefined);
    const mese = await riepilogoMese(db, p);
    const margine = Number(mese.resta);
    const rata = aRate ? prezzo / numero : 0;
    const costoMensile = aRate ? rata : vita ? prezzo / vita : prezzo;
    const regole = await controlloRate(db, rata, aRate ? prezzo : 0);
    const risparmio = Number(mese.risparmio);
    const peso = margine > 0 ? Math.round((costoMensile / margine) * 1000) / 10 : null;
    const mesiRisparmio = risparmio > 0 ? Math.round((prezzo / risparmio) * 10) / 10 : null;
    const violate = regole.controlli.filter((x) => !x.rispettata).length;
    const esito = violate > 0 || peso === null || peso > 100 ? 'no' : peso > 50 ? 'attenzione' : 'si';
    return {
      costo_mensile: cent(costoMensile), rata: aRate ? cent(rata) : null, margine: mese.resta,
      peso_sul_margine: peso, mesi_di_risparmio: mesiRisparmio, regole: regole.controlli, esito,
    };
  });
  res.json(risposta);
});
