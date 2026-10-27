import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { mesePassato, NIENTE } from '../movimenti.ts';
import { inizioMese, meseDi, oggi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Tutti i movimenti dei conti che si vedono (decisioni 48 e 51), dal più recente. Ognuno ha una sorgente («da») e una destinazione («a»):
// spunte di spese e rate, versamenti e prelievi dei salvadanai e uscite di budget vanno da un conto a «Niente» (uscita) o tornano da
// «Niente» (entrata); i giroconti vanno da un conto a un altro. «Niente» non ha nome: `da_niente` / `a_niente` lo dicono.
//   ?conto=<id> | senza   solo i movimenti in cui quel conto è sorgente o destinazione (senza = uscite di budget senza conto)
//   ?mese=AAAA-MM         solo quel mese personale
//   ?limite=              di base 200, al massimo 500
// `importo` è sempre positivo; `segno` lo dà visto dal filtro: con un conto scelto +1 se arrivano soldi a quel conto e -1 se escono;
// senza filtro +1 se entrano soldi nei tuoi conti, -1 se escono, 0 se restano tra i tuoi conti (giroconto). `conta` dice se il
// movimento è dopo il saldo di partenza (e quindi dentro il saldo attuale): gli altri erano già nel saldo scritto.
// `mesi` sono i mesi personali che hanno movimenti (per il filtro).
// `modificabile` = movimento scritto a mano (causa 'a_mano') da chi guarda, in un mese non passato: si può cambiare e togliere (decisione 53).
// `categoria_id` / `categoria`: la categoria di un'uscita (se c'è e se è di chi guarda).

export const rotteMovimenti = Router();

rotteMovimenti.get('/', async (req, res) => {
  const conto = typeof req.query.conto === 'string' ? req.query.conto : undefined;
  if (conto !== undefined && conto !== 'senza') v.idPercorso(conto);
  const limite = Math.min(500, Math.max(1, Number(req.query.limite ?? 200) || 200));
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = req.query.mese === undefined ? null : await periodoRichiesto(db, req.query.mese);
    if (req.query.mese !== undefined && !p) throw new ErroreApi(400, 'Il mese deve essere AAAA-MM');
    const inizio = await inizioMese(db);
    // Solo i movimenti di cui si vede almeno un conto (più le uscite di budget senza conto): lo garantisce la visibilità del database.
    const base = `from movimenti_conto m
        left join conti cd on cd.id = m.da_conto_id
        left join conti ca on ca.id = m.a_conto_id
        left join utenti u on u.id = m.utente_id
        left join categorie cat on cat.id = m.categoria_id`;
    const filtro = `($1::text is null or ($1 = 'senza' and m.da_conto_id is null) or m.da_conto_id::text = $1 or m.a_conto_id::text = $1)`;
    const righe = (await db.query(
      `select m.id, m.importo::text as importo, m.momento, m.momento::date as data, m.causa, m.descrizione,
              cd.id as da_conto_id, cd.nome as da, (m.da_conto_id is null) as da_senza_conto, cd.icona as da_icona, (m.da_conto_id = fp_niente()) as da_niente,
              ca.id as a_conto_id, ca.nome as a, ca.icona as a_icona, (m.a_conto_id = fp_niente()) as a_niente,
              u.nome as utente, m.budget_id, m.categoria_id, cat.nome as categoria, (m.causa = 'a_mano' and m.utente_id = fp_me()) as mio_a_mano,
              case when $1::text is not null and $1 <> 'senza' then (case when m.a_conto_id::text = $1 then 1 else -1 end)
                   else (case when ca.id is not null and ca.id <> fp_niente() then 1 else 0 end)
                      - (case when cd.id is not null and cd.id <> fp_niente() then 1 else 0 end) end as segno,
              (m.da_conto_id is null
               or (case when $1::text is not null and $1 <> 'senza'
                        then (select (k.saldo_partenza_il is not null and m.momento > k.saldo_partenza_il) from conti k where k.id::text = $1)
                        else coalesce(ca.saldo_partenza_il < m.momento, false) or coalesce(cd.saldo_partenza_il < m.momento, false) end)) as conta
         ${base}
        where ${filtro}
          and (m.da_conto_id is null or cd.id is not null or ca.id is not null)
          and ($2::date is null or (m.momento >= $2::date and m.momento < $3::date + 1))
        order by m.momento desc, m.id desc limit $4`,
      [conto ?? null, p?.dal ?? null, p?.al ?? null, limite])).rows;
    const giorni = (await db.query<{ data: string }>(
      `select distinct m.momento::date as data ${base} where ${filtro} and (m.da_conto_id is null or cd.id is not null or ca.id is not null)`, [conto ?? null])).rows;
    const mesi = [...new Set(giorni.map((x) => meseDi(x.data, inizio)))].sort().reverse();
    const adesso = await periodoRichiesto(db, undefined);
    const movimenti = righe.map(({ mio_a_mano, ...r }) => ({ ...r, modificabile: mio_a_mano && meseDi(r.data, adesso.inizio) >= adesso.mese }));
    return { movimenti, mesi, mese_in_corso: (await periodoRichiesto(db, undefined)).mese };
  });
  res.json(risposta);
});

// ---- Movimenti scritti a mano (decisione 53) ----
// tipo: 'entrata' (Niente -> conto), 'uscita' (conto -> Niente, con categoria facoltativa che conta nel budget di quella categoria) o
// 'giroconto' (conto -> conto). Campi: tipo, importo (positivo), conto_id (entrata e uscita), da_conto_id e a_conto_id (giroconto, diversi),
// data (AAAA-MM-GG) e ora (HH:MM) (di base adesso; un altro giorno senza ora = mezzogiorno), descrizione, categoria_id (solo uscite).
// Non nei mesi personali passati (409), né per scriverli né per cambiarli o toglierli. Solo l'autore li cambia e li toglie.

type Tipo = 'entrata' | 'uscita' | 'giroconto';
const TIPI = ['entrata', 'uscita', 'giroconto'] as const;

async function contoVisibile(db: PoolClient, id: string) {
  if (!(await db.query('select 1 from conti where id = $1', [id])).rowCount) throw nonTrovato('Conto');
}

function ora(c: Record<string, unknown>): string | undefined {
  const t = v.testo(c, 'ora', false, 5);
  if (t !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ErroreApi(400, 'Il campo "ora" deve essere HH:MM');
  return t;
}

// Il momento scelto (testo per il database) e il suo giorno. Senza data né ora: quello che c'era (o adesso).
async function momentoScelto(db: PoolClient, data: string | undefined, oraScelta: string | undefined, esistente: string | null) {
  const { rows } = await db.query<{ momento: string; giorno: string }>(
    `select m::text as momento, m::date::text as giorno from (select
       case when $1::date is null and $2::time is null then coalesce($3::timestamptz, now())
            else (coalesce($1::date, ($3::timestamptz)::date, current_date)
                  + coalesce($2::time, ($3::timestamptz)::time,
                             case when coalesce($1::date, current_date) = current_date then localtime(0) else time '12:00' end))::timestamptz end as m) x`,
    [data ?? null, oraScelta ?? null, esistente]);
  return rows[0];
}

type Attuale = { tipo: Tipo; conto_id: string | null; da_conto_id: string | null; a_conto_id: string | null; importo: string; descrizione: string; categoria_id: string | null; momento: string };

// Legge e controlla il corpo (completo alla creazione, parziale nella modifica: i campi mancanti restano come sono).
async function leggiCorpo(db: PoolClient, c: Record<string, unknown>, att: Attuale | null) {
  const tipo = v.scelta(c, 'tipo', TIPI, !att) ?? att!.tipo;
  const importo = v.importo(c, 'importo', !att) ?? att!.importo;
  if (!(Number(importo) > 0)) throw new ErroreApi(400, "L'importo deve essere positivo");
  const contoId = v.id(c, 'conto_id') ?? att?.conto_id ?? null;
  const daId = v.id(c, 'da_conto_id') ?? (att?.tipo === 'giroconto' ? att.da_conto_id : null);
  const aId = v.id(c, 'a_conto_id') ?? (att?.tipo === 'giroconto' ? att.a_conto_id : null);
  let da: string, a: string;
  if (tipo === 'giroconto') {
    if (!daId) throw new ErroreApi(400, 'Il campo "da_conto_id" è obbligatorio');
    if (!aId) throw new ErroreApi(400, 'Il campo "a_conto_id" è obbligatorio');
    if (daId === aId) throw new ErroreApi(400, 'I due conti devono essere diversi');
    [da, a] = [daId, aId];
  } else {
    if (!contoId) throw new ErroreApi(400, 'Il campo "conto_id" è obbligatorio');
    [da, a] = tipo === 'uscita' ? [contoId, NIENTE] : [NIENTE, contoId];
  }
  // «Niente» non si sceglie: è solo l'altro capo di un'entrata o di un'uscita.
  for (const scelto of [contoId, daId, aId]) if (scelto === NIENTE) throw nonTrovato('Conto');
  for (const conto of [da, a]) if (conto !== NIENTE) await contoVisibile(db, conto);
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
  if (!descrizione) {
    if (tipo === 'giroconto') {
      const nomi = (await db.query<{ id: string; nome: string }>('select id, nome from conti where id = any($1)', [[da, a]])).rows;
      descrizione = `Giroconto: ${nomi.find((x) => x.id === da)?.nome} verso ${nomi.find((x) => x.id === a)?.nome}`;
    } else descrizione = tipo === 'entrata' ? 'Entrata' : nomeCategoria ?? 'Uscita';
  }
  const m = await momentoScelto(db, v.data(c, 'data'), ora(c), att?.momento ?? null);
  if (await mesePassato(db, m.giorno)) throw new ErroreApi(409, 'Il passato non si cambia: non si scrivono movimenti in un mese già passato');
  return { da, a, importo, momento: m.momento, descrizione, categoria };
}

rotteMovimenti.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const id = await conUtente(res.locals.utenteId, async (db) => {
    const m = await leggiCorpo(db, c, null);
    return (await db.query<{ id: string }>(
      `insert into movimenti_conto (da_conto_id, a_conto_id, importo, momento, utente_id, causa, descrizione, categoria_id)
       values ($1, $2, $3, $4::timestamptz, fp_me(), 'a_mano', $5, $6) returning id`,
      [m.da, m.a, m.importo, m.momento, m.descrizione, m.categoria])).rows[0].id;
  });
  res.status(201).json({ id });
});

// Il movimento a mano di chi chiama, com'è adesso (404 se non esiste o non è suo; 403 se è di un altro movimento a mano che vede).
async function mioMovimento(db: PoolClient, id: string): Promise<Attuale & { giorno: string }> {
  const r = (await db.query<Attuale & { causa: string; mio: boolean; giorno: string }>(
    `select causa, utente_id = fp_me() as mio, importo::text as importo, descrizione, categoria_id, momento::text as momento, momento::date::text as giorno,
            da_conto_id, a_conto_id,
            case when da_conto_id = fp_niente() then 'entrata' when a_conto_id = fp_niente() then 'uscita' else 'giroconto' end as tipo,
            case when da_conto_id = fp_niente() then a_conto_id when a_conto_id = fp_niente() then da_conto_id end as conto_id
       from movimenti_conto where id = $1`, [id])).rows[0];
  if (!r || r.causa !== 'a_mano') throw nonTrovato('Movimento');
  if (!r.mio) throw new ErroreApi(403, 'Solo chi ha scritto il movimento lo può cambiare');
  if (await mesePassato(db, r.giorno)) throw new ErroreApi(409, 'Il passato non si cambia: un movimento di un mese passato non si cambia più');
  return r;
}

rotteMovimenti.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  await conUtente(res.locals.utenteId, async (db) => {
    const att = await mioMovimento(db, id);
    const m = await leggiCorpo(db, c, att);
    await db.query(
      `update movimenti_conto set da_conto_id = $2, a_conto_id = $3, importo = $4, momento = $5::timestamptz, descrizione = $6, categoria_id = $7 where id = $1`,
      [id, m.da, m.a, m.importo, m.momento, m.descrizione, m.categoria]);
  });
  res.json({ id });
});

rotteMovimenti.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    await mioMovimento(db, id);
    await db.query(`delete from movimenti_conto where id = $1 and causa = 'a_mano'`, [id]);
  });
  res.status(204).end();
});
