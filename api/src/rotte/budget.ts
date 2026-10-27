import { Router } from 'express';
import type { PoolClient } from 'pg';
import { type BudgetDelMese, budgetDelMese } from '../budget.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { mesePassato, NIENTE } from '../movimenti.ts';
import { meseDi, oggi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Budget (decisioni 49, 51 e 57): uno per categoria, senza modi. È una cifra da tenere sotto controllo (non un limite): lo speso è tutto ciò che
// esce con la categoria, da qualunque conto; se si sfora si conta tutto lo stesso e si mostra di quanto. Le uscite si registrano su
// qualunque budget. Nessun promemoria (decisione 57): se servono soldi su un altro conto si fa un giroconto da Movimenti.

export const rotteBudget = Router();

async function contoVisibile(db: PoolClient, id: string | null | undefined) {
  if (id && !(await db.query('select 1 from conti where id = $1', [id])).rowCount) throw nonTrovato('Conto');
}

async function categoriaMia(db: PoolClient, id: string) {
  if (!(await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw nonTrovato('Categoria');
}

// Il budget dopo un cambiamento, nel mese in corso.
async function rileggi(db: PoolClient, id: string): Promise<BudgetDelMese> {
  return (await budgetDelMese(db, await periodoRichiesto(db, undefined), id))[0];
}

// I budget del mese personale (?mese=AAAA-MM, di base quello in corso), anche quelli non attivi.
rotteBudget.get('/', async (req, res) => {
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    return { periodo: { mese: p.mese, dal: p.dal, al: p.al }, budget: await budgetDelMese(db, p) };
  });
  res.json(risposta);
});

function leggi(c: Record<string, unknown>, nuovo: boolean) {
  const importo = v.importo(c, 'importo', nuovo);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, 'Il tetto deve essere positivo');
  return {
    importo,
    attivo: v.booleano(c, 'attivo'),
    note: v.annullabile(c, 'note', () => v.testo(c, 'note', false, 500)),
  };
}

// Crea il budget di una categoria tua (una sola per categoria: 409 se c'è già).
rotteBudget.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const categoria = v.id(c, 'categoria_id', true)!;
  const campi = leggi(c, true);
  const creato = await conUtente(res.locals.utenteId, async (db) => {
    await categoriaMia(db, categoria);
    if ((await db.query('select 1 from budget where categoria_id = $1', [categoria])).rowCount) throw new ErroreApi(409, 'Questa categoria ha già un budget');
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into budget (proprietario_id, categoria_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), $1, ${voci.map((_, i) => `$${i + 2}`).join(', ')}) returning id`, [categoria, ...voci.map(([, x]) => x)]);
    return rileggi(db, rows[0].id);
  });
  res.status(201).json(creato);
});

rotteBudget.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const campi = leggi(v.corpo(req.body), false);
  const aggiornato = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from budget where id = $1', [id])).rowCount) throw nonTrovato('Budget');
    const set = v.setParziale(campi, 2);
    await db.query(`update budget set ${set.sql} where id = $1`, [id, ...set.valori]);
    return rileggi(db, id);
  });
  res.json(aggiornato);
});

// Solo chi ha creato il budget lo elimina. Le uscite già registrate restano nel registro dei movimenti, con la loro categoria.
rotteBudget.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('delete from budget where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from budget where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato il budget può eliminarlo') : nonTrovato('Budget');
  });
  res.status(204).end();
});

// Come si divide il budget con l'altra persona: come per le spese. Elenco vuoto = divisione di base.
rotteBudget.put('/:id/quote', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  if (!Array.isArray(c.quote)) throw new ErroreApi(400, 'Serve un elenco "quote"');
  const quote = c.quote.map((q) => {
    const r = v.corpo(q);
    return { utente: v.id(r, 'utente_id', true)!, pct: v.importo(r, 'percentuale', true)! };
  });
  const somma = quote.reduce((t, q) => t + Number(q.pct), 0);
  const nonSpecificata = quote.length === 1 && quote[0].utente === res.locals.utenteId && Number(quote[0].pct) > 0 && Number(quote[0].pct) < 100;
  if (quote.length && !nonSpecificata && Math.abs(somma - 100) > 0.001) throw new ErroreApi(400, 'Le quote devono fare 100%');
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from budget where id = $1', [id])).rowCount) throw nonTrovato('Budget');
    await db.query('delete from quote where budget_id = $1', [id]);
    for (const q of quote) await db.query('insert into quote (budget_id, utente_id, percentuale) values ($1, $2, $3)', [id, q.utente, q.pct]);
  });
  res.status(204).end();
});

// Registra un'uscita con la categoria del budget (su qualunque budget): importo (positivo), descrizione (di base il nome della categoria),
// data (di base adesso: oggi con l'ora di adesso, un altro giorno a mezzogiorno) e conto da cui esce (libero, facoltativo: il conto
// del budget non c'entra). È un movimento dal conto a Niente: il conto scende e il budget si riempie. Non nei mesi passati (409).
rotteBudget.post('/:id/uscite', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const descrizione = v.testo(c, 'descrizione', false, 120);
  const dataScelta = v.data(c, 'data');
  const contoId = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const b = (await db.query<{ categoria_id: string; nome: string }>(
      'select b.categoria_id, c.nome from budget b join categorie c on c.id = b.categoria_id where b.id = $1', [id])).rows[0];
    if (!b) throw nonTrovato('Budget');
    await contoVisibile(db, contoId);
    const giorno = dataScelta ?? oggi();
    if (await mesePassato(db, giorno)) throw new ErroreApi(409, 'Il passato non si cambia: non si registrano uscite in un mese passato');
    await db.query(
      `insert into movimenti_conto (da_conto_id, a_conto_id, importo, momento, utente_id, causa, descrizione, budget_id, categoria_id)
       values ($1, $2, $3, case when $4::date = $5::date then now() else ($4::date + time '12:00')::timestamptz end, fp_me(), 'budget', $6, $7, $8)`,
      [contoId, NIENTE, importo, giorno, oggi(), descrizione || b.nome, id, b.categoria_id]);
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
    const u = (await db.query<{ data: string }>(`select momento::date::text as data from movimenti_conto where id = $1 and causa in ('budget', 'a_mano')`, [id])).rows[0];
    if (!u) throw nonTrovato('Uscita');
    if (await mesePassato(db, u.data)) throw new ErroreApi(409, 'Il passato non si cambia: un\'uscita di un mese passato non si toglie più');
    if (!(await db.query(`delete from movimenti_conto where id = $1 and causa in ('budget', 'a_mano')`, [id])).rowCount) throw new ErroreApi(403, 'Non puoi togliere questa uscita');
  });
  res.status(204).end();
});
