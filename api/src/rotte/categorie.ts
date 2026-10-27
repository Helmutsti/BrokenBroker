import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { periodoRichiesto } from '../periodo.ts';
import { leggiRate, scadenzaRata } from '../rate.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';

export const rotteCategorie = Router();

const CAMPI = 'id, padre_id, nome, tipo, colore, icona, ordine';

type Categoria = { id: string; padre_id: string | null; nome: string; tipo: string; colore: string | null; icona: string | null; ordine: number;
  // Il budget di questa categoria, se c'è (decisione 49): uno per categoria.
  budget: { id: string; importo: string; attivo: boolean } | null };
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
    (await db.query<Categoria>(
      `select ${CAMPI.split(', ').map((x) => `c.${x}`).join(', ')},
              (select jsonb_build_object('id', b.id, 'importo', b.importo::text, 'attivo', b.attivo)
                 from budget b where b.categoria_id = c.id) as budget
         from categorie c where c.proprietario_id = fp_me() order by c.ordine, c.nome`)).rows);
  res.json(req.query.formato === 'elenco' ? righe : albero(righe));
});

// Quanto pesa ogni categoria nel mese (?mese=AAAA-MM), senza le sottocategorie: le spese
// previste del mese (la quota di chi guarda) e le rate che scadono, spuntate o no.
// I budget (decisione 58) non contano: sono solo una lente sui movimenti di una categoria, non una spesa.
// I promemoria dei salvadanai non sono spese. La somma sui rami la fa chi legge l'albero.
rotteCategorie.get('/spese', async (req, res) => {
  const righe = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const per = new Map<string, number>();
    for (const s of await speseDelMese(db, p)) {
      if (s.categoria_id && s.attiva && s.nel_mese && !s.alimenta_obiettivo_id) per.set(s.categoria_id, (per.get(s.categoria_id) ?? 0) + Number(s.mia_quota));
    }
    for (const r of await leggiRate(db)) {
      if (r.categoria_id && r.attiva && scadenzaRata(r, p)) per.set(r.categoria_id, (per.get(r.categoria_id) ?? 0) + Number(r.importo_rata));
    }
    return [...per].map(([categoria_id, speso]) => ({ categoria_id, speso: speso.toFixed(2) }));
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

// Cancellare una categoria in uso richiede ?sposta_su=<id>: spese (anche quelle condivise
// ricevute), rate e sottocategorie passano a quella categoria.
rotteCategorie.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const destinazione = typeof req.query.sposta_su === 'string' ? v.idPercorso(req.query.sposta_su) : undefined;
  await conUtente(res.locals.utenteId, async (db) => {
    const esiste = await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [id]);
    if (!esiste.rowCount) throw nonTrovato('Categoria');
    if ((await db.query('select 1 from budget where categoria_id = $1', [id])).rowCount) throw new ErroreApi(409, 'Questa categoria ha un budget: eliminalo prima dalla pagina Budget');

    if (destinazione) {
      if (destinazione === id) throw new ErroreApi(400, 'La categoria di destinazione deve essere diversa');
      const ok = await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [destinazione]);
      if (!ok.rowCount) throw nonTrovato('Categoria di destinazione');
      await controllaPadre(db, id, destinazione);
      await db.query('update categorie set padre_id = $2 where padre_id = $1', [id, destinazione]);
      for (const tabella of ['spese_previste', 'rate']) {
        await db.query(`update ${tabella} set categoria_id = $2 where categoria_id = $1`, [id, destinazione]);
      }
      // Anche le spese condivise ricevute, che hanno la categoria in spese_dati_utente (decisione 43).
      await db.query('update spese_dati_utente set categoria_id = $2 where categoria_id = $1 and utente_id = fp_me()', [id, destinazione]);
    } else {
      const { rows } = await db.query<{ in_uso: boolean }>(
        `select exists (select 1 from categorie where padre_id = $1)
             or exists (select 1 from spese_previste where categoria_id = $1)
             or exists (select 1 from spese_dati_utente where categoria_id = $1)
             or exists (select 1 from rate where categoria_id = $1) as in_uso`, [id]);
      if (rows[0].in_uso) throw new ErroreApi(409, 'La categoria è in uso: indica dove spostare le voci con ?sposta_su=<id>');
    }
    await db.query('delete from categorie where id = $1', [id]);
  });
  res.status(204).end();
});
