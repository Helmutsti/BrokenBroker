import type { PoolClient } from 'pg';
import { oggi } from './periodo.ts';

// La transazione che nasce dalla spunta di una spesa o di una rata (decisione 61): da `da` ad `a` (vuoto = fuori), legata alla spunta
// (togliendo la spunta sparisce con lei). Esce l'importo intero se il conto è condiviso (lui o un conto che lo contiene), altrimenti la
// quota di chi spunta (come la 47 C). La categoria vale solo per ciò che esce verso fuori: uno spostamento non è una spesa.
// Senza conti, o con un conto che chi spunta non vede, la spunta resta solo un segno.
export async function transazioneDaSpunta(db: PoolClient, t: {
  spunta: { id: string; data: string }; da: string | null; a: string | null; intero: number; mia: number; descrizione: string; categoria: string | null;
}): Promise<void> {
  const visibile = async (id: string | null) => !id || !!(await db.query('select 1 from conti where id = $1', [id])).rowCount;
  if ((!t.da && !t.a) || !(await visibile(t.da)) || !(await visibile(t.a))) return;
  const riferimento = t.da ?? t.a!;
  const condiviso = (await db.query<{ c: boolean }>('select fp_conto_condiviso($1) as c', [riferimento])).rows[0].c;
  const importo = condiviso ? t.intero : t.mia;
  if (importo < 0.005) return;
  await db.query(
    `insert into movimenti (utente_id, da_conto_id, a_conto_id, importo, momento, descrizione, categoria_id, spunta_id)
     values (fp_me(), $1, $2, $3, case when $4::date = $5::date then now() else ($4::date + time '12:00')::timestamptz end, $6, $7, $8)`,
    [t.da, t.a, importo.toFixed(2), t.spunta.data, oggi(), t.descrizione, t.a ? null : t.categoria, t.spunta.id]);
}
