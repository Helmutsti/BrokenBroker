// Prove dei gruppi delle spese (decisione 74): cartelle contenitore, solo etichetta, nessun numero cambia.
// Uso: node api/prove/prove-gruppi.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea utenti di prova nuovi e alla fine li cancella (con `docker compose exec db psql`).

import { execSync } from 'node:child_process';

const B = process.argv[2] ?? 'http://localhost:3000';
let ok = 0, ko = 0;
const verifica = (cond, msg, extra) => { if (cond) ok++; else { ko++; console.log('FALLITO:', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function r(metodo, path, token, body) {
  const res = await fetch(B + path, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  return { s: res.status, j: t ? JSON.parse(t) : null };
}
const psql = (sql) => execSync('docker compose exec -T db psql -U fp_admin -d finanza -At', { input: sql, cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).trim();

const n = Date.now();
const email = `gruppi${n}@prova.it`;
const reg = await r('POST', '/accesso/registrazione', null, { email, nome: 'Anna', password: 'password-lunga-a' });
if (reg.s !== 201 && reg.s !== 200) { console.log('Registrazione chiusa? Avvia l\'API con REGISTRAZIONE_APERTA=si', reg.s, reg.j); process.exit(1); }
const A = reg.j.token;
const altro = (await r('POST', '/accesso/registrazione', null, { email: `gruppi-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;

try {
  const casa = await r('POST', '/gruppi', A, { nome: 'Casa nuova' });
  verifica(casa.s === 201 && casa.j.nome === 'Casa nuova' && casa.j.icona === 'folder', 'gruppo creato con icona di base', casa.j);
  verifica(Object.keys(casa.j).sort().join() === 'icona,id,nome', 'campi del gruppo: id, nome, icona', casa.j);
  verifica((await r('POST', '/gruppi', A, {})).s === 400, 'nome obbligatorio');
  const viaggi = (await r('POST', '/gruppi', A, { nome: 'Abbonamenti', icona: 'repeat' })).j;
  verifica(viaggi.icona === 'repeat', 'icona scelta');
  const elenco = (await r('GET', '/gruppi', A)).j;
  verifica(elenco.length === 2 && elenco[0].nome === 'Abbonamenti' && elenco[1].nome === 'Casa nuova', 'elenco ordinato per nome', elenco);
  verifica((await r('GET', '/gruppi', altro.token)).j.length === 0, "l'altro utente non vede i miei gruppi");
  verifica((await r('GET', `/gruppi/${casa.j.id}`, altro.token)).s === 404, "GET di un gruppo altrui: 404");
  const mod = await r('PATCH', `/gruppi/${viaggi.id}`, A, { nome: 'Abbonamenti e rate', icona: 'star' });
  verifica(mod.s === 200 && mod.j.nome === 'Abbonamenti e rate' && mod.j.icona === 'star', 'gruppo modificato', mod.j);
  verifica((await r('PATCH', `/gruppi/${viaggi.id}`, altro.token, { nome: 'x' })).s === 404, "PATCH di un gruppo altrui: 404");

  const nuova = await r('POST', '/spese-previste', A, { nome: 'Affitto', importo: '700', giorno_mese: 5, gruppo_id: casa.j.id });
  verifica(nuova.s === 201 && nuova.j.gruppo_id === casa.j.id && nuova.j.gruppo === 'Casa nuova' && nuova.j.gruppo_icona === 'folder', 'spesa creata dentro il gruppo', nuova.j);
  const libera = (await r('POST', '/spese-previste', A, { nome: 'Libera', importo: '30', giorno_mese: 10 })).j;
  verifica(libera.gruppo_id === null && libera.gruppo === null && libera.gruppo_icona === null, 'spesa senza gruppo: campi null', libera);
  const prima = (await r('GET', '/spese-previste', A)).j;
  const messa = await r('PATCH', `/spese-previste/${libera.id}`, A, { gruppo_id: casa.j.id });
  verifica(messa.s === 200 && messa.j.gruppo === 'Casa nuova', 'gruppo messo con PATCH', messa.j);
  const dopo = (await r('GET', '/spese-previste', A)).j;
  const numeri = (x) => JSON.stringify(x.spese.map((s) => [s.id, s.importo, s.mia_quota, s.al_mese, s.all_anno, s.scadenza, s.nel_mese]));
  verifica(numeri(prima) === numeri(dopo), 'i numeri delle spese non cambiano mettendo il gruppo');
  verifica((await r('PATCH', `/spese-previste/${libera.id}`, A, { gruppo_id: '00000000-0000-4000-8000-000000000000' })).s === 404, 'gruppo inesistente: rifiutato (PATCH)');
  verifica((await r('POST', '/spese-previste', A, { nome: 'X', importo: '1', giorno_mese: 1, gruppo_id: casa.j.id.replace(/.$/, (c) => (c === '0' ? '1' : '0')) })).s === 404, 'gruppo inesistente: rifiutato (POST)');
  verifica((await r('POST', '/spese-previste', altro.token, { nome: 'X', importo: '1', giorno_mese: 1, gruppo_id: casa.j.id })).s === 404, 'gruppo di un altro: rifiutato');
  const tolta = await r('PATCH', `/spese-previste/${libera.id}`, A, { gruppo_id: null });
  verifica(tolta.s === 200 && tolta.j.gruppo_id === null && tolta.j.gruppo === null, 'gruppo tolto con null', tolta.j);

  verifica((await r('DELETE', `/gruppi/${casa.j.id}`, altro.token)).s === 404, 'DELETE di un gruppo altrui: 404');
  verifica((await r('DELETE', `/gruppi/${casa.j.id}`, A)).s === 204, 'gruppo cancellato (204)');
  const finale = (await r('GET', `/spese-previste/${nuova.j.id}`, A)).j;
  verifica(finale.gruppo_id === null && finale.gruppo === null && finale.gruppo_icona === null && finale.importo === '700.00', 'la spesa resta, senza gruppo, stessi numeri', finale);
  verifica((await r('GET', `/gruppi/${casa.j.id}`, A)).s === 404, 'il gruppo non esiste più');
} finally {
  try {
    psql(`delete from utenti where email like 'gruppi%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, gruppi-b${n}@prova.it`); }
}

console.log(`prove dei gruppi: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
