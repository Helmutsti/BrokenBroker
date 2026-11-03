import type { PoolClient } from 'pg';
import { oggi } from './periodo.ts';

// Un'uscita (decisione 72): un movimento verso «fuori», scritto a mano o nato dalla spunta di una spesa o di una rata. I conti sono solo
// etichette: i movimenti con un conto di arrivo e le entrate non sono uscite. Condizione SQL per `movimenti` con alias `m`.
export const SQL_USCITA = `m.a_conto_id is null and coalesce(m.verso, 'uscita') = 'uscita'`;

// L'uscita che nasce dalla spunta di una spesa o di una rata: la quota di chi spunta (`mia`), con la categoria della spesa (le rate non ne
// hanno). Senza conti, visibile solo a chi spunta. Legata alla spunta: togliendo la spunta sparisce, e il saldo risale (saldi.ts).
export async function uscitaDaSpunta(db: PoolClient, t: {
  spunta: { id: string; data: string }; mia: number; descrizione: string; categoria: string | null;
}): Promise<void> {
  if (t.mia < 0.005) return;
  await db.query(
    `insert into movimenti (utente_id, verso, importo, momento, descrizione, categoria_id, spunta_id)
     values (fp_me(), 'uscita', $1, case when $2::date = $3::date then now() else ($2::date + time '12:00')::timestamptz end, $4, $5, $6)`,
    [t.mia.toFixed(2), t.spunta.data, oggi(), t.descrizione, t.categoria, t.spunta.id]);
}
