import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteConti = Router();

// I conti sono solo etichette (decisione 59): un nome e un'icona per dire dove sta una spesa, una rata, un salvadanaio o un movimento.
// Nessun saldo e nessuna condivisione: ognuno vede i suoi.
const SELEZIONE = 'select c.id, c.nome, c.icona, c.archiviato from conti c';

rotteConti.get('/', async (req, res) => {
  const archiviati = req.query.archiviati === 'true';
  const conti = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`${SELEZIONE} where ($1 or not c.archiviato) order by c.archiviato, c.nome`, [archiviati])).rows);
  res.json(conti);
});

rotteConti.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const conto = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`${SELEZIONE} where c.id = $1`, [id])).rows[0]);
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

rotteConti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const valori = [v.testo(c, 'nome', true, 80), v.testo(c, 'icona', false, 60) ?? 'landmark'];
  const conto = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('insert into conti (proprietario_id, nome, icona) values (fp_me(), $1, $2) returning id, nome, icona, archiviato', valori)).rows[0]);
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
  const conto = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`update conti set ${set.sql} where id = $1 returning id, nome, icona, archiviato`, [id, ...set.valori])).rows[0]);
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Eliminando un conto le voci che lo usavano restano, senza etichetta.
rotteConti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('delete from conti where id = $1', [id])).rowCount) return;
    throw (await db.query('select 1 from conti where id = $1', [id])).rowCount ? new ErroreApi(403, 'Non puoi cancellare questo conto') : nonTrovato('Conto');
  });
  res.status(204).end();
});
