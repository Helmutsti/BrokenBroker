// Prove degli investimenti collegati ai salvadanai (decisione 75): solo etichetta, nessun numero del salvadanaio cambia.
// Uso: node api/prove/prove-collegamenti-asset.mjs [indirizzo]   (di base http://localhost:3000)
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
const psql = (sql) => execSync('docker compose exec -T db psql -v ON_ERROR_STOP=1 -U fp_admin -d finanza -At', { input: sql, cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).trim();

const n = Date.now();
const email = `collegamenti${n}@prova.it`;
const reg = await r('POST', '/accesso/registrazione', null, { email, nome: 'Anna', password: 'password-lunga-a' });
if (reg.s !== 201 && reg.s !== 200) { console.log('Registrazione chiusa? Avvia l\'API con REGISTRAZIONE_APERTA=si', reg.s, reg.j); process.exit(1); }
const A = reg.j.token;
const altro = (await r('POST', '/accesso/registrazione', null, { email: `collegamenti-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;
const conta = (dove) => Number(psql(`select count(*) from collegamenti_asset where ${dove}`));
const manca = '00000000-0000-4000-8000-000000000000';

try {
  // Dati: un portafoglio con un titolo (prezzo scritto a mano per oggi) e un bene non quotato, un secondo portafoglio con un altro titolo.
  const p1 = (await r('POST', '/investimenti/portafogli', A, { nome: 'Lungo termine' })).j;
  const p2 = (await r('POST', '/investimenti/portafogli', A, { nome: 'Idee' })).j;
  const titolo = async (isin, simbolo, nome) => (await r('POST', '/investimenti/titoli', A, { isin, simbolo, nome, tipo: 'etf' })).j;
  const t1 = await titolo(`XS${String(n).slice(-9)}1`, `PROVA1${n}`.slice(0, 12), 'ETF di prova uno');
  const t2 = await titolo(`XS${String(n).slice(-9)}2`, `PROVA2${n}`.slice(0, 12), 'ETF di prova due');
  for (const [t, prezzo] of [[t1, '100'], [t2, '50']]) await r('PUT', `/investimenti/titoli/${t.id}/prezzi`, A, { prezzo });
  const lotto1 = await r('POST', '/investimenti/lotti', A, { titolo_id: t1.id, portafoglio_id: p1.id, quantita: '10' });
  const lotto2 = await r('POST', '/investimenti/lotti', A, { titolo_id: t2.id, portafoglio_id: p2.id, quantita: '4' });
  verifica(lotto1.s === 201 && lotto2.s === 201, 'acquisti creati', [lotto1, lotto2]);
  const bene = (await r('POST', '/investimenti/beni', A, { portafoglio_id: p1.id, nome: 'Quote immobile', tipo: 'immobile', costo: '800', valore: '1200' })).j;
  verifica(bene.valore === '1200.00', 'bene creato', bene);

  const s1 = (await r('POST', '/salvadanai', A, { nome: 'Casa', traguardo: '5000' })).j;
  const s2 = (await r('POST', '/salvadanai', A, { nome: 'Vacanze' })).j;
  await r('POST', '/salvadanai/sposta', A, { da: null, a: s1.id, importo: '300' });
  const prima = (await r('GET', '/salvadanai', A)).j;

  // Asset tra cui scegliere.
  const disp = await r('GET', '/salvadanai/asset/disponibili', A);
  verifica(disp.s === 200 && disp.j.length === 3, 'asset disponibili: 2 posizioni e 1 bene', disp.j);
  const posUno = disp.j.find((a) => a.titolo_id === t1.id);
  verifica(posUno?.portafoglio === 'Lungo termine' && posUno.valore === '1000.00' && posUno.nome === 'ETF di prova uno', 'posizione: nome, portafoglio e valore come in Investimenti', posUno);
  const pagina = (await r('GET', `/investimenti/portafogli/${p1.id}`, A)).j;
  verifica(pagina.posizioni.find((x) => x.titolo_id === t1.id).valore === posUno.valore && pagina.beni[0].valore === '1200.00', 'stessi valori della pagina Investimenti');

  // Vuoto, poi aggiungi.
  const vuoto = await r('GET', `/salvadanai/${s1.id}/asset`, A);
  verifica(vuoto.s === 200 && vuoto.j.asset.length === 0 && vuoto.j.totale === '0.00', 'all\'inizio nessun collegamento', vuoto.j);
  const a1 = await r('POST', `/salvadanai/${s1.id}/asset`, A, { titolo_id: t1.id, portafoglio_id: p1.id });
  verifica(a1.s === 201 && a1.j.asset.length === 1 && a1.j.totale === '1000.00' && a1.j.asset[0].tipo === 'titolo', 'posizione collegata', a1.j);
  const a2 = await r('POST', `/salvadanai/${s1.id}/asset`, A, { bene_id: bene.id });
  verifica(a2.s === 201 && a2.j.asset.length === 2 && a2.j.totale === '2200.00', 'bene collegato, totale 2200', a2.j);
  verifica(a2.j.asset[0].portafoglio === 'Lungo termine' && a2.j.asset.find((x) => x.tipo === 'bene').nome === 'Quote immobile' && a2.j.asset.every((x) => x.id), 'nome, portafoglio e id del collegamento', a2.j);
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, { bene_id: bene.id })).s === 409, 'stesso asset due volte nello stesso salvadanaio: 409');
  // Un asset in più salvadanai.
  const b1 = await r('POST', `/salvadanai/${s2.id}/asset`, A, { bene_id: bene.id });
  verifica(b1.s === 201 && b1.j.asset.length === 1, 'lo stesso bene in un secondo salvadanaio', b1.j);
  // Richieste sbagliate.
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, {})).s === 400, 'corpo vuoto: 400');
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, { titolo_id: t2.id })).s === 400, 'titolo senza portafoglio: 400');
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, { bene_id: bene.id, titolo_id: t2.id, portafoglio_id: p2.id })).s === 400, 'bene e titolo insieme: 400');
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, { titolo_id: t2.id, portafoglio_id: p1.id })).s === 404, 'titolo non presente in quel portafoglio: 404');
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, A, { bene_id: manca })).s === 404, 'bene inesistente: 404');
  verifica((await r('POST', `/salvadanai/${manca}/asset`, A, { bene_id: bene.id })).s === 404, 'salvadanaio inesistente: 404');

  // Nessun numero cambia.
  const dopo = (await r('GET', '/salvadanai', A)).j;
  verifica(JSON.stringify(prima) === JSON.stringify(dopo), 'i numeri dei salvadanai non cambiano (saldo, traguardo, quota del mese)');

  // Il valore segue la pagina Investimenti: un nuovo prezzo cambia il valore collegato.
  await r('PUT', `/investimenti/titoli/${t1.id}/prezzi`, A, { prezzo: '110' });
  verifica((await r('GET', `/salvadanai/${s1.id}/asset`, A)).j.totale === '2300.00', 'il valore segue il prezzo (10 quote a 110 + bene 1200)');

  // Privacy: l'altro utente non vede ne tocca niente.
  verifica((await r('GET', `/salvadanai/${s1.id}/asset`, altro.token)).s === 404, 'GET degli asset di un salvadanaio altrui: 404');
  verifica((await r('POST', `/salvadanai/${s1.id}/asset`, altro.token, { bene_id: bene.id })).s === 404, 'POST su un salvadanaio altrui: 404');
  const sB = (await r('POST', '/salvadanai', altro.token, { nome: 'Di Bruno' })).j;
  verifica((await r('POST', `/salvadanai/${sB.id}/asset`, altro.token, { bene_id: bene.id })).s === 404, 'collegare il bene di un altro: 404');
  verifica((await r('POST', `/salvadanai/${sB.id}/asset`, altro.token, { titolo_id: t1.id, portafoglio_id: p1.id })).s === 404, 'collegare la posizione di un altro: 404');
  verifica((await r('GET', '/salvadanai/asset/disponibili', altro.token)).j.length === 0, 'gli asset disponibili di Bruno sono vuoti');
  verifica((await r('GET', `/salvadanai/${sB.id}/asset`, altro.token)).j.asset.length === 0, 'il suo salvadanaio non mostra gli asset di Anna');
  verifica((await r('DELETE', `/salvadanai/${s1.id}/asset/${a2.j.asset[0].id}`, altro.token)).s === 404, 'scollegare un collegamento altrui: 404');
  verifica(conta(`cesta_id = '${s1.id}'`) === 2, 'i collegamenti di Anna sono ancora 2');
  // Anche se un collegamento di Anna finisse in un salvadanaio di Bruno (scritto a mano nel database), lui non lo vede.
  psql(`insert into collegamenti_asset (proprietario_id, cesta_id, bene_id) select proprietario_id, '${sB.id}', id from beni where id = '${bene.id}'`);
  verifica((await r('GET', `/salvadanai/${sB.id}/asset`, altro.token)).j.asset.length === 0, 'un collegamento di Anna dentro un salvadanaio di Bruno resta invisibile a lui');
  psql(`delete from collegamenti_asset where cesta_id = '${sB.id}'`);

  // Togli.
  const daTogliere = a2.j.asset.find((x) => x.tipo === 'bene').id;
  verifica((await r('DELETE', `/salvadanai/${s1.id}/asset/${daTogliere}`, A)).s === 204, 'collegamento tolto (204)');
  const resto = (await r('GET', `/salvadanai/${s1.id}/asset`, A)).j;
  verifica(resto.asset.length === 1 && resto.totale === '1100.00', 'resta la posizione, totale 1100', resto);
  verifica((await r('GET', `/salvadanai/${s2.id}/asset`, A)).j.asset.length === 1, 'il bene resta nell\'altro salvadanaio');
  verifica((await r('DELETE', `/salvadanai/${s1.id}/asset/${daTogliere}`, A)).s === 404, 'toglierlo di nuovo: 404');
  verifica((await r('GET', '/investimenti/beni', A)).j.length === 1, 'il bene esiste ancora: si e tolta solo l\'etichetta');

  // Cascade: bene eliminato, ultimo acquisto tolto, salvadanaio eliminato.
  verifica((await r('DELETE', `/investimenti/beni/${bene.id}`, A)).s === 204, 'bene eliminato');
  verifica(conta(`bene_id = '${bene.id}'`) === 0 && (await r('GET', `/salvadanai/${s2.id}/asset`, A)).j.asset.length === 0, 'eliminando il bene spariscono i collegamenti');
  verifica((await r('POST', '/investimenti/lotti', A, { titolo_id: t1.id, portafoglio_id: p1.id, quantita: '1' })).s === 201, 'secondo acquisto dello stesso titolo');
  verifica((await r('DELETE', `/investimenti/lotti/${lotto1.j.id}`, A)).s === 204 && conta(`titolo_id = '${t1.id}'`) === 1, 'togliendo un acquisto (ne resta uno) il collegamento resta');
  const ultimo = (await r('GET', `/investimenti/lotti?titolo_id=${t1.id}`, A)).j[0];
  verifica((await r('DELETE', `/investimenti/lotti/${ultimo.id}`, A)).s === 204 && conta(`titolo_id = '${t1.id}'`) === 0, 'togliendo l\'ultimo acquisto la posizione sparisce e con lei il collegamento');
  await r('POST', `/salvadanai/${s2.id}/asset`, A, { titolo_id: t2.id, portafoglio_id: p2.id });
  verifica(conta(`cesta_id = '${s2.id}'`) === 1, 'collegamento creato per la prova di eliminazione');
  verifica((await r('DELETE', `/salvadanai/${s2.id}`, A)).s === 204 && conta(`cesta_id = '${s2.id}'`) === 0, 'eliminando il salvadanaio spariscono i collegamenti');
  verifica((await r('GET', `/investimenti/portafogli/${p2.id}`, A)).j.posizioni.length === 1, 'l\'investimento resta nel suo portafoglio');
  // Un collegamento senza asset e rifiutato dal database.
  let rifiutato = false;
  try { psql(`insert into collegamenti_asset (proprietario_id, cesta_id) select proprietario_id, id from ceste where id = '${s1.id}'`); } catch { rifiutato = true; }
  verifica(rifiutato, 'il database rifiuta un collegamento senza asset');
} finally {
  try {
    psql(`delete from lotti where titolo_id in (select id from titoli where isin like 'XS${String(n).slice(-9)}_')`);
    psql(`delete from titoli where isin like 'XS${String(n).slice(-9)}_'`);
    psql(`delete from utenti where email like 'collegamenti%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, collegamenti-b${n}@prova.it`); }
}

console.log(`prove dei collegamenti agli asset: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
