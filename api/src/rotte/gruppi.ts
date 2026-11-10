import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteGruppi = Router();

// I gruppi (decisione 74) sono cartelle contenitore per le spese: nome e icona, solo etichetta (come il conto, decisione 72): nessun numero cambia.
// Sono di chi li crea e non si condividono.
const SELEZIONE = `
  select g.id, g.nome, g.icona from gruppi g`;

rotteGruppi.get('/', async (_req, res) => {
  const gruppi = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`${SELEZIONE} where g.proprietario_id = fp_me() order by g.nome`)).rows);
  res.json(gruppi);
});

async function uno(db: PoolClient, id: string) {
  return (await db.query(`${SELEZIONE} where g.id = $1 and g.proprietario_id = fp_me()`, [id])).rows[0];
}

rotteGruppi.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const gruppo = await conUtente(res.locals.utenteId, (db) => uno(db, id));
  if (!gruppo) throw nonTrovato('Gruppo');
  res.json(gruppo);
});

rotteGruppi.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const nome = v.testo(c, 'nome', true, 80), icona = v.testo(c, 'icona', false, 60) ?? 'folder';
  const gruppo = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>('insert into gruppi (proprietario_id, nome, icona) values (fp_me(), $1, $2) returning id', [nome, icona]);
    return uno(db, rows[0].id);
  });
  res.status(201).json(gruppo);
});

rotteGruppi.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const set = v.setParziale({
    nome: v.testo(c, 'nome', false, 80),
    icona: v.testo(c, 'icona', false, 60),
  }, 2);
  const gruppo = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query(`update gruppi set ${set.sql} where id = $1 and proprietario_id = fp_me()`, [id, ...set.valori])).rowCount) return undefined;
    return uno(db, id);
  });
  if (!gruppo) throw nonTrovato('Gruppo');
  res.json(gruppo);
});

// Si cancella sempre: le spese del gruppo restano, senza gruppo (le chiavi del database mettono il gruppo a vuoto).
rotteGruppi.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('delete from gruppi where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw nonTrovato('Gruppo');
  });
  res.status(204).end();
});
