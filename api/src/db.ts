import pg from 'pg';
import type { PoolClient } from 'pg';
import { FUSO_ORARIO } from './periodo.ts';

// numeric e date arrivano come testo: gli importi restano esatti e le date
// non subiscono conversioni di fuso orario.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// Su Vercel ogni istanza della funzione tiene poche connessioni (Neon le raggruppa con il suo pooler).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
  idleTimeoutMillis: 10_000,
});
// current_date nel database segue lo stesso fuso orario dell'API (vedi periodo.ts).
pool.on('connect', (c) => { c.query(`set timezone to ${pg.escapeLiteral(FUSO_ORARIO)}`).catch(() => {}); });

// Esegue fn in una transazione dichiarando al database chi è l'utente:
// le regole di visibilità (Row Level Security) si basano su questo.
export async function conUtente<T>(utenteId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(`select set_config('app.utente_id', $1, true)`, [utenteId]);
    const risultato = await fn(db);
    await db.query('commit');
    return risultato;
  } catch (errore) {
    await db.query('rollback').catch(() => {});
    throw errore;
  } finally {
    db.release();
  }
}
