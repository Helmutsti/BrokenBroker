import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';
import { periodoRichiesto, type Periodo } from './periodo.ts';

// Movimenti del conto (decisione 47). Il saldo di un conto è UNO, uguale per chi lo vede:
// saldo attuale = saldo di partenza + movimenti registrati DOPO il momento del saldo di partenza.

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// Il passato non si cambia (47 D): le spunte (e i loro movimenti) dei mesi personali precedenti a quello in corso
// non si aggiungono né si tolgono.
export async function vietaMesePassato(db: PoolClient, p: Periodo): Promise<void> {
  const adesso = await periodoRichiesto(db, undefined);
  if (p.mese < adesso.mese) throw new ErroreApi(409, 'Il passato non si cambia: le spunte dei mesi precedenti a quello in corso non si possono più cambiare');
}

// Quanto esce dal conto per una voce di importo `intero` di cui chi spunta paga `mia` (47 C): se il CONTO è
// condiviso esce l'importo intero; se il conto è solo suo ma la voce è condivisa esce la sua quota; altrimenti l'importo.
// null se chi spunta non vede il conto (le regole di visibilità non lo permettono).
export async function importoSulConto(db: PoolClient, contoId: string, intero: number, mia: number): Promise<number | null> {
  const { rows } = await db.query<{ condiviso: boolean }>(
    'select exists (select 1 from condivisioni s where s.conto_id = c.id) as condiviso from conti c where c.id = $1', [contoId]);
  if (!rows[0]) return null;
  return rows[0].condiviso ? intero : mia;
}

export async function registraMovimento(db: PoolClient, m: {
  conto_id: string; importo: number; causa: 'spesa' | 'rata' | 'versamento'; descrizione: string; spunta_id?: string | null; versamento_id?: string | null;
}): Promise<void> {
  if (Math.abs(m.importo) < 0.005) return;
  await db.query(
    `insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id, versamento_id)
     values ($1, $2, fp_me(), $3, $4, $5, $6)`,
    [m.conto_id, cent(m.importo), m.causa, m.descrizione, m.spunta_id ?? null, m.versamento_id ?? null]);
}

// Toglie la spunta: sparisce anche il movimento (e il versamento della quota, se c'era).
export async function annullaSpunta(db: PoolClient, spuntaId: string): Promise<void> {
  await db.query('select fp_annulla_spunta($1)', [spuntaId]);
}
