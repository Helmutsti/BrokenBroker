import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { mesePassato } from '../movimenti.ts';
import { meseDi, oggi, periodoRichiesto, type Periodo } from '../periodo.ts';
import { type SpesaDelMese, speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';

// Pagina Budget (decisione 48). I budget sono spese_previste di tipo 'budget' (si creano e si cambiano con
// /spese-previste: nome, categoria, tetto = importo, modo, conti); qui si leggono con il loro stato nel mese e,
// per il modo «conto le uscite», si registrano e si tolgono le uscite.

export const rotteBudget = Router();

type Uscita = { id: string; budget_id: string; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };

async function usciteDel(db: PoolClient, ids: string[], p: Periodo): Promise<Uscita[]> {
  if (!ids.length) return [];
  const adesso = await periodoRichiesto(db, undefined);
  const { rows } = await db.query<Omit<Uscita, 'modificabile'>>(
    `select m.id, m.budget_id, (-m.importo)::text as importo, m.momento, m.momento::date as data, m.descrizione, m.conto_id, c.nome as conto, u.nome as utente
       from movimenti_conto m left join conti c on c.id = m.conto_id left join utenti u on u.id = m.utente_id
      where m.causa = 'budget' and m.budget_id = any($1::uuid[]) and m.momento >= $2::date and m.momento < $3::date + 1
      order by m.momento desc, m.id desc`, [ids, p.dal, p.al]);
  // Le uscite dei mesi passati non si cambiano più (decisione 48 C).
  return rows.map((x) => ({ ...x, modificabile: p.mese >= adesso.mese }));
}

type BudgetDelMese = SpesaDelMese & { uscite: Uscita[] };

async function budgetDelMese(db: PoolClient, p: Periodo, soloId?: string): Promise<BudgetDelMese[]> {
  const budget = (await speseDelMese(db, p, soloId)).filter((s) => s.tipo === 'budget');
  const uscite = await usciteDel(db, budget.map((s) => s.id), p);
  return budget.map((s) => ({ ...s, uscite: uscite.filter((x) => x.budget_id === s.id) }));
}

// I budget del mese personale (?mese=AAAA-MM, di base quello in corso), anche quelli non attivi.
rotteBudget.get('/', async (req, res) => {
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    return { periodo: { mese: p.mese, dal: p.dal, al: p.al }, budget: await budgetDelMese(db, p) };
  });
  res.json(risposta);
});

// Registra un'uscita su un budget «conto le uscite»: importo (positivo), descrizione (di base il nome del budget), data
// (di base adesso: oggi con l'ora di adesso, un altro giorno a mezzogiorno) e conto da cui esce (facoltativo).
// Il conto scende (movimento negativo) e il budget si riempie. Non nei mesi passati (409).
rotteBudget.post('/:id/uscite', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const descrizione = v.testo(c, 'descrizione', false, 120);
  const dataScelta = v.data(c, 'data');
  const contoId = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const [b] = await speseDelMese(db, await periodoRichiesto(db, undefined), id);
    if (!b || b.tipo !== 'budget') throw nonTrovato('Budget');
    if (b.budget_modo !== 'conto') throw new ErroreApi(409, 'Questo budget sposta i soldi tra due conti: le uscite si registrano solo su un budget che conta le uscite');
    if (contoId && !(await db.query('select 1 from conti where id = $1', [contoId])).rowCount) throw nonTrovato('Conto');
    const giorno = dataScelta ?? oggi();
    if (await mesePassato(db, giorno)) throw new ErroreApi(409, 'Il passato non si cambia: non si registrano uscite in un mese passato');
    await db.query(
      `insert into movimenti_conto (conto_id, importo, momento, utente_id, causa, descrizione, budget_id)
       values ($1, $2, case when $3::date = $4::date then now() else ($3::date + time '12:00')::timestamptz end, fp_me(), 'budget', $5, $6)`,
      [contoId, `-${importo}`, giorno, oggi(), descrizione || b.nome, id]);
    // Il budget mostrato è quello del mese personale in cui cade l'uscita.
    const adesso = await periodoRichiesto(db, undefined);
    return (await budgetDelMese(db, await periodoRichiesto(db, meseDi(giorno, adesso.inizio)), id))[0];
  });
  res.status(201).json(risposta);
});

// Toglie un'uscita (se è tua, o se vedi il conto o il budget). Solo nel mese in corso o dopo.
rotteBudget.delete('/uscite/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const u = (await db.query<{ data: string }>(`select momento::date::text as data from movimenti_conto where id = $1 and causa = 'budget'`, [id])).rows[0];
    if (!u) throw nonTrovato('Uscita');
    if (await mesePassato(db, u.data)) throw new ErroreApi(409, 'Il passato non si cambia: un\'uscita di un mese passato non si toglie più');
    if (!(await db.query(`delete from movimenti_conto where id = $1 and causa = 'budget'`, [id])).rowCount) throw new ErroreApi(403, 'Non puoi togliere questa uscita');
  });
  res.status(204).end();
});
