import { Router } from 'express';
import type { PoolClient } from 'pg';
import { alberoCeste, cent, trova } from '../ceste.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { saldiDeiConti } from '../saldi.ts';
import * as v from '../valida.ts';

// Le ceste (decisione 71): parti del saldo di un conto, annidabili, con traguardo, traguardi di copertura e, facoltativo, il collegamento a una
// spesa prevista. Niente si muove da solo: i soldi si spostano a mano dai liberi del conto a una cesta, da una cesta ai liberi, tra ceste dello
// stesso conto (POST /ceste/sposta). Il collegamento a una spesa lo usa la spunta (rotte/spese.ts, ceste.ts).

export const rotteCeste = Router();

// Gli errori che il database scrive con un messaggio chiaro (regole sulle ceste) diventano 400.
const traduci = (e: unknown): never => {
  if ((e as { code?: string }).code === 'P0001') throw new ErroreApi(400, (e as Error).message);
  if ((e as { code?: string }).code === '23505') throw new ErroreApi(409, 'Un\'altra cesta è già collegata a questa spesa');
  throw e;
};

rotteCeste.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, alberoCeste));
});

rotteCeste.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cesta = await conUtente(res.locals.utenteId, async (db) => trova(await alberoCeste(db), id));
  if (!cesta) throw nonTrovato('Cesta');
  res.json(cesta);
});

function leggi(c: Record<string, unknown>, nuova: boolean) {
  const traguardo = v.annullabile(c, 'traguardo', () => v.importo(c, 'traguardo'));
  if (traguardo && Number(traguardo) <= 0) throw new ErroreApi(400, 'Il traguardo deve essere positivo');
  return {
    nome: v.testo(c, 'nome', nuova, 120),
    icona: v.annullabile(c, 'icona', () => v.testo(c, 'icona', false, 60)),
    traguardo,
    spesa_id: v.annullabile(c, 'spesa_id', () => v.id(c, 'spesa_id')),
  };
}

async function spesaVisibile(db: PoolClient, id: string | null | undefined) {
  if (id && !(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) throw nonTrovato('Spesa');
}

// Dove sta la cesta: dentro un conto (`conto_id`) o dentro un'altra cesta (`padre_id`, nello stesso conto). Uno dei due serve.
rotteCeste.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = leggi(c, true);
  const contoId = v.id(c, 'conto_id'), padreId = v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')) ?? undefined;
  if (!contoId && !padreId) throw new ErroreApi(400, 'Scegli in quale conto sta la cesta');
  const cesta = await conUtente(res.locals.utenteId, async (db) => {
    const padre = padreId ? (await db.query<{ conto_id: string }>('select conto_id from ceste where id = $1', [padreId])).rows[0] : undefined;
    if (padreId && !padre) throw nonTrovato('Cesta superiore');
    const conto = padre?.conto_id ?? contoId!;
    if (contoId && padre && contoId !== padre.conto_id) throw new ErroreApi(400, 'Una sotto-cesta sta nello stesso conto della cesta che la contiene');
    if (!(await db.query('select 1 from conti where id = $1', [conto])).rowCount) throw nonTrovato('Conto');
    await spesaVisibile(db, campi.spesa_id);
    try {
      const { rows } = await db.query<{ id: string }>(
        `insert into ceste (proprietario_id, conto_id, padre_id, nome, icona, traguardo, spesa_id)
         values (fp_me(), $1, $2, $3, $4, $5, $6) returning id`,
        [conto, padreId ?? null, campi.nome, campi.icona ?? 'piggy-bank', campi.spesa_id ? null : campi.traguardo ?? null, campi.spesa_id ?? null]);
      return trova(await alberoCeste(db), rows[0].id);
    } catch (e) { return traduci(e); }
  });
  res.status(201).json(cesta);
});

rotteCeste.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = leggi(c, false);
  const cesta = await conUtente(res.locals.utenteId, async (db) => {
    await spesaVisibile(db, campi.spesa_id);
    // Collegata a una spesa, la cesta prende la cifra dalla spesa: il traguardo scritto non serve più.
    const set = v.setParziale({ ...campi, traguardo: campi.spesa_id ? null : campi.traguardo }, 2);
    try {
      if (!(await db.query(`update ceste set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    } catch (e) { return traduci(e); }
    return trova(await alberoCeste(db), id);
  });
  if (!cesta) throw nonTrovato('Cesta');
  res.json(cesta);
});

// Solo chi l'ha creata cancella; una cesta con dei soldi o con sotto-ceste no (prima si svuota o si spostano le sotto-ceste).
rotteCeste.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoCeste(db), id);
    if (!n) throw nonTrovato('Cesta');
    if (n.figli.length) throw new ErroreApi(409, 'La cesta contiene delle sotto-ceste: spostale o eliminale prima');
    if (Math.abs(Number(n.saldo)) >= 0.005) throw new ErroreApi(409, 'Nella cesta ci sono ancora dei soldi: rimettili nei liberi del conto prima di eliminarla');
    if (!(await db.query('delete from ceste where id = $1', [id])).rowCount) throw new ErroreApi(403, 'Solo chi ha creato la cesta può cancellarla');
  });
  res.status(204).end();
});

// Sposta dei soldi: `da` e `a` sono una cesta o null (= i liberi del conto); almeno una è una cesta e dice il conto, e le due stanno nello stesso conto.
// Da una cesta si prende al massimo quanto c'è nella sua parte propria (le sotto-ceste hanno i loro soldi); dai liberi al massimo i liberi del conto.
rotteCeste.post('/sposta', async (req, res) => {
  const c = v.corpo(req.body);
  const da = v.annullabile(c, 'da', () => v.id(c, 'da')) ?? null;
  const a = v.annullabile(c, 'a', () => v.id(c, 'a')) ?? null;
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  if (!da && !a) throw new ErroreApi(400, 'Scegli almeno una cesta');
  if (da === a) throw new ErroreApi(400, 'Scegli due posti diversi');
  const momento = v.data(c, 'data') ?? null;
  const descrizione = v.testo(c, 'descrizione', false, 200) ?? '';
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const trovate = (await db.query<{ id: string; conto_id: string; nome: string }>('select id, conto_id, nome from ceste where id = any($1::uuid[])', [[da, a].filter(Boolean)])).rows;
    const dk = da ? trovate.find((x) => x.id === da) : undefined, ak = a ? trovate.find((x) => x.id === a) : undefined;
    if ((da && !dk) || (a && !ak)) throw nonTrovato('Cesta');
    const conto = (dk ?? ak)!.conto_id;
    if (dk && ak && dk.conto_id !== ak.conto_id) throw new ErroreApi(400, 'Le due ceste devono stare nello stesso conto');
    // Un solo spostamento alla volta per conto: così due richieste insieme non possono prendere due volte gli stessi soldi.
    await db.query('select 1 from conti where id = $1 for update', [conto]);
    const quanto = Number(importo);
    if (da) {
      const propria = Number((await db.query<{ v: string }>(
        `select coalesce(sum(case when a_cesta_id = $1 then importo else -importo end), 0)::text as v from spostamenti_ceste where a_cesta_id = $1 or da_cesta_id = $1`, [da])).rows[0].v);
      if (quanto > propria + 0.005) throw new ErroreApi(400, `Nella cesta «${dk!.nome}» puoi prendere al massimo ${cent(Math.max(0, propria))} €: il resto è nelle sue sotto-ceste`);
    } else {
      const liberi = (await saldiDeiConti(db)).get(conto)?.liberi ?? 0;
      if (quanto > liberi + 0.005) throw new ErroreApi(400, `Nei liberi del conto ci sono ${cent(Math.max(0, liberi))} €: non bastano`);
    }
    await db.query(
      `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, momento, descrizione)
       values (fp_me(), $1, $2, $3, case when $4::date is null or $4::date = current_date then now() else ($4::date + time '12:00')::timestamptz end, $5)`,
      [da, a, cent(quanto), momento, descrizione]);
    return { conto_id: conto, ceste: await alberoCeste(db) };
  });
  res.status(201).json(risposta.ceste.filter((k) => k.conto_id === risposta.conto_id));
});

// Traguardi di copertura.
rotteCeste.post('/:id/traguardi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const nome = v.testo(c, 'nome', true, 120), ordine = v.intero(c, 'ordine', 0, 1000) ?? null;
  const traguardo = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) throw nonTrovato('Cesta');
    return (await db.query(
      `insert into traguardi_copertura (cesta_id, nome, importo, ordine)
       values ($1, $2, $3, coalesce($4, (select count(*) from traguardi_copertura where cesta_id = $1)))
       returning id, cesta_id, nome, importo::text as importo, ordine`, [id, nome, importo, ordine])).rows[0];
  });
  res.status(201).json(traguardo);
});

rotteCeste.patch('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo');
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const set = v.setParziale({ nome: v.testo(c, 'nome', false, 120), importo, ordine: v.intero(c, 'ordine', 0, 1000) }, 2);
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `update traguardi_copertura set ${set.sql} where id = $1 returning id, cesta_id, nome, importo::text as importo, ordine`, [id, ...set.valori])).rows[0]);
  if (!traguardo) throw nonTrovato('Traguardo');
  res.json(traguardo);
});

rotteCeste.delete('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cancellati = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('delete from traguardi_copertura where id = $1', [id])).rowCount);
  if (!cancellati) throw nonTrovato('Traguardo');
  res.status(204).end();
});
