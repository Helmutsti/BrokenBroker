import { Router } from 'express';
import { conUtente } from '../db.ts';
import { nonTrovato } from '../errori.ts';
import { oggi } from '../periodo.ts';
import * as v from '../valida.ts';

export const rotteProfilo = Router();

// conto_principale_id: il conto da cui parte la pagina Spese (decisione 61).
const CAMPI = 'id, email, nome, stipendio_netto, giorno_paga, inizio_mese, creato_il, sul_conto::text as sul_conto, sul_conto_al, conto_principale_id';

rotteProfilo.get('/', async (_req, res) => {
  const me = res.locals.utenteId;
  const profilo = await conUtente(me, async (db) =>
    (await db.query(`select ${CAMPI} from utenti where id = $1`, [me])).rows[0]);
  res.json(profilo);
});

rotteProfilo.patch('/', async (req, res) => {
  const me = res.locals.utenteId;
  const c = v.corpo(req.body);
  const conti = {
    conto_principale_id: v.annullabile(c, 'conto_principale_id', () => v.id(c, 'conto_principale_id')),
  };
  const set = v.setParziale({
    nome: v.testo(c, 'nome', false, 80),
    stipendio_netto: v.annullabile(c, 'stipendio_netto', () => v.importo(c, 'stipendio_netto')),
    giorno_paga: v.annullabile(c, 'giorno_paga', () => v.intero(c, 'giorno_paga', 1, 31)),
    inizio_mese: v.intero(c, 'inizio_mese', 1, 28),
    // "Sul conto oggi": quando lo scrivi, la data è oggi.
    sul_conto: v.annullabile(c, 'sul_conto', () => v.importo(c, 'sul_conto')),
    sul_conto_al: c.sul_conto === undefined ? undefined : c.sul_conto === null ? null : oggi(),
    ...conti,
  }, 2);
  const profilo = await conUtente(me, async (db) => {
    for (const id of Object.values(conti)) if (id && !(await db.query('select 1 from conti where id = $1', [id])).rowCount) throw nonTrovato('Conto');
    const p = (await db.query(`update utenti set ${set.sql} where id = $1 returning ${CAMPI}`, [me, ...set.valori])).rows[0];
    return p;
  });
  res.json(profilo);
});
