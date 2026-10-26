import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { caricaDati, elencoPortafogli, riassuntoPortafoglio, riepilogo } from '../investimenti.ts';
import * as v from '../valida.ts';

// Portafogli: contenitori privati di investimenti, separati dai conti.
// conta_nel_patrimonio = false: portafoglio di prova, fuori dai totali generali.

export const rottePortafogli = Router();

function leggiPortafoglio(c: Record<string, unknown>, nuovo: boolean) {
  return {
    nome: v.testo(c, 'nome', nuovo, 80), icona: v.testo(c, 'icona', false, 40),
    conta_nel_patrimonio: v.booleano(c, 'conta_nel_patrimonio'),
  };
}

async function riassunto(db: Parameters<typeof caricaDati>[0], id: string) {
  const d = await caricaDati(db);
  const p = d.portafogli.find((x) => x.id === id);
  if (!p) throw nonTrovato('Portafoglio');
  return riassuntoPortafoglio(d, p);
}

// Elenco con i totali di ciascuno (anche di prova).
rottePortafogli.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, elencoPortafogli));
});

// Un portafoglio con le sue posizioni e i suoi beni (anche se di prova).
rottePortafogli.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  res.json(await conUtente(res.locals.utenteId, async (db) => {
    const d = await caricaDati(db);
    const p = d.portafogli.find((x) => x.id === id);
    if (!p) throw nonTrovato('Portafoglio');
    return { ...riassuntoPortafoglio(d, p), ...riepilogo(d, new Set([id])) };
  }));
});

rottePortafogli.post('/', async (req, res) => {
  const c = leggiPortafoglio(v.corpo(req.body), true);
  const portafoglio = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'insert into portafogli (proprietario_id, nome, icona, conta_nel_patrimonio) values (fp_me(), $1, coalesce($2, \'briefcase\'), coalesce($3, true)) returning id',
      [c.nome, c.icona ?? null, c.conta_nel_patrimonio ?? null]);
    return riassunto(db, rows[0].id);
  });
  res.status(201).json(portafoglio);
});

rottePortafogli.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const set = v.setParziale(leggiPortafoglio(v.corpo(req.body), false), 2);
  const portafoglio = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query(`update portafogli set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    return riassunto(db, id);
  });
  if (!portafoglio) throw nonTrovato('Portafoglio');
  res.json(portafoglio);
});

// Si cancella solo se è vuoto; altrimenti 409 (prima si svuota).
rottePortafogli.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from portafogli where id = $1', [id])).rowCount) throw nonTrovato('Portafoglio');
    const dentro = (await db.query<{ lotti: string; beni: string }>(
      'select (select count(*) from lotti where portafoglio_id = $1) as lotti, (select count(*) from beni where portafoglio_id = $1) as beni', [id])).rows[0];
    if (Number(dentro.lotti) + Number(dentro.beni) > 0)
      throw new ErroreApi(409, `Il portafoglio non è vuoto (${dentro.lotti} titoli, ${dentro.beni} beni): sposta o elimina prima titoli e beni`);
    await db.query('delete from portafogli where id = $1', [id]);
  });
  res.status(204).end();
});
