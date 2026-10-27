import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi } from '../errori.ts';
import { inizioMese, meseDi, periodoRichiesto } from '../periodo.ts';
import * as v from '../valida.ts';

// Tutti i movimenti dei conti che si vedono (decisione 48): spunte di spese e rate, versamenti e prelievi dei
// salvadanai, giroconti e uscite dei budget; dal più recente.
//   ?conto=<id> | senza   solo quel conto (senza = uscite di budget senza conto)
//   ?mese=AAAA-MM         solo quel mese personale
//   ?limite=              di base 200, al massimo 500
// `conta` dice se il movimento è dopo il saldo di partenza del suo conto (e quindi dentro il saldo attuale): gli altri
// erano già nel saldo scritto. `mesi` sono i mesi personali che hanno movimenti (per il filtro).

export const rotteMovimenti = Router();

rotteMovimenti.get('/', async (req, res) => {
  const conto = typeof req.query.conto === 'string' ? req.query.conto : undefined;
  if (conto !== undefined && conto !== 'senza') v.idPercorso(conto);
  const limite = Math.min(500, Math.max(1, Number(req.query.limite ?? 200) || 200));
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = req.query.mese === undefined ? null : await periodoRichiesto(db, req.query.mese);
    if (req.query.mese !== undefined && !p) throw new ErroreApi(400, 'Il mese deve essere AAAA-MM');
    const inizio = await inizioMese(db);
    // Solo i movimenti di conti che si vedono, più le uscite senza conto del budget.
    const base = `from movimenti_conto m
        left join conti c on c.id = m.conto_id
        left join utenti u on u.id = m.utente_id
       where (m.conto_id is null or c.id is not null)`;
    const righe = (await db.query(
      `select m.id, m.importo::text as importo, m.momento, m.momento::date as data, m.causa, m.descrizione, m.conto_id, c.nome as conto, c.icona as conto_icona,
              u.nome as utente, m.giroconto_id, m.budget_id,
              (m.conto_id is null or (c.saldo_partenza_il is not null and m.momento > c.saldo_partenza_il)) as conta
         ${base}
          and ($1::text is null or ($1 = 'senza' and m.conto_id is null) or m.conto_id::text = $1)
          and ($2::date is null or (m.momento >= $2::date and m.momento < $3::date + 1))
        order by m.momento desc, m.id desc limit $4`,
      [conto ?? null, p?.dal ?? null, p?.al ?? null, limite])).rows;
    const giorni = (await db.query<{ data: string }>(
      `select distinct m.momento::date as data ${base}
          and ($1::text is null or ($1 = 'senza' and m.conto_id is null) or m.conto_id::text = $1)`, [conto ?? null])).rows;
    const mesi = [...new Set(giorni.map((x) => meseDi(x.data, inizio)))].sort().reverse();
    return { movimenti: righe, mesi, mese_in_corso: (await periodoRichiesto(db, undefined)).mese };
  });
  res.json(risposta);
});
