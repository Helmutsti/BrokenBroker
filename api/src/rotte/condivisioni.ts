import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

// Condivisione (decisioni 6, 7, 16): una voce è privata o in collaborazione.
// La crea e la toglie solo chi possiede la voce.

export const rotteCondivisioni = Router();
export const rottePersone = Router();

const COLONNA = { conto: 'conto_id', spesa: 'spesa_prevista_id', movimento: 'movimento_id', obiettivo: 'obiettivo_id' } as const;
const VOCI = Object.keys(COLONNA) as (keyof typeof COLONNA)[];

rotteCondivisioni.get('/', async (_req, res) => {
  const elenco = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `select s.id, s.creata_il, s.proprietario_id = fp_me() as mia,
            case when s.conto_id is not null then 'conto' when s.spesa_prevista_id is not null then 'spesa'
                 when s.movimento_id is not null then 'movimento' else 'obiettivo' end as voce,
            coalesce(s.conto_id, s.spesa_prevista_id, s.movimento_id, s.obiettivo_id) as voce_id,
            coalesce(c.nome, sp.nome, m.esercente, m.descrizione, o.nome) as nome,
            s.proprietario_id, up.nome as proprietario, s.condiviso_con_id, uc.nome as condiviso_con
       from condivisioni s
       left join conti c on c.id = s.conto_id
       left join spese_previste sp on sp.id = s.spesa_prevista_id
       left join movimenti m on m.id = s.movimento_id
       left join obiettivi o on o.id = s.obiettivo_id
       join utenti up on up.id = s.proprietario_id
       join utenti uc on uc.id = s.condiviso_con_id
      order by s.creata_il desc`)).rows);
  res.json(elenco);
});

// Corpo: { voce: conto|spesa|movimento|obiettivo, id, email }
rotteCondivisioni.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const voce = v.scelta(c, 'voce', VOCI, true)!;
  const id = v.id(c, 'id', true)!;
  const email = v.testo(c, 'email', true, 254)!;
  const creata = await conUtente(res.locals.utenteId, async (db) => {
    const altro = (await db.query<{ id: string | null }>('select fp_utente_per_email($1) as id', [email])).rows[0].id;
    if (!altro) throw new ErroreApi(404, 'Nessuna persona con questa email');
    const possiede = (await db.query<{ ok: boolean }>(
      `select fp_possiede_voce($1, $2, $3, $4) as ok`,
      VOCI.map((k) => (k === voce ? id : null)))).rows[0].ok;
    if (!possiede) throw new ErroreApi(403, "Può condividere solo chi ha creato la voce");
    return (await db.query(
      `insert into condivisioni (proprietario_id, condiviso_con_id, ${COLONNA[voce]}) values (fp_me(), $1, $2)
       returning id, condiviso_con_id`, [altro, id])).rows[0];
  });
  res.status(201).json(creata);
});

rotteCondivisioni.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if ((await db.query('delete from condivisioni where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from condivisioni where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha condiviso la voce può smettere di condividerla') : nonTrovato('Condivisione');
  });
  res.status(204).end();
});

// Le persone con cui c'è almeno una condivisione (servono per le quote).
rottePersone.get('/', async (_req, res) => {
  const persone = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('select id, nome, email, id = fp_me() as io from utenti order by id <> fp_me(), nome')).rows);
  res.json(persone);
});
