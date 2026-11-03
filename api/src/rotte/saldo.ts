import { Router } from 'express';
import { conUtente } from '../db.ts';
import { leggiSaldo, scriviSaldo } from '../saldi.ts';
import * as v from '../valida.ts';

// Il saldo unico (decisione 72), calcolo in saldi.ts.
//   GET /saldo  ->  { sul_conto, scritto_il, uscite_spuntate, effettivo }   (tutto null/0.00 finché non lo scrivi)
//   PUT /saldo  { importo: "1234.50" | null }  scrive la cifra (riparte da adesso) e restituisce lo stesso oggetto; null la toglie.

export const rotteSaldo = Router();

rotteSaldo.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, leggiSaldo));
});

rotteSaldo.put('/', async (req, res) => {
  const c = v.corpo(req.body);
  const importo = v.annullabile(c, 'importo', () => v.importo(c, 'importo', true));
  res.json(await conUtente(res.locals.utenteId, (db) => scriviSaldo(db, importo ?? null)));
});
