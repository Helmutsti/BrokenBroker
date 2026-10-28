import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { saldiDeiConti } from '../saldi.ts';
import * as v from '../valida.ts';

export const rotteConti = Router();

// Conti al centro (decisione 61): un albero di conti (conto → sotto-conti), ognuno con un saldo che si può sempre riscrivere.
// Un conto con sotto-conti è il loro contenitore: il suo saldo li comprende e `non_assegnato` è la parte che non sta in nessun sotto-conto
// (calcolo in saldi.ts). I conti si condividono (stesso saldo per tutti e due), sotto-conti compresi.
const SELEZIONE = `
  select c.id, c.nome, c.icona, c.archiviato, c.padre_id, c.proprietario_id = fp_me() as mio,
         exists (select 1 from condivisioni s where s.conto_id = c.id) as condiviso,
         c.saldo_scritto::text as saldo_scritto, c.saldo_scritto_il
    from conti c`;

async function conSaldi(db: PoolClient, righe: Record<string, unknown>[]) {
  const saldi = await saldiDeiConti(db);
  const testo = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(2));
  return righe.map((r) => ({ ...r, saldo: testo(saldi.get(r.id as string)?.saldo), non_assegnato: testo(saldi.get(r.id as string)?.non_assegnato) }));
}

rotteConti.get('/', async (req, res) => {
  const archiviati = req.query.archiviati === 'true';
  const conti = await conUtente(res.locals.utenteId, async (db) =>
    conSaldi(db, (await db.query(`${SELEZIONE} where ($1 or not c.archiviato) order by c.archiviato, c.nome`, [archiviati])).rows));
  res.json(conti);
});

async function uno(db: PoolClient, id: string) {
  const r = (await db.query(`${SELEZIONE} where c.id = $1`, [id])).rows;
  return r.length ? (await conSaldi(db, r))[0] : undefined;
}

rotteConti.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const conto = await conUtente(res.locals.utenteId, (db) => uno(db, id));
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

async function padreVisibile(db: PoolClient, id: string | null | undefined) {
  if (id && !(await db.query('select 1 from conti where id = $1', [id])).rowCount) throw nonTrovato('Conto contenitore');
}

rotteConti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const nome = v.testo(c, 'nome', true, 80), icona = v.testo(c, 'icona', false, 60) ?? 'landmark';
  const padre = v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')) ?? null;
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    await padreVisibile(db, padre);
    const { rows } = await db.query<{ id: string }>('insert into conti (proprietario_id, nome, icona, padre_id) values (fp_me(), $1, $2, $3) returning id', [nome, icona, padre]);
    return uno(db, rows[0].id);
  });
  res.status(201).json(conto);
});

rotteConti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = {
    nome: v.testo(c, 'nome', false, 80),
    icona: v.testo(c, 'icona', false, 60),
    archiviato: v.booleano(c, 'archiviato'),
    padre_id: v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')),
  };
  const set = v.setParziale(campi, 2);
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    await padreVisibile(db, campi.padre_id);
    try {
      if (!(await db.query(`update conti set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    } catch (e) {
      if ((e as Error).message.includes('sotto-conto')) throw new ErroreApi(400, (e as Error).message);
      throw e;
    }
    return uno(db, id);
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Il saldo del conto come lo vedi in banca (per un contenitore: comprende i sotto-conti). `momento` (facoltativo, di base adesso, non nel
// futuro) dice a quando vale: le transazioni prima di quel momento sono già dentro. Si può riscrivere sempre; importo null lo toglie.
rotteConti.put('/:id/saldo', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.annullabile(c, 'importo', () => v.importo(c, 'importo', true));
  let momento: string | null = null;
  if (c.momento !== undefined && c.momento !== null) {
    const t = typeof c.momento === 'string' ? Date.parse(c.momento) : NaN;
    if (Number.isNaN(t)) throw new ErroreApi(400, 'Il campo "momento" deve essere una data e ora');
    if (t > Date.now() + 60_000) throw new ErroreApi(400, 'Il momento del saldo non può essere nel futuro');
    momento = new Date(t).toISOString();
  }
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from conti where id = $1', [id])).rowCount) return undefined;
    if (importo === null) await db.query('update conti set saldo_scritto = null, saldo_scritto_il = null where id = $1', [id]);
    else await db.query('update conti set saldo_scritto = $2, saldo_scritto_il = coalesce($3::timestamptz, now()) where id = $1', [id, importo, momento]);
    return uno(db, id);
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Solo il proprietario cancella; un contenitore con sotto-conti no (prima si spostano o si cancellano i sotto-conti).
rotteConti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('select 1 from conti where padre_id = $1', [id])).rowCount) throw new ErroreApi(409, 'Il conto contiene dei sotto-conti: spostali o eliminali prima');
    if ((await db.query('delete from conti where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from conti where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato il conto può cancellarlo') : nonTrovato('Conto');
  });
  res.status(204).end();
});
