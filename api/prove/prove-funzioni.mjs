// Prove delle funzioni dell'API contro l'API in esecuzione (docker compose up).
// Uso: node api/prove/prove-funzioni.mjs [indirizzo]   (di base http://localhost:3000)
// Crea due utenti di prova nuovi a ogni giro.

const B = process.argv[2] ?? 'http://localhost:3000';
let ok = 0, ko = 0;
const verifica = (cond, msg, extra) => { if (cond) ok++; else { ko++; console.log('FALLITO:', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function r(metodo, path, token, body) {
  const res = await fetch(B + path, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  return { s: res.status, j: t ? JSON.parse(t) : null };
}

const n = Date.now();
const a = (await r('POST', '/accesso/registrazione', null, { email: `a${n}@prova.it`, nome: 'Anna', password: 'password-lunga-a' })).j;
const b = (await r('POST', '/accesso/registrazione', null, { email: `b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;
const A = a.token, Bt = b.token;

// Profilo e mese personale
const prof = await r('PATCH', '/profilo', A, { stipendio_netto: '2000', inizio_mese: 10 });
verifica(prof.j.inizio_mese === 10, 'inizio mese', prof.j);
verifica((await r('PATCH', '/profilo', A, { inizio_mese: 31 })).s === 400, 'inizio mese oltre 28 rifiutato');

// Icone delle categorie standard
const cat = (await r('GET', '/categorie?formato=elenco', A)).j;
const casa = cat.find((c) => c.nome === 'Casa' && !c.padre_id);
const bollette = cat.find((c) => c.nome === 'Bollette');
const luce = cat.find((c) => c.nome === 'Luce');
const supermercato = cat.find((c) => c.nome === 'Supermercato');
const cibo = cat.find((c) => c.nome === 'Cibo' && !c.padre_id);
verifica(casa.icona === 'house' && bollette.icona === 'zap' && luce.icona === null, 'icone standard', [casa.icona, bollette.icona]);

const conto = (await r('POST', '/conti', A, { nome: 'BPER' })).j;

// Spese previste
const affitto = await r('POST', '/spese-previste', A, { nome: 'Affitto', importo: '700', conto_id: conto.id, categoria_id: casa.id, prossima_scadenza: '2026-01-12' });
verifica(affitto.s === 201 && affitto.j.ogni_mesi === 1, 'spesa mensile', affitto.j);
const luceSp = (await r('POST', '/spese-previste', A, { nome: 'Luce', importo: '60', ogni_mesi: 2, conto_id: conto.id, categoria_id: luce.id, prossima_scadenza: '2026-02-15' })).j;
verifica(luceSp.icona === 'zap', 'icona ereditata dal padre', luceSp.icona);
const tari = (await r('POST', '/spese-previste', A, { nome: 'Tari', importo: '240', ogni_mesi: 12, conto_id: conto.id, categoria_id: casa.id, prossima_scadenza: '2026-11-20' })).j;
const spesaBudget = (await r('POST', '/budget', A, { categoria_id: cibo.id, importo: '400' })).j;
verifica(spesaBudget.categoria === 'Cibo' && spesaBudget.importo === '400.00' && spesaBudget.sforo === '0.00' && !('modo' in spesaBudget) && !('promemoria' in spesaBudget) && !('conto_id' in spesaBudget) && !('partenza_id' in spesaBudget) && !('uscito' in spesaBudget), 'budget creato da una categoria (senza modi, senza promemoria né conti: una lente)', spesaBudget);
verifica((await r('POST', '/budget', A, { categoria_id: cibo.id, importo: '10' })).s === 409, 'un solo budget per categoria (409)');
verifica((await r('POST', '/spese-previste', A, { nome: 'Vecchio budget', tipo: 'budget', importo: '5' })).s === 400, 'tipo budget non esiste più nelle spese (400)');
verifica((await r('GET', '/categorie?formato=elenco', A)).j.find((c) => c.id === cibo.id).budget?.id === spesaBudget.id, '/categorie dice il budget di ogni categoria');
verifica((await r('DELETE', `/categorie/${cibo.id}`, A)).s === 409, 'una categoria con un budget non si elimina (409)');
verifica((await r('POST', '/spese-previste', A, { nome: 'X', importo: '-3' })).s === 400, 'importo negativo rifiutato');
verifica((await r('POST', '/spese-previste', A, { nome: 'Una', importo: '30', ogni_mesi: null })).s === 400, 'una tantum senza data rifiutata');

const ott = (await r('GET', '/spese-previste?mese=2026-10', A)).j;
verifica(ott.periodo.dal === '2026-10-10' && ott.periodo.al === '2026-11-09', 'periodo dal 10', ott.periodo);
const sp = (nome, elenco = ott) => elenco.spese.find((s) => s.nome === nome);
verifica(sp('Affitto').scadenza === '2026-10-12' && sp('Affitto').nel_mese, 'affitto a ottobre');
verifica(sp('Luce').scadenza === '2026-10-15', 'luce bimestrale a ottobre', sp('Luce').scadenza);
verifica(sp('Tari').nel_mese === false, 'tari non a ottobre');
const nov = (await r('GET', '/spese-previste?mese=2026-11', A)).j;
verifica(sp('Tari', nov).scadenza === '2026-11-20' && sp('Luce', nov).nel_mese === false, 'tari a novembre, luce no');
// Mensili: solo il giorno del mese, nessuna data (decisione 44). Inizio mese = 10: periodo 10/10-09/11.
const mens = async (corpo) => (await r('POST', '/spese-previste', A, { importo: '10', conto_id: conto.id, categoria_id: casa.id, ...corpo })).j;
const m24 = await mens({ nome: 'Mensile 24', giorno_mese: 24 }), m2 = await mens({ nome: 'Mensile 2', giorno_mese: 2 }), m31 = await mens({ nome: 'Mensile 31', giorno_mese: 31 });
const m10 = await mens({ nome: 'Mensile 10', giorno_mese: 10 }), m9 = await mens({ nome: 'Mensile 9', giorno_mese: 9 }), mSenza = await mens({ nome: 'Mensile senza' });
const vecchio = await mens({ nome: 'Mensile da data', prossima_scadenza: '2026-11-24' }); // compatibilità: la data diventa il giorno
verifica(m24.giorno_mese === 24 && m24.prossima_scadenza === null && mSenza.giorno_mese === null && mSenza.prossima_scadenza === null, 'mensile: solo giorno_mese, niente data', [m24.giorno_mese, m24.prossima_scadenza]);
verifica(vecchio.giorno_mese === 24 && vecchio.prossima_scadenza === null, 'prossima_scadenza su una mensile diventa il giorno', vecchio);
const mensiliA = async (mese) => (await r('GET', `/spese-previste?mese=${mese}`, A)).j;
const o1 = await mensiliA('2026-10');
verifica(sp('Mensile 24', o1).scadenza === '2026-10-24' && sp('Mensile 24', o1).nel_mese, 'giorno >= inizio: nel mese, 24/10', sp('Mensile 24', o1).scadenza);
verifica(sp('Mensile 2', o1).scadenza === '2026-11-02' && sp('Mensile 2', o1).nel_mese, 'giorno < inizio: 2/11 nello stesso mese personale', sp('Mensile 2', o1).scadenza);
verifica(sp('Mensile 10', o1).scadenza === '2026-10-10' && sp('Mensile 9', o1).scadenza === '2026-11-09', 'giorno = inizio e giorno = inizio-1', [sp('Mensile 10', o1).scadenza, sp('Mensile 9', o1).scadenza]);
verifica(sp('Mensile 31', o1).scadenza === '2026-10-31', 'giorno 31 in ottobre', sp('Mensile 31', o1).scadenza);
verifica(sp('Mensile senza', o1).scadenza === '2026-10-10' && sp('Mensile senza', o1).nel_mese, 'senza giorno: tutto il mese, data = inizio periodo', sp('Mensile senza', o1).scadenza);
const o2 = await mensiliA('2026-02'), o3 = await mensiliA('2027-01'), o4 = await mensiliA('2026-09');
verifica(sp('Mensile 31', o2).scadenza === '2026-02-28' && sp('Mensile 24', o2).scadenza === '2026-02-24', 'giorno 31 in un mese corto: ultimo giorno', [sp('Mensile 31', o2).scadenza, sp('Mensile 24', o2).scadenza]);
verifica(sp('Mensile 2', o2).scadenza === '2026-03-02' && sp('Mensile 31', o3).scadenza === '2027-01-31', 'giorno < inizio a fine febbraio; gennaio 31', [sp('Mensile 2', o2).scadenza, sp('Mensile 31', o3).scadenza]);
verifica(sp('Mensile 24', o4).scadenza === '2026-09-24' && sp('Mensile 24', o4).nel_mese, 'mensile in ogni mese personale, anche prima della creazione', sp('Mensile 24', o4).scadenza);
// Spunta mensile: conta per mese personale
const spM = await r('POST', `/spese-previste/${m2.id}/spunta`, A, { mese: '2026-10', data: '2026-11-02' });
verifica(spM.s === 201, 'spunta di una mensile col giorno nel mese personale (2/11)', spM.j);
verifica(sp('Mensile 2', await mensiliA('2026-10')).uscita === true && sp('Mensile 2', await mensiliA('2026-11')).uscita === false, 'la spunta conta solo nel suo mese personale');
// Rifiuti e cambio di frequenza
verifica((await r('POST', '/spese-previste', A, { nome: 'X', importo: '5', giorno_mese: 32 })).s === 400, 'giorno_mese 32 rifiutato');
verifica((await r('POST', '/spese-previste', A, { nome: 'X', importo: '5', ogni_mesi: 12, prossima_scadenza: '2026-11-20', giorno_mese: 5 })).s === 400, 'giorno_mese su una non mensile rifiutato');
let c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { giorno_mese: 5 });
verifica(c1.j.giorno_mese === 5 && sp('Mensile 24', await mensiliA('2026-10')).scadenza === '2026-11-05', 'cambio giorno', c1.j);
c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { giorno_mese: null });
verifica(c1.j.giorno_mese === null && sp('Mensile 24', await mensiliA('2026-10')).scadenza === '2026-10-10', 'togli il giorno: senza giorno', c1.j);
verifica((await r('PATCH', `/spese-previste/${m24.id}`, A, { ogni_mesi: 12 })).s === 400, 'da mensile ad annuale serve il mese');
c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { ogni_mesi: 12, prossima_scadenza: '2026-11-20', senza_giorno: false, giorno_mese: null });
verifica(c1.s === 200 && c1.j.ogni_mesi === 12 && c1.j.giorno_mese === null && c1.j.prossima_scadenza === '2026-11-20' && sp('Mensile 24', await mensiliA('2026-11')).scadenza === '2026-11-20', 'da mensile ad annuale', c1.j);
c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { ogni_mesi: 1, giorno_mese: 15, prossima_scadenza: null });
verifica(c1.s === 200 && c1.j.giorno_mese === 15 && c1.j.prossima_scadenza === null && c1.j.senza_giorno === false, 'da annuale a mensile col giorno', c1.j);
c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { ogni_mesi: 6, prossima_scadenza: '2026-12-01', senza_giorno: true });
verifica(c1.j.ogni_mesi === 6 && c1.j.giorno_mese === null && c1.j.senza_giorno === true, 'da mensile a ogni 6 mesi senza giorno', c1.j);
c1 = await r('PATCH', `/spese-previste/${m24.id}`, A, { ogni_mesi: 1 });
verifica(c1.s === 200 && c1.j.ogni_mesi === 1 && c1.j.giorno_mese === null && c1.j.prossima_scadenza === null && c1.j.senza_giorno === false, 'da periodica a mensile senza altro: senza giorno', c1.j);
for (const x of [m24, m2, m31, m10, m9, mSenza, vecchio]) await r('DELETE', `/spese-previste/${x.id}`, A);

// Spunta
const sp1 = await r('POST', `/spese-previste/${affitto.j.id}/spunta`, A, { mese: '2026-10', data: '2026-10-12' });
// La spunta è un segno (proposta v5): nessun movimento sul conto.
verifica(sp1.s === 201 && sp1.j.data === '2026-10-12' && sp1.j.importo === undefined, 'spunta è un segno', sp1.j);
verifica((await r('POST', `/spese-previste/${affitto.j.id}/spunta`, A, { mese: '2026-10' })).s === 409, 'doppia spunta 409');
// Decisione 57: nessun promemoria dai budget, quindi niente spunte, niente conti del budget, niente impostazioni dei budget.
verifica((await r('POST', `/budget/${spesaBudget.id}/spunta`, A, { mese: '2026-10' })).s === 404 && (await r('DELETE', `/budget/${spesaBudget.id}/spunta?mese=2026-10`, A)).s === 404, 'un budget non si spunta più (404)');
verifica((await r('GET', '/budget/impostazioni', A)).s === 404 && (await r('PUT', '/budget/impostazioni', A, { partenza_id: conto.id })).s === 404, 'le impostazioni dei budget non esistono più (404)');
const budgetPatch = await r('PATCH', `/budget/${spesaBudget.id}`, A, { promemoria: true, conto_id: conto.id, importo: '400' });
verifica(budgetPatch.s === 200 && !('promemoria' in budgetPatch.j) && !('conto_id' in budgetPatch.j), 'i campi del vecchio promemoria vengono ignorati', budgetPatch.j);
verifica(!(await r('GET', '/spese-previste?mese=2026-10', A)).j.spese.some((x) => x.tipo === 'budget'), 'i budget non sono più tra le spese');
verifica((await r('POST', `/spese-previste/${luceSp.id}/spunta`, A, { mese: '2026-10', data: '2026-12-01' })).s === 400, 'data fuori dal mese');
let ott2 = (await r('GET', '/spese-previste?mese=2026-10', A)).j;
verifica(sp('Affitto', ott2).uscita === true, 'affitto uscito (spunta)');

ott2 = (await r('GET', '/spese-previste?mese=2026-10', A)).j;

verifica((await r('DELETE', `/spese-previste/${affitto.j.id}/spunta?mese=2026-10`, A)).s === 204, 'togli spunta');
ott2 = (await r('GET', '/spese-previste?mese=2026-10', A)).j;
verifica(sp('Affitto', ott2).uscita === false, 'affitto non più uscito');
await r('POST', `/spese-previste/${affitto.j.id}/spunta`, A, { mese: '2026-10', data: '2026-10-12' });

// Condivisione e quote
const persona = await r('POST', '/condivisioni', A, { voce: 'spesa', id: affitto.j.id, email: `b${n}@prova.it` });
verifica(persona.s === 201, 'condivisione spesa', persona.j);
verifica((await r('POST', '/condivisioni', A, { voce: 'spesa', id: affitto.j.id, email: 'nessuno@prova.it' })).s === 404, 'email sconosciuta 404');
verifica((await r('POST', '/condivisioni', Bt, { voce: 'spesa', id: affitto.j.id, email: `a${n}@prova.it` })).s === 403, 'solo il creatore condivide');
const vistaB = (await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, Bt)).j;
verifica(vistaB.mia_quota === '350.00' && vistaB.condivisa === true, 'quota di base metà', vistaB.mia_quota);
const persone = (await r('GET', '/persone', A)).j;
verifica(persone.length === 2 && persone[0].io, 'persone collegate', persone);
verifica((await r('PUT', `/spese-previste/${affitto.j.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '60' }, { utente_id: b.utente_id, percentuale: '30' }] })).s === 400, 'quote non a 100');
verifica((await r('PUT', `/spese-previste/${affitto.j.id}/quote`, Bt, { quote: [{ utente_id: a.utente_id, percentuale: '60' }, { utente_id: b.utente_id, percentuale: '40' }] })).s === 204, 'quote 60/40');
verifica((await r('PUT', `/spese-previste/${affitto.j.id}/quote`, Bt, { quote: [{ utente_id: b.utente_id, percentuale: '70' }] })).s === 204, 'quota sola (non specificata)');
verifica((await r('PUT', `/spese-previste/${affitto.j.id}/quote`, Bt, { quote: [{ utente_id: a.utente_id, percentuale: '70' }] })).s === 400, 'quota sola di un altro rifiutata');
verifica((await r('PUT', `/spese-previste/${affitto.j.id}/quote`, Bt, { quote: [{ utente_id: b.utente_id, percentuale: '100' }] })).s === 204, 'quota sola al 100: tutto a B (somma 100)');
await r('PUT', `/spese-previste/${affitto.j.id}/quote`, Bt, { quote: [{ utente_id: a.utente_id, percentuale: '60' }, { utente_id: b.utente_id, percentuale: '40' }] });
verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j.mia_quota === '420.00', 'quota 60%');
// Dividere e condividere sono scelte indipendenti: togliere la condivisione non cancella le quote.
{
  const sp = (await r('POST', '/spese-previste', A, { nome: 'Divisa', importo: '100', conto_id: conto.id, categoria_id: casa.id })).j;
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: sp.id, utente_id: b.utente_id });
  await r('PUT', `/spese-previste/${sp.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const cd = (await r('GET', '/condivisioni', A)).j.find((x) => x.voce_id === sp.id);
  verifica((await r('DELETE', `/condivisioni/${cd.id}`, A)).s === 204, 'tolgo la condivisione della spesa divisa');
  const dopo = (await r('GET', `/spese-previste/${sp.id}`, A)).j;
  verifica(dopo.condivisa === false && dopo.quote.length === 2 && dopo.mia_percentuale === 50, 'senza condivisione la divisione a metà resta', dopo.quote);
  verifica(dopo.quote.some((q) => q.utente_id === b.utente_id && Number(q.percentuale) === 50), 'resta anche la persona della divisione', dopo.quote);
  const bu = spesaBudget;
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bu.id, utente_id: b.utente_id });
  await r('PUT', `/budget/${bu.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const cb = (await r('GET', '/condivisioni', A)).j.find((x) => x.voce_id === bu.id);
  verifica((await r('DELETE', `/condivisioni/${cb.id}`, A)).s === 204, 'tolgo la condivisione del budget diviso');
  const bdopo = (await r('GET', `/budget/${bu.id}`, A)).j;
  verifica(bdopo.condiviso === false && bdopo.mia_percentuale === 50 && bdopo.quote.some((q) => q.utente_id === b.utente_id), 'budget: la divisione resta senza condivisione', bdopo.quote);
  await r('PUT', `/budget/${bu.id}/quote`, A, { quote: [] });
  await r('DELETE', `/spese-previste/${sp.id}`, A);
}

verifica((await r('DELETE', `/spese-previste/${affitto.j.id}`, Bt)).s === 403, "l'altro non cancella la spesa");

const cond = (await r('GET', '/condivisioni', Bt)).j;
verifica(cond.length === 1 && cond[0].nome === 'Affitto' && cond[0].mia === false, 'elenco condivisioni', cond);
verifica((await r('DELETE', `/condivisioni/${cond[0].id}`, Bt)).s === 403, "l'altro non toglie la condivisione");

// Condivisione scegliendo la persona dall'elenco (senza email)
const tutte = (await r('GET', '/persone/tutte', A)).j;
verifica(tutte.length >= 1 && tutte.some((x) => x.id === b.utente_id) && !tutte.some((x) => x.id === a.utente_id) && !('email' in tutte[0]), 'elenco altre persone', tutte);
const spesaInDue = (await r('POST', '/spese-previste', A, { nome: 'Spesa in due', importo: '20', conto_id: conto.id, categoria_id: casa.id })).j;
verifica((await r('POST', '/condivisioni', A, { voce: 'spesa', id: spesaInDue.id, utente_id: '00000000-0000-4000-8000-000000000000' })).s === 404, 'utente_id sconosciuto 404');
verifica((await r('POST', '/condivisioni', A, { voce: 'spesa', id: spesaInDue.id, utente_id: b.utente_id })).s === 201, 'condivisione con utente_id');
await r('DELETE', `/spese-previste/${spesaInDue.id}`, A);

// I conti sono solo etichette (decisione 59): nome, icona, archiviato; niente saldo, niente condivisione.
const etichetta = (await r('POST', '/conti', A, { nome: 'Conto in due', icona: 'wallet' })).j;
verifica(Object.keys(etichetta).sort().join() === 'archiviato,icona,id,nome' && etichetta.nome === 'Conto in due' && etichetta.icona === 'wallet' && etichetta.archiviato === false, 'il conto è solo un\'etichetta: id, nome, icona, archiviato', etichetta);
verifica(Object.keys((await r('GET', `/conti/${etichetta.id}`, A)).j).sort().join() === 'archiviato,icona,id,nome', 'GET /conti/:id: solo i campi dell\'etichetta');
verifica((await r('POST', '/condivisioni', A, { voce: 'conto', id: etichetta.id, utente_id: b.utente_id })).s === 400, 'i conti non si condividono più (voce conto: 400)');
verifica(!(await r('GET', '/conti', Bt)).j.some((x) => x.id === etichetta.id) && (await r('GET', `/conti/${etichetta.id}`, Bt)).s === 404, 'l\'etichetta di un altro non si vede (404)');
verifica((await r('PUT', `/conti/${etichetta.id}/saldo`, A, { importo: '1250.40' })).s === 404 && (await r('GET', `/conti/${etichetta.id}/movimenti`, A)).s === 404, 'il saldo e i movimenti del conto non esistono più (404)');
verifica((await r('PATCH', `/conti/${etichetta.id}`, A, { nome: 'Conto rinominato', archiviato: true })).j.nome === 'Conto rinominato' && (await r('PATCH', `/conti/${etichetta.id}`, Bt, { nome: 'x' })).s === 404, 'l\'etichetta si rinomina, solo da chi la vede');
await r('PATCH', `/conti/${etichetta.id}`, A, { archiviato: false });

// Obiettivi, versamenti, traguardi, crea spesa
const fondo = (await r('POST', '/obiettivi', A, { nome: 'Fondo emergenza' })).j;
const uno = (await r('POST', '/obiettivi', A, { nome: 'Un mese', padre_id: fondo.id, traguardo: '1000' })).j;
const due = (await r('POST', '/obiettivi', A, { nome: 'Due mesi', padre_id: fondo.id, traguardo: '2000' })).j;
await r('POST', `/obiettivi/${uno.id}/versamenti`, A, { importo: '1000' });
const dopo = (await r('POST', `/obiettivi/${due.id}/versamenti`, A, { importo: '500' })).j;
verifica(dopo.saldo === '500.00' && dopo.percentuale === 25, 'saldo sotto-obiettivo', dopo);
await r('POST', `/obiettivi/${fondo.id}/traguardi`, A, { nome: 'Auto', importo: '3000' });
await r('POST', `/obiettivi/${fondo.id}/traguardi`, A, { nome: 'Dentista', importo: '800' });
const albero = (await r('GET', '/obiettivi', A)).j;
const f = albero.find((x) => x.id === fondo.id);
verifica(f.saldo === '1500.00' && f.traguardo_effettivo === '3000.00' && f.percentuale === 50, 'padre somma figli', f);
verifica(f.traguardi.find((t) => t.nome === 'Auto').percentuale === 50 && f.traguardi.find((t) => t.nome === 'Dentista').percentuale === 100, 'copertura traguardi', f.traguardi);
verifica((await r('PATCH', `/obiettivi/${fondo.id}`, A, { padre_id: uno.id })).s === 400, 'niente cicli');

const viaggio = (await r('POST', '/obiettivi', A, { nome: 'Viaggio Giappone', traguardo: '1200', scadenza: '2027-04-01', crea_spesa: true })).j;
const v1 = (await r('POST', `/obiettivi/${viaggio.id}/versamenti`, A, { importo: '1200' })).j;
verifica(v1.spesa_creata_id, 'spesa creata al traguardo', v1);
const spesaViaggio = (await r('GET', `/spese-previste/${v1.spesa_creata_id}?mese=2027-03`, A)).j;
verifica(spesaViaggio.ogni_mesi === null && spesaViaggio.importo === '1200.00' && !('obiettivo_id' in spesaViaggio) && spesaViaggio.bloccato_da?.id === viaggio.id && spesaViaggio.nel_mese, 'spesa una tantum creata dal salvadanaio (promemoria, nessun collegamento di pagamento)', spesaViaggio);
await r('POST', `/obiettivi/${viaggio.id}/versamenti`, A, { importo: '10' });
verifica((await r('GET', `/obiettivi/${viaggio.id}`, A)).j.spesa_creata_id === v1.spesa_creata_id, 'spesa creata una volta sola');
// Spuntare la spesa del viaggio non tocca il salvadanaio (decisione 50)
await r('PATCH', `/spese-previste/${v1.spesa_creata_id}`, A, { conto_id: conto.id });
await r('POST', `/spese-previste/${v1.spesa_creata_id}/spunta`, A, { mese: '2027-03' });
verifica((await r('GET', `/obiettivi/${viaggio.id}`, A)).j.saldo === '1210.00', 'la spunta di una spesa non preleva dal salvadanaio');

// Crea spesa con il traguardo preso dai sotto-obiettivi: solo quando sono tutti completi
const gita = (await r('POST', '/obiettivi', A, { nome: 'Gita', crea_spesa: true })).j;
const treno = (await r('POST', '/obiettivi', A, { nome: 'Treno', padre_id: gita.id, traguardo: '100' })).j;
const hotel = (await r('POST', '/obiettivi', A, { nome: 'Hotel', padre_id: gita.id, traguardo: '50' })).j;
const g1 = (await r('POST', `/obiettivi/${treno.id}/versamenti`, A, { importo: '100' })).j;
verifica(!(await r('GET', `/obiettivi/${gita.id}`, A)).j.spesa_creata_id, 'nessuna spesa con un sotto-obiettivo incompleto');
await r('POST', `/obiettivi/${hotel.id}/versamenti`, A, { importo: '50' });
const gitaFatta = (await r('GET', `/obiettivi/${gita.id}`, A)).j;
verifica(gitaFatta.spesa_creata_id && gitaFatta.traguardo_effettivo === '150.00', 'spesa creata quando tutti sono completi', gitaFatta);
void g1;

// Rate
const r1 = (await r('POST', '/rate', A, { oggetto: 'Divano', importo_rata: '100', numero_rate: 10, prima_scadenza: '2026-05-05' })).j;
verifica(r1.ultima_scadenza === '2027-02-05', 'ultima calcolata', r1.ultima_scadenza);
const r2 = (await r('POST', '/rate', A, { oggetto: 'Telefono', importo_rata: '50', ultima_scadenza: '2027-09-10', prima_scadenza: '2026-10-10' })).j;
verifica(r2.numero_rate === 12, 'numero calcolato', r2.numero_rate);
verifica((await r('POST', '/rate', A, { oggetto: 'X', importo_rata: '5', numero_rate: 3, ultima_scadenza: '2027-01-01', prima_scadenza: '2026-10-01' })).s === 400, 'non entrambi');
verifica((await r('GET', '/rate', Bt)).j.length === 0, 'rate private');


// Investimenti
const vwce = (await r('POST', '/investimenti/titoli', A, { isin: 'IE00BK5BQT80', ticker: 'VWCE', nome: 'Vanguard FTSE All-World' })).j;
verifica((await r('POST', '/investimenti/titoli', A, { isin: 'XX', nome: 'X' })).s === 400, 'isin non valido');
// Portafogli, posizioni (una riga per titolo e portafoglio), beni
const pf = (await r('POST', '/investimenti/portafogli', A, { nome: 'Trade Republic', icona: 'trending-up' })).j;
verifica(pf.id && pf.conta_nel_patrimonio === true && pf.vuoto === true && pf.valore === '0.00', 'portafoglio creato', pf);
const prova = (await r('POST', '/investimenti/portafogli', A, { nome: 'Idee', conta_nel_patrimonio: false })).j;
verifica((await r('POST', '/investimenti/portafogli', A, { nome: '' })).s === 400, 'nome del portafoglio obbligatorio');
const l1 = await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '10', prezzo: '100', data: '2026-03-01' });
verifica(l1.s === 201 && l1.j.data === '2026-03-01' && l1.j.ora === '12:00', 'primo acquisto: riga nuova (201)', l1);
// Secondo acquisto dello stesso titolo nello stesso portafoglio: si unisce (200), stessa riga.
const l2 = await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '10', prezzo: '120', data: '2026-06-01', ora: '09:30' });
const riga = l2.j;
verifica(l2.s === 200 && riga.id === l1.j.id && riga.quantita === '20.000000' && riga.prezzo === '110.0000' && riga.controvalore === '2200.00' && riga.data === '2026-06-01' && riga.ora === '09:30', 'secondo acquisto: unito (quantità sommata, PCM pesato, data dell\'ultimo)', l2);
// Senza data vale adesso e si unisce ancora.
const l3 = await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '1', prezzo: '125' });
verifica(l3.s === 200 && l3.j.id === riga.id && l3.j.quantita === '21.000000' && l3.j.prezzo === '110.7143' && l3.j.data === new Date().toLocaleDateString('en-CA'), 'senza data vale adesso e si unisce', l3.j);
// Un acquisto con data passata non sposta indietro la data dell'ultimo.
const l4 = await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '1', prezzo: '125', data: '2026-01-02' });
verifica(l4.s === 200 && l4.j.data === l3.j.data && l4.j.quantita === '22.000000', 'acquisto con data più vecchia: la data resta quella dell\'ultimo', l4.j);
// Il campo verso è ignorato.
verifica((await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, verso: 'vendita', quantita: '5', prezzo: '125', data: '2026-01-02' })).j.quantita === '27.000000', 'il campo verso è ignorato: resta un acquisto');
verifica((await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '1', prezzo: '1', data: '2099-01-01' })).s === 400, 'acquisto nel futuro rifiutato');
verifica((await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '0', prezzo: '1' })).s === 400, 'quantità zero rifiutata');
const righe = (await r('GET', `/investimenti/lotti?titolo_id=${vwce.id}&portafoglio_id=${pf.id}`, A)).j;
verifica(righe.length === 1 && righe[0].quantita === '27.000000', 'una sola riga per titolo e portafoglio (e l\'acquisto nel futuro non ha lasciato tracce)', righe);
// Correzione diretta della riga: si torna a 20 quote a PCM 110, ultimo acquisto il 2026-06-01 alle 09:30.
const corretta = (await r('PATCH', `/investimenti/lotti/${riga.id}`, A, { quantita: '20', prezzo: '110', data: '2026-06-01', ora: '09:30' })).j;
verifica(corretta.quantita === '20.000000' && corretta.prezzo === '110.0000' && corretta.data === '2026-06-01' && corretta.ora === '09:30', 'riga corretta direttamente', corretta);

verifica((await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: '00000000-0000-4000-8000-000000000000', quantita: '1', prezzo: '1' })).s === 404, 'portafoglio inesistente');
verifica((await r('POST', '/investimenti/lotti', Bt, { titolo_id: vwce.id, portafoglio_id: pf.id, quantita: '1', prezzo: '1' })).s === 404, 'il portafoglio di un altro non si usa');
await r('PUT', `/investimenti/titoli/${vwce.id}/prezzi`, A, { prezzo: '130' });
await r('PUT', `/investimenti/titoli/${vwce.id}/esposizioni`, A, { dimensione: 'area', voci: [{ voce: 'Stati Uniti', peso: '62' }, { voce: 'Europa', peso: '16' }] });
let port = (await r('GET', '/investimenti/portafoglio', A)).j;
const pos = port.posizioni[0];
verifica(port.posizioni.length === 1 && pos.quantita === '20' && pos.lotti === undefined && pos.prezzo_medio === '110.0000' && pos.valore === '2600.00' && pos.stato === 'ok', 'una posizione dai due acquisti, prezzo medio pesato', pos);
verifica(port.valore === '2600.00' && port.costo === '2200.00' && port.guadagno === '400.00' && port.titoli_senza_prezzo === 0, 'totali del portafoglio', port);
const patch = (await r('PATCH', `/investimenti/lotti/${riga.id}`, A, { quantita: '40', prezzo: '107.5', ora: '10:15' })).j;
verifica(patch.quantita === '40.000000' && patch.ora === '10:15' && patch.data === '2026-06-01', 'modifica della posizione', patch);
port = (await r('GET', '/investimenti/portafoglio', A)).j;
verifica(port.posizioni[0].quantita === '40' && port.posizioni[0].prezzo_medio === '107.5000', 'prezzo medio dopo la modifica', port.posizioni[0]);
await r('PATCH', `/investimenti/lotti/${riga.id}`, A, { quantita: '20', prezzo: '110' });
// Portafoglio di prova: fuori dai totali generali, ma con i suoi totali.
await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: prova.id, quantita: '5', prezzo: '100' });
await r('POST', '/investimenti/lotti', A, { titolo_id: vwce.id, portafoglio_id: prova.id, quantita: '5', prezzo: '100' });
verifica((await r('GET', `/investimenti/lotti?portafoglio_id=${prova.id}`, A)).j.length === 1, 'portafoglio di prova: una riga anche dopo due acquisti');
await r('PATCH', `/investimenti/lotti/${(await r('GET', `/investimenti/lotti?portafoglio_id=${prova.id}`, A)).j[0].id}`, A, { quantita: '5' });
port = (await r('GET', '/investimenti/portafoglio', A)).j;
verifica(port.valore === '2600.00' && port.posizioni.length === 1, 'il portafoglio di prova non conta', port.valore);
const dettaglioProva = (await r('GET', `/investimenti/portafoglio?portafoglio_id=${prova.id}`, A)).j;
verifica(dettaglioProva.valore === '650.00', 'ma ha i suoi totali', dettaglioProva.valore);
const elenco = (await r('GET', '/investimenti/portafogli', A)).j;
verifica(elenco.length === 2 && elenco.find((x) => x.id === prova.id).valore === '650.00' && elenco.find((x) => x.id === pf.id).guadagno === '400.00', 'elenco portafogli con totali', elenco);
verifica((await r('GET', '/analisi/patrimonio', A)).j.investimenti === '2600.00', 'il patrimonio esclude il portafoglio di prova');
verifica((await r('DELETE', `/investimenti/portafogli/${prova.id}`, A)).s === 409, 'portafoglio non vuoto: non si cancella');
const rinominato = (await r('PATCH', `/investimenti/portafogli/${prova.id}`, A, { nome: 'Idee 2' })).j;
verifica(rinominato.nome === 'Idee 2', 'portafoglio modificato', rinominato);
verifica((await r('DELETE', `/investimenti/posizioni?titolo_id=${vwce.id}&portafoglio_id=${prova.id}`, A)).s === 204, 'posizione tolta');
verifica((await r('DELETE', `/investimenti/portafogli/${prova.id}`, A)).s === 204, 'portafoglio vuoto cancellato');
// Titolo senza prezzo: non vale 0 in silenzio.
const senza = (await r('POST', '/investimenti/titoli', A, { simbolo: `PROVA${n}.XX`, nome: 'Titolo senza prezzo' })).j;
await r('POST', '/investimenti/lotti', A, { titolo_id: senza.id, portafoglio_id: pf.id, quantita: '3', prezzo: '10' });
port = (await r('GET', '/investimenti/portafoglio', A)).j;
const ps = port.posizioni.find((x) => x.titolo_id === senza.id);
verifica(ps.valore === null && ps.stato === 'mancante' && ps.prezzo === null && ps.prezzo_al === null && port.titoli_senza_prezzo === 1 && port.incompleto === true && port.valore === '2600.00', 'titolo senza prezzo: valore null e segnalato', ps);
verifica((await r('GET', '/analisi/patrimonio', A)).j.investimenti_senza_prezzo === 1, 'il patrimonio segnala i titoli senza prezzo');
await r('PUT', `/investimenti/titoli/${senza.id}/prezzi`, A, { prezzo: '11', data: '2026-01-05' });
port = (await r('GET', '/investimenti/portafoglio', A)).j;
verifica(port.posizioni.find((x) => x.titolo_id === senza.id).stato === 'vecchio', 'prezzo vecchio', port.posizioni.find((x) => x.titolo_id === senza.id));
// «Leggi dalla borsa»: la fonte non conosce PROVA.XX, quindi 502 leggibile e il prezzo scritto a mano resta.
await r('PUT', `/investimenti/titoli/${vwce.id}/prezzi`, A, { prezzo: '130' });
const leggi = await r('POST', `/investimenti/titoli/${senza.id}/prezzi/leggi`, A);
verifica(leggi.s === 502 && typeof leggi.j.errore === 'string', 'leggi dalla borsa: fonte che non risponde = errore leggibile', leggi);
verifica((await r('POST', `/investimenti/titoli/00000000-0000-4000-8000-000000000000/prezzi/leggi`, A)).s === 404, 'leggi dalla borsa: titolo inesistente');
verifica((await r('GET', '/investimenti/portafoglio', A)).j.posizioni.find((x) => x.titolo_id === vwce.id).prezzo === '130.0000', 'il prezzo scritto a mano resta se la lettura fallisce');
const conOra = (await r('GET', '/investimenti/portafoglio', A)).j.posizioni.find((x) => x.titolo_id === vwce.id);
verifica(conOra.prezzo_fonte === 'mano' && conOra.prezzo_aggiornato_il, 'prezzo scritto a mano: fonte e ora');
verifica((await r('PATCH', '/investimenti/posizioni', A, { titolo_id: senza.id, portafoglio_id: pf.id, nuovo_portafoglio_id: pf.id })).s === 204, 'sposta posizione');
// Spostare in un portafoglio dove il titolo c'è già: una sola riga, unita.
const altro = (await r('POST', '/investimenti/portafogli', A, { nome: 'Altro' })).j;
await r('POST', '/investimenti/lotti', A, { titolo_id: senza.id, portafoglio_id: altro.id, quantita: '1', prezzo: '16' });
verifica((await r('PATCH', '/investimenti/posizioni', A, { titolo_id: senza.id, portafoglio_id: pf.id, nuovo_portafoglio_id: altro.id })).s === 204, 'sposta in un portafoglio che ha già il titolo');
const unita = (await r('GET', `/investimenti/lotti?titolo_id=${senza.id}`, A)).j;
verifica(unita.length === 1 && unita[0].portafoglio_id === altro.id && unita[0].quantita === '4.000000' && unita[0].prezzo === '11.5000', 'spostamento con unione: una riga, PCM pesato', unita);
await r('PATCH', '/investimenti/posizioni', A, { titolo_id: senza.id, portafoglio_id: altro.id, nuovo_portafoglio_id: pf.id });
await r('DELETE', `/investimenti/portafogli/${altro.id}`, A);
await r('DELETE', `/investimenti/posizioni?titolo_id=${senza.id}&portafoglio_id=${pf.id}`, A);
// Beni non quotati e beni con prezzo di mercato
const catalogo = (await r('GET', '/investimenti/catalogo', A)).j;
verifica(['oro', 'argento', 'platino', 'palladio', 'marengo', 'sterlina', 'krugerrand', 'maple-leaf-oro', 'philharmoniker-oro', 'napoleone'].every((c) => catalogo.some((x) => x.codice === c)), 'catalogo', catalogo.map((x) => x.codice));
const casa2 = (await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, nome: 'Fondo pensione', tipo: 'fondo_pensione', costo: '5000', valore: '5400', dove: 'Cometa' })).j;
verifica(casa2.valore === '5400.00' && casa2.catalogo === null && casa2.stato === 'ok' && casa2.guadagno === '400.00', 'bene non quotato', casa2);
const mar = (await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, catalogo: 'marengo', quantita: '3', costo: '600', dove: 'Cassetta di sicurezza' })).j;
verifica(mar.quantita === '3' && mar.grammi_fini === '17.4180' && mar.nome === 'Marengo' && mar.catalogo.metallo === 'XAU' && ['ok', 'vecchio', 'mancante'].includes(mar.stato), 'bene di mercato a pezzi', mar);
if (mar.euro_grammo) verifica(Math.abs(Number(mar.valore) - 17.418 * Number(mar.euro_grammo)) < 0.01, 'valore = grammi fini × spot', mar);
else verifica(mar.valore === null && mar.stato === 'mancante', 'senza quotazione il valore è null', mar);
const arg = (await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, catalogo: 'argento', quantita: '100', purezza: '925', costo: '60' })).j;
verifica(arg.purezza === '925.0' && arg.grammi_fini === '92.5000', 'argento a grammi con purezza', arg);
const oro = (await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, catalogo: 'oro', quantita: '10', costo: '700' })).j;
verifica(oro.purezza === '999.9', 'purezza proposta', oro);
verifica((await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, catalogo: 'marengo', quantita: '1.5', costo: '100' })).s === 400, 'le monete sono pezzi interi');
verifica((await r('POST', '/investimenti/beni', A, { portafoglio_id: pf.id, catalogo: 'inesistente', quantita: '1', costo: '1' })).s === 400, 'voce di catalogo sconosciuta');
verifica((await r('PATCH', `/investimenti/beni/${mar.id}`, A, { valore: '999' })).s === 400, 'il valore di un bene di mercato non si scrive');
verifica((await r('PATCH', `/investimenti/beni/${mar.id}`, A, { quantita: '4' })).j.quantita === '4', 'modifica quantità bene');
verifica((await r('PATCH', `/investimenti/beni/${casa2.id}`, A, { valore: '5500' })).j.valore_al === new Date().toLocaleDateString('en-CA'), 'nuovo valore = valore di oggi');
const quot = (await r('GET', '/investimenti/metalli/quotazioni', A)).j;
verifica(quot.length === 4 && quot.map((x) => x.metallo).join() === 'XAU,XAG,XPT,XPD', 'quotazioni dei quattro metalli', quot);
const beni = (await r('GET', `/investimenti/beni?portafoglio_id=${pf.id}`, A)).j;
verifica(beni.length === 4, 'elenco beni del portafoglio', beni.length);
const det = (await r('GET', `/investimenti/portafogli/${pf.id}`, A)).j;
verifica(det.beni.length === 4 && det.posizioni.length === 1, 'dettaglio del portafoglio', [det.beni.length, det.posizioni.length]);
verifica((await r('DELETE', `/investimenti/portafogli/${pf.id}`, A)).s === 409, 'portafoglio con posizioni e beni: 409');
for (const b of [casa2, mar, arg, oro]) await r('DELETE', `/investimenti/beni/${b.id}`, A);
const esp = (await r('GET', '/investimenti/esposizione', A)).j;
verifica(esp.area[0].voce === 'Stati Uniti' && esp.area[0].peso === 62 && esp.area.some((x) => x.voce === 'Non indicato'), 'esposizione', esp.area);
const and = (await r('GET', '/investimenti/andamento?mesi=12', A)).j;
verifica(and.length === 12 && and[11].valore === '2600.00' && and[11].messo_dentro === '2200.00', 'andamento', and.at(-1));
verifica((await r('GET', `/investimenti/andamento?mesi=3&portafoglio_id=${pf.id}`, A)).j.length === 3, 'andamento di un portafoglio');
verifica((await r('GET', '/investimenti/portafoglio', Bt)).j.posizioni.length === 0 && (await r('GET', '/investimenti/portafogli', Bt)).j.length === 0, 'investimenti privati');
verifica((await r('GET', `/investimenti/portafogli/${pf.id}`, Bt)).s === 404, 'il portafoglio di un altro non si vede');
verifica((await r('POST', '/investimenti/operazioni', A, { titolo_id: vwce.id, data: '2026-03-01', verso: 'acquisto', quantita: '10', prezzo: '100' })).s === 404, 'le operazioni non esistono più');

// Analisi
const mese = (await r('GET', '/analisi/mese?mese=2026-10', A)).j;
// stipendio 2000; fisse: affitto 420 (60%) + luce 60 (ogni 2 mesi: esce in questo mese, per intero; la Tari esce a novembre) + gita 150 (una tantum creata al traguardo); (il budget da 400 non pesa: decisione 58); rate: telefono 50 (10/10) + divano 100 (05/10)
verifica(mese.voci.fisse === '630.00' && mese.voci.periodiche_mensilizzate === undefined && mese.voci.budget === undefined && mese.budget_residuo === undefined, 'voci del mese (le annuali solo nel loro mese, nessun budget)', mese.voci);
verifica(mese.voci.rate === '150.00' && mese.resta === '1220.00' && mese.semaforo === 'ok', 'quanto resta', mese);
const pat = (await r('GET', '/analisi/patrimonio', A)).j;
verifica(pat.investimenti === '2600.00', 'patrimonio', pat);
const pro = (await r('GET', '/analisi/proiezione', A)).j;
verifica(pro.punti.length >= 3 && pro.punti.at(-1).mesi === 60, 'proiezione', pro.punti.at(-1));
// Categoria per persona (decisione 43): chi riceve ha la SUA categoria, proposta dal percorso di nomi.
{
  const catB = (await r('GET', '/categorie?formato=elenco', Bt)).j;
  const casaB = catB.find((c) => c.nome === 'Casa' && !c.padre_id);
  const ciboB = catB.find((c) => c.nome === 'Cibo' && !c.padre_id);
  const sA = (await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j;
  let sB = (await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, Bt)).j;
  verifica(sA.categoria_id === casa.id && sA.nuova === false && sA.creata_da === null, 'creatore: la sua categoria, non «nuova»', sA);
  verifica(sB.categoria_id === casaB.id && sB.categoria === 'Casa' && sB.nuova === true && sB.creata_da === 'Anna', 'ricevente: categoria proposta (percorso) e «nuova»', sB);
  // Modifica separata: B cambia la sua categoria, quella di A resta.
  const mB = await r('PATCH', `/spese-previste/${affitto.j.id}`, Bt, { categoria_id: ciboB.id });
  verifica(mB.s === 200 && mB.j.categoria_id === ciboB.id && mB.j.nuova === false, 'ricevente cambia la sua categoria (e non è più nuova)', mB);
  verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j.categoria_id === casa.id, 'la categoria del creatore non cambia');
  verifica((await r('PATCH', `/spese-previste/${affitto.j.id}`, Bt, { categoria_id: casa.id })).s === 404, 'non si sceglie la categoria di un altro');
  verifica((await r('PATCH', `/spese-previste/${affitto.j.id}`, A, { categoria_id: ciboB.id })).s === 404, 'nemmeno il creatore sceglie quella di un altro');
  const catSpeseB = (await r('GET', '/categorie/spese?mese=2026-10', Bt)).j;
  verifica(catSpeseB.some((x) => x.categoria_id === ciboB.id) && !catSpeseB.some((x) => x.categoria_id === casa.id), 'pesi per categoria: quella del ricevente', catSpeseB);
  // Altri campi: B li modifica per entrambi, senza toccare la categoria di A.
  verifica((await r('PATCH', `/spese-previste/${affitto.j.id}`, Bt, { note: 'da B' })).j.categoria_id === ciboB.id, 'modifica di altri campi dal ricevente');
  verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j.note === 'da B', 'la nota di B vale per entrambi');
  // Eliminare la categoria del ricevente in uso: serve dove spostare, e le spese ricevute vengono spostate.
  verifica((await r('DELETE', `/categorie/${ciboB.id}`, Bt)).s === 409, 'categoria del ricevente in uso: 409');
  verifica((await r('DELETE', `/categorie/${ciboB.id}?sposta_su=${casaB.id}`, Bt)).s === 204, 'eliminata spostando');
  verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, Bt)).j.categoria_id === casaB.id, 'la spesa ricevuta è passata alla destinazione');
  verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j.categoria_id === casa.id, 'e quella di A è intatta');
  // Nome della categoria finale uguale in un altro ramo; nessuna corrispondenza = «Da categorizzare»; «vista» a mano.
  const extra = (await r('POST', '/categorie', A, { nome: 'Extra' })).j;
  const giardinoA = (await r('POST', '/categorie', A, { nome: 'Giardino', padre_id: extra.id })).j;
  const raraA = (await r('POST', '/categorie', A, { nome: 'Rarissima' })).j;
  const altroB = (await r('POST', '/categorie', Bt, { nome: 'Altro B' })).j;
  const giardinoB = (await r('POST', '/categorie', Bt, { nome: 'giardino', padre_id: altroB.id })).j;
  const sg = (await r('POST', '/spese-previste', A, { nome: 'Siepe', importo: '30', categoria_id: giardinoA.id, prossima_scadenza: '2026-10-20' })).j;
  const sr = (await r('POST', '/spese-previste', A, { nome: 'Rara', importo: '30', categoria_id: raraA.id, prossima_scadenza: '2026-10-20' })).j;
  const sn = (await r('POST', '/spese-previste', A, { nome: 'Senza', importo: '30', prossima_scadenza: '2026-10-20' })).j;
  for (const x of [sg, sr, sn]) await r('POST', '/condivisioni', A, { voce: 'spesa', id: x.id, utente_id: b.utente_id });
  const leggiB = async (id) => (await r('GET', `/spese-previste/${id}?mese=2026-10`, Bt)).j;
  verifica((await leggiB(sg.id)).categoria_id === giardinoB.id, 'proposta per nome della categoria finale');
  verifica((await leggiB(sr.id)).categoria_id === null && (await leggiB(sn.id)).categoria_id === null, 'nessuna corrispondenza: Da categorizzare');
  verifica((await leggiB(sr.id)).nuova === true, 'ricevuta: nuova');
  verifica((await r('POST', `/spese-previste/${sr.id}/vista`, Bt)).s === 204 && (await leggiB(sr.id)).nuova === false, 'POST /vista toglie «nuova»');
  verifica((await r('POST', `/spese-previste/${sr.id}/vista`, A)).s === 204 && (await r('POST', '/spese-previste/00000000-0000-4000-8000-000000000001/vista', Bt)).s === 404, 'vista: no-op per il creatore, 404 se non esiste');
  // Smettere di condividere toglie la riga; condividere di nuovo propone di nuovo.
  const cn = (await r('GET', '/condivisioni', A)).j.find((x) => x.voce_id === sg.id);
  verifica((await r('DELETE', `/condivisioni/${cn.id}`, A)).s === 204 && (await leggiB(sg.id)).id === undefined, 'condivisione tolta: B non la vede più');
}


const ctrl = (await r('GET', '/analisi/rate', A)).j;
verifica(ctrl.rate_attive === 2 && ctrl.rata_mensile === '150.00', 'riepilogo rate', ctrl);

// Mese personale per tutte le voci (decisione 41), con inizio_mese = 10: il mese personale di marzo va dal 10 marzo al 9 aprile.
{
  const mp = async (m) => (await r('GET', `/spese-previste?mese=${m}`, A)).j;
  const bollo = (await r('POST', '/spese-previste', A, { nome: 'Bollo', importo: '120', ogni_mesi: 12, prossima_scadenza: '2027-03-01', senza_giorno: true })).j;
  const quindici = (await r('POST', '/spese-previste', A, { nome: 'Assicurazione 15 marzo', importo: '300', ogni_mesi: 12, prossima_scadenza: '2027-03-15' })).j;
  const cinqueApr = (await r('POST', '/spese-previste', A, { nome: 'Revisione 5 aprile', importo: '80', ogni_mesi: 12, prossima_scadenza: '2027-04-05' })).j;
  const trovata = (el, nome) => el.spese.find((x) => x.nome === nome);
  const feb = await mp('2027-02'), mar = await mp('2027-03'), apr = await mp('2027-04');
  verifica(trovata(mar, 'Bollo').nel_mese && trovata(mar, 'Bollo').scadenza === '2027-03-10', 'senza giorno: vale per tutto il mese personale di marzo', trovata(mar, 'Bollo'));
  verifica(!trovata(feb, 'Bollo').nel_mese && !trovata(apr, 'Bollo').nel_mese, 'senza giorno: non nei mesi personali vicini');
  verifica(trovata(mar, 'Assicurazione 15 marzo').scadenza === '2027-03-15' && trovata(mar, 'Revisione 5 aprile').scadenza === '2027-04-05', 'il 5 aprile cade nel mese personale di marzo, come il 15 marzo');
  verifica(!trovata(apr, 'Revisione 5 aprile').nel_mese && !trovata(feb, 'Assicurazione 15 marzo').nel_mese, 'una volta l\'anno, non nel mese personale accanto');
  // La spunta conta nel mese personale: senza giorno, spuntata fuori dal periodo, prende l'inizio del mese.
  const sp = await r('POST', `/spese-previste/${bollo.id}/spunta`, A, { mese: '2027-03' });
  verifica(sp.s === 201 && sp.j.data === '2027-03-10', 'spunta del mese personale', sp);
  verifica(trovata(await mp('2027-03'), 'Bollo').uscita && !trovata(await mp('2027-02'), 'Bollo').uscita, 'la spunta conta solo nel suo mese personale');
  // Decisione 50: una spesa non crea più un salvadanaio (nuovo_salvadanaio è ignorato) e nessun campo parla più di salvadanai pagati.
  const dopoBollo = await r('PATCH', `/spese-previste/${bollo.id}`, A, { note: 'prova', nuovo_salvadanaio: {}, obiettivo_id: null });
  verifica(dopoBollo.s === 200 && !('obiettivo_id' in dopoBollo.j), 'una spesa non ha più salvadanai: nuovo_salvadanaio è ignorato', dopoBollo.j);
  verifica(!(await r('GET', '/obiettivi', A)).j.some((o) => o.nome === 'Bollo'), 'nessun salvadanaio creato dalla spesa');
  // Il promemoria di un salvadanaio (decisione 51) vale ogni mese, per tutto il mese personale; senza scadenza serve la cifra fissa.
  const vacanze = (await r('POST', '/obiettivi', A, { nome: 'Vacanze' })).j;
  verifica((await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, {})).s === 400, 'promemoria senza scadenza né cifra fissa: 400');
  const pro = await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, { importo: '50', ogni_mesi: 3 });
  verifica(pro.s === 200 && pro.j.ogni_mesi === 1 && pro.j.senza_giorno === false && pro.j.nel_mese === true && pro.j.mia_quota === '50.00', 'promemoria: ogni mese, senza giorno (ogni_mesi è ignorato), cifra fissa', pro.j);
  const pro1 = await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, { importo: '70' });
  verifica(pro1.j.id === pro.j.id && pro1.j.mia_quota === '70.00' && (await r('GET', '/spese-previste?mese=2026-10', A)).j.spese.filter((x) => x.alimenta_obiettivo_id === vacanze.id).length === 1, 'promemoria cambiato: la stessa voce, una sola', pro1.j);
}

// Conto del salvadanaio (decisione 45): il sotto-salvadanaio senza conto proprio eredita quello del padre.
{
  const cA = (await r('POST', '/conti', A, { nome: 'Conto A' })).j;
  const cB = (await r('POST', '/conti', A, { nome: 'Conto B' })).j;
  const cBruno = (await r('POST', '/conti', Bt, { nome: 'Conto di Bruno' })).j;
  const nodi = (xs) => xs.flatMap((o) => [o, ...nodi(o.figli)]);
  const dammi = async (id) => nodi((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const padre = (await r('POST', '/obiettivi', A, { nome: 'Padre conti', conto_id: cA.id })).j;
  const figlioEred = (await r('POST', '/obiettivi', A, { nome: 'Figlio ereditato', padre_id: padre.id })).j;
  const figlioB = (await r('POST', '/obiettivi', A, { nome: 'Figlio su B', padre_id: padre.id, conto_id: cB.id })).j;
  const nipote = (await r('POST', '/obiettivi', A, { nome: 'Nipote ereditato', padre_id: figlioB.id })).j;
  const libero = (await r('POST', '/obiettivi', A, { nome: 'Senza conto' })).j;
  for (const [o, imp] of [[padre, '100'], [figlioEred, '50'], [figlioB, '200'], [nipote, '30'], [libero, '7']]) await r('POST', `/obiettivi/${o.id}/versamenti`, A, { importo: imp });
  const p1 = await dammi(padre.id), e1 = await dammi(figlioEred.id), b1 = await dammi(figlioB.id), n1 = await dammi(nipote.id), l1 = await dammi(libero.id);
  verifica(p1.conto_id === cA.id && p1.conto === 'Conto A' && p1.conto_ereditato === false && p1.conto_proprio_id === cA.id && p1.conto_icona, 'conto proprio del padre', p1);
  verifica(e1.conto_id === cA.id && e1.conto === 'Conto A' && e1.conto_ereditato === true && e1.conto_proprio_id === null, 'il figlio senza conto eredita quello del padre', e1);
  verifica(b1.conto_id === cB.id && b1.conto_ereditato === false, 'il figlio con un conto suo lo tiene', b1);
  verifica(n1.conto_id === cB.id && n1.conto === 'Conto B' && n1.conto_ereditato === true, 'il nipote eredita dal figlio, non dal nonno', n1);
  verifica(l1.conto_id === null && l1.conto === null && l1.conto_ereditato === false, 'salvadanaio senza conto', l1);
  // Somme del filtro: ogni salvadanaio conta una volta, col conto che vale e con i soldi messi direttamente in lui.
  const tutti = nodi((await r('GET', '/obiettivi', A)).j).filter((o) => [padre.id, figlioEred.id, figlioB.id, nipote.id, libero.id].includes(o.id));
  const somma = (f) => tutti.filter((o) => (f === 'senza' ? !o.conto_id : o.conto_id === f)).reduce((t, o) => t + Number(o.versato), 0);
  verifica(somma(cA.id) === 150 && somma(cB.id) === 230 && somma('senza') === 7, 'somme per conto senza doppi conteggi', [somma(cA.id), somma(cB.id), somma('senza')]);
  verifica(Number(p1.saldo) === 380 && somma(cA.id) + somma(cB.id) === 380, 'le somme per conto tornano col saldo del padre', p1.saldo);
  // Cambiare il conto del padre cambia quello dei figli che ereditano, non di chi ha il suo.
  const mod = await r('PATCH', `/obiettivi/${padre.id}`, A, { conto_id: cB.id });
  verifica(mod.s === 200 && (await dammi(figlioEred.id)).conto_id === cB.id && (await dammi(figlioB.id)).conto_id === cB.id, 'cambia il conto del padre: i figli che ereditano lo seguono', mod.j);
  // Tolto il conto al padre, il figlio ereditato resta senza conto; si può togliere anche quello proprio.
  await r('PATCH', `/obiettivi/${padre.id}`, A, { conto_id: null });
  await r('PATCH', `/obiettivi/${figlioB.id}`, A, { conto_id: null });
  const e2 = await dammi(figlioEred.id), b2 = await dammi(figlioB.id);
  verifica(e2.conto_id === null && e2.conto_ereditato === false && b2.conto_id === null && b2.conto_proprio_id === null, 'togliere il conto lo toglie ai figli che ereditano', [e2, b2]);
  // Un conto che non si vede non si può scegliere; uno inesistente neppure.
  verifica((await r('PATCH', `/obiettivi/${padre.id}`, A, { conto_id: cBruno.id })).s === 404, 'l\'etichetta di un altro rifiutata');
  verifica((await r('POST', '/obiettivi', A, { nome: 'Con conto altrui', conto_id: cBruno.id })).s === 404, 'creare con il conto di un altro rifiutato');
  verifica((await r('PATCH', `/obiettivi/${padre.id}`, A, { conto_id: 'non-un-id' })).s === 400, 'conto_id non valido rifiutato');
  // Cancellando il conto il salvadanaio resta, senza conto.
  await r('PATCH', `/obiettivi/${libero.id}`, A, { conto_id: cA.id });
  await r('DELETE', `/conti/${cA.id}`, A);
  const l2 = await dammi(libero.id);
  verifica(l2 && l2.conto_id === null, 'conto cancellato: il salvadanaio resta senza conto', l2);
  // Decisione 50: nessun salvadanaio è bloccato da una spesa (non esiste più il salvadanaio nato da una spesa): nome e conto si cambiano.
  const spesaConto = (await r('POST', '/spese-previste', A, { nome: 'Assicurazione conto', importo: '240', ogni_mesi: 12, prossima_scadenza: '2027-03-15', nuovo_salvadanaio: {} })).j;
  verifica(!nodi((await r('GET', '/obiettivi', A)).j).some((o) => o.nome === 'Assicurazione conto' || o.bloccato_da || o.paga_spesa), 'nessun salvadanaio nasce da una spesa, né ha campi bloccati o spesa pagata', spesaConto);
}

// Cifra di un salvadanaio (decisione 46): «Riempi», «Metti 1/12» e spostamenti da/verso i liberi del superiore.
{
  const { mancaAlTraguardo, quotaMensileSalvadanaio, liberiDi, pianoCifra } = await import('../../app/src/calcoliCifra.ts');
  // Calcoli dell'app (puri).
  verifica(mancaAlTraguardo({ saldo: '300.00', traguardo_effettivo: '1000.00' }) === 700, 'riempi: manca = traguardo - saldo');
  verifica(mancaAlTraguardo({ saldo: '1000.00', traguardo_effettivo: '1000.00' }) === 0 && mancaAlTraguardo({ saldo: '1200', traguardo_effettivo: '1000' }) < 0, 'riempi: già pieno (zero o meno)');
  verifica(mancaAlTraguardo({ saldo: '5', traguardo_effettivo: null }) === null, 'riempi: senza traguardo non c\'è');
  verifica(quotaMensileSalvadanaio({ traguardo_effettivo: '499.00' }) === 41.58, '1/12: traguardo / 12');
  verifica(quotaMensileSalvadanaio({ traguardo_effettivo: '1200' }) === 100, '1/12: 1200 / 12');
  verifica(quotaMensileSalvadanaio({ traguardo_effettivo: null }) === null, '1/12: senza traguardo non c\'è');
  const base = { saldo: 100, propria: 100, liberiPadre: 900 };
  const p1 = pianoCifra({ ...base, modo: 'aggiungi', valore: 41.58, daLiberi: true });
  verifica(p1.sposta && p1.differenza === 41.58 && p1.restanoLiberi === 858.42 && !p1.errore, 'piano: aggiungi dai liberi', p1);
  verifica(pianoCifra({ ...base, modo: 'aggiungi', valore: 901, daLiberi: true }).errore?.tipo === 'liberi', 'piano: oltre i liberi è errore');
  verifica(!pianoCifra({ ...base, modo: 'aggiungi', valore: 901, daLiberi: false }).errore, 'piano: soldi nuovi senza limite');
  verifica(pianoCifra({ ...base, modo: 'cifra', valore: 150, daLiberi: true }).sposta, 'piano: scrivi la cifra più alta sposta dai liberi');
  verifica(!pianoCifra({ ...base, modo: 'cifra', valore: 50, daLiberi: true }).sposta, 'piano: scrivi la cifra più bassa non sposta (esce)');
  verifica(pianoCifra({ ...base, modo: 'togli', valore: 30, daLiberi: true }).restanoLiberi === 930, 'piano: togli e rimetti nei liberi');
  verifica(pianoCifra({ ...base, modo: 'togli', valore: 101, daLiberi: false }).errore?.tipo === 'propria', 'piano: togli oltre la parte propria');
  verifica(liberiDi({ versato: '12.50' }) === 12.5, 'liberi = versato');

  // API: spostamenti. Scadenze (padre) 1000 liberi; sotto-salvadanai Assicurazione e Bollo.
  const nodi = (xs) => xs.flatMap((o) => [o, ...nodi(o.figli)]);
  const dammi = async (id) => nodi((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const sc = (await r('POST', '/obiettivi', A, { nome: 'Scadenze' })).j;
  const ass = (await r('POST', '/obiettivi', A, { nome: 'Assicurazione', padre_id: sc.id, traguardo: '500' })).j;
  const bollo = (await r('POST', '/obiettivi', A, { nome: 'Bollo', padre_id: sc.id, traguardo: '200' })).j;
  const nip = (await r('POST', '/obiettivi', A, { nome: 'Tagliando', padre_id: ass.id, traguardo: '100' })).j;
  await r('POST', `/obiettivi/${sc.id}/versamenti`, A, { importo: '1000' });
  verifica(Number((await dammi(sc.id)).saldo) === 1000 && Number((await dammi(sc.id)).versato) === 1000, 'liberi iniziali del padre');
  // Un salvadanaio senza padre non ha liberi da cui prendere.
  verifica((await r('POST', `/obiettivi/${sc.id}/versamenti`, A, { importo: '10', da_liberi: true })).s === 400, 'da_liberi su un salvadanaio senza padre rifiutato');
  // Dai liberi al figlio: il totale del padre non cambia.
  const s1 = await r('POST', `/obiettivi/${ass.id}/versamenti`, A, { importo: '41.58', data: '2026-10-26', da_liberi: true });
  const p = await dammi(sc.id), f = await dammi(ass.id);
  verifica(s1.s === 201 && Number(p.saldo) === 1000 && Number(p.versato) === 958.42 && Number(f.versato) === 41.58, 'spostamento dai liberi: totale invariato', [p.saldo, p.versato, f.versato]);
  const detF = (await r('GET', `/obiettivi/${ass.id}`, A)).j.versamenti, detP = (await r('GET', `/obiettivi/${sc.id}`, A)).j.versamenti;
  const vF = detF.find((x) => x.spostamento_con), vP = detP.find((x) => x.spostamento_con);
  verifica(vF?.spostamento_con === 'Scadenze' && vF.spostamento_con_padre === true && vF.importo === '41.58', 'versamento del figlio: da liberi di Scadenze', detF);
  verifica(vP?.spostamento_con === 'Assicurazione' && vP.spostamento_con_padre === false && vP.importo === '-41.58' && vP.data === vF.data, 'versamento del padre: spostato nel figlio, stessa data', detP);
  verifica(detP.some((x) => !x.spostamento_con && x.importo === '1000.00'), 'i versamenti normali restano senza spostamento', detP);
  // Limite: oltre i liberi nulla cambia (transazione).
  const troppo = await r('POST', `/obiettivi/${ass.id}/versamenti`, A, { importo: '958.43', da_liberi: true });
  const p2 = await dammi(sc.id);
  verifica(troppo.s === 400 && /solo 958,42/.test(troppo.j.errore ?? troppo.j.messaggio ?? JSON.stringify(troppo.j)) && Number(p2.versato) === 958.42 && Number((await dammi(ass.id)).versato) === 41.58, 'oltre i liberi: rifiutato, nulla cambia', troppo.j);
  const tutti = await r('POST', `/obiettivi/${bollo.id}/versamenti`, A, { importo: '958.42', da_liberi: true });
  verifica(tutti.s === 201 && Number((await dammi(sc.id)).versato) === 0 && Number((await dammi(sc.id)).saldo) === 1000, 'si possono spostare tutti i liberi fino a zero');
  verifica((await r('POST', `/obiettivi/${bollo.id}/versamenti`, A, { importo: '0.01', da_liberi: true })).s === 400, 'liberi a zero: niente da spostare');
  // Verso i liberi (importo negativo): dal figlio al padre; non oltre quello che il figlio ha di suo.
  const indietro = await r('POST', `/obiettivi/${bollo.id}/versamenti`, A, { importo: '-100', da_liberi: true });
  verifica(indietro.s === 201 && Number((await dammi(sc.id)).versato) === 100 && Number((await dammi(bollo.id)).versato) === 858.42 && Number((await dammi(sc.id)).saldo) === 1000, 'rimetti nei liberi: totale invariato');
  const oltre = await r('POST', `/obiettivi/${bollo.id}/versamenti`, A, { importo: '-900', da_liberi: true });
  verifica(oltre.s === 400 && Number((await dammi(sc.id)).versato) === 100, 'rimettere più di quello che c\'è: rifiutato, nulla cambia', oltre.j);
  const dettB = (await r('GET', `/obiettivi/${bollo.id}`, A)).j.versamenti.find((x) => Number(x.importo) === -100);
  verifica(dettB?.spostamento_con === 'Scadenze' && dettB.spostamento_con_padre === true, 'versamento negativo del figlio: nei liberi di Scadenze', dettB);
  // Nipote: i «liberi» sono quelli del padre diretto (Assicurazione, 41,58), non del nonno.
  verifica((await r('POST', `/obiettivi/${nip.id}/versamenti`, A, { importo: '50', da_liberi: true })).s === 400, 'nipote: liberi del padre diretto, non del nonno');
  const nip1 = await r('POST', `/obiettivi/${nip.id}/versamenti`, A, { importo: '40', da_liberi: true });
  verifica(nip1.s === 201 && Number((await dammi(ass.id)).versato) === 1.58 && Number((await dammi(ass.id)).saldo) === 41.58 && Number((await dammi(sc.id)).versato) === 100, 'nipote: sposta dai liberi del padre diretto', nip1.j);
  // Aggiunta divisa: sul figlio con un nipote, lo spostamento si divide e il padre cala dell'intero.
  const div = await r('POST', `/obiettivi/${ass.id}/versamenti`, A, { importo: '1.00', da_liberi: true, dividi: true });
  const a2 = await dammi(ass.id);
  verifica(div.s === 201 && Number(a2.saldo) === 42.58 && Number((await dammi(sc.id)).saldo) === 1000 && Number((await dammi(sc.id)).versato) === 99, 'spostamento con dividi: i liberi calano dell\'intero, totale del superiore invariato', [a2.saldo, a2.versato]);
  // Annullare un vecchio spostamento quando i soldi sono già stati usati: rifiutato, nulla cambia.
  const idVecchio = (await r('GET', `/obiettivi/${bollo.id}`, A)).j.versamenti.find((x) => Number(x.importo) === -100).id;
  verifica((await r('DELETE', `/obiettivi/versamenti/${idVecchio}`, A)).s === 409 && Number((await dammi(sc.id)).versato) === 99 && Number((await dammi(bollo.id)).versato) === 858.42, 'annullare uno spostamento già usato: 409 e nulla cambia');
  // Cancellare un versamento di uno spostamento annulla entrambe le metà.
  const idDiv = (await r('GET', `/obiettivi/${nip.id}`, A)).j.versamenti.find((x) => x.spostamento_con === 'Scadenze' || Number(x.importo) === 1).id;
  verifica((await r('DELETE', `/obiettivi/versamenti/${idDiv}`, A)).s === 204 && Number((await dammi(sc.id)).versato) === 100 && Number((await dammi(ass.id)).saldo) === 41.58, 'cancellare uno spostamento toglie entrambe le metà');
  verifica((await r('DELETE', `/obiettivi/versamenti/${idVecchio}`, A)).s === 204 && Number((await dammi(sc.id)).versato) === 0 && Number((await dammi(bollo.id)).versato) === 958.42, 'annullare uno spostamento: tornano come prima');
  await r('POST', `/obiettivi/${sc.id}/versamenti`, A, { importo: '500' });
  // Un altro utente non vede né sposta.
  verifica((await r('POST', `/obiettivi/${bollo.id}/versamenti`, Bt, { importo: '1', da_liberi: true })).s === 404, 'spostamento su un salvadanaio non visibile: 404');
  // Due spostamenti insieme non spendono due volte gli stessi liberi.
  const liberiOra = Number((await dammi(sc.id)).versato);
  const coppia = await Promise.all([ass.id, bollo.id].map((x) => r('POST', `/obiettivi/${x}/versamenti`, A, { importo: String(liberiOra - 10), da_liberi: true })));
  verifica(coppia.filter((x) => x.s === 201).length === 1 && coppia.filter((x) => x.s === 400).length === 1 && Number((await dammi(sc.id)).versato) === 10, 'spostamenti insieme: uno solo passa, i liberi non vanno sotto zero', coppia.map((x) => x.s));
}


// ---- Spunte e versamenti sono solo segni (decisione 59): nessun movimento, nessun saldo, nessun mese bloccato ----
{
  const sposta = (m, k) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + mm - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese, meseB = (await r('GET', '/spese-previste', Bt)).j.periodo.mese;
  const passato = sposta(meseA, -1), futuro = sposta(meseA, 1);
  const quanti = async (T = A) => (await r('GET', '/movimenti?limite=500', T)).j.movimenti.length;
  const mk = async (T, corpo) => (await r('POST', '/spese-previste', T, { importo: '10', ...corpo })).j;
  const spuntaA = (id, mese = meseA) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togliA = (id, mese = meseA) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const piatti = (xs) => xs.flatMap((o) => [o, ...piatti(o.figli)]);
  const goal = async (id) => piatti((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const versa = (id, corpo, T = A) => r('POST', `/obiettivi/${id}/versamenti`, T, corpo);
  const condividi = async (spesaId, pctA) => {
    await r('POST', '/condivisioni', A, { voce: 'spesa', id: spesaId, utente_id: b.utente_id });
    await r('PUT', `/spese-previste/${spesaId}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: String(pctA) }, { utente_id: b.utente_id, percentuale: String(100 - pctA) }] });
  };
  const cA = (await r('POST', '/conti', A, { nome: 'Etichetta prova' })).j;
  const nA = await quanti(), nB = await quanti(Bt);

  // Spesa con un conto: la spunta è un segno, nessun movimento scritto
  const X = await mk(A, { nome: 'Spesa X', importo: '100', conto_id: cA.id });
  const sX = await spuntaA(X.id);
  verifica(sX.s === 201 && sX.j.importo === undefined && await quanti() === nA, 'spunta di una spesa con un conto: nessun movimento', sX.j);
  verifica((await togliA(X.id)).s === 204 && (await togliA(X.id)).s === 404, 'togliere la spunta; senza spunta: 404');
  // Spesa condivisa spuntata dall'altra persona: segno anche per lei
  const perB = await mk(A, { nome: 'Per B', importo: '100', conto_id: cA.id });
  await condividi(perB.id, 50);
  const sB = await r('POST', `/spese-previste/${perB.id}/spunta`, Bt, { mese: meseB });
  verifica(sB.s === 201 && await quanti() === nA && await quanti(Bt) === nB, 'B spunta una spesa condivisa: nessun movimento per nessuno', sB.j);
  verifica((await r('DELETE', `/spese-previste/${perB.id}/spunta?mese=${meseB}`, Bt)).s === 204, 'B toglie la sua spunta');
  // Rate: stessa regola
  const rata = (await r('POST', '/rate', A, { oggetto: 'Rata prova', importo_rata: '50', numero_rate: 6, prima_scadenza: `${passato}-15`, conto_id: cA.id })).j;
  verifica((await r('POST', `/rate/${rata.id}/spunta`, A, { mese: meseA })).s === 201 && await quanti() === nA, 'rata con conto: la spunta non scrive movimenti');
  verifica((await r('DELETE', `/rate/${rata.id}/spunta?mese=${meseA}`, A)).s === 204, 'rata: si toglie la spunta');
  // Il passato non è più bloccato (decisione 59)
  verifica((await spuntaA(X.id, passato)).s === 201 && (await togliA(X.id, passato)).s === 204, 'spunta e togli in un mese passato: permessi');
  verifica((await r('POST', `/rate/${rata.id}/spunta`, A, { mese: passato })).s === 201 && (await r('DELETE', `/rate/${rata.id}/spunta?mese=${passato}`, A)).s === 204, 'rate nei mesi passati: permesse');
  verifica((await spuntaA(X.id, futuro)).s === 201 && (await togliA(X.id, futuro)).s === 204, 'un mese futuro si spunta e si toglie');

  // Budget: una lente sui movimenti della categoria, senza promemoria né conti (decisione 57); un budget non è una spesa
  const catE = (await r('POST', '/categorie', A, { nome: 'Categoria budget E' })).j;
  const bud = (await r('POST', '/budget', A, { categoria_id: catE.id, importo: '300' })).j;
  verifica(!('conto_id' in bud) && bud.categoria_id === catE.id && bud.nome === 'Categoria budget E' && !('speso_da_spese' in bud) && !('spese_contate' in bud), 'un budget ha la categoria, nessun conto né spese contate', bud);
  verifica((await r('POST', `/budget/${bud.id}/spunta`, A, { mese: meseA })).s === 404, 'la spunta del budget non esiste');
  verifica((await r('POST', '/budget', A, { categoria_id: (await r('POST', '/categorie', A, { nome: 'Categoria budget E2' })).j.id, importo: '10', promemoria: true })).s === 201, 'il campo promemoria è ignorato in creazione');
  verifica((await r('PATCH', `/spese-previste/${(await mk(A, { nome: 'Fissa E', conto_id: cA.id })).id}`, A, { tipo: 'budget' })).s === 400, 'una spesa non diventa un budget (400)');

  // Annuali (decisione 50): promemoria come le altre spese, solo nel mese in cui escono, per intero; nessun salvadanaio
  const an = await mk(A, { nome: 'Assicurazione prova', importo: '100', ogni_mesi: 12, prossima_scadenza: `${meseA}-15`, conto_id: cA.id, nuovo_salvadanaio: {} });
  verifica(an.nel_mese && !('obiettivo_id' in an) && !('quota_mensile' in an), 'annuale in questo mese, senza salvadanaio né quota mensile', an);
  verifica(!(await r('GET', '/obiettivi', A)).j.some((o) => o.nome === 'Assicurazione prova'), 'nuovo_salvadanaio è ignorato: nessun salvadanaio');
  verifica((await spuntaA(an.id)).s === 201 && await quanti() === nA && (await togliA(an.id)).s === 204, 'annuale: la spunta è un segno e si toglie');
  const fuori = await mk(A, { nome: 'Annuale fuori mese', importo: '120', ogni_mesi: 12, prossima_scadenza: `${sposta(meseA, 4)}-20`, conto_id: cA.id });
  verifica(!fuori.nel_mese && (await spuntaA(fuori.id)).s === 400, 'un\'annuale fuori dal suo mese non si spunta (400)');

  // Il promemoria di un salvadanaio (decisione 51): una spesa come le altre; la spunta non versa nulla (decisione 59)
  const fondoP = (await r('POST', '/obiettivi', A, { nome: 'Fondo promemoria' })).j;
  const prom = (await r('PUT', `/obiettivi/${fondoP.id}/promemoria`, A, { importo: '100', conto_id: cA.id })).j;
  verifica(prom.conto_id === cA.id && prom.mia_quota === '100.00' && prom.alimenta_obiettivo_id === fondoP.id, 'promemoria del salvadanaio: voce con l\'etichetta scelta e la cifra fissa', prom);
  verifica((await spuntaA(prom.id)).s === 201 && Number((await goal(fondoP.id)).saldo) === 0 && Number((await goal(fondoP.id)).versato) === 0 && await quanti() === nA, 'la spunta del promemoria non versa nel salvadanaio e non scrive movimenti');
  const spesaProm = (await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === prom.id);
  verifica(spesaProm.uscita === true && spesaProm.mia_quota === '100.00', 'spuntato: la voce resta a 100', spesaProm);
  verifica((await togliA(prom.id)).s === 204 && Number((await goal(fondoP.id)).saldo) === 0, 'togliendo la spunta il salvadanaio non cambia');
  await r('DELETE', `/obiettivi/${fondoP.id}/promemoria`, A);
  // Con scadenza e traguardo la quota è (traguardo - già messo) / mesi personali rimasti, minimo 0
  const fondoQ = (await r('POST', '/obiettivi', A, { nome: 'Fondo quota', traguardo: '1200', scadenza: `${sposta(meseA, 3)}-20` })).j;
  const promQ = (await r('PUT', `/obiettivi/${fondoQ.id}/promemoria`, A, { conto_id: cA.id })).j;
  verifica(promQ.mia_quota === '300.00' && promQ.importo === '300.00', 'promemoria con scadenza fra 4 mesi personali e traguardo 1200: 300 al mese', promQ);
  await versa(fondoQ.id, { importo: '300' });
  verifica((await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === promQ.id).mia_quota === '225.00', 'versati 300: (1200 - 300) / 4 mesi = 225');
  await versa(fondoQ.id, { importo: '5000' });
  verifica((await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === promQ.id).mia_quota === '0.00', 'oltre il traguardo la quota è 0 (minimo 0)');
  verifica((await r('GET', `/obiettivi/${fondoQ.id}`, A)).j.alimentato_da.importo === '0.00', 'il salvadanaio mostra la quota del mese');
  await r('DELETE', `/obiettivi/${fondoQ.id}/promemoria`, A);
  verifica(!(await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.some((x) => x.id === promQ.id), 'spento il promemoria la voce sparisce');

  // Versamenti: si scrivono a mano, conto_id è ignorato, nessun movimento, il passato si può
  const fondoG = (await r('POST', '/obiettivi', A, { nome: 'Fondo G' })).j;
  verifica((await versa(fondoG.id, { importo: '200', conto_id: cA.id })).s === 201 && Number((await goal(fondoG.id)).saldo) === 200 && await quanti() === nA, 'versamento con conto_id: il conto è ignorato, nessun movimento');
  verifica((await versa(fondoG.id, { importo: '-30', conto_id: cA.id })).s === 201 && Number((await goal(fondoG.id)).saldo) === 170 && await quanti() === nA, 'prelievo con conto_id: nessun movimento');
  const vP = await versa(fondoG.id, { importo: '10', data: `${passato}-20` });
  verifica(vP.s === 201 && Number((await goal(fondoG.id)).saldo) === 180, 'versamento in un mese passato: permesso', vP.j);
  const idP = (await r('GET', `/obiettivi/${fondoG.id}`, A)).j.versamenti.find((x) => x.importo === '10.00').id;
  verifica((await r('DELETE', `/obiettivi/versamenti/${idP}`, A)).s === 204 && Number((await goal(fondoG.id)).saldo) === 170, 'annullare un versamento di un mese passato: permesso');
  // Un versamento diviso tra i sotto-salvadanai: la somma è l'importo
  const padreD = (await r('POST', '/obiettivi', A, { nome: 'Fondo D' })).j;
  await r('POST', '/obiettivi', A, { nome: 'D1', padre_id: padreD.id, traguardo: '100' });
  await r('POST', '/obiettivi', A, { nome: 'D2', padre_id: padreD.id, traguardo: '100' });
  verifica((await versa(padreD.id, { importo: '150', dividi: true })).s === 201 && Number((await r('GET', `/obiettivi/${padreD.id}`, A)).j.saldo) === 150 && await quanti() === nA, 'versamento con dividi: la somma delle parti è l\'importo');
  verifica((await r('DELETE', `/obiettivi/${fondoG.id}`, A)).s === 204 && (await r('DELETE', `/obiettivi/${padreD.id}`, A)).s === 204, 'i salvadanai si eliminano');
}

// ---- Budget e movimenti (decisioni 49, 57 e 59): lo speso sono solo le uscite scritte in Movimenti ----
{
  const sposta = (m, k) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + mm - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese, meseB = (await r('GET', '/spese-previste', Bt)).j.periodo.mese;
  const passato = sposta(meseA, -1), futuro = sposta(meseA, 1);
  const tutti = async (query = '', T = A) => (await r('GET', `/movimenti${query}`, T)).j;
  const mk = async (T, corpo) => (await r('POST', '/spese-previste', T, { importo: '10', ...corpo })).j;
  const spunta = (id, mese = meseA, T = A) => r('POST', `/spese-previste/${id}/spunta`, T, { mese });
  const togli = (id, mese = meseA, T = A) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, T);
  const conto = async (nome, T = A) => (await r('POST', '/conti', T, { nome })).j;
  const uscita = (id, corpo, T = A) => r('POST', `/budget/${id}/uscite`, T, corpo);
  const budgetDi = async (id, mese = meseA, T = A) => (await r('GET', `/budget?mese=${mese}`, T)).j.budget.find((x) => x.id === id);
  const nuovaCat = async (nome, T = A) => (await r('POST', '/categorie', T, { nome })).j;
  const mkB = async (T, corpo) => (await r('POST', '/budget', T, { importo: '10', ...corpo })).j;

  // Una spesa non condivisa non si spunta da chi non la vede
  const cX = await conto('Privato di A');
  const privata = await mk(A, { nome: 'Privata di A', importo: '30', conto_id: cX.id });
  verifica((await spunta(privata.id, meseB, Bt)).s === 404, 'una spesa non condivisa non si spunta (404)');

  const cP = await conto('Budget da'), cQ = await conto('Budget a'), cBx = await conto('Conto di B', Bt);
  const catS = await nuovaCat('Budget casa');
  const bs = await mkB(A, { categoria_id: catS.id, importo: '300' });
  verifica(bs.attivo === true && bs.speso === '0.00' && bs.sforo === '0.00' && !('modo' in bs) && !('promemoria' in bs) && !('conto_id' in bs) && !('conto_partenza_id' in bs) && !('partenza_id' in bs) && !('arrivo_id' in bs) && !('uscito' in bs) && !('speso_da_spese' in bs) && !('spese_contate' in bs), 'budget nuovo: solo la cifra e la categoria (nessun promemoria, nessun conto)', bs);
  verifica((await r('POST', `/budget/${bs.id}/spunta`, A, { mese: meseA })).s === 404 && (await r('DELETE', `/budget/${bs.id}/spunta?mese=${meseA}`, A)).s === 404, 'il budget non si spunta (404)');
  const patchVecchio = await r('PATCH', `/budget/${bs.id}`, A, { promemoria: true, conto_partenza_id: cP.id, conto_id: cQ.id, importo: '300' });
  verifica(patchVecchio.s === 200 && !('promemoria' in patchVecchio.j) && !('conto_id' in patchVecchio.j), 'i campi del vecchio promemoria sono ignorati', patchVecchio.j);
  verifica((await r('PATCH', `/budget/${bs.id}`, A, { modo: 'conto' })).s === 400, 'il campo modo non esiste più: nessun campo da modificare (400)');
  verifica((await r('POST', '/movimenti', A, { tipo: 'giroconto', importo: '300', da_conto_id: cP.id, a_conto_id: cQ.id })).s === 400, 'il giroconto non esiste più (400)');

  // Budget condiviso: B vede il budget con la sua quota, ma non c'è nulla da spuntare
  const catSh = await nuovaCat('Budget condiviso');
  const bsh = await mkB(A, { categoria_id: catSh.id, importo: '100' });
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bsh.id, utente_id: b.utente_id });
  await r('PUT', `/budget/${bsh.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const bshB = await budgetDi(bsh.id, meseB, Bt);
  verifica(bshB && bshB.mia === false && bshB.creato_da === 'Anna' && bshB.mia_quota === '50.00' && bshB.condiviso, 'B vede il budget condiviso con la sua quota', bshB);
  verifica((await r('POST', `/budget/${bsh.id}/spunta`, Bt, { mese: meseB })).s === 404, 'B non può spuntare il budget condiviso (404)');
  verifica((await r('DELETE', `/budget/${bsh.id}`, Bt)).s === 403, 'solo chi ha creato il budget lo elimina (403)');

  // --- Lo speso: le uscite in Movimenti con la categoria, con qualunque etichetta; non è un limite ---
  const catC = await nuovaCat('Spesa cibo');
  const bc = await mkB(A, { categoria_id: catC.id, importo: '300' });
  verifica(bc.speso === '0.00' && bc.sforo === '0.00' && JSON.stringify(bc.speso_per_conto) === '{}', 'budget: speso 0', bc);
  const u1 = await uscita(bc.id, { importo: '40', descrizione: 'Supermercato', conto_id: cP.id });
  verifica(u1.s === 201 && u1.j.speso === '40.00' && u1.j.speso_per_conto[cP.id] === '40.00', 'uscita con un conto: il budget si riempie', u1.j);
  const u2 = await uscita(bc.id, { importo: '10.50', descrizione: 'Mercato' });
  verifica(u2.s === 201 && u2.j.speso === '50.50' && u2.j.speso_per_conto.senza === '10.50', 'uscita senza conto: riempie il budget', u2.j);
  const u3 = await uscita(bc.id, { importo: '9.50', descrizione: 'Altro conto', conto_id: cQ.id });
  verifica(u3.j.speso === '60.00' && u3.j.speso_per_conto[cP.id] === '40.00' && u3.j.speso_per_conto[cQ.id] === '9.50', 'le uscite con etichette diverse contano tutte nello stesso budget', u3.j);
  // Una spesa prevista spuntata con la stessa categoria NON conta più (decisione 59); un'uscita scritta in Movimenti sì
  const sCat = await mk(A, { nome: 'Spesa con categoria del budget', importo: '25', conto_id: cQ.id, categoria_id: catC.id });
  await spunta(sCat.id);
  const conSpesa = await budgetDi(bc.id);
  verifica(conSpesa.speso === '60.00' && !('speso_da_spese' in conSpesa) && !('spese_contate' in conSpesa), 'una spesa spuntata con la categoria del budget non conta nello speso', conSpesa);
  const mCat = await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '15', categoria_id: catC.id, descrizione: 'Da Movimenti' });
  const conMov = await budgetDi(bc.id);
  verifica(mCat.s === 201 && conMov.speso === '75.00' && conMov.uscite.some((x) => x.id === mCat.j.id), 'un\'uscita scritta in Movimenti con la categoria conta nello speso', conMov);
  verifica((await r('DELETE', `/movimenti/${mCat.j.id}`, A)).s === 204 && (await budgetDi(bc.id)).speso === '60.00', 'tolta l\'uscita lo speso torna');
  await togli(sCat.id);
  await r('DELETE', `/spese-previste/${sCat.id}`, A);
  await r('DELETE', `/budget/uscite/${u3.j.uscite.find((x) => x.descrizione === 'Altro conto').id}`, A);
  const sp = (await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese;
  verifica(!sp.some((x) => x.id === bc.id || x.tipo === 'budget'), 'i budget non sono più nelle spese');
  const bd = await budgetDi(bc.id);
  verifica(bd.uscite.length === 2 && bd.uscite[0].descrizione === 'Mercato' && bd.uscite[0].importo === '10.50' && bd.uscite[0].utente === 'Anna' && bd.uscite[0].modificabile && bd.uscite[1].conto === 'Budget da', '/budget: le uscite del mese, dalla più recente', bd.uscite);
  const mAll = await tutti();
  verifica(Array.isArray(mAll.movimenti) && Array.isArray(mAll.mesi) && mAll.mese_in_corso === meseA, '/movimenti: movimenti, mesi e mese in corso', Object.keys(mAll));
  const r40 = mAll.movimenti.find((x) => x.budget_id === bc.id && x.importo === '40.00');
  verifica(r40 && r40.tipo === 'uscita' && r40.conto_id === cP.id && r40.conto === 'Budget da' && r40.categoria_id === catC.id && r40.categoria === 'Spesa cibo' && r40.utente === 'Anna' && r40.modificabile === true && /^\d{4}-\d{2}-\d{2}$/.test(r40.data) && /^\d{4}-\d{2}-\d{2}T/.test(r40.momento) && 'conto_icona' in r40, '/movimenti: l\'uscita di budget con tutti i campi', r40);
  verifica(mAll.movimenti.some((x) => x.budget_id === bc.id && x.importo === '10.50' && x.conto_id === null && x.conto === null), '/movimenti: l\'uscita senza conto');
  verifica(mAll.movimenti.every((x) => !('causa' in x) && !('da_conto_id' in x) && !('segno' in x)), '/movimenti: niente più causa, da/a, segno');
  const conP = (await tutti(`?conto=${cP.id}`)).movimenti, senza = (await tutti('?conto=senza')).movimenti;
  verifica(conP.length >= 1 && conP.every((x) => x.conto_id === cP.id) && senza.length >= 1 && senza.every((x) => x.conto_id === null), '/movimenti: filtro per conto e «senza»');
  verifica((await r('GET', '/movimenti?conto=non-un-id', A)).s === 404, '/movimenti: conto non valido (404, come un id nel percorso)');
  verifica((await tutti(`?mese=${meseA}`)).movimenti.length > 0 && (await tutti(`?mese=${sposta(meseA, -6)}`)).movimenti.length === 0 && mAll.mesi.includes(meseA), '/movimenti: filtro per mese personale', mAll.mesi);
  verifica((await uscita(bc.id, { importo: '0' })).s === 400 && (await uscita(bc.id, { importo: '-5' })).s === 400 && (await uscita(bc.id, {})).s === 400, 'uscita: importo obbligatorio e positivo');
  verifica((await uscita(bc.id, { importo: '5', conto_id: cBx.id })).s === 404, 'uscita con l\'etichetta di un altro: 404');
  verifica((await uscita(bc.id, { importo: '5' }, Bt)).s === 404, 'uscita su un budget che non vedi: 404');
  const uAltro = await uscita(bs.id, { importo: '5', descrizione: 'Su un altro budget' });
  verifica(uAltro.s === 201 && uAltro.j.speso === '5.00', 'le uscite si registrano per qualunque budget', uAltro.j);
  await r('DELETE', `/budget/uscite/${uAltro.j.uscite[0].id}`, A);
  // Il passato non è più bloccato (decisione 59)
  const uP = await uscita(bc.id, { importo: '5', descrizione: 'Nel passato', data: `${passato}-15` });
  verifica(uP.s === 201 && uP.j.speso === '5.00' && (await budgetDi(bc.id)).speso === '50.50', 'uscita in un mese passato: permessa, conta nel suo mese', uP.j);
  verifica((await r('DELETE', `/budget/uscite/${uP.j.uscite[0].id}`, A)).s === 204 && (await budgetDi(bc.id, passato)).speso === '0.00', 'e si toglie');
  const uF = await uscita(bc.id, { importo: '7', descrizione: 'Più avanti', data: `${futuro}-20` });
  verifica(uF.s === 201 && uF.j.speso === '7.00' && (await budgetDi(bc.id)).speso === '50.50' && (await budgetDi(bc.id, futuro)).speso === '7.00', 'uscita in un mese futuro: conta nel suo mese, non in questo', uF.j);
  const idF = (await budgetDi(bc.id, futuro)).uscite[0].id;
  verifica((await r('DELETE', `/budget/uscite/${idF}`, A)).s === 204 && (await budgetDi(bc.id, futuro)).speso === '0.00', 'si toglie un\'uscita del mese futuro');
  verifica((await r('DELETE', `/budget/uscite/${bd.uscite[1].id}`, A)).s === 204 && (await budgetDi(bc.id)).speso === '10.50', 'togliere un\'uscita: il budget si svuota');
  // Sforo: non è un limite, si conta tutto e si dice di quanto si è sforato
  const catF = await nuovaCat('Budget sforato');
  const bf = await mkB(A, { categoria_id: catF.id, importo: '100' });
  await uscita(bf.id, { importo: '80', descrizione: 'Prima' });
  const sf = await uscita(bf.id, { importo: '50', descrizione: 'Oltre la cifra' });
  verifica(sf.s === 201 && sf.j.speso === '130.00' && sf.j.sforo === '30.00' && (await budgetDi(bf.id)).uscite.length === 2, 'oltre la cifra si conta tutto e lo sforo è la differenza (130 su 100: 30)', sf.j);
  verifica((await budgetDi(bc.id)).sforo === '0.00', 'sotto la cifra lo sforo è 0');
  await r('DELETE', `/budget/${bf.id}`, A);
  // Condiviso: ognuno registra le sue uscite, il totale è uno; solo chi l'ha scritta la cambia o la toglie
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bc.id, utente_id: b.utente_id });
  await r('PUT', `/budget/${bc.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const uB = await uscita(bc.id, { importo: '20', descrizione: 'B paga', conto_id: cBx.id }, Bt);
  verifica(uB.s === 201 && (await budgetDi(bc.id)).speso === '30.50' && (await budgetDi(bc.id, meseB, Bt)).speso === '30.50', 'budget condiviso: speso uno solo per entrambi', uB.j);
  const uteA = (await budgetDi(bc.id)).uscite.find((x) => x.descrizione === 'B paga');
  verifica(uteA && uteA.conto === null && uteA.utente === 'Bruno' && uteA.modificabile === false, 'A vede l\'uscita di B, non il nome dell\'etichetta di B, e non la può cambiare', uteA);
  const rigaB = (await tutti()).movimenti.find((x) => x.id === uteA.id);
  verifica(rigaB && rigaB.budget_id === bc.id && rigaB.conto === null && rigaB.modificabile === false, '/movimenti: A vede le uscite del budget condiviso, non modificabili', rigaB);
  verifica((await r('PATCH', `/movimenti/${uteA.id}`, A, { importo: '1' })).s === 403 && (await r('DELETE', `/movimenti/${uteA.id}`, A)).s === 403 && (await r('DELETE', `/budget/uscite/${uteA.id}`, A)).s === 403, 'solo chi ha scritto l\'uscita la cambia o la toglie (403)');
  verifica((await tutti(`?conto=${cBx.id}`, Bt)).movimenti.some((x) => x.id === uteA.id && x.conto === 'Conto di B' && x.modificabile), 'B: l\'uscita sta sotto la sua etichetta');
  const eB = await r('POST', '/movimenti', Bt, { tipo: 'entrata', importo: '3', conto_id: cBx.id });
  verifica(eB.s === 201 && !(await tutti()).movimenti.some((x) => x.id === eB.j.id) && (await r('PATCH', `/movimenti/${eB.j.id}`, A, { importo: '1' })).s === 404, 'i movimenti di B fuori dai budget condivisi: A non li vede (404)');
  // Eliminare il budget non cancella le uscite: restano nel registro con la loro categoria
  const catD = await nuovaCat('Budget da eliminare');
  const bdel = await mkB(A, { categoria_id: catD.id, importo: '50' });
  await uscita(bdel.id, { importo: '12', descrizione: 'Resta nel registro' });
  verifica((await r('DELETE', `/budget/${bdel.id}`, A)).s === 204 && (await tutti()).movimenti.some((x) => x.descrizione === 'Resta nel registro' && x.budget_id === null && x.categoria_id === catD.id), 'eliminando il budget le uscite restano nel registro');
  verifica((await r('DELETE', `/categorie/${catD.id}`, A)).s === 204, 'senza budget la categoria si elimina');

  // Analisi (decisioni 58 e 59): niente giroconti né uscite a mano per conto, nessuna voce di budget
  const catU = await nuovaCat('Usciti prova');
  const budU = await mkB(A, { categoria_id: catU.id, importo: '500' });
  await uscita(budU.id, { importo: '30', conto_id: cP.id, descrizione: 'Uscita di budget' });
  const m2 = (await r('GET', `/analisi/mese?mese=${meseA}`, A)).j;
  verifica(!('giroconti_per_conto' in m2) && !('uscite_a_mano_per_conto' in m2), '/analisi/mese: niente giroconti né uscite a mano per conto', Object.keys(m2));
  verifica(m2.voci.budget === undefined && m2.budget_residuo === undefined, 'analisi: nessuna voce di budget nei totali del mese', m2.voci);
  const catS2 = (await r('GET', `/categorie/spese?mese=${meseA}`, A)).j;
  verifica(!catS2.some((x) => x.categoria_id === catU.id && Number(x.speso) >= 500), '/categorie/spese: il tetto del budget non pesa sulla categoria', catS2);
}

// ---- Movimenti a mano e conto eliminato (decisioni 53 e 59) ----
{
  const tutti = async (query = '', T = A) => (await r('GET', `/movimenti${query}`, T)).j;
  const conto = async (nome, T = A) => (await r('POST', '/conti', T, { nome })).j;
  const mano = (corpo, T = A) => r('POST', '/movimenti', T, corpo);

  const c1 = await conto('Mano 1');
  const cat = (await r('GET', '/categorie?formato=elenco', A)).j.find((x) => x.nome === 'Supermercato');
  // Entrata e uscita: il conto è un'etichetta, facoltativa
  const e = await mano({ tipo: 'entrata', importo: '100', conto_id: c1.id, descrizione: 'Regalo' });
  verifica(e.s === 201 && e.j.id, 'a mano: entrata', e.j);
  const u = await mano({ tipo: 'uscita', importo: '30.50', conto_id: c1.id });
  verifica(u.s === 201, 'a mano: uscita', u.j);
  const s = await mano({ tipo: 'uscita', importo: '4' });
  verifica(s.s === 201, 'a mano: uscita senza conto', s.j);
  const el = (await tutti('?limite=50')).movimenti;
  const rE = el.find((x) => x.id === e.j.id), rU = el.find((x) => x.id === u.j.id), rS = el.find((x) => x.id === s.j.id);
  verifica(rE.tipo === 'entrata' && rE.importo === '100.00' && rE.conto_id === c1.id && rE.conto === 'Mano 1' && rE.conto_icona === 'landmark' && rE.modificabile === true && rE.descrizione === 'Regalo' && rE.categoria_id === null && rE.budget_id === null && rE.utente === 'Anna', '/movimenti: entrata a mano, modificabile', rE);
  verifica(rU.tipo === 'uscita' && rU.importo === '30.50' && rU.descrizione === 'Uscita' && rU.modificabile === true, '/movimenti: uscita a mano (descrizione di base)', rU);
  verifica(rS.conto_id === null && rS.conto === null && (await tutti('?conto=senza')).movimenti.some((x) => x.id === s.j.id) && !(await tutti('?conto=senza')).movimenti.some((x) => x.id === e.j.id), '/movimenti: uscita senza conto, nel filtro «senza»', rS);
  verifica((await tutti(`?conto=${c1.id}`)).movimenti.length === 2, '/movimenti: filtro per etichetta');
  // Validazione
  verifica((await mano({ tipo: 'uscita', importo: '0', conto_id: c1.id })).s === 400 && (await mano({ tipo: 'uscita', importo: '-5', conto_id: c1.id })).s === 400, 'a mano: importo zero o negativo rifiutato');
  verifica((await mano({ tipo: 'altro', importo: '5', conto_id: c1.id })).s === 400 && (await mano({ importo: '5', conto_id: c1.id })).s === 400, 'a mano: tipo non valido o mancante rifiutato');
  verifica((await mano({ tipo: 'giroconto', importo: '5', da_conto_id: c1.id, a_conto_id: (await conto('Mano 2')).id })).s === 400, 'a mano: il giroconto non esiste più (400)');
  verifica((await mano({ tipo: 'entrata', importo: '5', conto_id: c1.id }, Bt)).s === 404, 'a mano: l\'etichetta di un altro non si sceglie (404)');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, data: '31/12/2026' })).s === 400 && (await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, ora: '25:00' })).s === 400, 'a mano: data o ora non valide rifiutate');
  verifica((await mano({ tipo: 'entrata', importo: '5', conto_id: c1.id, categoria_id: cat.id })).s === 400, 'a mano: la categoria è solo delle uscite');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, categoria_id: (await r('GET', '/categorie?formato=elenco', Bt)).j[0].id })).s === 404, 'a mano: la categoria di un altro non si sceglie (404)');
  const vecchio = await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, data: '2020-01-15' });
  verifica(vecchio.s === 201 && (await r('DELETE', `/movimenti/${vecchio.j.id}`, A)).s === 204, 'a mano: un mese passato non è più bloccato');
  // Data e ora scelte
  const ora10 = await mano({ tipo: 'entrata', importo: '1', conto_id: c1.id, data: '2099-05-04', ora: '10:30' });
  const riga10 = (await tutti('?limite=50')).movimenti.find((x) => x.id === ora10.j.id);
  verifica(ora10.s === 201 && (riga10.momento.startsWith('2099-05-04T08:30') || riga10.momento.startsWith('2099-05-04T09:30')), 'a mano: data e ora scelte (mese futuro permesso)', riga10?.momento);
  await r('DELETE', `/movimenti/${ora10.j.id}`, A);
  // Categoria con budget: l'uscita a mano conta nello speso del budget
  const bud = (await r('POST', '/budget', A, { categoria_id: cat.id, importo: '300' })).j;
  const budDi = async () => (await r('GET', '/budget', A)).j.budget.find((x) => x.id === bud.id);
  const uc = await mano({ tipo: 'uscita', importo: '45', conto_id: c1.id, categoria_id: cat.id, descrizione: 'Spesa grande' });
  const b1 = await budDi();
  verifica(uc.s === 201 && b1.speso === '45.00' && b1.uscite.some((x) => x.id === uc.j.id && x.modificabile), 'a mano: l\'uscita con categoria conta nel budget', b1);
  verifica((await tutti('?limite=50')).movimenti.find((x) => x.id === uc.j.id).categoria === 'Supermercato', '/movimenti: l\'uscita mostra la categoria');
  // Modifica
  const m1 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { importo: '60', descrizione: 'Spesa più grande' });
  verifica(m1.s === 200 && (await budDi()).speso === '60.00', 'a mano: modificare l\'importo aggiorna il budget', m1.j);
  const m2 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { categoria_id: null });
  verifica(m2.s === 200 && (await budDi()).speso === '0.00', 'a mano: tolta la categoria, il budget si svuota', m2.j);
  await r('PATCH', `/movimenti/${uc.j.id}`, A, { categoria_id: cat.id });
  const m4 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { tipo: 'entrata', conto_id: null });
  const rm4 = (await tutti('?limite=50')).movimenti.find((x) => x.id === uc.j.id);
  verifica(m4.s === 200 && rm4.tipo === 'entrata' && rm4.categoria_id === null && rm4.conto_id === null && rm4.descrizione === 'Spesa più grande' && (await budDi()).speso === '0.00', 'a mano: da uscita a entrata (la categoria si toglie, il budget si svuota)', rm4);
  verifica((await r('PATCH', `/movimenti/${uc.j.id}`, A, { tipo: 'giroconto' })).s === 400 && (await r('PATCH', `/movimenti/${uc.j.id}`, A, { importo: '0' })).s === 400, 'a mano: modifica non valida rifiutata');
  verifica((await r('PATCH', `/movimenti/${uc.j.id}`, A, { data: '2020-01-01' })).s === 200, 'a mano: si sposta anche in un mese passato');
  verifica((await r('DELETE', `/movimenti/${uc.j.id}`, A)).s === 204 && (await r('DELETE', `/movimenti/${uc.j.id}`, A)).s === 404, 'a mano: eliminare toglie il movimento');
  // Le uscite si tolgono anche dalla pagina Budget
  const ub = await mano({ tipo: 'uscita', importo: '10', conto_id: c1.id, categoria_id: cat.id });
  verifica((await r('DELETE', `/budget/uscite/${ub.j.id}`, A)).s === 204 && (await budDi()).speso === '0.00', 'a mano: l\'uscita con categoria si toglie anche dal budget');
  verifica((await r('DELETE', `/budget/uscite/${e.j.id}`, A)).s === 404, 'un\'entrata non è un\'uscita di budget (404)');
  // Solo l'autore: un'uscita di un budget condiviso
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bud.id, utente_id: b.utente_id });
  const ubc = await r('POST', `/budget/${bud.id}/uscite`, A, { importo: '7', conto_id: c1.id });
  const idUbc = ubc.j.uscite[0].id;
  const visto = (await tutti('?limite=50', Bt)).movimenti.find((x) => x.id === idUbc);
  verifica(visto && visto.modificabile === false && visto.conto === null && !(await tutti('?limite=50', Bt)).movimenti.some((x) => x.id === e.j.id), 'budget condiviso: l\'altra persona vede l\'uscita (non l\'etichetta) ma non le entrate private', visto);
  verifica((await r('PATCH', `/movimenti/${idUbc}`, Bt, { importo: '8' })).s === 403 && (await r('DELETE', `/movimenti/${idUbc}`, Bt)).s === 403, 'solo l\'autore cambia e toglie (403)');
  verifica((await r('PATCH', `/movimenti/${e.j.id}`, Bt, { importo: '8' })).s === 404, 'un movimento che non si vede: 404');
  verifica((await r('PATCH', `/movimenti/00000000-0000-0000-0000-0000000000aa`, A, { importo: '1' })).s === 404, 'movimento inesistente (404)');

  // ---- Eliminare un conto: le voci restano, senza etichetta ----
  const X = await conto('Da eliminare');
  const soloX = await mano({ tipo: 'uscita', importo: '20', conto_id: X.id, descrizione: 'Solo di X' });
  const spesaX = (await r('POST', '/spese-previste', A, { nome: 'Spesa su X', importo: '10', conto_id: X.id })).j;
  const svX = (await r('POST', '/obiettivi', A, { nome: 'Sv su X', conto_id: X.id })).j;
  verifica((await r('DELETE', `/conti/${X.id}`, Bt)).s === 404, 'conto eliminato: solo chi lo vede (404 per B)');
  verifica((await r('DELETE', `/conti/${X.id}`, A)).s === 204, 'conto eliminato: X eliminato');
  const dopoX = (await tutti('?limite=200')).movimenti.find((x) => x.id === soloX.j.id);
  verifica(dopoX && dopoX.conto_id === null && dopoX.conto === null, 'conto eliminato: il movimento resta, senza etichetta', dopoX);
  verifica((await r('GET', `/spese-previste`, A)).j.spese.find((x) => x.id === spesaX.id)?.conto_id === null && (await r('GET', `/obiettivi/${svX.id}`, A)).j.conto_id === null, 'conto eliminato: spese e salvadanai restano senza conto');
}

console.log(`prove: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
