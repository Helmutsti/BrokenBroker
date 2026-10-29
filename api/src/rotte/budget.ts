import { Router } from 'express';
import type { PoolClient } from 'pg';
import { type BudgetDelMese, budgetDelMese } from '../budget.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { meseDi, oggi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Budget (decisioni 49, 57, 59 e 71): uno per categoria, un limite di spesa (categoria, cifra del mese, attivo). Lo speso sono tutte le uscite del
// mese con la sua categoria, scritte a mano o nate da una spunta; se si sfora si conta tutto lo stesso e si mostra di quanto. Solo di chi lo crea.

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

// Un budget.
rotteBudget.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const voce = await conUtente(res.locals.utenteId, async (db) => (await budgetDelMese(db, await periodoRichiesto(db, req.query.mese), id))[0]);
  if (!voce) throw nonTrovato('Budget');
  res.json(voce);
});

function leggi(c: Record<string, unknown>, nuovo: boolean) {
  const importo = v.importo(c, 'importo', nuovo);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, 'Il tetto deve essere positivo');
  return {
    importo,
    attivo: v.booleano(c, 'attivo'),
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

// Le uscite già registrate restano nel registro dei movimenti, con la loro categoria.
rotteBudget.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('delete from budget where id = $1', [id])).rowCount) throw nonTrovato('Budget');
  });
  res.status(204).end();
});

// Registra un'uscita con la categoria del budget: importo (positivo), descrizione (di base il nome della categoria), data (di base adesso:
// oggi con l'ora di adesso, un altro giorno a mezzogiorno) e conto come etichetta (facoltativo). È un movimento come quelli scritti in Movimenti.
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
    await db.query(
      `insert into movimenti (utente_id, da_conto_id, verso, importo, momento, descrizione, budget_id, categoria_id)
       values (fp_me(), $1, case when $1::uuid is null then 'uscita' end, $2, case when $3::date = $4::date then now() else ($3::date + time '12:00')::timestamptz end, $5, $6, $7)`,
      [contoId, importo, giorno, oggi(), descrizione || b.nome, id, b.categoria_id]);
    // Il budget mostrato è quello del mese personale in cui cade l'uscita.
    const adesso = await periodoRichiesto(db, undefined);
    return (await budgetDelMese(db, await periodoRichiesto(db, meseDi(giorno, adesso.inizio)), id))[0];
  });
  res.status(201).json(risposta);
});

// Toglie un'uscita: solo chi l'ha scritta.
rotteBudget.delete('/uscite/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from movimenti where id = $1 and a_conto_id is null', [id])).rowCount) throw nonTrovato('Uscita');
    if (!(await db.query('delete from movimenti where id = $1 and spunta_id is null', [id])).rowCount) throw new ErroreApi(403, 'Solo chi ha scritto l\'uscita la può togliere');
  });
  res.status(204).end();
});
