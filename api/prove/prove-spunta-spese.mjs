// Prove della spunta delle spese (decisione 71): spuntare sposta davvero i soldi, togliere la spunta li riporta indietro.
// Uso: node api/prove/prove-spunta-spese.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea un utente di prova nuovo e alla fine lo cancella con i suoi dati
// (se può, con `docker compose exec db psql`; altrimenti lo dice).
// La prova delle «vecchie spunte» (senza movimento) scrive la spunta direttamente nel database, come se fosse di prima della modifica.

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
const email = `spunta${n}@prova.it`;
const reg = (await r('POST', '/accesso/registrazione', null, { email, nome: 'Anna', password: 'password-lunga-a' })).j;
const A = reg.token;
const altro = (await r('POST', '/accesso/registrazione', null, { email: `spunta-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;
const me = (await r('GET', '/profilo', A)).j;

try {
  const conto = async (nome, saldo) => {
    const k = (await r('POST', '/conti', A, { nome })).j;
    await r('PUT', `/conti/${k.id}/saldo`, A, { importo: saldo });
    return k;
  };
  const saldo = async (k) => Number((await r('GET', '/conti', A)).j.find((x) => x.id === k.id).saldo);
  const cat = (await r('GET', '/categorie?formato=elenco', A)).j.find((c) => c.nome === 'Casa' && !c.padre_id);
  const principale = await conto('Principale', '1000');
  const secondo = await conto('Secondo', '200');
  const mese = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const spesa = async (corpo) => (await r('POST', '/spese-previste', A, { importo: '100', giorno_mese: 15, conto_id: principale.id, ...corpo })).j;
  const spunta = (id) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togli = (id) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const movimentiDiSpunta = () => psql(`select count(*) from movimenti where spunta_id is not null and utente_id = '${me.id}'`);

  // Uscita: da un conto, con categoria. Spuntata il saldo scende della cifra, tolta la spunta torna.
  const affitto = await spesa({ nome: 'Affitto', importo: '700', categoria_id: cat.id });
  verifica(affitto.a_conto_id === null && affitto.categoria_id === cat.id, 'uscita: da un conto, con categoria', affitto);
  const s1 = await spunta(affitto.id);
  verifica(s1.s === 201 && await saldo(principale) === 300, 'uscita spuntata: il saldo scende di 700', await saldo(principale));
  verifica((await r('GET', '/spese-previste', A)).j.spese.find((x) => x.id === affitto.id).uscita === true, 'la spesa risulta uscita nel mese');
  verifica((await togli(affitto.id)).s === 204 && await saldo(principale) === 1000, 'tolta la spunta il saldo torna a 1000', await saldo(principale));
  verifica((await togli(affitto.id)).s === 404, 'senza spunta: 404');

  // Giroconto: da un conto a un altro, senza categoria (con categoria l'API rifiuta).
  const rifiuto = await r('POST', '/spese-previste', A, { nome: 'Giro con categoria', importo: '50', giorno_mese: 3, conto_id: principale.id, a_conto_id: secondo.id, categoria_id: cat.id });
  verifica(rifiuto.s === 400, 'un giroconto con categoria è rifiutato (400)', rifiuto.j);
  const giro = await spesa({ nome: 'Per la spesa', importo: '300', a_conto_id: secondo.id });
  verifica(giro.a_conto_id === secondo.id && giro.categoria_id === null, 'giroconto: da un conto a un altro, senza categoria', giro);
  verifica((await spunta(giro.id)).s === 201 && await saldo(principale) === 700 && await saldo(secondo) === 500, 'giroconto spuntato: 300 passano dal primo conto al secondo', [await saldo(principale), await saldo(secondo)]);
  verifica((await togli(giro.id)).s === 204 && await saldo(principale) === 1000 && await saldo(secondo) === 200, 'giroconto: tolta la spunta i soldi tornano', [await saldo(principale), await saldo(secondo)]);

  // Il movimento è legato alla spunta (quindi alla spesa e al mese): togliere la spunta elimina esattamente quello.
  const uno = await spesa({ nome: 'Uno', importo: '10' }), due = await spesa({ nome: 'Due', importo: '20' });
  await spunta(uno.id); await spunta(due.id);
  verifica(await movimentiDiSpunta() === '2' && await saldo(principale) === 970, 'due spunte, due movimenti', await movimentiDiSpunta());
  await togli(uno.id);
  verifica(await movimentiDiSpunta() === '1' && await saldo(principale) === 980, 'tolta una spunta sparisce solo il suo movimento', await saldo(principale));
  await togli(due.id);
  verifica(await movimentiDiSpunta() === '0' && await saldo(principale) === 1000, 'tolte tutte, il saldo è com\'era');

  // Spesa condivisa: si muove la quota di chi spunta (metà), non l'importo intero.
  const condivisa = await spesa({ nome: 'Condivisa', importo: '200', categoria_id: cat.id });
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: condivisa.id, utente_id: altro.utente_id });
  const sc = (await r('GET', '/spese-previste', A)).j.spese.find((x) => x.id === condivisa.id);
  verifica(sc.mia_quota === '100.00', 'condivisa a metà: la mia quota è 100', sc.mia_quota);
  await spunta(condivisa.id);
  verifica(await saldo(principale) === 900, 'condivisa spuntata: scende la mia quota (100), non l\'intero', await saldo(principale));
  await togli(condivisa.id);
  verifica(await saldo(principale) === 1000, 'condivisa: tolta la spunta il saldo torna');

  // Vecchia spunta (scritta nel database prima di questa modifica, senza movimento): non cambia il saldo, né quando c'è né quando si toglie.
  const vecchia = await spesa({ nome: 'Vecchia spunta', importo: '60' });
  const p = (await r('GET', '/spese-previste', A)).j.periodo;
  try {
    psql(`insert into spunte (utente_id, spesa_prevista_id, data) values ('${me.id}', '${vecchia.id}', '${p.dal}')`);
    verifica((await r('GET', '/spese-previste', A)).j.spese.find((x) => x.id === vecchia.id).uscita === true && await saldo(principale) === 1000, 'vecchia spunta: la spesa è spuntata e il saldo non cambia', await saldo(principale));
    verifica((await togli(vecchia.id)).s === 204 && await saldo(principale) === 1000 && await movimentiDiSpunta() === '0', 'vecchia spunta tolta: si toglie solo il segno, saldo invariato', await saldo(principale));
    // E rispuntandola dopo, ora sì, i soldi si muovono.
    verifica((await spunta(vecchia.id)).s === 201 && await saldo(principale) === 940, 'rispuntata dopo la modifica: ora i soldi escono', await saldo(principale));
    await togli(vecchia.id);
  } catch (e) {
    console.log('SALTATA la prova delle vecchie spunte (serve docker compose):', String(e.message).split('\n')[0]);
  }

  // Ogni spesa ha un conto di partenza: senza, l'API rifiuta (creazione e modifica).
  const senza = await r('POST', '/spese-previste', A, { nome: 'Senza conto', importo: '40', giorno_mese: 20 });
  verifica(senza.s === 400, 'una spesa senza conto è rifiutata (400)', senza.j);
  const conConto = await spesa({ nome: 'Con conto', importo: '40' });
  verifica((await r('PATCH', `/spese-previste/${conConto.id}`, A, { conto_id: null })).s === 400, 'togliere il conto a una spesa è rifiutato (400)');
  // Una spesa già nel database senza conto (di prima): si vede ancora, ma per modificarla serve il conto.
  const vecchiaSenza = await spesa({ nome: 'Vecchia senza conto', importo: '15' });
  try {
    psql(`update spese_previste set conto_id = null where id = '${vecchiaSenza.id}'`);
    verifica((await r('GET', '/spese-previste', A)).j.spese.some((x) => x.id === vecchiaSenza.id && x.conto_id === null), 'una spesa senza conto si vede ancora nell elenco');
    verifica((await r('PATCH', `/spese-previste/${vecchiaSenza.id}`, A, { note: 'x' })).s === 400, 'modificare una spesa senza conto senza dare il conto è rifiutato (400)');
    verifica((await r('PATCH', `/spese-previste/${vecchiaSenza.id}`, A, { conto_id: secondo.id })).s === 200, 'dando il conto la modifica passa');
  } catch (e) {
    console.log('SALTATA la prova della spesa senza conto già nel database (serve docker compose):', String(e.message).split(String.fromCharCode(10))[0]);
  }
} finally {
  try {
    psql(`delete from utenti where email like 'spunta%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, spunta-b${n}@prova.it`); }
}

console.log(`prove della spunta: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
