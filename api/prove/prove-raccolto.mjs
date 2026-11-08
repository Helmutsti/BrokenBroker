// Prove della cesta delle spese non mensili (decisione 73): è un numero sulla spesa (`raccolto`). Spuntare la quota del mese (/quota) lo fa salire e fa scendere
// il saldo della stessa cifra; «Segna pagata» (/spunta, anche in anticipo) fa scendere solo il raccolto (della tua quota della scadenza), il saldo no;
// togliere le spunte ripristina tutto; il raccolto si corregge a mano.
// Uso: node api/prove/prove-raccolto.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea utenti di prova nuovi e alla fine li cancella con i loro dati
// (con `docker compose exec db psql`, scegliendo il progetto con COMPOSE_PROJECT_NAME; se non può lo dice).

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
const spostaMese = (mese, n) => { const [a, m] = mese.split('-').map(Number); const t = a * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

const n = Date.now();
const reg = (await r('POST', '/accesso/registrazione', null, { email: `raccolto${n}@prova.it`, nome: 'Anna', password: 'password-lunga-a' })).j;
const A = reg.token;
const regB = (await r('POST', '/accesso/registrazione', null, { email: `raccolto-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;
const Bt = regB.token;

try {
  const mese = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const spesa = async (corpo, T = A) => (await r('POST', '/spese-previste', T, { importo: '1200', ogni_mesi: 12, ...corpo })).j;
  const una = async (id, m = mese, T = A) => (await r('GET', `/spese-previste?mese=${m}`, T)).j.spese.find((x) => x.id === id);
  const saldo = async () => (await r('GET', '/saldo', A)).j.effettivo;
  await r('PUT', '/saldo', A, { importo: '5000' });

  // Una spesa non mensile nasce con la cesta a zero; quota del mese = al_mese (1200 / 12 = 100).
  const ass = await spesa({ nome: 'Assicurazione', prossima_scadenza: `${spostaMese(mese, 4)}-10` });
  const bollo = await spesa({ nome: 'Bollo', importo: '300', ogni_mesi: 6, prossima_scadenza: `${spostaMese(mese, 2)}-15` });
  const divano = await spesa({ nome: 'Divano', importo: '600', ogni_mesi: null, prossima_scadenza: `${spostaMese(mese, 5)}-12` });
  verifica(ass.raccolto === '0.00' && ass.al_mese === '100.00' && !('metti_da_parte' in ass), 'cesta a zero, quota 100 al mese, niente metti_da_parte', ass);
  verifica(bollo.al_mese === '50.00' && divano.al_mese === '50.00', 'quote del mese: ogni 6 mesi 300 -> 50, una tantum 600 -> 50', [bollo.al_mese, divano.al_mese]);
  const mensile = await spesa({ nome: 'Affitto', importo: '500', ogni_mesi: 1, giorno_mese: 1 });
  verifica(mensile.raccolto === '0.00', 'la mensile ha raccolto 0');
  verifica((await r('PATCH', `/spese-previste/${mensile.id}`, A, { raccolto: '5' })).s === 400, 'la mensile non ha la cesta (400)');

  const uscitePrima = (await r('GET', '/saldo', A)).j;
  verifica(await saldo() === '5000.00' && uscitePrima.effettivo === '5000.00', 'il saldo di partenza è 5000');

  // Correzione a mano.
  const p1 = await r('PATCH', `/spese-previste/${ass.id}`, A, { raccolto: '350.50' });
  verifica(p1.s === 200 && p1.j.raccolto === '350.50', 'PATCH raccolto: 350,50', p1.j);
  verifica((await r('PATCH', `/spese-previste/${ass.id}`, A, { raccolto: 'abc' })).s === 400, 'raccolto non valido: 400');
  verifica((await r('PATCH', `/spese-previste/${ass.id}`, A, { raccolto: '-20' })).j.raccolto === '-20.00', 'il raccolto può essere negativo');
  verifica((await r('PATCH', `/spese-previste/${ass.id}`, Bt, { raccolto: '1' })).s === 404, 'un\'altra persona non vede la spesa: 404');

  // Quota del mese spuntata: il raccolto sale della quota, il saldo scende della stessa cifra; tolta, tutto torna.
  await r('PATCH', `/spese-previste/${ass.id}`, A, { raccolto: '500' });
  verifica((await una(ass.id)).quota_spuntata === false, 'quota non spuntata all\'inizio');
  const q1 = await r('POST', `/spese-previste/${ass.id}/quota`, A, { mese });
  verifica(q1.s === 201 && (await una(ass.id)).raccolto === '600.00' && (await una(ass.id)).quota_spuntata === true && await saldo() === '4900.00',
    'quota spuntata: raccolto 500 + 100, saldo 5000 - 100', [await una(ass.id), await saldo()]);
  verifica((await r('POST', `/spese-previste/${ass.id}/quota`, A, { mese })).s === 409, 'la quota dello stesso mese non si spunta due volte (409)');
  verifica((await una(ass.id, spostaMese(mese, 1))).quota_spuntata === false, 'un altro mese ha la sua quota non spuntata');
  const q2 = await r('POST', `/spese-previste/${ass.id}/quota`, A, { mese: spostaMese(mese, 1) });
  verifica(q2.s === 201 && (await una(ass.id)).raccolto === '700.00' && await saldo() === '4800.00', 'quota del mese dopo: raccolto 700, saldo 4800');
  // Cambiare l'importo della spesa non cambia ciò che si toglie.
  await r('PATCH', `/spese-previste/${ass.id}`, A, { importo: '2400' });
  verifica((await r('DELETE', `/spese-previste/${ass.id}/spunta?mese=${mese}`, A)).s === 404, 'non c\'è la spunta di pagamento da togliere (404)');
  verifica((await r('DELETE', `/spese-previste/${ass.id}/quota?mese=${spostaMese(mese, 1)}`, A)).s === 204 && (await una(ass.id)).raccolto === '600.00' && await saldo() === '4900.00',
    'quota tolta: sottrae esattamente 100 anche se l\'importo è cambiato');
  await r('PATCH', `/spese-previste/${ass.id}`, A, { importo: '1200' });
  verifica((await r('DELETE', `/spese-previste/${ass.id}/quota?mese=${spostaMese(mese, 1)}`, A)).s === 404, 'quota non spuntata: 404 a toglierla');
  verifica((await r('POST', `/spese-previste/${mensile.id}/quota`, A, { mese })).s === 400, 'la mensile non ha la quota (400)');
  verifica((await r('POST', `/spese-previste/${ass.id}/quota`, Bt, { mese })).s === 404, 'un\'altra persona non vede la spesa: 404');

  // Segna pagata (anche in anticipo): scende solo il raccolto della quota della scadenza (1200), il saldo non si muove.
  const sp = await r('POST', `/spese-previste/${ass.id}/spunta`, A, { mese });
  const dopo = await una(ass.id);
  verifica(sp.s === 201 && dopo.raccolto === '-600.00' && await saldo() === '4900.00', 'segna pagata: raccolto 600 - 1200, saldo fermo a 4900', [dopo, await saldo()]);
  verifica(dopo.uscita === true && !!dopo.pagata_il && dopo.quota_spuntata === true, 'risulta pagata (con la data) e la quota resta spuntata', dopo);
  verifica((await r('POST', `/spese-previste/${ass.id}/spunta`, A, { mese })).s === 409, 'non si segna pagata due volte (409)');
  verifica((await r('DELETE', `/spese-previste/${ass.id}/spunta?mese=${mese}`, A)).s === 204 && (await una(ass.id)).raccolto === '600.00' && await saldo() === '4900.00' && (await una(ass.id)).pagata_il === null,
    'pagamento tolto: raccolto 600, saldo fermo');
  verifica((await r('DELETE', `/spese-previste/${ass.id}/quota?mese=${mese}`, A)).s === 204 && (await una(ass.id)).raccolto === '500.00' && await saldo() === '5000.00', 'quota tolta: raccolto 500 e saldo 5000');
  // Quota di una spesa divisa: conta la mia (50% di 1200 / 12 = 50).
  const div = await spesa({ nome: 'Divisa', prossima_scadenza: `${spostaMese(mese, 3)}-20` });
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: div.id, utente_id: regB.utente_id });
  const dA = await una(div.id);
  verifica(dA.al_mese === '50.00', 'quota divisa a metà: 50 al mese', dA);
  await r('PATCH', `/spese-previste/${div.id}`, A, { raccolto: '50' });
  await r('POST', `/spese-previste/${div.id}/quota`, A, { mese });
  verifica((await una(div.id)).raccolto === '100.00' && await saldo() === '4950.00', 'quota divisa: la mia (50) sale nel raccolto e scende dal saldo');
  await r('POST', `/spese-previste/${div.id}/spunta`, A, { mese });
  verifica((await una(div.id)).raccolto === '-500.00' && await saldo() === '4950.00', 'pagata: esce la mia quota della scadenza (600): 100 - 600, saldo fermo');

  // Eliminare la spesa non lascia niente.
  verifica((await r('DELETE', `/spese-previste/${divano.id}`, A)).s === 204, 'eliminata la spesa');
} finally {
  try {
    psql(`delete from utenti where email like 'raccolto%${n}@prova.it'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: raccolto${n}@prova.it, raccolto-b${n}@prova.it`); }
}

console.log(`prove del raccolto: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
