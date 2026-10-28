import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { inizioMese, meseDi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Transazioni (decisione 61): da un conto a un altro, o da/verso «fuori». tipo: 'entrata' (da fuori), 'uscita' (verso fuori) o
// 'spostamento' (tra due conti). Le categorie e i budget contano solo entrate e uscite: uno spostamento non è una spesa.
// Le scrive la spunta di una spesa o di una rata (`da_spunta`: si cambiano togliendo la spunta) oppure si scrivono a mano.
//   ?conto=<id> | senza   solo le transazioni da o verso quel conto (senza = nessun conto)
//   ?mese=AAAA-MM         solo quel mese personale
//   ?limite=              di base 200, al massimo 500
// `modificabile` = scritta a mano da chi guarda. `mesi` sono i mesi personali che hanno transazioni (per il filtro).

export const rotteMovimenti = Router();

const TIPI = ['entrata', 'uscita', 'spostamento'] as const;
type Tipo = (typeof TIPI)[number];

const TIPO_SQL = `case when m.da_conto_id is not null and m.a_conto_id is not null then 'spostamento'
                      when m.a_conto_id is not null or m.verso = 'entrata' then 'entrata' else 'uscita' end`;

rotteMovimenti.get('/', async (req, res) => {
  const conto = typeof req.query.conto === 'string' ? req.query.conto : undefined;
  if (conto !== undefined && conto !== 'senza') v.idPercorso(conto);
  const limite = Math.min(500, Math.max(1, Number(req.query.limite ?? 200) || 200));
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = req.query.mese === undefined ? null : await periodoRichiesto(db, req.query.mese);
    const filtro = `($1::text is null or ($1 = 'senza' and m.da_conto_id is null and m.a_conto_id is null) or m.da_conto_id::text = $1 or m.a_conto_id::text = $1)`;
    const movimenti = (await db.query(
      `select m.id, ${TIPO_SQL} as tipo, m.importo::text as importo, m.momento, m.momento::date as data, m.descrizione,
              m.da_conto_id, cd.nome as da, m.a_conto_id, ca.nome as a, m.categoria_id, cat.nome as categoria, m.budget_id,
              (m.spunta_id is not null) as da_spunta, u.nome as utente, (m.utente_id = fp_me() and m.spunta_id is null) as modificabile
         from movimenti m
         left join conti cd on cd.id = m.da_conto_id
         left join conti ca on ca.id = m.a_conto_id
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

// ---- Scrivere, cambiare e togliere una transazione a mano ----
// Campi: tipo, importo (positivo), conto_id (entrata e uscita, facoltativo), da_conto_id e a_conto_id (spostamento, diversi), data
// (AAAA-MM-GG) e ora (HH:MM) (di base adesso; un altro giorno senza ora = mezzogiorno), descrizione, categoria_id (entrate e uscite).

function ora(c: Record<string, unknown>): string | undefined {
  const t = v.testo(c, 'ora', false, 5);
  if (t !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ErroreApi(400, 'Il campo "ora" deve essere HH:MM');
  return t;
}

async function momentoScelto(db: PoolClient, data: string | undefined, oraScelta: string | undefined, esistente: string | null) {
  const { rows } = await db.query<{ momento: string }>(
    `select (case when $1::date is null and $2::time is null then coalesce($3::timestamptz, now())
                  else (coalesce($1::date, ($3::timestamptz)::date, current_date)
                        + coalesce($2::time, ($3::timestamptz)::time,
                                   case when coalesce($1::date, current_date) = current_date then localtime(0) else time '12:00' end))::timestamptz end)::text as momento`,
    [data ?? null, oraScelta ?? null, esistente]);
  return rows[0].momento;
}

type Attuale = { tipo: Tipo; da_conto_id: string | null; a_conto_id: string | null; importo: string; descrizione: string; categoria_id: string | null; momento: string };

async function contoVisibile(db: PoolClient, id: string | null) {
  if (id && !(await db.query('select 1 from conti where id = $1', [id])).rowCount) throw nonTrovato('Conto');
}

async function leggiCorpo(db: PoolClient, c: Record<string, unknown>, att: Attuale | null) {
  const tipo = v.scelta(c, 'tipo', TIPI, !att) ?? att!.tipo;
  const importo = v.importo(c, 'importo', !att) ?? att!.importo;
  if (!(Number(importo) > 0)) throw new ErroreApi(400, "L'importo deve essere positivo");
  const prima = att ? (att.tipo === 'uscita' ? att.da_conto_id : att.tipo === 'entrata' ? att.a_conto_id : null) : null;
  let da: string | null, a: string | null;
  if (tipo === 'spostamento') {
    da = v.id(c, 'da_conto_id') ?? att?.da_conto_id ?? null;
    a = v.id(c, 'a_conto_id') ?? att?.a_conto_id ?? null;
    if (!da) throw new ErroreApi(400, 'Il campo "da_conto_id" è obbligatorio');
    if (!a) throw new ErroreApi(400, 'Il campo "a_conto_id" è obbligatorio');
    if (da === a) throw new ErroreApi(400, 'I due conti devono essere diversi');
  } else {
    let conto = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id'));
    if (conto === undefined) conto = prima;
    [da, a] = tipo === 'uscita' ? [conto ?? null, null] : [null, conto ?? null];
  }
  await contoVisibile(db, da);
  await contoVisibile(db, a);
  let categoria = v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id'));
  if (categoria === undefined) categoria = att?.categoria_id ?? null;
  if (tipo === 'spostamento') {
    if (c.categoria_id) throw new ErroreApi(400, 'Uno spostamento tra due conti non ha categoria: non è una spesa');
    categoria = null;
  }
  let nomeCategoria: string | null = null;
  if (categoria) {
    const k = (await db.query<{ nome: string }>('select nome from categorie where id = $1 and proprietario_id = fp_me()', [categoria])).rows[0];
    if (!k) throw nonTrovato('Categoria');
    nomeCategoria = k.nome;
  }
  let descrizione = v.testo(c, 'descrizione', false, 120);
  if (descrizione === undefined && att && !('descrizione' in c)) descrizione = att.descrizione;
  if (!descrizione) {
    if (tipo === 'spostamento') {
      const nomi = (await db.query<{ id: string; nome: string }>('select id, nome from conti where id = any($1)', [[da, a]])).rows;
      descrizione = `Spostamento: ${nomi.find((x) => x.id === da)?.nome} → ${nomi.find((x) => x.id === a)?.nome}`;
    } else descrizione = nomeCategoria ?? (tipo === 'entrata' ? 'Entrata' : 'Uscita');
  }
  const momento = await momentoScelto(db, v.data(c, 'data'), ora(c), att?.momento ?? null);
  return { tipo, da, a, verso: !da && !a ? tipo : null, importo, momento, descrizione, categoria };
}

rotteMovimenti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const id = await conUtente(res.locals.utenteId, async (db) => {
    const m = await leggiCorpo(db, c, null);
    return (await db.query<{ id: string }>(
      `insert into movimenti (utente_id, da_conto_id, a_conto_id, verso, importo, momento, descrizione, categoria_id)
       values (fp_me(), $1, $2, $3, $4, $5::timestamptz, $6, $7) returning id`,
      [m.da, m.a, m.verso, m.importo, m.momento, m.descrizione, m.categoria])).rows[0].id;
  });
  res.status(201).json({ id });
});

// La transazione a mano di chi chiama (404 se non si vede; 403 se è di un altro o nasce da una spunta).
async function mioMovimento(db: PoolClient, id: string): Promise<Attuale> {
  const r = (await db.query<Attuale & { mio: boolean; da_spunta: boolean }>(
    `select ${TIPO_SQL} as tipo, m.utente_id = fp_me() as mio, m.spunta_id is not null as da_spunta, m.importo::text as importo, m.descrizione,
            m.da_conto_id, m.a_conto_id, m.categoria_id, m.momento::text as momento
       from movimenti m where m.id = $1`, [id])).rows[0];
  if (!r) throw nonTrovato('Movimento');
  if (r.da_spunta) throw new ErroreApi(409, 'Questa transazione nasce dalla spunta di una spesa: si cambia togliendo la spunta');
  if (!r.mio) throw new ErroreApi(403, 'Solo chi ha scritto la transazione la può cambiare');
  return r;
}

rotteMovimenti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  await conUtente(res.locals.utenteId, async (db) => {
    const m = await leggiCorpo(db, c, await mioMovimento(db, id));
    await db.query(
      `update movimenti set da_conto_id = $2, a_conto_id = $3, verso = $4, importo = $5, momento = $6::timestamptz, descrizione = $7, categoria_id = $8,
              budget_id = case when $3::uuid is null then budget_id end where id = $1`,
      [id, m.da, m.a, m.verso, m.importo, m.momento, m.descrizione, m.categoria]);
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
