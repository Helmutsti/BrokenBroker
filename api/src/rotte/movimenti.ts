import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { inizioMese, meseDi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Movimenti (decisione 59): uno strumento a parte, insieme ai budget. Sono le entrate e le uscite scritte a mano (anche quelle registrate
// da un budget); non toccano Spese, Panoramica o altre pagine. Il conto è solo un'etichetta: nessun saldo si muove.
//   ?conto=<id> | senza   solo i movimenti con quell'etichetta (senza = senza conto)
//   ?mese=AAAA-MM         solo quel mese personale
//   ?limite=              di base 200, al massimo 500
// Si vedono i propri e le uscite dei budget condivisi; `modificabile` = scritto da chi guarda (solo lui lo cambia e lo toglie).
// `mesi` sono i mesi personali che hanno movimenti (per il filtro).

export const rotteMovimenti = Router();

const TIPI = ['entrata', 'uscita'] as const;
type Tipo = (typeof TIPI)[number];

rotteMovimenti.get('/', async (req, res) => {
  const conto = typeof req.query.conto === 'string' ? req.query.conto : undefined;
  if (conto !== undefined && conto !== 'senza') v.idPercorso(conto);
  const limite = Math.min(500, Math.max(1, Number(req.query.limite ?? 200) || 200));
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = req.query.mese === undefined ? null : await periodoRichiesto(db, req.query.mese);
    const filtro = `($1::text is null or ($1 = 'senza' and m.conto_id is null) or m.conto_id::text = $1)`;
    const movimenti = (await db.query(
      `select m.id, m.tipo, m.importo::text as importo, m.momento, m.momento::date as data, m.descrizione,
              m.conto_id, c.nome as conto, c.icona as conto_icona, m.categoria_id, cat.nome as categoria, m.budget_id,
              u.nome as utente, (m.utente_id = fp_me()) as modificabile
         from movimenti m
         left join conti c on c.id = m.conto_id
         left join categorie cat on cat.id = m.categoria_id
         left join utenti u on u.id = m.utente_id
        where ${filtro} and ($2::date is null or (m.momento >= $2::date and m.momento < $3::date + 1))
        order by m.momento desc, m.id desc limit $4`,
      [conto ?? null, p?.dal ?? null, p?.al ?? null, limite])).rows;
    const inizio = await inizioMese(db);
    const giorni = (await db.query<{ data: string }>(`select distinct m.momento::date as data from movimenti m where ${filtro}`, [conto ?? null])).rows;
    const mesi = [...new Set(giorni.map((x) => meseDi(x.data, inizio)))].sort().reverse();
    return { movimenti, mesi, mese_in_corso: (await periodoRichiesto(db, undefined)).mese };
  });
  res.json(risposta);
});

// ---- Scrivere, cambiare e togliere un movimento ----
// Campi: tipo ('entrata' o 'uscita'), importo (positivo), conto_id (etichetta, facoltativa), data (AAAA-MM-GG) e ora (HH:MM) (di base
// adesso; un altro giorno senza ora = mezzogiorno), descrizione, categoria_id (solo uscite: conta nel budget di quella categoria).

function ora(c: Record<string, unknown>): string | undefined {
  const t = v.testo(c, 'ora', false, 5);
  if (t !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ErroreApi(400, 'Il campo "ora" deve essere HH:MM');
  return t;
}

// Il momento scelto (testo per il database). Senza data né ora: quello che c'era (o adesso).
async function momentoScelto(db: PoolClient, data: string | undefined, oraScelta: string | undefined, esistente: string | null) {
  const { rows } = await db.query<{ momento: string }>(
    `select (case when $1::date is null and $2::time is null then coalesce($3::timestamptz, now())
                  else (coalesce($1::date, ($3::timestamptz)::date, current_date)
                        + coalesce($2::time, ($3::timestamptz)::time,
                                   case when coalesce($1::date, current_date) = current_date then localtime(0) else time '12:00' end))::timestamptz end)::text as momento`,
    [data ?? null, oraScelta ?? null, esistente]);
  return rows[0].momento;
}

type Attuale = { tipo: Tipo; conto_id: string | null; importo: string; descrizione: string; categoria_id: string | null; momento: string };

// Legge e controlla il corpo (completo alla creazione, parziale nella modifica: i campi mancanti restano come sono).
async function leggiCorpo(db: PoolClient, c: Record<string, unknown>, att: Attuale | null) {
  const tipo = v.scelta(c, 'tipo', TIPI, !att) ?? att!.tipo;
  const importo = v.importo(c, 'importo', !att) ?? att!.importo;
  if (!(Number(importo) > 0)) throw new ErroreApi(400, "L'importo deve essere positivo");
  let conto = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id'));
  if (conto === undefined) conto = att?.conto_id ?? null;
  if (conto && !(await db.query('select 1 from conti where id = $1', [conto])).rowCount) throw nonTrovato('Conto');
  let categoria = v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id'));
  if (categoria === undefined) categoria = att?.categoria_id ?? null;
  if (tipo !== 'uscita') {
    if (c.categoria_id) throw new ErroreApi(400, 'La categoria serve solo alle uscite');
    categoria = null;
  }
  let nomeCategoria: string | null = null;
  if (categoria) {
    const k = (await db.query<{ nome: string }>(`select nome from categorie where id = $1 and proprietario_id = fp_me() and tipo = 'uscita'`, [categoria])).rows[0];
    if (!k) throw nonTrovato('Categoria');
    nomeCategoria = k.nome;
  }
  let descrizione = v.testo(c, 'descrizione', false, 120);
  if (descrizione === undefined && att && !('descrizione' in c)) descrizione = att.descrizione;
  if (!descrizione) descrizione = tipo === 'entrata' ? 'Entrata' : nomeCategoria ?? 'Uscita';
  const momento = await momentoScelto(db, v.data(c, 'data'), ora(c), att?.momento ?? null);
  return { tipo, conto, importo, momento, descrizione, categoria };
}

rotteMovimenti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const id = await conUtente(res.locals.utenteId, async (db) => {
    const m = await leggiCorpo(db, c, null);
    return (await db.query<{ id: string }>(
      `insert into movimenti (utente_id, tipo, importo, momento, descrizione, conto_id, categoria_id)
       values (fp_me(), $1, $2, $3::timestamptz, $4, $5, $6) returning id`,
      [m.tipo, m.importo, m.momento, m.descrizione, m.conto, m.categoria])).rows[0].id;
  });
  res.status(201).json({ id });
});

// Il movimento di chi chiama, com'è adesso (404 se non si vede; 403 se è di un altro).
async function mioMovimento(db: PoolClient, id: string): Promise<Attuale> {
  const r = (await db.query<Attuale & { mio: boolean }>(
    `select tipo, utente_id = fp_me() as mio, importo::text as importo, descrizione, conto_id, categoria_id, momento::text as momento
       from movimenti where id = $1`, [id])).rows[0];
  if (!r) throw nonTrovato('Movimento');
  if (!r.mio) throw new ErroreApi(403, 'Solo chi ha scritto il movimento lo può cambiare');
  return r;
}

rotteMovimenti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  await conUtente(res.locals.utenteId, async (db) => {
    const m = await leggiCorpo(db, c, await mioMovimento(db, id));
    await db.query(
      `update movimenti set tipo = $2, importo = $3, momento = $4::timestamptz, descrizione = $5, conto_id = $6, categoria_id = $7,
              budget_id = case when $2 = 'uscita' then budget_id end where id = $1`,
      [id, m.tipo, m.importo, m.momento, m.descrizione, m.conto, m.categoria]);
  });
  res.json({ id });
});

rotteMovimenti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    await mioMovimento(db, id);
    await db.query('delete from movimenti where id = $1', [id]);
  });
  res.status(204).end();
});
