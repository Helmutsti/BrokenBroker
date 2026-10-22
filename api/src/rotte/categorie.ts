import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

export const rotteCategorie = Router();

const CAMPI = 'id, padre_id, nome, tipo, colore, icona, ordine';

type Categoria = { id: string; padre_id: string | null; nome: string; tipo: string; colore: string | null; icona: string | null; ordine: number };
type Nodo = Categoria & { figli: Nodo[] };

function albero(righe: Categoria[]): Nodo[] {
  const nodi = new Map(righe.map((r) => [r.id, { ...r, figli: [] as Nodo[] }]));
  const radici: Nodo[] = [];
  for (const nodo of nodi.values()) {
    const padre = nodo.padre_id ? nodi.get(nodo.padre_id) : undefined;
    (padre ? padre.figli : radici).push(nodo);
  }
  return radici;
}

const leggiColore = (c: Record<string, unknown>) => {
  const colore = v.testo(c, 'colore', false, 7);
  if (colore !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(colore)) throw new ErroreApi(400, 'Il colore deve essere nel formato #RRGGBB');
  return colore;
};

// Un padre non può essere la categoria stessa né una sua discendente.
async function controllaPadre(db: PoolClient, id: string, padre: string) {
  const { rowCount } = await db.query(
    `with recursive discendenti as (
       select id from categorie where id = $1
       union all
       select c.id from categorie c join discendenti d on c.padre_id = d.id)
     select 1 from discendenti where id = $2`, [id, padre]);
  if (rowCount) throw new ErroreApi(400, 'Una categoria non può stare dentro sé stessa o una sua sottocategoria');
}

// ?formato=elenco restituisce la lista piatta, altrimenti l'albero.
rotteCategorie.get('/', async (req, res) => {
  const righe = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query<Categoria>(`select ${CAMPI} from categorie where proprietario_id = fp_me() order by ordine, nome`)).rows);
  res.json(req.query.formato === 'elenco' ? righe : albero(righe));
});

// Speso nel mese (?mese=AAAA-MM) per ogni categoria, senza le sottocategorie:
// la somma sui rami la fa chi legge l'albero.
rotteCategorie.get('/spese', async (req, res) => {
  const righe = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    return (await db.query(
      `select categoria_id, (-sum(importo))::text as speso from movimenti
        where categoria_id is not null and importo < 0 and trasferimento_id is null and data between $1 and $2
        group by categoria_id`, [p.dal, p.al])).rows;
  });
  res.json(righe);
});

rotteCategorie.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const valori = [
    v.id(c, 'padre_id') ?? null,
    v.testo(c, 'nome', true, 60),
    v.scelta(c, 'tipo', ['uscita', 'entrata'] as const) ?? null,
    leggiColore(c) ?? null,
    v.testo(c, 'icona', false, 60) ?? null,
    v.intero(c, 'ordine', 0, 10000) ?? 0,
  ];
  const categoria = await conUtente(res.locals.utenteId, async (db) =>
    // Senza tipo esplicito una sottocategoria eredita quello del padre.
    (await db.query(
      `insert into categorie (proprietario_id, padre_id, nome, tipo, colore, icona, ordine)
       values (fp_me(), $1, $2,
               coalesce($3, (select tipo from categorie where id = $1 and proprietario_id = fp_me()), 'uscita'),
               $4, $5, $6)
       returning ${CAMPI}`, valori)).rows[0]);
  res.status(201).json(categoria);
});

rotteCategorie.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const padre = v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id'));
  const set = v.setParziale({
    padre_id: padre,
    nome: v.testo(c, 'nome', false, 60),
    tipo: v.scelta(c, 'tipo', ['uscita', 'entrata'] as const),
    colore: v.annullabile(c, 'colore', () => leggiColore(c)),
    icona: v.annullabile(c, 'icona', () => v.testo(c, 'icona', false, 60)),
    ordine: v.intero(c, 'ordine', 0, 10000),
  }, 2);
  const categoria = await conUtente(res.locals.utenteId, async (db) => {
    if (padre) await controllaPadre(db, id, padre);
    return (await db.query(`update categorie set ${set.sql} where id = $1 returning ${CAMPI}`, [id, ...set.valori])).rows[0];
  });
  if (!categoria) throw nonTrovato('Categoria');
  res.json(categoria);
});

// Cancellare una categoria in uso richiede ?sposta_su=<id>: movimenti, spese,
// rate e sottocategorie passano a quella categoria.
rotteCategorie.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const destinazione = typeof req.query.sposta_su === 'string' ? v.idPercorso(req.query.sposta_su) : undefined;
  await conUtente(res.locals.utenteId, async (db) => {
    const esiste = await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [id]);
    if (!esiste.rowCount) throw nonTrovato('Categoria');

    if (destinazione) {
      if (destinazione === id) throw new ErroreApi(400, 'La categoria di destinazione deve essere diversa');
      const ok = await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [destinazione]);
      if (!ok.rowCount) throw nonTrovato('Categoria di destinazione');
      await controllaPadre(db, id, destinazione);
      await db.query('update categorie set padre_id = $2 where padre_id = $1', [id, destinazione]);
      for (const tabella of ['movimenti', 'spese_previste', 'rate']) {
        await db.query(`update ${tabella} set categoria_id = $2 where categoria_id = $1`, [id, destinazione]);
      }
    } else {
      const { rows } = await db.query<{ in_uso: boolean }>(
        `select exists (select 1 from categorie where padre_id = $1)
             or exists (select 1 from movimenti where categoria_id = $1)
             or exists (select 1 from spese_previste where categoria_id = $1)
             or exists (select 1 from rate where categoria_id = $1) as in_uso`, [id]);
      if (rows[0].in_uso) throw new ErroreApi(409, 'La categoria è in uso: indica dove spostare le voci con ?sposta_su=<id>');
    }
    await db.query('delete from categorie where id = $1', [id]);
  });
  res.status(204).end();
});
