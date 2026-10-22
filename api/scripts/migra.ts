// Applica in ordine i file db/migrazioni/NNN_*.sql non ancora applicati.
// Si collega come amministratore (DATABASE_ADMIN_URL) e crea, se manca, il
// ruolo fp_app usato dall'API, con la password APP_DB_PASSWORD.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const cartella = join(import.meta.dirname, '..', 'db', 'migrazioni');
const passwordApp = process.env.APP_DB_PASSWORD;
if (!passwordApp) throw new Error('Manca APP_DB_PASSWORD');

const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await db.connect();

try {
  const ruolo = await db.query(`select 1 from pg_roles where rolname = 'fp_app'`);
  const azione = ruolo.rowCount ? 'alter' : 'create';
  await db.query(`${azione} role fp_app login password ${db.escapeLiteral(passwordApp)}`);
  await db.query(`grant connect on database ${db.escapeIdentifier(db.database ?? 'postgres')} to fp_app`);

  await db.query(`create table if not exists schema_migrazioni (
                    nome text primary key, applicata_il timestamptz not null default now())`);
  const fatte = new Set((await db.query<{ nome: string }>('select nome from schema_migrazioni')).rows.map((r) => r.nome));
  const file = (await readdir(cartella)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

  for (const nome of file) {
    if (fatte.has(nome)) continue;
    const sql = await readFile(join(cartella, nome), 'utf8');
    await db.query('begin');
    try {
      await db.query(sql);
      await db.query('insert into schema_migrazioni (nome) values ($1)', [nome]);
      await db.query('commit');
      console.log(`applicata ${nome}`);
    } catch (errore) {
      await db.query('rollback');
      console.error(`errore in ${nome}`);
      throw errore;
    }
  }
  console.log('database aggiornato');
} finally {
  await db.end();
}
