import { Router } from 'express';
import { pool } from '../db.ts';
import { ErroreApi } from '../errori.ts';
import { apriSessione, autentica, chiudiSessione, proteggiPassword, verificaPassword } from '../accesso.ts';
import * as v from '../valida.ts';

export const rotteAccesso = Router();

const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

rotteAccesso.post('/registrazione', async (req, res) => {
  const c = v.corpo(req.body);
  const email = v.testo(c, 'email', true, 254)!;
  const nome = v.testo(c, 'nome', true, 80)!;
  const password = v.testo(c, 'password', true, 200)!;
  if (!formatoEmail.test(email)) throw new ErroreApi(400, 'Email non valida');
  if (password.length < 10) throw new ErroreApi(400, 'La password deve avere almeno 10 caratteri');

  const hash = await proteggiPassword(password);
  const { rows } = await pool.query<{ id: string }>('select fp_registra($1, $2, $3) as id', [email, nome, hash]);
  res.status(201).json({ utente_id: rows[0].id, ...(await apriSessione(rows[0].id)) });
});

rotteAccesso.post('/accesso', async (req, res) => {
  const c = v.corpo(req.body);
  const email = v.testo(c, 'email', true, 254)!;
  const password = v.testo(c, 'password', true, 200)!;

  const { rows } = await pool.query<{ id: string; password_hash: string }>('select * from fp_credenziali($1)', [email]);
  const ok = rows[0] ? await verificaPassword(password, rows[0].password_hash) : false;
  if (!ok) throw new ErroreApi(401, 'Email o password errate');
  res.json({ utente_id: rows[0].id, ...(await apriSessione(rows[0].id)) });
});

rotteAccesso.post('/uscita', autentica, async (_req, res) => {
  await chiudiSessione(res.locals.token);
  res.status(204).end();
});
