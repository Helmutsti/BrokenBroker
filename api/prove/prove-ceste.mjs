// Prove dei salvadanai (decisione 72; la tabella si chiama `ceste`): liberi, annidabili, versare e prelevare a mano, eliminare, collegamento con
// il fatto che non siano più legati alle spese (decisione 73).
// Uso: node api/prove/prove-ceste.mjs [indirizzo]   (di base http://localhost:3000)
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
const reg = (await r('POST', '/accesso/registrazione', null, { email: `ceste${n}@prova.it`, nome: 'Anna', password: 'password-lunga-a' })).j;
const A = reg.token;
const regB = (await r('POST', '/accesso/registrazione', null, { email: `ceste-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;
const Bt = regB.token;

try {
  const tutti = async (T = A) => (await r('GET', '/salvadanai', T)).j;
  const piatti = (xs) => xs.flatMap((k) => [k, ...piatti(k.figli)]);
  const sal = async (id, T = A) => piatti(await tutti(T)).find((k) => k.id === id);
  const nuovo = async (corpo, T = A) => (await r('POST', '/salvadanai', T, corpo)).j;
  const sposta = (da, a, importo, T = A) => r('POST', '/salvadanai/sposta', T, { da, a, importo });
  const saldo = async () => (await r('GET', '/saldo', A)).j;
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const fra3 = `${spostaMese(meseA, 3)}-20`;

  // Salvadanai nuovi: in cima, vuoti, con traguardo e data facoltativi; con data e traguardo si sa quanto mettere al mese.
  const A1 = await nuovo({ nome: 'Fondo emergenza', traguardo: '2000', scadenza: fra3 });
  const B1 = await nuovo({ nome: 'Giappone' });
  verifica(A1.padre_id === null && A1.dentro === '0.00' && A1.versato === '0.00' && A1.traguardo === '2000.00' && A1.scadenza === fra3 && A1.collegato === undefined, 'salvadanaio nuovo: in cima, vuoto, con traguardo e data', A1);
  verifica(A1.mancano === '2000.00' && A1.mesi === 4 && A1.metti_al_mese === '500.00' && A1.percentuale === 0, 'con traguardo e data: mancano 2000 in 4 mesi, 500 al mese', A1);
  verifica(B1.traguardo === null && B1.scadenza === null && B1.mancano === null && B1.metti_al_mese === null, 'senza traguardo: niente mancano né al mese', B1);
  verifica((await r('POST', '/salvadanai', A, { nome: 'Con padre altrui', padre_id: (await nuovo({ nome: 'Di Bruno' }, Bt)).id })).s === 404, 'un salvadanaio superiore che non vedi: 404');
  verifica((await r('POST', '/salvadanai', A, { nome: 'Traguardo zero', traguardo: '0' })).s === 400, 'traguardo zero: 400');
  verifica((await r('POST', '/ceste', A, { nome: 'Vecchio indirizzo' })).s === 201, 'il vecchio indirizzo /ceste funziona ancora');
  verifica((await r('GET', '/salvadanai', Bt)).j.every((k) => k.nome !== 'Fondo emergenza'), 'B non vede i salvadanai di A');
  verifica((await r('GET', `/salvadanai/${A1.id}`, Bt)).s === 404, 'B: 404 sul salvadanaio di A');

  // Versare e prelevare: i soldi non vengono dal saldo, e il saldo non cambia.
  await r('PUT', '/saldo', A, { importo: '1000' });
  const s1 = await sposta(null, A1.id, '300');
  verifica(s1.s === 201 && Array.isArray(s1.j), 'versa fuori -> salvadanaio (risponde con l\'albero)', s1);
  verifica((await sal(A1.id)).dentro === '300.00' && (await sal(A1.id)).percentuale === 15 && (await sal(A1.id)).mancano === '1700.00' && (await sal(A1.id)).metti_al_mese === '425.00', 'dentro 300 (15%), mancano 1700, 425 al mese', await sal(A1.id));
  verifica((await saldo()).effettivo === '1000.00', 'versare non cambia il saldo');
  verifica((await sposta(null, A1.id, '5000')).s === 201, 'versare non ha limiti (non è il saldo)');
  await sposta(A1.id, null, '5000');
  verifica((await sposta(A1.id, null, '100')).s === 201 && (await sal(A1.id)).dentro === '200.00', 'preleva salvadanaio -> fuori: 200 dentro');
  verifica((await sposta(A1.id, null, '200.01')).s === 400, 'prelevare più di quanto c\'è: 400');
  verifica((await sposta(null, A1.id, '0')).s === 400 && (await sposta(null, A1.id, '-5')).s === 400, 'importo zero o negativo: 400');
  verifica((await sposta(null, null, '5')).s === 400 && (await sposta(A1.id, A1.id, '5')).s === 400, 'senza salvadanai o con lo stesso posto: 400');
  verifica((await sposta(null, A1.id, '10', Bt)).s === 404, 'un salvadanaio che non vedi: 404');
  verifica((await sposta(A1.id, B1.id, '50')).s === 201 && (await sal(A1.id)).dentro === '150.00' && (await sal(B1.id)).dentro === '50.00', 'sposta tra due salvadanai: 150 e 50');

  // Annidare: il padre fa la somma, la parte propria è a sé; niente cicli.
  const f1 = await nuovo({ nome: 'Un mese', padre_id: A1.id, traguardo: '1000' });
  await sposta(null, f1.id, '100');
  let padre = await sal(A1.id);
  verifica(f1.padre_id === A1.id && padre.dentro === '250.00' && padre.versato === '150.00' && padre.figli[0].dentro === '100.00', 'il padre fa la somma: 150 propri + 100 nel figlio', padre);
  verifica((await sposta(A1.id, null, '200')).s === 400, 'dal padre si prende solo la parte propria (400)');
  verifica((await r('PATCH', `/salvadanai/${A1.id}`, A, { padre_id: f1.id })).s === 400, 'un salvadanaio non sta dentro un suo figlio (400)');
  verifica((await r('PATCH', `/salvadanai/${A1.id}`, A, { padre_id: A1.id })).s === 400, 'né dentro se stesso (400)');
  const mosso = await r('PATCH', `/salvadanai/${B1.id}`, A, { padre_id: A1.id, nome: 'Giappone 2027', scadenza: null, traguardo: '3000', icona: 'plane' });
  verifica(mosso.s === 200 && mosso.j.padre_id === A1.id && mosso.j.nome === 'Giappone 2027' && mosso.j.icona === 'plane' && mosso.j.traguardo === '3000.00', 'si cambiano nome, icona, traguardo e posto', mosso.j);
  verifica((await r('PATCH', `/salvadanai/${B1.id}`, A, { padre_id: null })).j.padre_id === null, 'tornato in cima');
  verifica((await r('PATCH', `/salvadanai/${B1.id}`, Bt, { nome: 'x' })).s === 404, 'B non modifica i salvadanai di A');

  // Traguardi di copertura.
  const t = await r('POST', `/salvadanai/${A1.id}/traguardi`, A, { nome: 'Auto', importo: '300' });
  verifica(t.s === 201 && (await sal(A1.id)).traguardi[0].percentuale === 83, 'traguardo di copertura: 250 su 300 = 83%', await sal(A1.id));
  verifica((await r('DELETE', `/salvadanai/traguardi/${t.j.id}`, A)).s === 204 && (await sal(A1.id)).traguardi.length === 0, 'il traguardo si elimina');

  // Eliminare: i figli salgono e i soldi propri vanno nel contenitore (che resta uguale come totale); in cima i soldi escono.
  const T = await nuovo({ nome: 'Tetto' }), M = await nuovo({ nome: 'Mezzo', padre_id: T.id }), L = await nuovo({ nome: 'Foglia', padre_id: M.id });
  await sposta(null, T.id, '10'); await sposta(null, M.id, '70'); await sposta(null, L.id, '30');
  verifica((await sal(T.id)).dentro === '110.00', 'albero di prova: 10 + 70 + 30');
  verifica((await r('DELETE', `/salvadanai/${M.id}`, A)).s === 204, 'si elimina un salvadanaio con soldi e figli');
  const dopo = await sal(T.id);
  verifica(await sal(M.id) === undefined && dopo.versato === '80.00' && dopo.dentro === '110.00' && dopo.figli.length === 1 && dopo.figli[0].id === L.id && dopo.figli[0].dentro === '30.00', 'il figlio sale nel padre con i suoi soldi, i soldi propri del eliminato vanno nel padre: 80 propri + 30 nel figlio', dopo);
  verifica((await r('DELETE', `/salvadanai/${T.id}`, A)).s === 204, 'si elimina un salvadanaio in cima con soldi');
  const orfano = await sal(L.id);
  verifica(await sal(T.id) === undefined && orfano && orfano.padre_id === null && orfano.dentro === '30.00', 'il figlio resta, ora in cima, con i suoi soldi', orfano);
  verifica((await r('DELETE', `/salvadanai/${T.id}`, A)).s === 404 && (await r('DELETE', `/salvadanai/${L.id}`, Bt)).s === 404, 'già eliminato o di un altro: 404');
  verifica((await saldo()).effettivo === '1000.00', 'eliminare non cambia il saldo');

  // ---- Nessun legame con le spese (decisione 73) ----
  // Le spese non mensili hanno la loro cesta, un numero sulla spesa (prove-raccolto.mjs): i salvadanai non sono più collegati e «Spese annuali» non si crea da solo.
  const ass = (await r('POST', '/spese-previste', A, { nome: 'Assicurazione', importo: '400', ogni_mesi: 12, prossima_scadenza: fra3, metti_da_parte: true })).j;
  verifica(ass.metti_da_parte === undefined && ass.raccolto === '0.00', 'la spesa non ha più metti_da_parte e ha il raccolto a zero', ass);
  const albero = await tutti();
  verifica(!albero.some((k) => k.nome === 'Spese annuali') && piatti(albero).every((k) => k.spesa_id === undefined && k.collegato === undefined && k.spesa === undefined), 'nessun «Spese annuali», nessun campo di legame nei salvadanai', albero);
  verifica((await r('DELETE', `/spese-previste/${ass.id}`, A)).s === 204 && (await tutti()).length === albero.length, 'eliminare la spesa non tocca i salvadanai');
} finally {
  try {
    psql(`delete from utenti where email like 'ceste%${n}@prova.it'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ceste${n}@prova.it, ceste-b${n}@prova.it`); }
}

console.log(`prove dei salvadanai: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
