// Crea un account con le categorie standard e una password generata.
// Uso: docker compose exec api node scripts/crea-utente.ts <email> <nome>
import { randomBytes } from 'node:crypto';
import { proteggiPassword } from '../src/accesso.ts';
import { pool } from '../src/db.ts';

const [email, ...parti] = process.argv.slice(2);
const nome = parti.join(' ').trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nome) {
  console.error('Uso: node scripts/crea-utente.ts <email> <nome>');
  process.exit(1);
}

// 16 caratteri leggibili (niente 0/O, 1/l/I).
const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = [...randomBytes(16)].map((b) => alfabeto[b % alfabeto.length]).join('');

try {
  await pool.query('select fp_registra($1, $2, $3)', [email, nome, await proteggiPassword(password)]);
  console.log(`Account creato.\nEmail: ${email}\nPassword: ${password}`);
} catch (e) {
  console.error((e as { code?: string }).code === '23505' ? 'Esiste già un account con questa email' : (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
