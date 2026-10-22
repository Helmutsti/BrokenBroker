import { Router } from 'express';
import { conUtente } from '../db.ts';
import * as v from '../valida.ts';

export const rotteProfilo = Router();

const CAMPI = 'id, email, nome, stipendio_netto, giorno_paga, inizio_mese, creato_il';

rotteProfilo.get('/', async (_req, res) => {
  const me = res.locals.utenteId;
  const profilo = await conUtente(me, async (db) =>
    (await db.query(`select ${CAMPI} from utenti where id = $1`, [me])).rows[0]);
  res.json(profilo);
});

rotteProfilo.patch('/', async (req, res) => {
  const me = res.locals.utenteId;
  const c = v.corpo(req.body);
  const set = v.setParziale({
    nome: v.testo(c, 'nome', false, 80),
    stipendio_netto: v.annullabile(c, 'stipendio_netto', () => v.importo(c, 'stipendio_netto')),
    giorno_paga: v.annullabile(c, 'giorno_paga', () => v.intero(c, 'giorno_paga', 1, 31)),
    inizio_mese: v.intero(c, 'inizio_mese', 1, 28),
  }, 2);
  const profilo = await conUtente(me, async (db) =>
    (await db.query(`update utenti set ${set.sql} where id = $1 returning ${CAMPI}`, [me, ...set.valori])).rows[0]);
  res.json(profilo);
});
