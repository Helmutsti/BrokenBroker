// Prepara un file .sql da incollare nell'editor SQL di Neon: tutte le migrazioni
// dopo l'ultima già applicata online, in una sola transazione (se una fallisce
// non cambia niente), ognuna segnata in schema_migrazioni.
// Uso, dalla cartella api/:  node scripts/script-neon.ts <ultima migrazione online> [file di uscita]
// L'ultima migrazione online si legge su Neon con:
//   select nome from schema_migrazioni order by nome desc limit 1;

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [ultima, uscita = 'aggiorna-neon.sql'] = process.argv.slice(2);
if (!ultima) throw new Error('Uso: node scripts/script-neon.ts <ultima migrazione online> [file di uscita]');

const cartella = join(import.meta.dirname, '..', 'db', 'migrazioni');
const file = (await readdir(cartella)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
if (!file.includes(ultima)) throw new Error(`Migrazione sconosciuta: ${ultima}`);
const mancanti = file.filter((f) => f > ultima);
if (!mancanti.length) {
  console.log('Il database online è già aggiornato: nessun file da preparare.');
  process.exit(0);
}

const parti = [
  `-- Aggiornamento del database di produzione: da ${ultima} a ${mancanti.at(-1)}.`,
  '-- Incollare tutto nell\'editor SQL di Neon ed eseguire. Prima fare una copia (Branch o Backup).',
  'begin;',
  '',
  '-- Si ferma se il database online non è al punto previsto.',
  `do $controllo$ begin
  if (select max(nome) from schema_migrazioni) is distinct from ${letterale(ultima)} then
    raise exception 'Il database online non è a ${ultima}: rigenera il file con l''ultima migrazione giusta';
  end if;
end $controllo$;`,
];
for (const nome of mancanti) {
  const sql = (await readFile(join(cartella, nome), 'utf8')).trimEnd();
  parti.push('', `-- ===== ${nome} =====`, sql, `insert into schema_migrazioni (nome) values (${letterale(nome)});`);
}
parti.push('', 'commit;', '');

await writeFile(uscita, parti.join('\n'));
console.log(`Preparato ${uscita} con ${mancanti.length} migrazioni (${mancanti[0]} … ${mancanti.at(-1)}).`);

function letterale(testo: string) {
  return `'${testo.replaceAll("'", "''")}'`;
}
