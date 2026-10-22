import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import * as v from '../valida.ts';

// Regole personali sulle rate: quante insieme al massimo, che percentuale dello
// stipendio al massimo, quante mensilità di debito al massimo.

export const rotteRegole = Router();

export const TIPI_REGOLA = ['max_rate_contemporanee', 'tetto_rate_percentuale', 'max_mensilita_debito'] as const;
export type Regole = Partial<Record<(typeof TIPI_REGOLA)[number], number>>;

export async function leggiRegole(db: PoolClient): Promise<Regole> {
  const { rows } = await db.query<{ tipo: (typeof TIPI_REGOLA)[number]; valore: string }>('select tipo, valore::text as valore from regole');
  return Object.fromEntries(rows.map((r) => [r.tipo, Number(r.valore)]));
}

rotteRegole.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, leggiRegole));
});

// Corpo: { tipo: valore | null } per ogni regola da impostare o togliere.
rotteRegole.put('/', async (req, res) => {
  const c = v.corpo(req.body);
  const regole = await conUtente(res.locals.utenteId, async (db) => {
    for (const tipo of TIPI_REGOLA) {
      if (!(tipo in c)) continue;
      const valore = v.annullabile(c, tipo, () => v.importo(c, tipo));
      if (valore === null || valore === undefined) await db.query('delete from regole where tipo = $1', [tipo]);
      else await db.query(
        `insert into regole (proprietario_id, tipo, valore) values (fp_me(), $1, $2)
         on conflict (proprietario_id, tipo) do update set valore = excluded.valore`, [tipo, valore]);
    }
    return leggiRegole(db);
  });
  res.json(regole);
});
