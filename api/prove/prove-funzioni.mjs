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

const conto = (await r('POST', '/conti', A, { nome: 'BPER', tipo: 'corrente', saldo_iniziale: '3000', data_saldo_iniziale: '2026-01-01' })).j;

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
verifica((await r('DELETE', `/spese-previste/${affitto.j.id}`, Bt)).s === 403, "l'altro non cancella la spesa");

const cond = (await r('GET', '/condivisioni', Bt)).j;
verifica(cond.length === 1 && cond[0].nome === 'Affitto' && cond[0].mia === false, 'elenco condivisioni', cond);
verifica((await r('DELETE', `/condivisioni/${cond[0].id}`, Bt)).s === 403, "l'altro non toglie la condivisione");

// Condivisione scegliendo la persona dall'elenco (senza email)
const tutte = (await r('GET', '/persone/tutte', A)).j;
verifica(tutte.length >= 1 && tutte.some((x) => x.id === b.utente_id) && !tutte.some((x) => x.id === a.utente_id) && !('email' in tutte[0]), 'elenco altre persone', tutte);
const contoDaCondividere = (await r('POST', '/conti', A, { nome: 'Conto in due' })).j;
verifica((await r('POST', '/condivisioni', A, { voce: 'conto', id: contoDaCondividere.id, utente_id: '00000000-0000-4000-8000-000000000000' })).s === 404, 'utente_id sconosciuto 404');
verifica((await r('POST', '/condivisioni', A, { voce: 'conto', id: contoDaCondividere.id, utente_id: b.utente_id })).s === 201, 'condivisione con utente_id');

// Saldo del conto (decisione 47): UNO per conto, uguale per tutte le persone che lo vedono
const sc1 = await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: '1250.40' });
verifica(sc1.s === 200 && sc1.j.saldo === '1250.40' && sc1.j.saldo_partenza === '1250.40' && /^\d{4}-\d{2}-\d{2}T/.test(sc1.j.saldo_partenza_il), 'saldo del conto scritto', sc1.j);
verifica((await r('GET', '/conti', Bt)).j.find((x) => x.id === contoDaCondividere.id).saldo === '1250.40', 'conto condiviso: B vede lo stesso saldo di A');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, Bt, { importo: '-20' })).j.saldo === '-20.00', 'B riscrive il saldo del conto condiviso');
verifica((await r('GET', '/conti', A)).j.find((x) => x.id === contoDaCondividere.id).saldo === '-20.00', 'conto condiviso: il saldo scritto da B è anche quello di A');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: 'abc' })).s === 400, 'saldo non valido rifiutato');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: '5', momento: new Date(Date.now() + 3600e3).toISOString() })).s === 400, 'saldo nel futuro rifiutato');
verifica((await r('PUT', `/conti/${conto.id}/saldo`, Bt, { importo: '5' })).s === 404, 'saldo di un conto non visibile: 404');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: null })).j.saldo === null, 'saldo del conto tolto');

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
  const cA = (await r('POST', '/conti', A, { nome: 'Conto A', tipo: 'corrente' })).j;
  const cB = (await r('POST', '/conti', A, { nome: 'Conto B', tipo: 'risparmio' })).j;
  const cBruno = (await r('POST', '/conti', Bt, { nome: 'Conto di Bruno', tipo: 'corrente' })).j;
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
  verifica((await r('PATCH', `/obiettivi/${padre.id}`, A, { conto_id: cBruno.id })).s === 404, 'conto di un altro (non condiviso) rifiutato');
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


// ---- Il saldo dei conti si muove con spese e salvadanai (decisione 47) ----
{
  const sposta = (m, k) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + mm - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese, meseB = (await r('GET', '/spese-previste', Bt)).j.periodo.mese;
  const saldoDi = async (id, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === id)?.saldo;
  const movs = async (id, T = A) => (await r('GET', `/conti/${id}/movimenti?limite=100`, T)).j;
  const mk = async (T, corpo) => (await r('POST', '/spese-previste', T, { importo: '10', ...corpo })).j;
  const spuntaA = (id, mese = meseA) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togliA = (id, mese = meseA) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const scrivi = (id, importo, T = A, extra = {}) => r('PUT', `/conti/${id}/saldo`, T, { importo, ...extra });
  const piatti = (xs) => xs.flatMap((o) => [o, ...piatti(o.figli)]);
  const goal = async (id) => piatti((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const condividi = async (spesaId, pctA) => {
    await r('POST', '/condivisioni', A, { voce: 'spesa', id: spesaId, utente_id: b.utente_id });
    await r('PUT', `/spese-previste/${spesaId}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: String(pctA) }, { utente_id: b.utente_id, percentuale: String(100 - pctA) }] });
  };

  // A. Saldo di partenza + movimenti registrati dopo
  const cA = (await r('POST', '/conti', A, { nome: 'Saldo prova' })).j;
  verifica(cA.saldo === null && cA.saldo_partenza === null && cA.saldo_aggiornato_il === null, 'conto nuovo: nessun saldo');
  await scrivi(cA.id, '1000');
  const X = await mk(A, { nome: 'Spesa X', importo: '100', conto_id: cA.id });
  const sX = await spuntaA(X.id);
  verifica(sX.s === 201 && await saldoDi(cA.id) === '900.00', 'C: spesa sul tuo conto, non condivisa: esce l\'importo intero', sX.j);
  let mv = await movs(cA.id);
  verifica(mv.length === 1 && mv[0].importo === '-100.00' && mv[0].descrizione === 'Spesa X' && mv[0].causa === 'spesa' && mv[0].conta === true && mv[0].utente === 'Anna' && /^\d{4}-\d{2}-\d{2}$/.test(mv[0].data), 'movimento della spunta: importo, causa leggibile, chi, conta', mv);
  verifica((await togliA(X.id)).s === 204 && await saldoDi(cA.id) === '1000.00' && (await movs(cA.id)).length === 0, 'togliere la spunta: il movimento sparisce, i soldi tornano');
  // Riscrivere il saldo: i movimenti prima di quel momento sono già nel saldo scritto e non si contano due volte.
  await spuntaA(X.id);
  const riscritto = await scrivi(cA.id, '880');
  verifica(riscritto.j.saldo === '880.00' && (await movs(cA.id))[0].conta === false, 'saldo riscritto dopo la spunta: vale quello scritto, il movimento di prima non si conta', riscritto.j);
  const Y = await mk(A, { nome: 'Spesa Y', importo: '30', conto_id: cA.id });
  await spuntaA(Y.id);
  verifica(await saldoDi(cA.id) === '850.00', 'un movimento dopo il saldo scritto si conta');
  await togliA(X.id);
  verifica(await saldoDi(cA.id) === '850.00', 'togliere una spunta fatta prima del saldo scritto non lo cambia');
  await scrivi(cA.id, '500', A, { momento: new Date(Date.now() - 3600e3).toISOString() });
  verifica(await saldoDi(cA.id) === '470.00', 'saldo scritto con un momento nel passato: contano i movimenti fatti dopo quel momento');
  await scrivi(cA.id, '500');
  verifica(await saldoDi(cA.id) === '500.00', 'riscrivere il saldo adesso: riallineato alla banca');
  const agg = (await r('GET', '/conti', A)).j.find((x) => x.id === cA.id);
  verifica(agg.saldo_partenza === '500.00' && agg.saldo_aggiornato_il >= agg.saldo_partenza_il, 'saldo_partenza e aggiornato_il', agg);
  await togliA(Y.id);

  // C. I tre casi: conto solo tuo + spesa condivisa (la tua quota); conto condiviso (intero)
  const split = await mk(A, { nome: 'Divisa 60', importo: '200', conto_id: cA.id });
  await condividi(split.id, 60);
  await spuntaA(split.id);
  verifica(await saldoDi(cA.id) === '380.00', 'C: conto solo tuo, spesa condivisa 60/40: esce solo la tua quota (120)', await saldoDi(cA.id));
  await togliA(split.id);
  const cS = contoDaCondividere;
  await scrivi(cS.id, '1000');
  const sola = await mk(A, { nome: 'Sola 80', importo: '80', conto_id: cS.id });
  const divisa = await mk(A, { nome: 'Divisa su conto in due', importo: '200', conto_id: cS.id });
  await condividi(divisa.id, 50);
  await spuntaA(sola.id); await spuntaA(divisa.id);
  verifica(await saldoDi(cS.id) === '720.00' && await saldoDi(cS.id, Bt) === '720.00', 'C: conto condiviso: esce l\'importo intero (80 + 200), stesso saldo per entrambi', [await saldoDi(cS.id), await saldoDi(cS.id, Bt)]);
  verifica((await movs(cS.id, Bt)).length === 2 && (await movs(cS.id, Bt))[0].utente === 'Anna', 'B vede i movimenti del conto condiviso');
  verifica((await r('DELETE', `/spese-previste/${divisa.id}/spunta?mese=${meseB}`, Bt)).s === 204, 'B toglie la spunta di A');
  verifica(await saldoDi(cS.id) === '920.00' && await saldoDi(cS.id, Bt) === '920.00', 'togliendo la spunta il movimento sparisce anche se a spuntare era stata l\'altra persona');
  verifica((await r('GET', `/conti/${cA.id}/movimenti`, Bt)).s === 404, 'i movimenti di un conto non visibile: 404');
  // Conto solo di A, spesa condivisa con B: B non vede il conto, ma la sua spunta muove comunque il conto di A con la sua quota (decisione 48 B)
  const perB = await mk(A, { nome: 'Per B', importo: '100', conto_id: cA.id });
  await condividi(perB.id, 50);
  const sB = await r('POST', `/spese-previste/${perB.id}/spunta`, Bt, { mese: meseB });
  verifica(sB.s === 201 && await saldoDi(cA.id) === '450.00', '48 B: B spunta una spesa su un conto che non vede: il conto di A scende della quota di B (50)', [sB.j, await saldoDi(cA.id)]);
  verifica((await movs(cA.id))[0].utente === 'Bruno' && (await movs(cA.id))[0].importo === '-50.00', '48 B: il movimento è di Bruno', (await movs(cA.id))[0]);
  verifica((await r('GET', '/movimenti', Bt)).j.movimenti.every((x) => x.da_conto_id !== cA.id && x.a_conto_id !== cA.id), '48 B: B non vede il movimento sul conto di A');
  verifica((await r('DELETE', `/spese-previste/${perB.id}/spunta?mese=${meseB}`, Bt)).s === 204 && await saldoDi(cA.id) === '500.00', '48 B: B toglie la spunta e il movimento sul conto di A sparisce');

  // Rate: stessa regola
  const rata = (await r('POST', '/rate', A, { oggetto: 'Rata prova', importo_rata: '50', numero_rate: 6, prima_scadenza: `${meseA}-15`, conto_id: cA.id })).j;
  const sr = await r('POST', `/rate/${rata.id}/spunta`, A, { mese: meseA });
  mv = await movs(cA.id);
  verifica(sr.s === 201 && await saldoDi(cA.id) === '450.00' && mv[0].causa === 'rata' && mv[0].descrizione === 'Rata prova', 'rata con conto: movimento negativo', [sr.j, mv[0]]);
  verifica((await r('DELETE', `/rate/${rata.id}/spunta?mese=${meseA}`, A)).s === 204 && await saldoDi(cA.id) === '500.00', 'rata: togliendo la spunta i soldi tornano');

  // D. Il passato non si cambia
  const passato = sposta(meseA, -1), futuro = sposta(meseA, 1);
  verifica((await spuntaA(X.id, passato)).s === 409, 'D: spunta in un mese passato: 409');
  verifica((await togliA(X.id, passato)).s === 409, 'D: togliere una spunta di un mese passato: 409');
  verifica((await r('POST', `/rate/${rata.id}/spunta`, A, { mese: passato })).s === 409 && (await r('DELETE', `/rate/${rata.id}/spunta?mese=${passato}`, A)).s === 409, 'D: rate nei mesi passati: 409');
  verifica((await spuntaA(X.id, futuro)).s === 201 && (await togliA(X.id, futuro)).s === 204, 'D: un mese futuro si può ancora spuntare e togliere');
  verifica(await saldoDi(cA.id) === '500.00', 'D: nessun cambiamento di saldo dai 409 e dal mese futuro rimesso a posto');

  // E. Budget: una lente sui movimenti della categoria, senza promemoria né conti (decisione 57); un budget non è una spesa
  const catE = (await r('POST', '/categorie', A, { nome: 'Categoria budget E' })).j;
  const bud = (await r('POST', '/budget', A, { categoria_id: catE.id, importo: '300' })).j;
  verifica(!('conto_id' in bud) && bud.categoria_id === catE.id && bud.nome === 'Categoria budget E', 'E: un budget ha la categoria, nessun conto', bud);
  verifica((await r('POST', `/budget/${bud.id}/spunta`, A, { mese: meseA })).s === 404 && await saldoDi(cA.id) === '500.00', 'E: la spunta del budget non esiste e il saldo non si muove');
  verifica((await r('POST', '/budget', A, { categoria_id: (await r('POST', '/categorie', A, { nome: 'Categoria budget E2' })).j.id, importo: '10', promemoria: true })).s === 201, 'E: il campo promemoria è ignorato in creazione');
  verifica((await r('PATCH', `/spese-previste/${(await mk(A, { nome: 'Fissa E', conto_id: cA.id })).id}`, A, { tipo: 'budget' })).s === 400, 'E: una spesa non diventa un budget (400)');

  // F. Annuali (decisione 50): promemoria come le altre spese, solo nel mese in cui escono, per intero; nessun salvadanaio
  const an = await mk(A, { nome: 'Assicurazione prova', importo: '100', ogni_mesi: 12, prossima_scadenza: `${meseA}-15`, conto_id: cA.id, nuovo_salvadanaio: {} });
  verifica(an.nel_mese && !('obiettivo_id' in an) && !('quota_mensile' in an), 'F: annuale in questo mese, senza salvadanaio né quota mensile', an);
  verifica(!(await r('GET', '/obiettivi', A)).j.some((o) => o.nome === 'Assicurazione prova'), 'F: nuovo_salvadanaio è ignorato: nessun salvadanaio');
  const sAn = await spuntaA(an.id);
  mv = await movs(cA.id);
  verifica(sAn.s === 201 && await saldoDi(cA.id) === '400.00' && mv[0].importo === '-100.00' && mv[0].causa === 'spesa' && mv[0].descrizione === 'Assicurazione prova',
    'F: la spunta di un\'annuale muove il conto per l\'importo intero, come una spesa mensile', [sAn.j, mv[0]]);
  verifica((await togliA(an.id)).s === 204 && await saldoDi(cA.id) === '500.00' && (await movs(cA.id)).length === mv.length - 1, 'F: togliendo la spunta il movimento sparisce');
  await spuntaA(an.id);
  verifica((await r('DELETE', `/spese-previste/${an.id}`, A)).s === 204 && await saldoDi(cA.id) === '400.00', 'F: eliminare la spesa non fa sparire il movimento già registrato');
  const fuori = await mk(A, { nome: 'Annuale fuori mese', importo: '120', ogni_mesi: 12, prossima_scadenza: `${sposta(meseA, 4)}-20`, conto_id: cA.id });
  verifica(!fuori.nel_mese && (await spuntaA(fuori.id)).s === 400 && await saldoDi(cA.id) === '400.00', 'F: un\'annuale fuori dal suo mese non si spunta (400) e non muove il conto');
  const senzaConto = await mk(A, { nome: 'Bollo prova', importo: '240', ogni_mesi: 12, prossima_scadenza: `${meseA}-20` });
  verifica((await spuntaA(senzaConto.id)).s === 201 && await saldoDi(cA.id) === '400.00', 'F: senza conto la spunta è solo un segno');
  await togliA(senzaConto.id);
  const senzaSalv = await mk(A, { nome: 'Tari prova', importo: '120', ogni_mesi: 12, prossima_scadenza: `${meseA}-20`, conto_id: cA.id });
  await spuntaA(senzaSalv.id);
  verifica(await saldoDi(cA.id) === '280.00', 'annuale con conto: esce l\'importo intero nel suo mese (120)');
  await togliA(senzaSalv.id);
  const anDiv = await mk(A, { nome: 'Annuale divisa', importo: '200', ogni_mesi: 12, prossima_scadenza: `${meseA}-20`, conto_id: cA.id });
  await condividi(anDiv.id, 50);
  await spuntaA(anDiv.id);
  verifica(await saldoDi(cA.id) === '300.00', 'annuale divisa su conto solo tuo: esce la tua quota (100)', await saldoDi(cA.id));
  await togliA(anDiv.id);
  // Il promemoria di un salvadanaio (decisione 51): la spunta versa la quota del mese «Dal conto» (conto -> Niente, il saldo scende),
  // togliendo la spunta il versamento e il movimento spariscono. Fuori dai totali delle spese: lo dice l'app, qui la quota è mia_quota.
  const fondoP = (await r('POST', '/obiettivi', A, { nome: 'Fondo promemoria' })).j;
  const prom = (await r('PUT', `/obiettivi/${fondoP.id}/promemoria`, A, { importo: '100', conto_id: cA.id })).j;
  const antes = Number(await saldoDi(cA.id));
  verifica(prom.conto_id === cA.id && prom.mia_quota === '100.00' && prom.alimenta_obiettivo_id === fondoP.id, 'promemoria del salvadanaio: voce con il conto scelto e la cifra fissa', prom);
  verifica((await spuntaA(prom.id)).s === 201 && Number(await saldoDi(cA.id)) === antes - 100 && Number((await goal(fondoP.id)).saldo) === 100, 'la spunta di un promemoria versa la quota «Dal conto»: saldo del salvadanaio +100, conto -100');
  mv = await movs(cA.id);
  verifica(mv[0].importo === '-100.00' && mv[0].causa === 'versamento' && mv[0].descrizione === 'Versato in Fondo promemoria' && mv[0].a_niente === true, 'il movimento va dal conto a Niente', mv[0]);
  const spesaProm = (await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === prom.id);
  verifica(spesaProm.uscita === true && spesaProm.mia_quota === '100.00', 'spuntato: la voce resta a 100 (quanto versato)', spesaProm);
  verifica((await togliA(prom.id)).s === 204 && Number(await saldoDi(cA.id)) === antes && Number((await goal(fondoP.id)).saldo) === 0, 'togliendo la spunta il versamento e il movimento si annullano');
  verifica((await spuntaA(prom.id, passato)).s === 409 && (await togliA(prom.id, passato)).s === 409, 'promemoria del salvadanaio: il passato non si cambia (409)');
  // Senza conto: «soldi nuovi», il conto non si muove
  const promSenza = (await r('PUT', `/obiettivi/${fondoP.id}/promemoria`, A, { conto_id: null })).j;
  await spuntaA(promSenza.id);
  verifica(promSenza.conto_id === null && Number(await saldoDi(cA.id)) === antes && Number((await goal(fondoP.id)).saldo) === 100, 'promemoria senza conto: il versamento c\'è, il conto non si muove');
  await togliA(promSenza.id);
  // Con scadenza e traguardo la quota è (traguardo - già messo) / mesi personali rimasti, minimo 0
  const meseSc = sposta(meseA, 3);
  const fondoQ = (await r('POST', '/obiettivi', A, { nome: 'Fondo quota', traguardo: '1200', scadenza: `${meseSc}-20` })).j;
  const promQ = (await r('PUT', `/obiettivi/${fondoQ.id}/promemoria`, A, { conto_id: cA.id })).j;
  verifica(promQ.mia_quota === '300.00' && promQ.importo === '300.00', 'promemoria con scadenza fra 4 mesi personali e traguardo 1200: 300 al mese', promQ);
  await r('POST', `/obiettivi/${fondoQ.id}/versamenti`, A, { importo: '300' });
  verifica((await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === promQ.id).mia_quota === '225.00', 'versati 300: (1200 - 300) / 4 mesi = 225');
  await r('POST', `/obiettivi/${fondoQ.id}/versamenti`, A, { importo: '5000' });
  const quotaZero = (await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.find((x) => x.id === promQ.id);
  verifica(quotaZero.mia_quota === '0.00', 'oltre il traguardo la quota è 0 (minimo 0)', quotaZero);
  verifica((await r('GET', `/obiettivi/${fondoQ.id}`, A)).j.alimentato_da.importo === '0.00', 'il salvadanaio mostra la quota del mese');
  await r('DELETE', `/obiettivi/${fondoQ.id}/promemoria`, A);
  verifica(!(await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese.some((x) => x.id === promQ.id), 'spento il promemoria la voce sparisce');
  await r('DELETE', `/obiettivi/${fondoP.id}/promemoria`, A);

  // G. Salvadanai: la provenienza dei soldi
  const cG = (await r('POST', '/conti', A, { nome: 'Conto salvadanai' })).j;
  await scrivi(cG.id, '1000');
  // Fondo G NON sta su un conto: «Dal conto» è conto -> Niente (il salvadanaio sul conto è provato più sotto, decisione 52).
  const fondoG = (await r('POST', '/obiettivi', A, { nome: 'Fondo G' })).j;
  const versa = (id, corpo) => r('POST', `/obiettivi/${id}/versamenti`, A, corpo);
  verifica((await versa(fondoG.id, { importo: '200', conto_id: cG.id })).s === 201 && Number((await goal(fondoG.id)).saldo) === 200 && await saldoDi(cG.id) === '800.00', 'G principale «Dal conto»: versamento e movimento negativo insieme');
  mv = await movs(cG.id);
  verifica(mv[0].importo === '-200.00' && mv[0].causa === 'versamento' && mv[0].descrizione === 'Versato in Fondo G', 'G: il movimento si legge «Versato in Fondo G»', mv[0]);
  await versa(fondoG.id, { importo: '50' });
  verifica(Number((await goal(fondoG.id)).saldo) === 250 && await saldoDi(cG.id) === '800.00', 'G principale «Soldi nuovi»: il conto non si muove');
  await versa(fondoG.id, { importo: '-30', conto_id: cG.id });
  verifica(Number((await goal(fondoG.id)).saldo) === 220 && await saldoDi(cG.id) === '830.00' && (await movs(cG.id))[0].descrizione === 'Tornato da Fondo G', 'G: togliendo «Torna sul conto»: movimento positivo');
  await versa(fondoG.id, { importo: '-20' });
  verifica(Number((await goal(fondoG.id)).saldo) === 200 && await saldoDi(cG.id) === '830.00', 'G: togliendo «Esce»: il conto non si muove');
  const idDa200 = (await r('GET', `/obiettivi/${fondoG.id}`, A)).j.versamenti.find((x) => x.importo === '200.00').id;
  verifica((await r('DELETE', `/obiettivi/versamenti/${idDa200}`, A)).s === 204 && await saldoDi(cG.id) === '1030.00' && (await movs(cG.id)).every((x) => x.importo !== '-200.00'), 'G: annullare il versamento annulla anche il movimento collegato');
  verifica((await versa(fondoG.id, { importo: '10', conto_id: cG.id, da_liberi: true })).s === 400, 'G: conto e liberi insieme: 400');
  const cB = (await r('POST', '/conti', Bt, { nome: 'Conto di B' })).j;
  verifica((await versa(fondoG.id, { importo: '10', conto_id: cB.id })).s === 404, 'G: un conto che non si vede: 404');
  verifica((await versa(fondoG.id, { importo: '10', conto_id: cG.id, data: '2020-01-01' })).s === 409, 'D: versamento dal conto in un mese passato: 409');
  // Sotto-salvadanaio: tre provenienze
  const sotto = (await r('POST', '/obiettivi', A, { nome: 'Sotto G', padre_id: fondoG.id, traguardo: '1000' })).j;
  const base0 = Number(await saldoDi(cG.id));
  await versa(sotto.id, { importo: '100', conto_id: cG.id });
  verifica(Number(await saldoDi(cG.id)) === base0 - 100 && Number((await goal(sotto.id)).saldo) === 100, 'G sotto «Dal conto»: movimento negativo');
  await versa(fondoG.id, { importo: '300', conto_id: cG.id });
  const prima = Number(await saldoDi(cG.id));
  const dl = await versa(sotto.id, { importo: '40', da_liberi: true });
  verifica(dl.s === 201 && Number(await saldoDi(cG.id)) === prima && Number((await goal(sotto.id)).saldo) === 140, 'G sotto «Dai liberi»: il conto non si muove');
  await versa(sotto.id, { importo: '10' });
  verifica(Number(await saldoDi(cG.id)) === prima && Number((await goal(sotto.id)).saldo) === 150, 'G sotto «Soldi nuovi»: il conto non si muove');
  await versa(sotto.id, { importo: '-25', conto_id: cG.id });
  verifica(Number(await saldoDi(cG.id)) === prima + 25, 'G sotto «Torna sul conto»');
  // Saldo sotto zero: permesso (è la realtà della banca)
  const grosso = await versa(fondoG.id, { importo: '5000', conto_id: cG.id });
  verifica(grosso.s === 201 && Number(await saldoDi(cG.id)) < 0, 'G: il saldo può andare sotto zero', await saldoDi(cG.id));
  // Un versamento diviso tra i sotto-salvadanai: un movimento per ogni parte, la somma è l'importo
  await scrivi(cG.id, '2000');
  const padreD = (await r('POST', '/obiettivi', A, { nome: 'Fondo D' })).j;
  const d1 = (await r('POST', '/obiettivi', A, { nome: 'D1', padre_id: padreD.id, traguardo: '100' })).j;
  const d2 = (await r('POST', '/obiettivi', A, { nome: 'D2', padre_id: padreD.id, traguardo: '100' })).j;
  await versa(padreD.id, { importo: '150', conto_id: cG.id, dividi: true });
  const dettD = (await r('GET', `/obiettivi/${padreD.id}`, A)).j;
  const movD = (await movs(cG.id)).filter((x) => /^Versato in (D1|D2|Fondo D)$/.test(x.descrizione));
  verifica(await saldoDi(cG.id) === '1850.00' && movD.length >= 2 && movD.reduce((t, x) => t + Number(x.importo), 0) === -150 && Number(dettD.saldo) === 150, 'G con dividi: un movimento per parte, la somma è l\'importo', [movD, dettD.saldo]);
  const parteD1 = (await r('GET', `/obiettivi/${d1.id}`, A)).j.versamenti[0];
  await r('DELETE', `/obiettivi/versamenti/${parteD1.id}`, A);
  verifica(Number(await saldoDi(cG.id)) === 1850 + Number(parteD1.importo), 'G con dividi: annullando una parte torna solo il suo movimento');
  // Anche «Riempi» e «Metti 1/12» sono versamenti normali: usano la provenienza scelta (qui: dal conto)
  const fondoR = (await r('POST', '/obiettivi', A, { nome: 'Fondo R', traguardo: '1200' })).j;
  const prePrima = Number(await saldoDi(cG.id));
  await versa(fondoR.id, { importo: '100', conto_id: cG.id });
  verifica(Number(await saldoDi(cG.id)) === prePrima - 100, '«Metti 1/12» dal conto');
  await versa(fondoR.id, { importo: '1100', conto_id: cG.id });
  verifica(Number(await saldoDi(cG.id)) === prePrima - 1200 && Number((await goal(fondoR.id)).saldo) === 1200, '«Riempi» dal conto');
  // Eliminare il salvadanaio: i versamenti spariscono e con loro i movimenti collegati (i soldi tornano sul conto)
  const prePre = Number(await saldoDi(cG.id));
  verifica((await r('DELETE', `/obiettivi/${fondoR.id}`, A)).s === 204 && Number(await saldoDi(cG.id)) === prePre + 1200, 'eliminare un salvadanaio: i movimenti collegati spariscono');
  // Conto condiviso: B scrive/legge lo stesso saldo anche dopo i movimenti dei salvadanai
  verifica(await saldoDi(cS.id) === await saldoDi(cS.id, Bt), 'conto condiviso: stesso saldo per entrambi');
}

// ---- Budget, movimenti, voci condivise su conti che non si vedono, passato bloccato (decisione 48) ----
{
  const sposta = (m, k) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + mm - 1 + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese, meseB = (await r('GET', '/spese-previste', Bt)).j.periodo.mese;
  const saldoDi = async (id, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === id)?.saldo;
  const movs = async (id, T = A) => (await r('GET', `/conti/${id}/movimenti?limite=100`, T)).j;
  const tutti = async (query = '', T = A) => (await r('GET', `/movimenti${query}`, T)).j;
  const mk = async (T, corpo) => (await r('POST', '/spese-previste', T, { importo: '10', ...corpo })).j;
  const spunta = (id, mese = meseA, T = A) => r('POST', `/spese-previste/${id}/spunta`, T, { mese });
  const togli = (id, mese = meseA, T = A) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, T);
  const scrivi = (id, importo, T = A, extra = {}) => r('PUT', `/conti/${id}/saldo`, T, { importo, ...extra });
  const conto = async (nome, saldo, T = A) => { const c = (await r('POST', '/conti', T, { nome })).j; if (saldo) await scrivi(c.id, saldo, T); return c; };
  const piatti = (xs) => xs.flatMap((o) => [o, ...piatti(o.figli)]);
  const goal = async (id) => piatti((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const condividi = async (spesaId, pctA) => {
    await r('POST', '/condivisioni', A, { voce: 'spesa', id: spesaId, utente_id: b.utente_id });
    await r('PUT', `/spese-previste/${spesaId}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: String(pctA) }, { utente_id: b.utente_id, percentuale: String(100 - pctA) }] });
  };
  const versa = (id, corpo, T = A) => r('POST', `/obiettivi/${id}/versamenti`, T, corpo);
  const uscita = (id, corpo, T = A) => r('POST', `/budget/${id}/uscite`, T, corpo);
  const budgetDi = async (id, mese = meseA, T = A) => (await r('GET', `/budget?mese=${mese}`, T)).j.budget.find((x) => x.id === id);
  // Con DATABASE_ADMIN_URL le prove portano indietro nel tempo alcune righe (non c'è altro modo di avere un mese passato).
  const admin = process.env.DATABASE_ADMIN_URL ? new (await import('pg')).default.Client({ connectionString: process.env.DATABASE_ADMIN_URL }) : null;
  if (admin) await admin.connect();
  const passato = sposta(meseA, -1), futuro = sposta(meseA, 1);

  // --- B. Una voce condivisa su un conto / salvadanaio che spunta chi non li vede ---
  const cX = await conto('Privato di A', '1000');
  const anB = await mk(A, { nome: 'Annuale condivisa', importo: '100', ogni_mesi: 12, prossima_scadenza: `${meseB}-15`, conto_id: cX.id });
  await condividi(anB.id, 50);
  const sAnB = await spunta(anB.id, meseB, Bt);
  verifica(sAnB.s === 201 && await saldoDi(cX.id) === '950.00', '48 B: la quota di B di un\'annuale esce dal conto di A (50 su 100)', [sAnB.j, await saldoDi(cX.id)]);
  verifica((await movs(cX.id))[0].descrizione === 'Annuale condivisa' && (await movs(cX.id))[0].causa === 'spesa', '48 B: movimento di causa spesa con la descrizione della spesa', (await movs(cX.id))[0]);
  verifica((await togli(anB.id, meseB, Bt)).s === 204 && await saldoDi(cX.id) === '1000.00', '48 B: B toglie la spunta: torna il conto di A');
  // Un intruso (spesa non condivisa) non muove niente di altri
  const privata = await mk(A, { nome: 'Privata di A', importo: '30', conto_id: cX.id });
  verifica((await spunta(privata.id, meseB, Bt)).s === 404 && await saldoDi(cX.id) === '1000.00', '48 B: una spesa non condivisa non si spunta e non muove il conto');

  // --- Budget senza promemoria (decisione 57): una lente sui movimenti della categoria; per spostare soldi si fa un giroconto a mano ---
  const nuovaCat = async (nome, T = A) => (await r('POST', '/categorie', T, { nome })).j;
  const mkB = async (T, corpo) => (await r('POST', '/budget', T, { importo: '10', ...corpo })).j;
  const cP = await conto('Budget da', '1000'), cQ = await conto('Budget a', '200');
  const catS = await nuovaCat('Budget casa');
  const bs = await mkB(A, { categoria_id: catS.id, importo: '300' });
  verifica(bs.attivo === true && bs.speso === '0.00' && bs.sforo === '0.00' && !('modo' in bs) && !('promemoria' in bs) && !('conto_id' in bs) && !('conto_partenza_id' in bs) && !('partenza_id' in bs) && !('arrivo_id' in bs) && !('uscito' in bs), 'budget nuovo: solo la cifra e la categoria (nessun promemoria, nessun conto)', bs);
  verifica((await r('POST', `/budget/${bs.id}/spunta`, A, { mese: meseA })).s === 404 && (await r('DELETE', `/budget/${bs.id}/spunta?mese=${meseA}`, A)).s === 404, 'il budget non si spunta (404)');
  const patchVecchio = await r('PATCH', `/budget/${bs.id}`, A, { promemoria: true, conto_partenza_id: cP.id, conto_id: cQ.id, importo: '300' });
  verifica(patchVecchio.s === 200 && !('promemoria' in patchVecchio.j) && await saldoDi(cP.id) === '1000.00' && await saldoDi(cQ.id) === '200.00', 'i campi del vecchio promemoria sono ignorati e nulla si muove', patchVecchio.j);
  verifica((await r('PATCH', `/budget/${bs.id}`, A, { modo: 'conto' })).s === 400, 'il campo modo non esiste più: nessun campo da modificare (400)');
  const cBx = await conto('Conto di B', null, Bt);
  // Il giroconto «da budget» è un movimento a mano come gli altri (Movimenti → Nuovo movimento → Giroconto): UNA riga da un conto a un altro, non è speso
  const sg = await r('POST', '/movimenti', A, { tipo: 'giroconto', importo: '300', da_conto_id: cP.id, a_conto_id: cQ.id, descrizione: 'Budget casa' });
  verifica(sg.s === 201 && await saldoDi(cP.id) === '700.00' && await saldoDi(cQ.id) === '500.00', 'giroconto a mano: -300 sulla partenza, +300 sull\'arrivo', [await saldoDi(cP.id), await saldoDi(cQ.id)]);
  const gm = (await tutti()).movimenti.filter((x) => x.id === sg.j.id);
  verifica(gm.length === 1 && gm[0].causa === 'a_mano' && gm[0].importo === '300.00' && gm[0].da === 'Budget da' && gm[0].a === 'Budget a' && !gm[0].da_niente && !gm[0].a_niente && gm[0].segno === 0 && gm[0].modificabile, 'il giroconto è UNA riga a mano da un conto a un altro, neutra con tutti i conti e modificabile', gm);
  verifica((await tutti(`?conto=${cP.id}`)).movimenti.find((x) => x.id === sg.j.id)?.segno === -1 && (await tutti(`?conto=${cQ.id}`)).movimenti.find((x) => x.id === sg.j.id)?.segno === 1, '/movimenti con il filtro per conto: il giroconto esce dalla partenza (-1) ed entra nell\'arrivo (+1)');
  verifica(Number(await saldoDi(cP.id)) + Number(await saldoDi(cQ.id)) === 1200, 'con tutti i conti il giroconto è neutro (la somma dei saldi non cambia)');
  verifica((await budgetDi(bs.id)).speso === '0.00', 'il giroconto non è speso: il budget resta a 0');
  verifica((await r('PATCH', `/movimenti/${sg.j.id}`, A, { importo: '250' })).s === 200 && await saldoDi(cP.id) === '750.00' && await saldoDi(cQ.id) === '450.00', 'il giroconto si cambia da Movimenti');
  verifica((await r('DELETE', `/movimenti/${sg.j.id}`, A)).s === 204 && await saldoDi(cP.id) === '1000.00' && await saldoDi(cQ.id) === '200.00', 'e si elimina da Movimenti: i saldi tornano');
  verifica((await r('POST', '/movimenti', A, { tipo: 'giroconto', importo: '10', da_conto_id: cP.id, a_conto_id: cP.id })).s === 400, 'giroconto con due conti uguali: 400');
  verifica((await r('POST', '/movimenti', A, { tipo: 'giroconto', importo: '10', da_conto_id: cP.id, a_conto_id: cBx.id })).s === 404, 'giroconto verso un conto che non vedi: 404');

  // Budget condiviso: B vede il budget con la sua quota, ma non c'è nulla da spuntare
  const catSh = await nuovaCat('Budget condiviso');
  const bsh = await mkB(A, { categoria_id: catSh.id, importo: '100' });
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bsh.id, utente_id: b.utente_id });
  await r('PUT', `/budget/${bsh.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const bshB = await budgetDi(bsh.id, meseB, Bt);
  verifica(bshB && bshB.mia === false && bshB.creato_da === 'Anna' && bshB.mia_quota === '50.00' && bshB.condiviso, 'B vede il budget condiviso con la sua quota', bshB);
  verifica((await r('POST', `/budget/${bsh.id}/spunta`, Bt, { mese: meseB })).s === 404 && await saldoDi(cP.id) === '1000.00', 'B non può spuntare il budget condiviso (404): nessun saldo si muove');
  verifica((await r('DELETE', `/budget/${bsh.id}`, Bt)).s === 403, 'solo chi ha creato il budget lo elimina (403)');

  // --- Lo speso è per categoria, da qualunque conto, e non è un limite: si conta tutto anche oltre la cifra ---
  const catC = await nuovaCat('Spesa cibo');
  const bc = await mkB(A, { categoria_id: catC.id, importo: '300' });
  verifica(bc.speso === '0.00' && bc.sforo === '0.00' && JSON.stringify(bc.speso_per_conto) === '{}', 'budget: speso 0', bc);
  const u1 = await uscita(bc.id, { importo: '40', descrizione: 'Supermercato', conto_id: cP.id });
  verifica(u1.s === 201 && u1.j.speso === '40.00' && await saldoDi(cP.id) === '960.00', 'uscita su un conto: il conto scende e il budget si riempie', u1.j);
  const u2 = await uscita(bc.id, { importo: '10.50', descrizione: 'Mercato' });
  verifica(u2.s === 201 && u2.j.speso === '50.50' && await saldoDi(cP.id) === '960.00', 'uscita senza conto: riempie il budget, nessun conto si muove', u2.j);
  const u3 = await uscita(bc.id, { importo: '9.50', descrizione: 'Altro conto', conto_id: cQ.id });
  verifica(u3.j.speso === '60.00' && u3.j.speso_per_conto[cP.id] === '40.00' && u3.j.speso_per_conto[cQ.id] === '9.50', 'le uscite da conti diversi contano tutte nello stesso budget', u3.j);
  // Una spesa prevista spuntata con la stessa categoria conta nello speso, da qualunque conto (e il conto del budget non c'entra)
  const sCat = await mk(A, { nome: 'Spesa con categoria del budget', importo: '25', conto_id: cQ.id, categoria_id: catC.id });
  await spunta(sCat.id);
  const conSpesa = await budgetDi(bc.id);
  verifica(conSpesa.speso === '85.00' && conSpesa.speso_da_spese === '25.00' && conSpesa.speso_per_conto[cQ.id] === '34.50' && conSpesa.spese_contate.length === 1, 'una spesa spuntata con la categoria del budget conta nello speso', conSpesa);
  await togli(sCat.id);
  verifica((await budgetDi(bc.id)).speso === '60.00', 'togliendo la spunta lo speso torna');
  await r('DELETE', `/spese-previste/${sCat.id}`, A);
  await r('DELETE', `/budget/uscite/${u3.j.uscite.find((x) => x.descrizione === 'Altro conto').id}`, A);
  const sp = (await r('GET', `/spese-previste?mese=${meseA}`, A)).j.spese;
  verifica(!sp.some((x) => x.id === bc.id || x.tipo === 'budget'), 'i budget non sono più nelle spese');
  const bd = await budgetDi(bc.id);
  verifica(bd.uscite.length === 2 && bd.uscite[0].descrizione === 'Mercato' && bd.uscite[0].importo === '10.50' && bd.uscite[0].utente === 'Anna' && bd.uscite[0].modificabile && bd.uscite[1].conto === 'Budget da', '/budget: le uscite del mese, dalla più recente', bd.uscite);
  const mAll = await tutti();
  verifica(mAll.movimenti.some((x) => x.causa === 'budget' && x.importo === '40.00' && x.da === 'Budget da' && x.a_niente && x.segno === -1) && mAll.movimenti.some((x) => x.causa === 'budget' && x.da_senza_conto && !x.da_niente && x.a_niente && x.importo === '10.50'), '/movimenti: le uscite di budget vanno da un conto (o da nessun conto) a Niente');
  verifica((await tutti(`?conto=${cP.id}`)).movimenti.every((x) => x.da_conto_id === cP.id || x.a_conto_id === cP.id) && (await tutti('?conto=senza')).movimenti.every((x) => x.da_senza_conto), '/movimenti: filtro per conto (sorgente o destinazione) e «senza»');
  verifica((await tutti(`?mese=${meseA}`)).movimenti.length > 0 && (await tutti(`?mese=${sposta(meseA, -6)}`)).movimenti.length === 0 && mAll.mesi.includes(meseA), '/movimenti: filtro per mese personale', mAll.mesi);
  verifica((await uscita(bc.id, { importo: '0' })).s === 400 && (await uscita(bc.id, { importo: '-5' })).s === 400 && (await uscita(bc.id, {})).s === 400, 'uscita: importo obbligatorio e positivo');
  verifica((await uscita(bc.id, { importo: '5', conto_id: cBx.id })).s === 404, 'uscita da un conto che non vedi: 404');
  verifica((await uscita(bc.id, { importo: '5' }, Bt)).s === 404, 'uscita su un budget che non vedi: 404');
  const uPromemoria = await uscita(bs.id, { importo: '5', descrizione: 'Su un altro budget' });
  verifica(uPromemoria.s === 201 && uPromemoria.j.speso === '5.00', 'le uscite si registrano per qualunque budget', uPromemoria.j);
  await r('DELETE', `/budget/uscite/${uPromemoria.j.uscite[0].id}`, A);
  verifica((await uscita(bc.id, { importo: '5', data: `${passato}-15` })).s === 409, 'uscita in un mese passato: 409');
  const uF = await uscita(bc.id, { importo: '7', descrizione: 'Più avanti', data: `${futuro}-20` });
  verifica(uF.s === 201 && uF.j.speso === '7.00' && (await budgetDi(bc.id)).speso === '50.50' && (await budgetDi(bc.id, futuro)).speso === '7.00', 'uscita in un mese futuro: conta nel suo mese, non in questo', uF.j);
  const idF = (await budgetDi(bc.id, futuro)).uscite[0].id;
  verifica((await r('DELETE', `/budget/uscite/${idF}`, A)).s === 204 && (await budgetDi(bc.id, futuro)).speso === '0.00', 'si toglie un\'uscita del mese futuro');
  verifica((await r('DELETE', `/budget/uscite/${bd.uscite[1].id}`, A)).s === 204 && await saldoDi(cP.id) === '1000.00' && (await budgetDi(bc.id)).speso === '10.50', 'togliere un\'uscita: il conto torna e il budget si svuota');
  // Sforo: non è un limite, si conta tutto e si dice di quanto si è sforato
  const catF = await nuovaCat('Budget sforato');
  const bf = await mkB(A, { categoria_id: catF.id, importo: '100' });
  await uscita(bf.id, { importo: '80', descrizione: 'Prima' });
  const sf = await uscita(bf.id, { importo: '50', descrizione: 'Oltre la cifra' });
  verifica(sf.s === 201 && sf.j.speso === '130.00' && sf.j.sforo === '30.00' && (await budgetDi(bf.id)).uscite.length === 2, 'oltre la cifra si conta tutto e lo sforo è la differenza (130 su 100: 30)', sf.j);
  verifica((await budgetDi(bc.id)).sforo === '0.00', 'sotto la cifra lo sforo è 0');
  await r('DELETE', `/budget/${bf.id}`, A);
  await r('DELETE', `/categorie/${catF.id}`, A);
  // Condiviso: ognuno registra le sue uscite, il totale è uno
  await r('POST', '/condivisioni', A, { voce: 'budget', id: bc.id, utente_id: b.utente_id });
  await r('PUT', `/budget/${bc.id}/quote`, A, { quote: [{ utente_id: a.utente_id, percentuale: '50' }, { utente_id: b.utente_id, percentuale: '50' }] });
  const uB = await uscita(bc.id, { importo: '20', descrizione: 'B paga', conto_id: cBx.id }, Bt);
  verifica(uB.s === 201 && (await budgetDi(bc.id)).speso === '30.50' && (await budgetDi(bc.id, meseB, Bt)).speso === '30.50', 'budget condiviso: speso uno solo per entrambi', uB.j);
  const uteA = (await budgetDi(bc.id)).uscite.find((x) => x.descrizione === 'B paga');
  verifica(uteA && uteA.conto === null && uteA.utente === 'Bruno', 'A vede l\'uscita di B ma non il nome del conto di B', uteA);
  verifica((await tutti()).movimenti.every((x) => x.da_conto_id !== cBx.id && x.a_conto_id !== cBx.id), '/movimenti: A non vede i movimenti dei conti di B');
  verifica(await saldoDi(cBx.id, Bt) === null && (await movs(cBx.id, Bt)).some((x) => x.importo === '-20.00'), 'B: l\'uscita sta nei movimenti del suo conto');
  // Eliminare il budget non cancella le uscite: restano nel registro con la loro categoria
  const catD = await nuovaCat('Budget da eliminare');
  const bdel = await mkB(A, { categoria_id: catD.id, importo: '50' });
  await uscita(bdel.id, { importo: '12', descrizione: 'Resta nel registro' });
  verifica((await r('DELETE', `/budget/${bdel.id}`, A)).s === 204 && (await tutti()).movimenti.some((x) => x.descrizione === 'Resta nel registro' && x.budget_id === null), 'eliminando il budget le uscite restano nel registro');
  verifica((await r('DELETE', `/categorie/${catD.id}`, A)).s === 204, 'senza budget la categoria si elimina');

  // --- «Niente» (decisione 51): il conto nascosto che raccoglie le uscite e da cui arrivano le entrate ---
  const NIENTE = '00000000-0000-0000-0000-000000000001';
  verifica(![...(await r('GET', '/conti?archiviati=true', A)).j, ...(await r('GET', '/conti?archiviati=true', Bt)).j].some((x) => x.id === NIENTE || x.nome === 'Niente'), 'Niente non compare tra i conti');
  verifica((await r('GET', `/conti/${NIENTE}`, A)).s === 404 && (await r('GET', `/conti/${NIENTE}/movimenti`, A)).s === 404, 'Niente non si apre (404)');
  verifica((await r('PUT', `/conti/${NIENTE}/saldo`, A, { importo: '5' })).s === 404 && (await r('DELETE', `/conti/${NIENTE}`, A)).s === 404, 'Niente non si modifica né si elimina (404)');
  const fondoN = (await r('POST', '/obiettivi', A, { nome: 'Fondo Niente' })).j;
  verifica((await versa(fondoN.id, { importo: '5', conto_id: NIENTE })).s === 404, 'Niente non si sceglie come conto di un versamento (404)');
  verifica((await r('GET', '/conti', A)).j.every((x) => x.id !== NIENTE) && (await r('PATCH', `/conti/${NIENTE}`, A, { nome: 'Altro' })).s === 404, 'Niente non si rinomina (404)');
  // Entrata: un versamento che torna sul conto va da Niente al conto
  await versa(fondoN.id, { importo: '100', conto_id: cP.id });
  await versa(fondoN.id, { importo: '-30', conto_id: cP.id });
  const mN = (await tutti(`?conto=${cP.id}`)).movimenti;
  const tornato = mN.find((x) => x.descrizione === 'Tornato da Fondo Niente'), versato = mN.find((x) => x.descrizione === 'Versato in Fondo Niente');
  verifica(tornato && tornato.da_niente && !tornato.a_niente && tornato.a === 'Budget da' && tornato.segno === 1 && tornato.importo === '30.00', '/movimenti: un\'entrata va da Niente (Entrata) al conto, segno +1', tornato);
  verifica(versato && versato.a_niente && !versato.da_niente && versato.da === 'Budget da' && versato.segno === -1 && versato.importo === '100.00', '/movimenti: un\'uscita va dal conto a Niente (Uscita), segno -1', versato);
  verifica(JSON.stringify(await tutti()).indexOf(NIENTE) === -1, '/movimenti non mostra mai l\'id di Niente');
  verifica(await saldoDi(cP.id) === '930.00', 'saldo = partenza + entrate verso di lui - uscite da lui (1000 - 100 + 30)', await saldoDi(cP.id));
  await r('DELETE', `/obiettivi/${fondoN.id}`, A);
  verifica(await saldoDi(cP.id) === '1000.00', 'eliminato il salvadanaio i movimenti spariscono e il saldo torna');

  // --- Movimenti: «già nel saldo» ---
  const cZ = await conto('Conto Z', '500');
  const zz = await mk(A, { nome: 'Spesa Z', importo: '50', conto_id: cZ.id });
  await spunta(zz.id);
  await scrivi(cZ.id, '400');
  const mz = (await tutti(`?conto=${cZ.id}`)).movimenti;
  verifica(mz.length === 1 && mz[0].conta === false && mz[0].utente === 'Anna' && /^\d{4}-\d{2}-\d{2}T/.test(mz[0].momento), '/movimenti: dopo aver riscritto il saldo il movimento è «già nel saldo»', mz);
  await togli(zz.id);

  // --- 4c: il passato non si cambia per nessun versamento ---
  const fondo4 = (await r('POST', '/obiettivi', A, { nome: 'Fondo passato' })).j;
  verifica((await versa(fondo4.id, { importo: '10', data: `${passato}-20` })).s === 409, '4c: soldi nuovi in un mese passato: 409');
  verifica((await versa(fondo4.id, { importo: '-10', data: `${passato}-20` })).s === 409, '4c: prelievo in un mese passato: 409');
  verifica((await versa(fondo4.id, { importo: '10', conto_id: cP.id, data: `${passato}-20` })).s === 409, '4c: dal conto in un mese passato: 409');
  verifica((await versa(fondo4.id, { importo: '10', data: `${futuro}-05` })).s === 201, '4c: un mese futuro si può');
  if (admin) {
    const v10 = (await r('GET', `/obiettivi/${fondo4.id}`, A)).j.versamenti[0];
    await admin.query(`update versamenti set data = $2 where id = $1`, [v10.id, `${passato}-20`]);
    verifica((await r('DELETE', `/obiettivi/versamenti/${v10.id}`, A)).s === 409 && Number((await goal(fondo4.id)).saldo) === 10, '4c: annullare un versamento di un mese passato: 409');
    // Un'uscita di budget di un mese passato non si toglie
    const ux = (await budgetDi(bc.id)).uscite.find((x) => x.descrizione === 'Mercato');
    await admin.query(`update movimenti_conto set momento = $2 where id = $1`, [ux.id, `${passato}-20 12:00+00`]);
    verifica((await r('DELETE', `/budget/uscite/${ux.id}`, A)).s === 409, 'uscita di un mese passato: non si toglie (409)');
    verifica((await budgetDi(bc.id, passato)).uscite.some((x) => x.id === ux.id && x.modificabile === false), '/budget di un mese passato: le uscite non sono modificabili');
    await admin.end();
  }

  // --- Avanzo (decisione 57): un giroconto non lo muove mai; scende solo quando i soldi escono (calcoli puri dell'app + dati dell'API) ---
  const { correzioneGiroconti, usciteAMano } = await import('../../app/src/calcoliAvanzo.ts');
  const gir = { P: { usciti: '250.00', entrati: '0.00' }, Q: { usciti: '0.00', entrati: '250.00' } };
  verifica(correzioneGiroconti(['P'], gir).correzione === 250 && correzioneGiroconti(['P'], gir).mossi === 250, 'avanzo: sul conto di partenza i giroconti del mese si risommano (+250)');
  verifica(correzioneGiroconti(['Q'], gir).correzione === -250 && correzioneGiroconti(['Q'], gir).mossi === 250, 'avanzo: sul conto di arrivo si sottraggono (−250)');
  verifica(correzioneGiroconti(['P', 'Q'], gir).correzione === 0 && correzioneGiroconti(['P', 'Q'], gir).mossi === 500, 'avanzo: con tutti i conti le due correzioni si annullano');
  verifica(correzioneGiroconti(['ALTRO'], gir).correzione === 0 && correzioneGiroconti(['ALTRO'], gir).mossi === 0 && correzioneGiroconti(['P'], undefined).correzione === 0, 'avanzo: un altro conto o nessun dato: nulla');
  verifica(correzioneGiroconti(['P'], { P: { usciti: '100.00', entrati: '30.00' } }).correzione === 70, 'avanzo: giroconti in entrata e in uscita sullo stesso conto: si compensano (+100 −30)');
  const manoCnt = { P: { totale: '40.00', quante: 2 }, senza: { totale: '10.50', quante: 1 } };
  verifica(Math.abs(usciteAMano(manoCnt, null).totale - 50.5) < 1e-9 && usciteAMano(manoCnt, null).quante === 3 && usciteAMano(manoCnt, 'P').totale === 40 && usciteAMano(manoCnt, 'Q').totale === 0 && usciteAMano(undefined, null).totale === 0, 'usciti: le uscite a mano contano per tutti i conti (anche senza conto) o per quel conto')

  // Esempio con l'API: principale 1.000, giroconto 250 verso il conto Budget, poi 80 spesi dal conto Budget
  const avP = await conto('Avanzo principale', '1000'), avB = await conto('Avanzo budget', '0');
  const girA = await r('POST', '/movimenti', A, { tipo: 'giroconto', importo: '250', da_conto_id: avP.id, a_conto_id: avB.id });
  const speA = await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '80', conto_id: avB.id });
  const mesAv = (await r('GET', `/analisi/mese?mese=${meseA}`, A)).j;
  const gpc = mesAv.giroconti_per_conto;
  verifica(girA.s === 201 && speA.s === 201 && gpc[avP.id]?.usciti === '250.00' && gpc[avP.id]?.entrati === '0.00' && gpc[avB.id]?.usciti === '0.00' && gpc[avB.id]?.entrati === '250.00', '/analisi/mese: giroconti del mese per conto (l\'uscita da 80 non è un giroconto)', gpc);
  const contiAv = (await r('GET', '/conti', A)).j;
  const liberiDi = (id) => Number(contiAv.find((x) => x.id === id).liberi);
  const avanzoDi = (ids) => ids.reduce((t, id) => t + liberiDi(id), 0) + correzioneGiroconti(ids, gpc).correzione;
  verifica(liberiDi(avP.id) === 750 && liberiDi(avB.id) === 170, 'saldo e liberi restano reali: principale 750, Budget 170 (250 − 80)');
  verifica(avanzoDi([avP.id]) === 1000, 'avanzo del conto principale: 1.000 (il giroconto non lo fa scendere)');
  verifica(avanzoDi([avB.id]) === -80, 'avanzo del conto Budget: −80 (i 250 non sono suoi, i 80 escono da lì)');
  verifica(avanzoDi([avP.id, avB.id]) === 920, 'avanzo di tutti i conti: 920 (scende solo di 80, usciti davvero)');
  // Decisione 58: «Usciti» = spunte + uscite a mano, una volta sola; i budget non contano. Il budget sulla categoria dell'uscita e della spunta non raddoppia nulla.
  {
    const catU = await nuovaCat('Usciti prova');
    const budU = await mkB(A, { categoria_id: catU.id, importo: '500' });
    const uBud = await uscita(budU.id, { importo: '30', conto_id: avP.id, descrizione: 'Uscita di budget' });
    const sU = await mk(A, { nome: 'Spesa spuntata U', importo: '20', conto_id: avP.id, categoria_id: catU.id });
    const spuntaU = await r('POST', `/spese-previste/${sU.id}/spunta`, A, { mese: meseA });
    const m2 = (await r('GET', `/analisi/mese?mese=${meseA}`, A)).j;
    const aMano = m2.uscite_a_mano_per_conto;
    verifica(uBud.s === 201 && spuntaU.s === 201, 'usciti: uscita di budget e spesa spuntata registrate', [uBud.s, spuntaU.s]);
    verifica(aMano[avB.id]?.totale === '80.00' && aMano[avB.id]?.quante === 1 && aMano[avP.id]?.totale === '30.00' && aMano[avP.id]?.quante === 1, 'usciti: /analisi/mese conta le uscite a mano per conto, senza la spunta (che ha causa spesa)', aMano);
    verifica(m2.voci.budget === undefined && m2.budget_residuo === undefined, 'analisi: nessuna voce di budget nei totali del mese', m2.voci);
    const catS2 = (await r('GET', `/categorie/spese?mese=${meseA}`, A)).j;
    verifica(!catS2.some((x) => x.categoria_id === catU.id && Number(x.speso) >= 500), '/categorie/spese: il tetto del budget non pesa sulla categoria', catS2);
  }
  verifica((await r('GET', `/analisi/mese?mese=${futuro}`, A)).j.giroconti_per_conto[avP.id] === undefined, '/analisi/mese: i giroconti sono del mese chiesto (un altro mese: nessuno)');
}

// ---- Il salvadanaio sul conto (decisione 52) ----
{
  const meseA = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const saldoDi = async (id, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === id)?.saldo;
  const movs = async (id, T = A) => (await r('GET', `/conti/${id}/movimenti?limite=100`, T)).j;
  const scrivi = (id, importo, T = A, extra = {}) => r('PUT', `/conti/${id}/saldo`, T, { importo, ...extra });
  const spuntaA = (id, mese = meseA) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togliA = (id, mese = meseA) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const piatti = (xs) => xs.flatMap((o) => [o, ...piatti(o.figli)]);
  const goal = async (id) => piatti((await r('GET', '/obiettivi', A)).j).find((o) => o.id === id);
  const versa = (id, corpo, T = A) => r('POST', `/obiettivi/${id}/versamenti`, T, corpo);
  let mv;
  // «Dal conto» sullo stesso conto non muove il saldo (cambiano i liberi), su un altro conto è
  // un giroconto, senza conto è conto -> Niente (provato sopra). Liberi = saldo - soldi nei salvadanai del conto (solo quelli che vedi).
  const contoH0 = async (nome, saldo) => { const c = (await r('POST', '/conti', A, { nome })).j; await scrivi(c.id, saldo); return c; };
  const cH1 = await contoH0('Conto H1', '1000'), cH2 = await contoH0('Conto H2', '500');
  const contoH = async (id, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === id);
  const svH = (await r('POST', '/obiettivi', A, { nome: 'Sv H', conto_id: cH1.id })).j;
  const sottoH = (await r('POST', '/obiettivi', A, { nome: 'Sotto H', padre_id: svH.id })).j;   // eredita il conto del padre
  const nMov = (await movs(cH1.id)).length;
  verifica((await versa(svH.id, { importo: '200', conto_id: cH1.id })).s === 201 && await saldoDi(cH1.id) === '1000.00' && (await movs(cH1.id)).length === nMov && Number((await goal(svH.id)).saldo) === 200,
    'H: Dal conto sullo stesso conto del salvadanaio: il saldo resta uguale e non c\'è nessun movimento');
  let k = await contoH(cH1.id);
  verifica(k.saldo === '1000.00' && k.nei_salvadanai === '200.00' && k.liberi === '800.00', 'H: il conto dice saldo, nei salvadanai e liberi', k);
  verifica((await versa(sottoH.id, { importo: '100', conto_id: cH1.id })).s === 201 && await saldoDi(cH1.id) === '1000.00', 'H: anche il sotto-salvadanaio (conto ereditato dal padre) non muove il saldo');
  k = await contoH(cH1.id);
  verifica(k.nei_salvadanai === '300.00' && k.liberi === '700.00', 'H: i sotto-salvadanai contano una volta sola (200 + 100)', k);
  verifica((await contoH(cH2.id)).nei_salvadanai === '0.00' && (await contoH(cH2.id)).liberi === '500.00', 'H: un conto senza salvadanai ha liberi = saldo');
  // Salvadanaio su un ALTRO conto: giroconto (una riga) da H2 a H1
  verifica((await versa(svH.id, { importo: '50', conto_id: cH2.id })).s === 201 && await saldoDi(cH2.id) === '450.00' && await saldoDi(cH1.id) === '1050.00', 'H: Dal conto di un altro conto: giroconto (H2 -50, H1 +50)');
  mv = await movs(cH1.id);
  verifica(mv[0].importo === '50.00' && mv[0].causa === 'giroconto' && mv[0].da === 'Conto H2' && mv[0].a === 'Conto H1' && mv[0].descrizione === 'Versato in Sv H', 'H: una riga sola, da H2 a H1', mv[0]);
  k = await contoH(cH1.id);
  verifica(k.nei_salvadanai === '350.00' && k.liberi === '700.00' && (await contoH(cH2.id)).liberi === '450.00', 'H: dopo il giroconto i liberi di H1 restano 700 (saldo 1050 - 350)', k);
  verifica((await versa(svH.id, { importo: '-50', conto_id: cH2.id })).s === 201 && await saldoDi(cH2.id) === '500.00' && await saldoDi(cH1.id) === '1000.00', 'H: prelievo verso un altro conto: giroconto al contrario');
  verifica((await versa(svH.id, { importo: '-30', conto_id: cH1.id })).s === 201 && await saldoDi(cH1.id) === '1000.00' && (await contoH(cH1.id)).liberi === '730.00', 'H: prelievo verso lo stesso conto: nessun movimento, i liberi salgono');
  // Annullare un versamento sullo stesso conto: nessun movimento da togliere, i liberi tornano
  const v200 = (await r('GET', `/obiettivi/${svH.id}`, A)).j.versamenti.find((x) => x.importo === '200.00').id;
  verifica((await r('DELETE', `/obiettivi/versamenti/${v200}`, A)).s === 204 && await saldoDi(cH1.id) === '1000.00' && (await contoH(cH1.id)).liberi === '930.00', 'H: annullare un versamento sullo stesso conto: il saldo non cambia, i liberi salgono');
  // Il promemoria del salvadanaio spuntato: la quota si mette da parte sul conto, il saldo non scende
  const promH = (await r('PUT', `/obiettivi/${svH.id}/promemoria`, A, { importo: '70', conto_id: cH1.id })).j;
  verifica((await spuntaA(promH.id)).s === 201 && await saldoDi(cH1.id) === '1000.00' && (await contoH(cH1.id)).liberi === '860.00', 'H: la spunta del promemoria con il salvadanaio sul conto: saldo uguale, liberi -70');
  verifica((await togliA(promH.id)).s === 204 && (await contoH(cH1.id)).liberi === '930.00' && await saldoDi(cH1.id) === '1000.00', 'H: togliendo la spunta i liberi tornano');
  await r('DELETE', `/obiettivi/${svH.id}/promemoria`, A);
  // Liberi negativi: più soldi messi da parte del saldo
  await versa(svH.id, { importo: '5000', conto_id: cH1.id });
  k = await contoH(cH1.id);
  verifica(k.saldo === '1000.00' && Number(k.liberi) < 0, 'H: i liberi possono essere negativi (la parte messa da parte supera il saldo)', k);
  // Visibilità: un salvadanaio privato di A su un conto condiviso con B non conta per B; condiviso con B conta per tutti e due
  const sSh = await contoH0('Conto H3 condiviso', '300');
  await r('POST', '/condivisioni', A, { voce: 'conto', id: sSh.id, utente_id: b.utente_id });
  const svPriv = (await r('POST', '/obiettivi', A, { nome: 'Sv privato H', conto_id: sSh.id })).j;
  await versa(svPriv.id, { importo: '120', conto_id: sSh.id });
  verifica((await contoH(sSh.id)).nei_salvadanai === '120.00' && (await contoH(sSh.id, Bt)).nei_salvadanai === '0.00' && (await contoH(sSh.id, Bt)).liberi === '300.00', 'H: un salvadanaio privato di A su un conto condiviso non conta per B');
  await r('POST', '/condivisioni', A, { voce: 'obiettivo', id: svPriv.id, utente_id: b.utente_id });
  verifica((await contoH(sSh.id, Bt)).nei_salvadanai === '120.00' && (await contoH(sSh.id, Bt)).liberi === '180.00' && await saldoDi(sSh.id, Bt) === '300.00', 'H: condiviso con B, lo vede per intero: liberi 180, saldo 300 per tutti e due');
  // Un salvadanaio sul conto di B (non condiviso) condiviso con A: A non vede il conto, quindi non conta per A e «Dal conto» è conto -> Niente
  const cBpriv = (await r('POST', '/conti', Bt, { nome: 'Conto privato di B' })).j;
  const svB = (await r('POST', '/obiettivi', Bt, { nome: 'Sv di B su conto di B', conto_id: cBpriv.id })).j;
  await r('POST', '/condivisioni', Bt, { voce: 'obiettivo', id: svB.id, utente_id: a.utente_id });
  const antH = Number(await saldoDi(cH2.id));
  verifica((await versa(svB.id, { importo: '25', conto_id: cH2.id })).s === 201 && Number(await saldoDi(cH2.id)) === antH - 25 && (await movs(cH2.id))[0].a_niente === true,
    'H: salvadanaio su un conto che non vedo: per me non è su nessun conto (conto -> Niente)');
}

// ---- Movimenti a mano e conto eliminato (decisione 53) ----
{
  const NIENTE = '00000000-0000-0000-0000-000000000001';
  const saldoDi = async (id, T = A) => (await r('GET', '/conti', T)).j.find((x) => x.id === id)?.saldo;
  const tutti = async (query = '', T = A) => (await r('GET', `/movimenti${query}`, T)).j;
  const scrivi = (id, importo, T = A) => r('PUT', `/conti/${id}/saldo`, T, { importo });
  const conto = async (nome, saldo, T = A) => { const c = (await r('POST', '/conti', T, { nome })).j; if (saldo) await scrivi(c.id, saldo, T); return c; };
  const mano = (corpo, T = A) => r('POST', '/movimenti', T, corpo);
  const admin = process.env.DATABASE_ADMIN_URL ? new (await import('pg')).default.Client({ connectionString: process.env.DATABASE_ADMIN_URL }) : null;
  if (admin) await admin.connect();

  const c1 = await conto('Mano 1', '1000'), c2 = await conto('Mano 2', '500');
  const cat = (await r('GET', '/categorie?formato=elenco', A)).j.find((x) => x.nome === 'Supermercato');
  // Entrata, uscita, giroconto: il saldo dei conti si aggiorna
  const e = await mano({ tipo: 'entrata', importo: '100', conto_id: c1.id, descrizione: 'Regalo' });
  verifica(e.s === 201 && await saldoDi(c1.id) === '1100.00', 'a mano: entrata (Niente -> conto) alza il saldo', e.j);
  const u = await mano({ tipo: 'uscita', importo: '30,50'.replace(',', '.'), conto_id: c1.id });
  verifica(u.s === 201 && await saldoDi(c1.id) === '1069.50', 'a mano: uscita (conto -> Niente) abbassa il saldo', u.j);
  const g = await mano({ tipo: 'giroconto', importo: '200', da_conto_id: c1.id, a_conto_id: c2.id });
  verifica(g.s === 201 && await saldoDi(c1.id) === '869.50' && await saldoDi(c2.id) === '700.00', 'a mano: giroconto sposta i soldi tra due conti', g.j);
  const el = (await tutti('?limite=50')).movimenti;
  const rE = el.find((x) => x.id === e.j.id), rU = el.find((x) => x.id === u.j.id), rG = el.find((x) => x.id === g.j.id);
  verifica(rE.causa === 'a_mano' && rE.da_niente && rE.a === 'Mano 1' && rE.modificabile === true && rE.descrizione === 'Regalo', '/movimenti: entrata a mano, modificabile', rE);
  verifica(rU.a_niente && rU.descrizione === 'Uscita' && rU.modificabile === true && rG.descrizione === 'Giroconto: Mano 1 verso Mano 2' && rG.da_conto_id === c1.id && rG.a_conto_id === c2.id, '/movimenti: uscita e giroconto a mano (descrizioni di base)', [rU, rG]);
  verifica(el.filter((x) => x.causa !== 'a_mano').every((x) => x.modificabile === false), '/movimenti: le righe non a mano non sono modificabili');
  // Validazione
  verifica((await mano({ tipo: 'uscita', importo: '0', conto_id: c1.id })).s === 400 && (await mano({ tipo: 'uscita', importo: '-5', conto_id: c1.id })).s === 400, 'a mano: importo zero o negativo rifiutato');
  verifica((await mano({ tipo: 'altro', importo: '5', conto_id: c1.id })).s === 400 && (await mano({ importo: '5', conto_id: c1.id })).s === 400, 'a mano: tipo non valido o mancante rifiutato');
  verifica((await mano({ tipo: 'uscita', importo: '5' })).s === 400, 'a mano: manca il conto (400)');
  verifica((await mano({ tipo: 'giroconto', importo: '5', da_conto_id: c1.id, a_conto_id: c1.id })).s === 400 && (await mano({ tipo: 'giroconto', importo: '5', da_conto_id: c1.id })).s === 400, 'a mano: giroconto con due conti uguali o uno solo rifiutato');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: NIENTE })).s === 404 && (await mano({ tipo: 'giroconto', importo: '5', da_conto_id: NIENTE, a_conto_id: c1.id })).s === 404, 'a mano: Niente non si sceglie (404)');
  verifica((await mano({ tipo: 'entrata', importo: '5', conto_id: c1.id }, Bt)).s === 404, 'a mano: il conto di un altro non si sceglie (404)');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, data: '31/12/2026' })).s === 400 && (await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, ora: '25:00' })).s === 400, 'a mano: data o ora non valide rifiutate');
  verifica((await mano({ tipo: 'entrata', importo: '5', conto_id: c1.id, categoria_id: cat.id })).s === 400, 'a mano: la categoria è solo delle uscite');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, categoria_id: (await r('GET', '/categorie?formato=elenco', Bt)).j[0].id })).s === 404, 'a mano: la categoria di un altro non si sceglie (404)');
  verifica((await mano({ tipo: 'uscita', importo: '5', conto_id: c1.id, data: '2020-01-15' })).s === 409, 'a mano: un mese passato è bloccato (409)');
  // Data e ora scelte
  const ora10 = await mano({ tipo: 'entrata', importo: '1', conto_id: c1.id, data: '2099-05-04', ora: '10:30' });
  const riga10 = (await tutti('?limite=50')).movimenti.find((x) => x.id === ora10.j.id);
  verifica(ora10.s === 201 && riga10.momento.startsWith('2099-05-04T08:30') || riga10.momento.startsWith('2099-05-04T09:30'), 'a mano: data e ora scelte (mese futuro permesso)', riga10?.momento);
  await r('DELETE', `/movimenti/${ora10.j.id}`, A);
  // Categoria con budget: l'uscita a mano conta nello speso del budget
  const bud = (await r('POST', '/budget', A, { categoria_id: cat.id, importo: '300' })).j;
  const budDi = async () => (await r('GET', '/budget', A)).j.budget.find((x) => x.id === bud.id);
  const uc = await mano({ tipo: 'uscita', importo: '45', conto_id: c1.id, categoria_id: cat.id, descrizione: 'Spesa grande' });
  const b1 = await budDi();
  verifica(uc.s === 201 && b1.speso === '45.00' && b1.uscite.some((x) => x.id === uc.j.id && x.modificabile) && await saldoDi(c1.id) === '824.50', 'a mano: l\'uscita con categoria conta nel budget e nel saldo', b1);
  verifica((await tutti('?limite=50')).movimenti.find((x) => x.id === uc.j.id).categoria === 'Supermercato', '/movimenti: l\'uscita mostra la categoria');
  // Modifica
  const m1 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { importo: '60', descrizione: 'Spesa più grande' });
  verifica(m1.s === 200 && (await budDi()).speso === '60.00' && await saldoDi(c1.id) === '809.50', 'a mano: modificare l\'importo aggiorna saldo e budget', m1.j);
  const m2 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { categoria_id: null });
  verifica(m2.s === 200 && (await budDi()).speso === '0.00', 'a mano: tolta la categoria, il budget si svuota', m2.j);
  const m3 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { tipo: 'giroconto', da_conto_id: c1.id, a_conto_id: c2.id });
  verifica(m3.s === 200 && await saldoDi(c1.id) === '809.50' && await saldoDi(c2.id) === '760.00', 'a mano: da uscita a giroconto', m3.j);
  const m4 = await r('PATCH', `/movimenti/${uc.j.id}`, A, { tipo: 'entrata', conto_id: c2.id });
  verifica(m4.s === 200 && await saldoDi(c1.id) === '869.50' && await saldoDi(c2.id) === '760.00', 'a mano: da giroconto a entrata (il conto che dava non perde più)', m4.j);
  verifica((await r('PATCH', `/movimenti/${uc.j.id}`, A, { importo: '0' })).s === 400 && (await r('PATCH', `/movimenti/${uc.j.id}`, A, { data: '2020-01-01' })).s === 409, 'a mano: modifica non valida o nel passato rifiutata');
  verifica((await r('DELETE', `/movimenti/${uc.j.id}`, A)).s === 204 && await saldoDi(c2.id) === '700.00' && (await r('DELETE', `/movimenti/${uc.j.id}`, A)).s === 404, 'a mano: eliminare toglie il movimento e il saldo torna');
  // Le uscite si tolgono anche dalla pagina Budget
  const ub = await mano({ tipo: 'uscita', importo: '10', conto_id: c1.id, categoria_id: cat.id });
  verifica((await r('DELETE', `/budget/uscite/${ub.j.id}`, A)).s === 204 && (await budDi()).speso === '0.00', 'a mano: l\'uscita con categoria si toglie anche dal budget');
  // Solo l'autore; i movimenti non a mano non si toccano
  await r('POST', '/condivisioni', A, { voce: 'conto', id: c1.id, utente_id: b.utente_id });
  const cond = await mano({ tipo: 'uscita', importo: '7', conto_id: c1.id });
  const visto = (await tutti('?limite=50', Bt)).movimenti.find((x) => x.id === cond.j.id);
  verifica(visto && visto.modificabile === false, 'conto condiviso: l\'altra persona vede il movimento a mano ma non lo può modificare');
  verifica((await r('PATCH', `/movimenti/${cond.j.id}`, Bt, { importo: '8' })).s === 403 && (await r('DELETE', `/movimenti/${cond.j.id}`, Bt)).s === 403, 'conto condiviso: solo l\'autore cambia e toglie (403)');
  verifica((await r('DELETE', `/movimenti/${(await tutti('?limite=200')).movimenti.find((x) => x.causa !== 'a_mano')?.id ?? '00000000-0000-0000-0000-0000000000aa'}`, A)).s === 404, 'i movimenti non a mano non si eliminano da qui (404)');
  verifica((await r('PATCH', `/movimenti/00000000-0000-0000-0000-0000000000aa`, A, { importo: '1' })).s === 404, 'movimento inesistente (404)');
  // Passato bloccato per cambiare e togliere
  if (admin) {
    await admin.query(`update movimenti_conto set momento = '2020-01-15 12:00+00' where id = $1`, [cond.j.id]);
    verifica((await r('PATCH', `/movimenti/${cond.j.id}`, A, { importo: '9' })).s === 409 && (await r('DELETE', `/movimenti/${cond.j.id}`, A)).s === 409, 'a mano: un movimento di un mese passato non si cambia né si toglie (409)');
    verifica((await tutti('?limite=200')).movimenti.find((x) => x.id === cond.j.id)?.modificabile === false, '/movimenti: nel mese passato non è modificabile');
  }

  // ---- Eliminare un conto: l'altro conto non cambia ----
  // X (di A) e Y (di B, condiviso con A): A scrive giroconti X -> Y e Y -> X; in più movimenti solo di X.
  const X = await conto('Da eliminare', '1000'), Y = await conto('Resta di B', '400', Bt);
  await r('POST', '/condivisioni', Bt, { voce: 'conto', id: Y.id, utente_id: a.utente_id });
  const gXY = await mano({ tipo: 'giroconto', importo: '150', da_conto_id: X.id, a_conto_id: Y.id });
  const gYX = await mano({ tipo: 'giroconto', importo: '40', da_conto_id: Y.id, a_conto_id: X.id });
  const soloX = await mano({ tipo: 'uscita', importo: '20', conto_id: X.id, descrizione: 'Solo di X' });
  const soloX2 = await mano({ tipo: 'entrata', importo: '5', conto_id: X.id, descrizione: 'Solo di X (entrata)' });
  const ySaldo = await saldoDi(Y.id, Bt);
  verifica(gXY.s === 201 && gYX.s === 201 && ySaldo === '510.00' && await saldoDi(Y.id) === '510.00', 'conto eliminato: prima, Y vale 400 + 150 - 40', ySaldo);
  // La spesa e il salvadanaio che puntano a X restano, senza conto
  const spesaX = (await r('POST', '/spese-previste', A, { nome: 'Spesa su X', importo: '10', conto_id: X.id })).j;
  const svX = (await r('POST', '/obiettivi', A, { nome: 'Sv su X', conto_id: X.id })).j;
  // B toglie la condivisione: A non vede più Y, ma eliminando X il saldo di Y non deve cambiare
  verifica((await r('DELETE', `/conti/${X.id}`, Bt)).s === 404, 'conto eliminato: solo chi lo vede (404 per B, X è privato)');
  verifica((await r('DELETE', `/conti/${X.id}`, A)).s === 204, 'conto eliminato: X eliminato');
  verifica(await saldoDi(Y.id, Bt) === ySaldo && await saldoDi(Y.id) === ySaldo, 'conto eliminato: il saldo di Y (conto secondario) resta identico', [await saldoDi(Y.id, Bt), ySaldo]);
  const dopo = (await tutti('?limite=200', Bt)).movimenti;
  const dXY = dopo.find((x) => x.id === gXY.j.id), dYX = dopo.find((x) => x.id === gYX.j.id);
  verifica(dXY && dXY.da_niente && dXY.a_conto_id === Y.id && dXY.importo === '150.00', 'conto eliminato: X -> Y diventa Niente -> Y (entrata)', dXY);
  verifica(dYX && dYX.a_niente && dYX.da_conto_id === Y.id && dYX.importo === '40.00', 'conto eliminato: Y -> X diventa Y -> Niente (uscita)', dYX);
  verifica(!(await tutti('?limite=200')).movimenti.some((x) => x.id === soloX.j.id || x.id === soloX2.j.id), 'conto eliminato: i movimenti solo di X spariscono');
  verifica((await r('GET', `/spese-previste`, A)).j.spese.find((x) => x.id === spesaX.id)?.conto_id === null && (await r('GET', `/obiettivi/${svX.id}`, A)).j.conto_id === null, 'conto eliminato: spese e salvadanai restano senza conto');
  // Il conto secondario può essere di un'altra persona e non visibile a chi elimina
  const P = await conto('Privato A', '300'), Q = await conto('Privato B', '100', Bt);
  await r('POST', '/condivisioni', Bt, { voce: 'conto', id: Q.id, utente_id: a.utente_id });
  await mano({ tipo: 'giroconto', importo: '60', da_conto_id: P.id, a_conto_id: Q.id });
  await r('POST', '/condivisioni', A, { voce: 'conto', id: P.id, utente_id: b.utente_id });
  const qPrima = await saldoDi(Q.id, Bt);
  const dq = await r('DELETE', `/conti/${P.id}`, A);
  verifica(dq.s === 204 && await saldoDi(Q.id, Bt) === qPrima && qPrima === '160.00', 'conto eliminato: anche con il conto secondario di un\'altra persona il saldo non cambia', qPrima);
  if (admin) await admin.end();
}

console.log(`prove: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
