import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteConti = Router();

// I conti sono solo etichette (decisione 72): nome, icona, e si possono archiviare. Nessun saldo. Si mettono su una spesa o una rata per
// ricordare da dove escono i soldi, senza influenzare nessun numero. Non si condividono (le vecchie condivisioni restano nei dati ma non si vedono).
// Il proprietario è sempre chi chiede, quindi `mio` non serve più.
const SELEZIONE = `
  select c.id, c.nome, c.icona, c.archiviato from conti c`;

rotteConti.get('/', async (req, res) => {
  const archiviati = req.query.archiviati === 'true';
  const conti = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`${SELEZIONE} where c.proprietario_id = fp_me() and ($1 or not c.archiviato) order by c.archiviato, c.nome`, [archiviati])).rows);
  res.json(conti);
});

async function uno(db: PoolClient, id: string) {
  return (await db.query(`${SELEZIONE} where c.id = $1 and c.proprietario_id = fp_me()`, [id])).rows[0];
}

rotteConti.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const conto = await conUtente(res.locals.utenteId, (db) => uno(db, id));
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

rotteConti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const nome = v.testo(c, 'nome', true, 80), icona = v.testo(c, 'icona', false, 60) ?? 'landmark';
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>('insert into conti (proprietario_id, nome, icona) values (fp_me(), $1, $2) returning id', [nome, icona]);
    return uno(db, rows[0].id);
  });
  res.status(201).json(conto);
});

rotteConti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const set = v.setParziale({
    nome: v.testo(c, 'nome', false, 80),
    icona: v.testo(c, 'icona', false, 60),
    archiviato: v.booleano(c, 'archiviato'),
  }, 2);
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query(`update conti set ${set.sql} where id = $1 and proprietario_id = fp_me()`, [id, ...set.valori])).rowCount) return undefined;
    return uno(db, id);
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Solo il proprietario cancella. Si può sempre, anche se il conto è su delle spese o rate: perdono l'etichetta e basta (le chiavi del
// database mettono il conto a vuoto; i movimenti restano, senza questo conto).
rotteConti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const visibile = (await db.query('select 1 from conti where id = $1', [id])).rowCount;
    if (!visibile) throw nonTrovato('Conto');
    if (!(await db.query('delete from conti where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw new ErroreApi(403, 'Solo chi ha creato il conto può cancellarlo');
  });
  res.status(204).end();
});
