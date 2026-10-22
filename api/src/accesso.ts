import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';
import { pool } from './db.ts';
import { ErroreApi } from './errori.ts';

// Password protette con scrypt (incluso in Node, nessuna dipendenza).
// Formato salvato: scrypt$N$r$p$sale$hash, tutto in base64url.

const scryptAsync = promisify(scrypt) as (pwd: string, sale: Buffer, len: number, opz: object) => Promise<Buffer>;
const PARAMETRI = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LUNGHEZZA = 32;
const DURATA_SESSIONE_GIORNI = 30;

export async function proteggiPassword(password: string): Promise<string> {
  const sale = randomBytes(16);
  const hash = await scryptAsync(password, sale, LUNGHEZZA, PARAMETRI);
  return ['scrypt', PARAMETRI.N, PARAMETRI.r, PARAMETRI.p, sale.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verificaPassword(password: string, salvato: string): Promise<boolean> {
  const [schema, N, r, p, sale, hash] = salvato.split('$');
  if (schema !== 'scrypt' || !sale || !hash) return false;
  const atteso = Buffer.from(hash, 'base64url');
  const calcolato = await scryptAsync(password, Buffer.from(sale, 'base64url'), atteso.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMETRI.maxmem,
  });
  return timingSafeEqual(atteso, calcolato);
}

// Il token va al client; nel database si salva solo la sua impronta.
const impronta = (token: string) => createHash('sha256').update(token).digest();

export async function apriSessione(utenteId: string): Promise<{ token: string; scade_il: string }> {
  const token = randomBytes(32).toString('base64url');
  const scade = new Date(Date.now() + DURATA_SESSIONE_GIORNI * 24 * 3600 * 1000);
  await pool.query('select fp_apri_sessione($1, $2, $3)', [utenteId, impronta(token), scade]);
  return { token, scade_il: scade.toISOString() };
}

export async function chiudiSessione(token: string): Promise<void> {
  await pool.query('select fp_chiudi_sessione($1)', [impronta(token)]);
}

export function tokenDa(intestazione: string | undefined): string | undefined {
  const [tipo, valore] = (intestazione ?? '').split(' ');
  return tipo === 'Bearer' && valore ? valore : undefined;
}

// Richiede "Authorization: Bearer <token>" e mette l'utente in res.locals.utenteId.
export const autentica: RequestHandler = async (req, res, next) => {
  const token = tokenDa(req.headers.authorization);
  if (!token) throw new ErroreApi(401, 'Accesso richiesto');
  const { rows } = await pool.query<{ id: string | null }>('select fp_utente_sessione($1) as id', [impronta(token)]);
  if (!rows[0]?.id) throw new ErroreApi(401, 'Sessione scaduta o non valida');
  res.locals.utenteId = rows[0].id;
  res.locals.token = token;
  next();
};
