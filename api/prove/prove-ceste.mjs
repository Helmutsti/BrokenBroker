// Prove delle ceste (decisione 71): parti del saldo di un conto; liberi = saldo - ceste; spostamenti a mano; cesta collegata a una spesa.
// Uso: node api/prove/prove-ceste.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea utenti di prova nuovi e alla fine li cancella con i loro dati
// (con `docker compose exec db psql`; se non può lo dice).

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
  const conto = async (nome, saldo, T = A) => {
    const k = (await r('POST', '/conti', T, { nome })).j;
    if (saldo !== undefined) await r('PUT', `/conti/${k.id}/saldo`, T, { importo: saldo });
    return k;
  };
  const datiConto = async (k, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === k.id);
  const tutte = async (T = A) => (await r('GET', '/ceste', T)).j;
  const piatte = (xs) => xs.flatMap((k) => [k, ...piatte(k.figli)]);
  const cesta = async (id, T = A) => piatte(await tutte(T)).find((k) => k.id === id);
  const nuova = async (corpo, T = A) => (await r('POST', '/ceste', T, corpo)).j;
  const sposta = (da, a, importo, T = A) => r('POST', '/ceste/sposta', T, { da, a, importo });

  const principale = await conto('Principale', '1000');
  const secondo = await conto('Secondo', '500');
  const senzaSaldo = await conto('Senza saldo');

  // Liberi = saldo - ceste.
  let k = await datiConto(principale);
  verifica(k.saldo === '1000.00' && k.nelle_ceste === '0.00' && k.liberi === '1000.00', 'conto senza ceste: liberi = saldo', k);
  verifica((await datiConto(senzaSaldo)).liberi === null, 'conto senza saldo: liberi null');

  const A1 = await nuova({ nome: 'Fondo emergenza', conto_id: principale.id, traguardo: '2000' });
  const B1 = await nuova({ nome: 'Giappone', conto_id: principale.id });
  verifica(A1.conto_id === principale.id && A1.saldo === '0.00' && A1.traguardo_effettivo === '2000.00' && A1.percentuale === 0 && B1.traguardo_effettivo === null, 'cesta nuova: vuota, col traguardo scritto', A1);
  verifica((await r('POST', '/ceste', A, { nome: 'Senza conto' })).s === 400, 'una cesta senza conto è rifiutata (400)');
  verifica((await r('POST', '/ceste', A, { nome: 'Conto altrui', conto_id: (await conto('Di Bruno', '10', Bt)).id })).s === 404, 'un conto che non vedi: 404');

  // Dai liberi a una cesta, e ritorno: il saldo del conto non cambia, cambiano i liberi.
  const s1 = await sposta(null, A1.id, '300');
  verifica(s1.s === 201, 'sposta liberi -> cesta', s1);
  k = await datiConto(principale);
  verifica(k.saldo === '1000.00' && k.nelle_ceste === '300.00' && k.liberi === '700.00', 'dopo 300 nella cesta: saldo uguale, liberi 700', k);
  verifica((await cesta(A1.id)).saldo === '300.00' && (await cesta(A1.id)).percentuale === 15, 'la cesta ha 300 (15%)', await cesta(A1.id));
  verifica((await sposta(A1.id, null, '100')).s === 201 && (await cesta(A1.id)).saldo === '200.00' && (await datiConto(principale)).liberi === '800.00', 'sposta cesta -> liberi: 200 nella cesta, liberi 800');
  verifica((await sposta(A1.id, null, '200.01')).s === 400, 'dalla cesta non si prende più di quanto c\'è (400)');
  verifica((await sposta(null, A1.id, '800.01')).s === 400, 'dai liberi non si prende più dei liberi (400)');
  verifica((await sposta(null, A1.id, '0')).s === 400 && (await sposta(null, A1.id, '-5')).s === 400, 'importo zero o negativo: 400');
  verifica((await sposta(null, null, '5')).s === 400 && (await sposta(A1.id, A1.id, '5')).s === 400, 'senza ceste o con lo stesso posto: 400');
  verifica((await sposta(null, A1.id, '10', Bt)).s === 404, 'una cesta che non vedi: 404');
  // Tra ceste dello stesso conto.
  verifica((await sposta(A1.id, B1.id, '50')).s === 201 && (await cesta(A1.id)).saldo === '150.00' && (await cesta(B1.id)).saldo === '50.00' && (await datiConto(principale)).nelle_ceste === '200.00', 'sposta tra due ceste: 150 e 50, in totale 200 nelle ceste');
  // Tra ceste di conti diversi: no.
  const C2 = await nuova({ nome: 'Su un altro conto', conto_id: secondo.id });
  verifica((await sposta(A1.id, C2.id, '10')).s === 400, 'tra ceste di conti diversi: 400');
  // Conto senza saldo: niente liberi da cui prendere.
  const D0 = await nuova({ nome: 'Senza saldo', conto_id: senzaSaldo.id });
  verifica((await sposta(null, D0.id, '10')).s === 400, 'conto senza saldo: nei liberi non c\'è niente (400)');

  // Sotto-ceste: il padre ne fa la somma, la parte propria è a sé.
  const f1 = await nuova({ nome: 'Un mese', padre_id: A1.id, traguardo: '1000' });
  verifica(f1.conto_id === principale.id && f1.padre_id === A1.id, 'la sotto-cesta sta nel conto del padre', f1);
  await sposta(null, f1.id, '100');
  const padre = await cesta(A1.id);
  verifica(padre.saldo === '250.00' && padre.versato === '150.00' && padre.figli[0].saldo === '100.00', 'il padre fa la somma: 150 propri + 100 nella sotto-cesta', padre);
  verifica((await datiConto(principale)).nelle_ceste === '300.00', 'nelle ceste del conto: 150 + 100 + 50', await datiConto(principale));
  verifica((await sposta(A1.id, null, '200')).s === 400, 'dal padre si prende solo la parte propria (400)');
  verifica((await r('PATCH', `/ceste/${A1.id}`, A, { traguardo: null })).j.traguardo_effettivo === '1000.00', 'senza traguardo scritto il padre prende la somma di quelli delle sotto-ceste');
  verifica((await r('POST', '/ceste', A, { nome: 'Altro conto', padre_id: A1.id, conto_id: secondo.id })).s === 400, 'una sotto-cesta nello stesso conto del padre (400)');
  verifica((await r('DELETE', `/ceste/${A1.id}`, A)).s === 409, 'una cesta con sotto-ceste non si elimina (409)');
  verifica((await r('DELETE', `/ceste/${f1.id}`, A)).s === 409, 'una cesta con dei soldi non si elimina (409)');
  await sposta(f1.id, null, '100');
  verifica((await r('DELETE', `/ceste/${f1.id}`, A)).s === 204, 'vuota, la sotto-cesta si elimina');

  // Traguardi di copertura.
  const t = await r('POST', `/ceste/${A1.id}/traguardi`, A, { nome: 'Auto', importo: '300' });
  verifica(t.s === 201 && (await cesta(A1.id)).traguardi[0].percentuale === 50, 'traguardo di copertura: 150 su 300 = 50%', await cesta(A1.id));
  verifica((await r('DELETE', `/ceste/traguardi/${t.j.id}`, A)).s === 204 && (await cesta(A1.id)).traguardi.length === 0, 'il traguardo si elimina');

  // Cesta collegata a una spesa: cifra e data dalla spesa; spuntata, scende della stessa cifra (non sotto zero); tolta la spunta, torna.
  const p = (await r('GET', '/spese-previste', A)).j.periodo;
  const meseA = p.mese;
  const spesa = async (corpo) => (await r('POST', '/spese-previste', A, { conto_id: principale.id, ogni_mesi: 12, ...corpo })).j;
  const ass = await spesa({ nome: 'Assicurazione', importo: '400', prossima_scadenza: `${spostaMese(meseA, 3)}-20` });
  const cAss = await nuova({ nome: 'Assicurazione', conto_id: principale.id, spesa_id: ass.id, traguardo: '999' });
  verifica(cAss.traguardo === null && cAss.traguardo_effettivo === '400.00' && cAss.spesa.importo === '400.00' && cAss.spesa.scadenza === `${spostaMese(meseA, 3)}-20`, 'collegata: cifra e data dalla spesa, niente traguardo scritto', cAss);
  verifica(cAss.manca === '400.00' && cAss.mesi === 4 && cAss.al_mese === '100.00', 'collegata vuota: mancano 400 in 4 mesi, 100 al mese', cAss);
  await sposta(null, cAss.id, '100');
  const cAss2 = await cesta(cAss.id);
  verifica(cAss2.manca === '300.00' && cAss2.al_mese === '75.00' && cAss2.percentuale === 25, 'con 100 dentro: mancano 300, 75 al mese', cAss2);
  verifica((await r('POST', '/ceste', A, { nome: 'Doppia', conto_id: principale.id, spesa_id: ass.id })).s === 409, 'due ceste sulla stessa spesa: 409');
  verifica((await r('POST', '/ceste', A, { nome: 'Dentro la collegata', padre_id: cAss.id })).s === 400, 'una cesta collegata non contiene altre ceste (400)');
  const figlia = await nuova({ nome: 'Provvisoria', padre_id: A1.id });
  verifica((await r('PATCH', `/ceste/${A1.id}`, A, { spesa_id: ass.id })).s === 400 && (await r('PATCH', `/ceste/${A1.id}`, A, { spesa_id: 'non-un-id' })).s === 400, 'una cesta che contiene sotto-ceste non si collega a una spesa (400)');
  verifica((await r('POST', '/ceste', A, { nome: 'Spesa altrui', conto_id: principale.id, spesa_id: '11111111-1111-1111-1111-111111111111' })).s === 404, 'una spesa che non esiste: 404');

  // La spunta: la spesa cade in questo mese (scadenza il 15).
  const bolloM = await spesa({ nome: 'Bollo', importo: '400', prossima_scadenza: `${meseA}-15` });
  const cBollo = await nuova({ nome: 'Bollo', conto_id: principale.id, spesa_id: bolloM.id });
  const spunta = (id, T = A) => r('POST', `/spese-previste/${id}/spunta`, T, { mese: meseA });
  const togli = (id, T = A) => r('DELETE', `/spese-previste/${id}/spunta?mese=${meseA}`, T);
  const stato = async () => ({ conto: (await datiConto(principale)), bollo: await cesta(cBollo.id) });
  // a) La cesta contiene più della cifra: scende della cifra.
  await sposta(null, cBollo.id, '500');
  let x = await stato();
  verifica(x.conto.saldo === '1000.00' && x.bollo.saldo === '500.00' && x.bollo.manca === '0.00', 'prima della spunta: 500 nella cesta, niente manca', x.bollo);
  verifica((await spunta(bolloM.id)).s === 201, 'spunta della spesa collegata');
  x = await stato();
  verifica(x.conto.saldo === '600.00' && x.bollo.saldo === '100.00', 'spunta con 500 dentro: saldo 600, cesta 100', x);
  verifica(x.bollo.spesa.scadenza > `${meseA}-31` && x.bollo.spesa.scadenza.startsWith(String(Number(meseA.slice(0, 4)) + 1)), 'dopo la spunta la data è la prossima volta (fra un anno)', x.bollo.spesa);
  verifica((await togli(bolloM.id)).s === 204, 'tolta la spunta');
  x = await stato();
  verifica(x.conto.saldo === '1000.00' && x.bollo.saldo === '500.00' && x.bollo.spesa.scadenza === `${meseA}-15`, 'tolta la spunta: tutto com\'era (saldo 1000, cesta 500, data di questo mese)', x);
  // b) Contiene meno della cifra: si svuota e il resto esce dai liberi.
  await sposta(cBollo.id, null, '350');
  const prima = await stato();
  verifica(prima.bollo.saldo === '150.00', 'prima: 150 nella cesta', prima.bollo);
  await spunta(bolloM.id);
  x = await stato();
  verifica(x.conto.saldo === '600.00' && x.bollo.saldo === '0.00', 'cesta con 150 e spesa da 400: la cesta si svuota (non va sotto zero), il saldo scende di 400', x);
  verifica(Number(x.conto.liberi) === Number(prima.conto.liberi) - 250, 'il resto (250) esce dai liberi', [x.conto.liberi, prima.conto.liberi]);
  await togli(bolloM.id);
  x = await stato();
  verifica(x.conto.saldo === '1000.00' && x.bollo.saldo === '150.00' && x.conto.liberi === prima.conto.liberi, 'tolta la spunta: la cesta torna a 150 e i liberi come prima', x);
  // c) Cesta vuota: la spunta non la tocca.
  await sposta(cBollo.id, null, '150');
  await spunta(bolloM.id);
  x = await stato();
  verifica(x.bollo.saldo === '0.00' && x.conto.saldo === '600.00', 'cesta vuota: resta a zero, scendono solo il saldo e i liberi', x);
  await togli(bolloM.id);
  // d) Il saldo della cesta non va sotto zero nemmeno rispuntando e togliendo più volte.
  await sposta(null, cBollo.id, '100');
  await spunta(bolloM.id); await togli(bolloM.id); await spunta(bolloM.id); await togli(bolloM.id);
  verifica((await cesta(cBollo.id)).saldo === '100.00' && (await datiConto(principale)).saldo === '1000.00', 'spunta e tolta due volte: tutto com\'era');
  // e) Spesa condivisa: la cesta scende della quota di chi spunta (metà).
  const cond = await spesa({ nome: 'Condivisa', importo: '400', prossima_scadenza: `${meseA}-16` });
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: cond.id, utente_id: regB.utente_id });
  const cCond = await nuova({ nome: 'Condivisa', conto_id: principale.id, spesa_id: cond.id });
  verifica(cCond.spesa.importo === '200.00', 'collegata a una spesa condivisa: la cifra è la mia quota (200)', cCond.spesa);
  await sposta(null, cCond.id, '300');
  await spunta(cond.id);
  verifica((await cesta(cCond.id)).saldo === '100.00' && (await datiConto(principale)).saldo === '800.00', 'condivisa spuntata: la cesta scende di 200 (la quota), non di 400', [(await cesta(cCond.id)).saldo, (await datiConto(principale)).saldo]);
  await togli(cond.id);
  verifica((await cesta(cCond.id)).saldo === '300.00' && (await datiConto(principale)).saldo === '1000.00', 'condivisa: tolta la spunta torna');
  // f) Scollegare la cesta: torna a un traguardo scritto.
  const scoll = await r('PATCH', `/ceste/${cBollo.id}`, A, { spesa_id: null, traguardo: '700' });
  verifica(scoll.s === 200 && scoll.j.spesa === null && scoll.j.traguardo_effettivo === '700.00' && scoll.j.manca === null, 'scollegata: traguardo scritto e niente spesa', scoll.j);
  await spunta(bolloM.id);
  verifica((await cesta(cBollo.id)).saldo === '100.00', 'scollegata: la spunta non tocca più la cesta');
  await togli(bolloM.id);
  // g) Eliminando la spesa la cesta resta, scollegata.
  await r('DELETE', `/spese-previste/${ass.id}`, A);
  const dopoElimina = await cesta(cAss.id);
  verifica(dopoElimina && dopoElimina.spesa === null && dopoElimina.saldo === '100.00', 'eliminata la spesa la cesta resta, scollegata e con i suoi soldi', dopoElimina);

  // Conto condiviso: l'altra persona vede le ceste e il saldo uguale, e può spostare i soldi.
  verifica((await cesta(A1.id, Bt)) === undefined, 'prima della condivisione B non vede le ceste');
  await r('POST', '/condivisioni', A, { voce: 'conto', id: principale.id, utente_id: regB.utente_id });
  const viste = await cesta(A1.id, Bt);
  verifica(viste && viste.nome === 'Fondo emergenza' && viste.saldo === (await cesta(A1.id)).saldo, 'conto condiviso: B vede la cesta con gli stessi soldi', viste);
  const kB = await datiConto(principale, Bt);
  verifica(kB.liberi === (await datiConto(principale)).liberi && kB.nelle_ceste === (await datiConto(principale)).nelle_ceste, 'i liberi sono uguali per tutti e due', kB);
  verifica((await sposta(null, B1.id, '10', Bt)).s === 201 && (await cesta(B1.id)).saldo === '60.00', 'B sposta dei soldi in una cesta del conto condiviso');
  verifica((await r('DELETE', `/ceste/${B1.id}`, Bt)).s === 409 || (await r('DELETE', `/ceste/${B1.id}`, Bt)).s === 403, 'B non cancella la cesta di A (403/409)');

  // Eliminare un conto porta via le sue ceste.
  const tmp = await conto('Provvisorio', '100');
  const cTmp = await nuova({ nome: 'Provvisoria', conto_id: tmp.id });
  verifica((await r('DELETE', `/conti/${tmp.id}`, A)).s === 204 && (await cesta(cTmp.id)) === undefined, 'eliminato il conto spariscono le sue ceste');
} finally {
  try {
    psql(`delete from utenti where email like 'ceste%${n}@prova.it'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ceste${n}@prova.it, ceste-b${n}@prova.it`); }
}

console.log(`prove delle ceste: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
