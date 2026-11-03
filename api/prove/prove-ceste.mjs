// Prove dei salvadanai (decisione 72; la tabella si chiama `ceste`): liberi, annidabili, versare e prelevare a mano, eliminare, collegamento con
// le spese annuali («metti da parte»).
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
  verifica(A1.padre_id === null && A1.dentro === '0.00' && A1.versato === '0.00' && A1.traguardo === '2000.00' && A1.scadenza === fra3 && A1.collegato === false, 'salvadanaio nuovo: in cima, vuoto, con traguardo e data', A1);
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

  // ---- Il legame con le annuali ----
  const spesa = async (corpo, T = A) => (await r('POST', '/spese-previste', T, { importo: '400', ogni_mesi: 12, ...corpo })).j;
  const spesaDi = async (id) => (await r('GET', `/spese-previste/${id}`, A)).j;
  const annuali = async () => (await tutti()).filter((k) => k.nome === 'Spese annuali' && k.padre_id === null);
  verifica((await annuali()).length === 0, 'prima di metterne una da parte «Spese annuali» non c\'è');

  const ass = await spesa({ nome: 'Assicurazione', prossima_scadenza: fra3, metti_da_parte: true });
  verifica(ass.metti_da_parte === true, 'la spesa dice metti_da_parte', ass);
  verifica((await annuali()).length === 1 && (await annuali())[0].icona === 'calendar-clock', 'creato «Spese annuali» in cima (icona calendario)', await annuali());
  let cAss = (await annuali())[0].figli.find((k) => k.spesa_id === ass.id);
  verifica(cAss && cAss.nome === 'Assicurazione' && cAss.collegato === true && cAss.traguardo === '400.00' && cAss.scadenza === fra3 && cAss.mancano === '400.00' && cAss.mesi === 4 && cAss.metti_al_mese === '100.00', 'sotto-salvadanaio collegato: traguardo = quota, data = scadenza, 100 al mese', cAss);
  verifica(cAss.spesa && cAss.spesa.importo === '400.00' && cAss.spesa.scadenza === fra3, 'e porta i dati della spesa', cAss.spesa);
  const ass2 = await spesa({ nome: 'Bollo auto', importo: '120', prossima_scadenza: `${spostaMese(meseA, 5)}-10`, metti_da_parte: true });
  verifica((await annuali()).length === 1 && (await annuali())[0].figli.length === 2 && (await annuali())[0].traguardo === '520.00', 'la seconda va nello stesso «Spese annuali», che fa la somma dei traguardi (520)', await annuali());

  // Collegato: nome, traguardo, data e posto si cambiano solo dalla spesa; versare e prelevare si può.
  const bloccato = async (corpo) => r('PATCH', `/salvadanai/${cAss.id}`, A, corpo);
  const rn = await bloccato({ nome: 'Altro' });
  verifica(rn.s === 409 && rn.j.errore === 'Si cambia dalla spesa', 'nome del collegato: 409 «Si cambia dalla spesa»', rn);
  verifica((await bloccato({ traguardo: '5' })).s === 409 && (await bloccato({ scadenza: '2030-01-01' })).s === 409 && (await bloccato({ padre_id: null })).s === 409, 'traguardo, data e posto del collegato: 409');
  verifica((await bloccato({ icona: 'car' })).s === 200, 'l\'icona del collegato si cambia');
  verifica((await r('DELETE', `/salvadanai/${cAss.id}`, A)).s === 409, 'il collegato non si elimina da qui (409)');
  verifica((await r('POST', '/salvadanai', A, { nome: 'Dentro il collegato', padre_id: cAss.id })).s === 400, 'il collegato non contiene altri salvadanai (400)');
  verifica((await sposta(null, cAss.id, '100')).s === 201 && (await sal(cAss.id)).mancano === '300.00' && (await sal(cAss.id)).metti_al_mese === '75.00' && (await sal(cAss.id)).percentuale === 25, 'versare nel collegato: dentro 100, mancano 300, 75 al mese');

  // La spesa cambia, il salvadanaio segue.
  await r('PATCH', `/spese-previste/${ass.id}`, A, { importo: '600', nome: 'Assicurazione auto' });
  cAss = await sal(cAss.id);
  verifica(cAss.nome === 'Assicurazione auto' && cAss.traguardo === '600.00' && cAss.mancano === '500.00', 'cambiando importo e nome della spesa il salvadanaio segue', cAss);
  await r('PATCH', `/spese-previste/${ass.id}`, A, { importo: '400', nome: 'Assicurazione' });

  // Spesa condivisa: il traguardo è la mia quota.
  const cond = await spesa({ nome: 'Condivisa', importo: '400', prossima_scadenza: `${meseA}-16`, metti_da_parte: true });
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: cond.id, utente_id: regB.utente_id });
  verifica((await piatti(await tutti()).find((k) => k.spesa_id === cond.id)).traguardo === '200.00', 'collegato a una spesa condivisa: il traguardo è la mia quota (200)');

  // La spunta: la spesa cade in questo mese (scadenza il 15). Il salvadanaio scende della quota (non sotto zero) e il saldo della stessa cifra.
  const bollo = await spesa({ nome: 'Bollo', prossima_scadenza: `${meseA}-15`, metti_da_parte: true });
  const cBollo = piatti(await tutti()).find((k) => k.spesa_id === bollo.id);
  const spunta = (id, T = A) => r('POST', `/spese-previste/${id}/spunta`, T, { mese: meseA });
  const togli = (id, T = A) => r('DELETE', `/spese-previste/${id}/spunta?mese=${meseA}`, T);
  const stato = async () => ({ saldo: (await saldo()).effettivo, bollo: await sal(cBollo.id) });
  // a) Contiene più della quota: scende della quota.
  await sposta(null, cBollo.id, '500');
  let x = await stato();
  verifica(x.saldo === '1000.00' && x.bollo.dentro === '500.00' && x.bollo.mancano === '0.00' && x.bollo.metti_al_mese === '0.00', 'prima della spunta: 500 dentro, niente manca', x);
  verifica((await spunta(bollo.id)).s === 201, 'spunta della spesa collegata');
  x = await stato();
  verifica(x.saldo === '600.00' && x.bollo.dentro === '100.00', 'spunta con 500 dentro: saldo 600, salvadanaio 100', x);
  verifica(x.bollo.scadenza > `${meseA}-31` && x.bollo.scadenza.startsWith(String(Number(meseA.slice(0, 4)) + 1)) && x.bollo.mancano === '300.00', 'dopo la spunta la data è la prossima volta (fra un anno) e il traguardo riparte (300 da mettere)', x.bollo);
  verifica((await togli(bollo.id)).s === 204, 'tolta la spunta');
  x = await stato();
  verifica(x.saldo === '1000.00' && x.bollo.dentro === '500.00' && x.bollo.scadenza === `${meseA}-15`, 'tolta la spunta: tutto com\'era (saldo 1000, salvadanaio 500, data di questo mese)', x);
  // b) Contiene meno della quota: si svuota (non va sotto zero), il saldo scende dell'intera quota.
  await sposta(cBollo.id, null, '350');
  await spunta(bollo.id);
  x = await stato();
  verifica(x.saldo === '600.00' && x.bollo.dentro === '0.00', 'con 150 dentro e spesa da 400: il salvadanaio si svuota, il saldo scende di 400', x);
  await togli(bollo.id);
  x = await stato();
  verifica(x.saldo === '1000.00' && x.bollo.dentro === '150.00', 'tolta la spunta: il salvadanaio torna a 150', x);
  // c) Vuoto: la spunta non lo tocca. Rispuntando e togliendo più volte non va mai sotto zero.
  await sposta(cBollo.id, null, '150');
  await spunta(bollo.id); await togli(bollo.id); await spunta(bollo.id); await togli(bollo.id);
  verifica((await sal(cBollo.id)).dentro === '0.00' && (await saldo()).effettivo === '1000.00', 'vuoto: resta a zero, rispuntato e tolto due volte: tutto com\'era');
  // d) Spesa una tantum già spuntata: niente data, niente da mettere da parte.
  const unaV = await spesa({ nome: 'Divano', importo: '300', ogni_mesi: null, prossima_scadenza: `${meseA}-12`, metti_da_parte: true });
  const cUna = piatti(await tutti()).find((k) => k.spesa_id === unaV.id);
  verifica(cUna && cUna.scadenza === `${meseA}-12` && cUna.traguardo === '300.00', 'una tantum: si mette da parte, data = la sua data', cUna);
  await spunta(unaV.id);
  const unaPagata = await sal(cUna.id);
  verifica(unaPagata.spesa.pagata === true && unaPagata.scadenza === null && unaPagata.mancano === '0.00' && unaPagata.metti_al_mese === null, 'una tantum pagata: niente data, niente da mettere da parte', unaPagata);
  await togli(unaV.id);

  // Spegnere: i soldi vanno in «Spese annuali» e il collegato sparisce; la spesa dice metti_da_parte falso.
  const prima = await sal((await annuali())[0].id);
  verifica((await r('PATCH', `/spese-previste/${ass.id}`, A, { metti_da_parte: false })).j.metti_da_parte === false, 'spenta la spesa: metti_da_parte falso');
  const dopoSpento = await sal(prima.id);
  verifica(await sal(cAss.id) === undefined && dopoSpento.versato === '100.00' && Number(dopoSpento.dentro) === Number(prima.dentro), 'il collegato sparisce, i suoi 100 sono in «Spese annuali» (stesso totale)', dopoSpento);
  // Riaccendere: ne nasce uno nuovo, vuoto.
  verifica((await r('PATCH', `/spese-previste/${ass.id}`, A, { metti_da_parte: true })).j.metti_da_parte === true, 'riaccesa');
  verifica(piatti(await tutti()).filter((k) => k.spesa_id === ass.id).length === 1 && (await annuali()).length === 1, 'un solo collegato, un solo «Spese annuali»');
  // Cambiare in mensile spegne; la mensile non si mette da parte.
  verifica((await r('PATCH', `/spese-previste/${ass2.id}`, A, { ogni_mesi: 1, giorno_mese: 5 })).j.metti_da_parte === false && piatti(await tutti()).every((k) => k.spesa_id !== ass2.id), 'una spesa che diventa mensile perde il collegato');
  verifica((await r('PATCH', `/spese-previste/${ass2.id}`, A, { metti_da_parte: true })).s === 400, 'una mensile non si mette da parte (400)');
  // Eliminare la spesa: i soldi del collegato vanno in «Spese annuali».
  await sposta(null, piatti(await tutti()).find((k) => k.spesa_id === ass.id).id, '40');
  const prima2 = await sal((await annuali())[0].id);
  verifica((await r('DELETE', `/spese-previste/${ass.id}`, A)).s === 204 && piatti(await tutti()).every((k) => k.spesa_id !== ass.id), 'eliminata la spesa sparisce il suo collegato');
  const dopo2 = await sal(prima2.id);
  verifica(dopo2.versato === (Number(prima2.versato) + 40).toFixed(2), 'e i suoi 40 vanno in «Spese annuali»', [prima2.versato, dopo2.versato]);
  // Chi riceve una spesa non la mette da parte.
  verifica((await r('PATCH', `/spese-previste/${cond.id}`, Bt, { metti_da_parte: true })).s === 403, 'chi riceve una spesa condivisa non la mette da parte (403)');

  // Un «Spese annuali» già esistente in cima si riusa.
  const miaB = await nuovo({ nome: 'Spese annuali' }, Bt);
  const sB = await spesa({ nome: 'Di Bruno', prossima_scadenza: fra3, metti_da_parte: true }, Bt);
  const treB = await tutti(Bt);
  verifica(treB.filter((k) => k.nome === 'Spese annuali' && k.padre_id === null).length === 1 && (await sal(miaB.id, Bt)).figli.some((k) => k.spesa_id === sB.id), 'un «Spese annuali» già in cima si riusa', treB);
} finally {
  try {
    psql(`delete from utenti where email like 'ceste%${n}@prova.it'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ceste${n}@prova.it, ceste-b${n}@prova.it`); }
}

console.log(`prove dei salvadanai: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
