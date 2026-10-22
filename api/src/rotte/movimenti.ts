import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

export const rotteMovimenti = Router();

const CAMPI = `id, conto_id, data, importo::text as importo, esercente, descrizione, categoria_id, inserito_da,
               origine, spesa_prevista_id, rata_id, obiettivo_id, trasferimento_id, creato_il, modificato_il`;

// Categoria e conto usati l'ultima volta con lo stesso esercente.
async function suggerisci(db: PoolClient, esercente: string) {
  const { rows } = await db.query<{ categoria_id: string | null; conto_id: string }>(
    `select categoria_id, conto_id from movimenti
      where inserito_da = fp_me() and lower(esercente) = lower($1) and trasferimento_id is null
      order by data desc, creato_il desc limit 1`, [esercente]);
  return rows[0] ?? null;
}

rotteMovimenti.get('/suggerimento', async (req, res) => {
  const esercente = typeof req.query.esercente === 'string' ? req.query.esercente.trim() : '';
  if (!esercente) throw new ErroreApi(400, 'Indica un esercente');
  const suggerimento = await conUtente(res.locals.utenteId, (db) => suggerisci(db, esercente));
  res.json(suggerimento ?? { categoria_id: null, conto_id: null });
});

// Filtri: dal, al, conto_id, categoria_id (include le sottocategorie), cerca, limite, salta.
rotteMovimenti.get('/', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const dal = v.data(q, 'dal');
  const al = v.data(q, 'al');
  const conto = v.id(q, 'conto_id');
  const categoria = v.id(q, 'categoria_id');
  const cerca = v.testo(q, 'cerca', false, 100);
  const limite = v.intero(q, 'limite', 1, 500) ?? 100;
  const salta = v.intero(q, 'salta', 0, 1_000_000) ?? 0;

  const movimenti = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(
      `with recursive rami as (
         select id from categorie where id = $4
         union all
         select c.id from categorie c join rami r on c.padre_id = r.id)
       select ${CAMPI} from movimenti
        where ($1::date is null or data >= $1)
          and ($2::date is null or data <= $2)
          and ($3::uuid is null or conto_id = $3)
          and ($4::uuid is null or categoria_id in (select id from rami))
          and ($5::text is null or esercente ilike '%' || $5 || '%' or descrizione ilike '%' || $5 || '%')
        order by data desc, creato_il desc
        limit $6 offset $7`,
      [dal ?? null, al ?? null, conto ?? null, categoria ?? null, cerca ?? null, limite, salta])).rows);
  res.json(movimenti);
});

rotteMovimenti.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const movimento = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query(`select ${CAMPI} from movimenti where id = $1`, [id])).rows[0]);
  if (!movimento) throw nonTrovato('Movimento');
  res.json(movimento);
});

// Inserimento veloce: basta importo ed esercente; conto e categoria, se mancano,
// vengono dall'ultimo movimento con lo stesso esercente.
rotteMovimenti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) === 0) throw new ErroreApi(400, "L'importo non può essere zero");
  const esercente = v.testo(c, 'esercente', false, 120);
  let conto = v.id(c, 'conto_id');
  let categoria = v.id(c, 'categoria_id');

  const movimento = await conUtente(res.locals.utenteId, async (db) => {
    if (esercente && (!conto || !categoria)) {
      const s = await suggerisci(db, esercente);
      conto ??= s?.conto_id;
      categoria ??= s?.categoria_id ?? undefined;
    }
    if (!conto) throw new ErroreApi(400, 'Indica il conto');
    return (await db.query(
      `insert into movimenti (conto_id, data, importo, esercente, descrizione, categoria_id, inserito_da,
                              spesa_prevista_id, rata_id, obiettivo_id)
       values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, fp_me(), $7, $8, $9)
       returning ${CAMPI}`,
      [conto, v.data(c, 'data') ?? null, importo, esercente ?? null, v.testo(c, 'descrizione', false, 500) ?? null,
       categoria ?? null, v.id(c, 'spesa_prevista_id') ?? null, v.id(c, 'rata_id') ?? null, v.id(c, 'obiettivo_id') ?? null],
    )).rows[0];
  });
  res.status(201).json(movimento);
});

// Spostamento di soldi tra due conti: due movimenti collegati dallo stesso trasferimento_id.
rotteMovimenti.post('/trasferimento', async (req, res) => {
  const c = v.corpo(req.body);
  const da = v.id(c, 'da_conto_id', true)!;
  const a = v.id(c, 'a_conto_id', true)!;
  const importo = v.importo(c, 'importo', true)!;
  if (da === a) throw new ErroreApi(400, 'I due conti devono essere diversi');
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const data = v.data(c, 'data') ?? null;
  const descrizione = v.testo(c, 'descrizione', false, 500) ?? 'Trasferimento';
  const trasferimento = randomUUID();

  const movimenti = await conUtente(res.locals.utenteId, async (db) => {
    const inserisci = (conto: string, valore: string) => db.query(
      `insert into movimenti (conto_id, data, importo, descrizione, inserito_da, trasferimento_id)
       values ($1, coalesce($2::date, current_date), $3, $4, fp_me(), $5) returning ${CAMPI}`,
      [conto, data, valore, descrizione, trasferimento]);
    const uscita = (await inserisci(da, `-${importo}`)).rows[0];
    const entrata = (await inserisci(a, importo)).rows[0];
    return [uscita, entrata];
  });
  res.status(201).json({ trasferimento_id: trasferimento, movimenti });
});

rotteMovimenti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo');
  if (importo !== undefined && Number(importo) === 0) throw new ErroreApi(400, "L'importo non può essere zero");
  const campi = {
    conto_id: v.id(c, 'conto_id'),
    data: v.data(c, 'data'),
    importo,
    esercente: v.annullabile(c, 'esercente', () => v.testo(c, 'esercente', false, 120)),
    descrizione: v.annullabile(c, 'descrizione', () => v.testo(c, 'descrizione', false, 500)),
    categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
    spesa_prevista_id: v.annullabile(c, 'spesa_prevista_id', () => v.id(c, 'spesa_prevista_id')),
    rata_id: v.annullabile(c, 'rata_id', () => v.id(c, 'rata_id')),
    obiettivo_id: v.annullabile(c, 'obiettivo_id', () => v.id(c, 'obiettivo_id')),
  };
  const set = v.setParziale(campi, 2);

  const movimento = await conUtente(res.locals.utenteId, async (db) => {
    const attuale = (await db.query<{ trasferimento_id: string | null }>(
      'select trasferimento_id from movimenti where id = $1', [id])).rows[0];
    if (!attuale) return undefined;
    // In un trasferimento si cambiano solo data e descrizione, su entrambe le metà.
    if (attuale.trasferimento_id) {
      const altri = Object.entries(campi).filter(([k, val]) => val !== undefined && !['data', 'descrizione'].includes(k));
      if (altri.length) throw new ErroreApi(400, 'Di un trasferimento si possono cambiare solo data e descrizione');
      const s = v.setParziale({ data: campi.data, descrizione: campi.descrizione }, 2);
      await db.query(`update movimenti set ${s.sql}, modificato_il = now() where trasferimento_id = $1`,
        [attuale.trasferimento_id, ...s.valori]);
    } else {
      await db.query(`update movimenti set ${set.sql}, modificato_il = now() where id = $1`, [id, ...set.valori]);
    }
    return (await db.query(`select ${CAMPI} from movimenti where id = $1`, [id])).rows[0];
  });
  if (!movimento) throw nonTrovato('Movimento');
  res.json(movimento);
});

// Cancellare metà di un trasferimento cancella anche l'altra metà.
rotteMovimenti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const attuale = (await db.query<{ trasferimento_id: string | null }>(
      'select trasferimento_id from movimenti where id = $1', [id])).rows[0];
    if (!attuale) throw nonTrovato('Movimento');
    const { rowCount } = attuale.trasferimento_id
      ? await db.query('delete from movimenti where trasferimento_id = $1', [attuale.trasferimento_id])
      : await db.query('delete from movimenti where id = $1', [id]);
    if (!rowCount) throw new ErroreApi(403, "Può cancellarlo solo chi l'ha inserito o il proprietario del conto");
  });
  res.status(204).end();
});
