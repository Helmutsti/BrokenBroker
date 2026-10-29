import type { PoolClient } from 'pg';
import { oggi } from './periodo.ts';

// Un'uscita (decisione 71): una transazione verso «fuori», scritta a mano o nata dalla spunta di una spesa o di una rata. I giroconti (hanno un
// conto di arrivo e nessuna categoria) e le entrate non sono uscite. Condizione SQL per `movimenti` con alias `m`.
export const SQL_USCITA = `m.a_conto_id is null and coalesce(m.verso, 'uscita') = 'uscita'`;

// La transazione che nasce dalla spunta di una spesa o di una rata (decisioni 61 e 71): da `da` ad `a` (vuoto = fuori), legata alla spunta
// (che a sua volta è legata alla spesa e al mese personale: togliendo la spunta la transazione sparisce, e il saldo torna com'era).
// Si muove sempre la quota di chi spunta (`mia`), anche se il conto è condiviso. La categoria vale solo per ciò che esce verso fuori:
// uno spostamento non è una spesa. Senza conti, o con un conto che chi spunta non vede, la spunta resta solo un segno.
export async function transazioneDaSpunta(db: PoolClient, t: {
  spunta: { id: string; data: string }; da: string | null; a: string | null; mia: number; descrizione: string; categoria: string | null;
}): Promise<void> {
  const visibile = async (id: string | null) => !id || !!(await db.query('select 1 from conti where id = $1', [id])).rowCount;
  if ((!t.da && !t.a) || !(await visibile(t.da)) || !(await visibile(t.a))) return;
  if (t.mia < 0.005) return;
  await db.query(
    `insert into movimenti (utente_id, da_conto_id, a_conto_id, importo, momento, descrizione, categoria_id, spunta_id)
     values (fp_me(), $1, $2, $3, case when $4::date = $5::date then now() else ($4::date + time '12:00')::timestamptz end, $6, $7, $8)`,
    [t.da, t.a, t.mia.toFixed(2), t.spunta.data, oggi(), t.descrizione, t.a ? null : t.categoria, t.spunta.id]);
}
