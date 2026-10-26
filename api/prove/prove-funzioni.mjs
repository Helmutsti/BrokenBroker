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
const spesaBudget = (await r('POST', '/spese-previste', A, { nome: 'Spesa', tipo: 'budget', importo: '400', conto_id: conto.id, categoria_id: cibo.id })).j;
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
// I budget si spuntano come le altre voci (decisione 30).
verifica((await r('POST', `/spese-previste/${spesaBudget.id}/spunta`, A, { mese: '2026-10' })).s === 201 && (await r('DELETE', `/spese-previste/${spesaBudget.id}/spunta?mese=2026-10`, A)).s === 204, 'budget si spunta e si toglie');
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

// "Sul conto oggi" per conto: un saldo per persona, privato anche sul conto condiviso
const sc1 = await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: '1250.40' });
verifica(sc1.s === 200 && sc1.j.saldo === '1250.40' && /^\d{4}-\d{2}-\d{2}/.test(sc1.j.saldo_al), 'saldo del conto scritto', sc1.j);
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, Bt, { importo: '-20' })).j.saldo === '-20.00', 'saldo dell\'altra persona sullo stesso conto');
verifica((await r('GET', '/conti', A)).j.find((x) => x.id === contoDaCondividere.id).saldo === '1250.40', 'il saldo di A non cambia con quello di B');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: 'abc' })).s === 400, 'saldo non valido rifiutato');
verifica((await r('PUT', `/conti/${conto.id}/saldo`, Bt, { importo: '5' })).s === 404, 'saldo di un conto non visibile: 404');
verifica((await r('PUT', `/conti/${contoDaCondividere.id}/saldo`, A, { importo: null })).j.saldo === null, 'saldo del conto tolto');

// Obiettivi, versamenti, traguardi, crea spesa
const fondo = (await r('POST', '/obiettivi', A, { nome: 'Fondo emergenza' })).j;
const uno = (await r('POST', '/obiettivi', A, { nome: 'Un mese', padre_id: fondo.id, traguardo: '1000' })).j;
const due = (await r('POST', '/obiettivi', A, { nome: 'Due mesi', padre_id: fondo.id, traguardo: '2000' })).j;
await r('POST', `/obiettivi/${uno.id}/versamenti`, A, { importo: '1000', data: '2026-09-01' });
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
verifica(spesaViaggio.ogni_mesi === null && spesaViaggio.importo === '1200.00' && spesaViaggio.obiettivo_id === viaggio.id && spesaViaggio.nel_mese, 'spesa una tantum pagata dall\'obiettivo', spesaViaggio);
await r('POST', `/obiettivi/${viaggio.id}/versamenti`, A, { importo: '10' });
verifica((await r('GET', `/obiettivi/${viaggio.id}`, A)).j.spesa_creata_id === v1.spesa_creata_id, 'spesa creata una volta sola');
// Spuntare la spesa del viaggio preleva dall'obiettivo
await r('PATCH', `/spese-previste/${v1.spesa_creata_id}`, A, { conto_id: conto.id });
await r('POST', `/spese-previste/${v1.spesa_creata_id}/spunta`, A, { mese: '2027-03' });
verifica((await r('GET', `/obiettivi/${viaggio.id}`, A)).j.saldo === '10.00', 'spunta preleva dall\'obiettivo');

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
// stipendio 2000; fisse: affitto 420 (60%); periodiche: luce 30 + tari 20; budget 400; rate: telefono 50 (10/10) + divano 100 (05/10)
verifica(mese.voci.fisse === '420.00' && mese.voci.periodiche_mensilizzate === '50.00' && mese.voci.budget === '400.00', 'voci del mese', mese.voci);
verifica(mese.voci.rate === '150.00' && mese.resta === '980.00' && mese.semaforo === 'ok', 'quanto resta', mese);
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
  // Salvadanaio della spesa senza giorno: scade alla fine del mese personale (9 aprile), non il 1° o il 31 marzo.
  await r('PATCH', `/spese-previste/${bollo.id}`, A, { nuovo_salvadanaio: {} });
  const alb = (await r('GET', '/obiettivi', A)).j;
  const sal = alb.find((o) => o.nome === 'Bollo');
  verifica(sal && /^\d{4}-04-09$/.test(sal.scadenza) && sal.paga_spesa.senza_giorno === true, 'salvadanaio senza giorno: scadenza a fine mese personale', sal && [sal.scadenza, sal.paga_spesa]);
  // Il «Ricordamelo» ogni 3 mesi vale per il mese personale in corso e poi ogni 3 mesi personali, senza giorno.
  const vacanze = (await r('POST', '/obiettivi', A, { nome: 'Vacanze' })).j;
  const pro = await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, { importo: '50', ogni_mesi: 3 });
  verifica(pro.s === 200 && pro.j.senza_giorno === true && pro.j.nel_mese === true, 'promemoria ogni 3 mesi: senza giorno, nel mese personale in corso', pro.j);
  const pro1 = await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, { importo: '50', ogni_mesi: 1 });
  const pro6 = await r('PUT', `/obiettivi/${vacanze.id}/promemoria`, A, { importo: '50', ogni_mesi: 6 });
  verifica(pro1.j.nel_mese === true && pro6.j.nel_mese === true && pro6.j.senza_giorno === true, 'promemoria cambiato da 1 a 6 mesi non sparisce', [pro1.j, pro6.j]);
}

console.log(`prove: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
