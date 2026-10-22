import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteConti = Router();

export const TIPI_CONTO = ['corrente', 'carta', 'risparmio', 'investimenti', 'contanti', 'digitale'] as const;

// Il saldo attuale è il saldo di partenza più i movimenti da quella data in poi.
const SELEZIONE = `
  select c.id, c.proprietario_id, c.nome, c.tipo, c.saldo_iniziale, c.data_saldo_iniziale, c.archiviato,
         c.proprietario_id = fp_me() as mio,
         exists (select 1 from condivisioni s where s.conto_id = c.id) as condiviso,
         (c.saldo_iniziale + coalesce((select sum(m.importo) from movimenti m
                                        where m.conto_id = c.id and m.data >= c.data_saldo_iniziale), 0))::text as saldo
    from conti c`;

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
  const valori = [
    v.testo(c, 'nome', true, 80),
    v.scelta(c, 'tipo', TIPI_CONTO, true),
    v.importo(c, 'saldo_iniziale') ?? '0',
    v.data(c, 'data_saldo_iniziale') ?? null,
  ];
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into conti (proprietario_id, nome, tipo, saldo_iniziale, data_saldo_iniziale)
       values (fp_me(), $1, $2, $3, coalesce($4::date, current_date)) returning id`, valori);
    return (await db.query(`${SELEZIONE} where c.id = $1`, [rows[0].id])).rows[0];
  });
  res.status(201).json(conto);
});

rotteConti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const set = v.setParziale({
    nome: v.testo(c, 'nome', false, 80),
    tipo: v.scelta(c, 'tipo', TIPI_CONTO),
    saldo_iniziale: v.importo(c, 'saldo_iniziale'),
    data_saldo_iniziale: v.data(c, 'data_saldo_iniziale'),
    archiviato: v.booleano(c, 'archiviato'),
  }, 2);
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    const { rowCount } = await db.query(`update conti set ${set.sql} where id = $1`, [id, ...set.valori]);
    if (!rowCount) return undefined;
    return (await db.query(`${SELEZIONE} where c.id = $1`, [id])).rows[0];
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Solo il proprietario può cancellare (decisione 16); i movimenti del conto spariscono con lui.
rotteConti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('delete from conti where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from conti where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato il conto può cancellarlo') : nonTrovato('Conto');
  });
  res.status(204).end();
});
