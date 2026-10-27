import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteConti = Router();

// I conti hanno un saldo (decisione 47): UNO per conto, uguale per tutte le persone che lo vedono.
// saldo = saldo di partenza (scritto a mano, con data e ora) + movimenti registrati DOPO quel momento.
// saldo_partenza / saldo_partenza_il: quello scritto; saldo: l'attuale (null se il conto non ha un saldo di partenza);
// saldo_aggiornato_il: l'ultima volta che è cambiato (saldo scritto o ultimo movimento che conta).
const SELEZIONE = `
  select c.id, c.proprietario_id, c.nome, c.icona, c.archiviato,
         c.proprietario_id = fp_me() as mio,
         exists (select 1 from condivisioni s where s.conto_id = c.id) as condiviso,
         c.saldo_partenza::text as saldo_partenza, c.saldo_partenza_il,
         case when c.saldo_partenza is null then null
              else (c.saldo_partenza + coalesce(m.somma, 0))::text end as saldo,
         case when c.saldo_partenza is null then null
              else greatest(c.saldo_partenza_il, m.ultimo) end as saldo_aggiornato_il
    from conti c
    left join lateral (select sum(x.importo) as somma, max(x.momento) as ultimo from movimenti_conto x
                        where x.conto_id = c.id and x.momento > c.saldo_partenza_il) m on true`;

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
  const conto = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'insert into conti (proprietario_id, nome, icona) values (fp_me(), $1, $2) returning id', valori);
    return (await db.query(`${SELEZIONE} where c.id = $1`, [rows[0].id])).rows[0];
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
    const { rowCount } = await db.query(`update conti set ${set.sql} where id = $1`, [id, ...set.valori]);
    if (!rowCount) return undefined;
    return (await db.query(`${SELEZIONE} where c.id = $1`, [id])).rows[0];
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Il saldo di partenza del conto, come lo vedi in banca. `momento` (facoltativo, di base adesso, non nel futuro) dice a
// quando vale: i movimenti prima di quel momento non si contano più (sono già nel saldo). Riscriverlo è il modo
// di riallinearsi alla banca. importo null toglie il saldo.
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
    if (importo === null) await db.query('update conti set saldo_partenza = null, saldo_partenza_il = null where id = $1', [id]);
    else await db.query('update conti set saldo_partenza = $2, saldo_partenza_il = coalesce($3::timestamptz, now()) where id = $1', [id, importo, momento]);
    return (await db.query(`${SELEZIONE} where c.id = $1`, [id])).rows[0];
  });
  if (!conto) throw nonTrovato('Conto');
  res.json(conto);
});

// Ultimi movimenti del conto (?limite=, di base 20), dal più recente. `conta` dice se il movimento è dopo il saldo di
// partenza (e quindi è nel saldo attuale); gli altri erano già nel saldo scritto.
rotteConti.get('/:id/movimenti', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const limite = Math.min(200, Math.max(1, Number(req.query.limite ?? 20) || 20));
  const righe = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from conti where id = $1', [id])).rowCount) return undefined;
    return (await db.query(
      `select m.id, m.importo::text as importo, m.momento, m.momento::date as data, m.causa, m.descrizione, u.nome as utente,
              (c.saldo_partenza_il is not null and m.momento > c.saldo_partenza_il) as conta
         from movimenti_conto m join conti c on c.id = m.conto_id left join utenti u on u.id = m.utente_id
        where m.conto_id = $1 order by m.momento desc, m.id desc limit $2`, [id, limite])).rows;
  });
  if (!righe) throw nonTrovato('Conto');
  res.json(righe);
});

// Solo il proprietario può cancellare (decisione 16).
rotteConti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('delete from conti where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from conti where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato il conto può cancellarlo') : nonTrovato('Conto');
  });
  res.status(204).end();
});
