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

// Spunta
const sp1 = await r('POST', `/spese-previste/${affitto.j.id}/spunta`, A, { mese: '2026-10', data: '2026-10-12' });
// La spunta è un segno (proposta v5): nessun movimento sul conto.
verifica(sp1.s === 201 && sp1.j.data === '2026-10-12' && sp1.j.importo === undefined, 'spunta è un segno', sp1.j);
verifica((await r('POST', `/spese-previste/${affitto.j.id}/spunta`, A, { mese: '2026-10' })).s === 409, 'doppia spunta 409');
verifica((await r('POST', `/spese-previste/${spesaBudget.id}/spunta`, A, { mese: '2026-10' })).s === 400, 'budget non si spunta');
verifica((await r('POST', `/spese-previste/${luceSp.id}/spunta`, A, { mese: '2026-10', data: '2026-12-01' })).s === 400, 'data fuori dal mese');
let ott2 = (await r('GET', '/spese-previste?mese=2026-10', A)).j;
verifica(sp('Affitto', ott2).uscita === true && sp('Affitto', ott2).movimento_id === null, 'affitto uscito senza movimento');

// Budget: si riempie con i movimenti della categoria e delle sottocategorie
await r('POST', '/movimenti', A, { conto_id: conto.id, importo: '-45.30', esercente: 'Esselunga', categoria_id: supermercato.id, data: '2026-10-20' });
await r('POST', '/movimenti', A, { conto_id: conto.id, importo: '-20', esercente: 'Bar', categoria_id: cibo.id, data: '2026-10-21' });
await r('POST', '/movimenti', A, { conto_id: conto.id, importo: '-99', esercente: 'Vecchio', categoria_id: cibo.id, data: '2026-10-05' });
ott2 = (await r('GET', '/spese-previste?mese=2026-10', A)).j;
verifica(sp('Spesa', ott2).speso === '65.30', 'budget speso', sp('Spesa', ott2).speso);

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
verifica((await r('GET', `/spese-previste/${affitto.j.id}?mese=2026-10`, A)).j.mia_quota === '420.00', 'quota 60%');
verifica((await r('DELETE', `/spese-previste/${affitto.j.id}`, Bt)).s === 403, "l'altro non cancella la spesa");
const cond = (await r('GET', '/condivisioni', Bt)).j;
verifica(cond.length === 1 && cond[0].nome === 'Affitto' && cond[0].mia === false, 'elenco condivisioni', cond);
verifica((await r('DELETE', `/condivisioni/${cond[0].id}`, Bt)).s === 403, "l'altro non toglie la condivisione");

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

// Regole
const reg = (await r('PUT', '/regole', A, { max_rate_contemporanee: '2', tetto_rate_percentuale: '10', max_mensilita_debito: null })).j;
verifica(reg.max_rate_contemporanee === 2 && reg.max_mensilita_debito === undefined, 'regole', reg);

// Investimenti
const vwce = (await r('POST', '/investimenti/titoli', A, { isin: 'IE00BK5BQT80', ticker: 'VWCE', nome: 'Vanguard FTSE All-World' })).j;
verifica((await r('POST', '/investimenti/titoli', A, { isin: 'XX', nome: 'X' })).s === 400, 'isin non valido');
await r('POST', '/investimenti/operazioni', A, { titolo_id: vwce.id, data: '2026-03-01', verso: 'acquisto', quantita: '10', prezzo: '100', commissioni: '1' });
await r('POST', '/investimenti/operazioni', A, { titolo_id: vwce.id, data: '2026-06-01', verso: 'acquisto', quantita: '10', prezzo: '120', commissioni: '1' });
await r('POST', '/investimenti/operazioni', A, { titolo_id: vwce.id, data: '2026-08-01', verso: 'vendita', quantita: '5', prezzo: '125' });
await r('PUT', `/investimenti/titoli/${vwce.id}/prezzi`, A, { prezzo: '130' });
await r('PUT', `/investimenti/titoli/${vwce.id}/esposizioni`, A, { dimensione: 'area', voci: [{ voce: 'Stati Uniti', peso: '62' }, { voce: 'Europa', peso: '16' }] });
const port = (await r('GET', '/investimenti/portafoglio', A)).j;
verifica(port.posizioni[0].quote === '15' && port.posizioni[0].prezzo_medio === '110.1000' && port.valore === '1950.00', 'portafoglio con prezzo medio', port);
verifica(port.guadagno === '298.50', 'guadagno', port.guadagno);
const esp = (await r('GET', '/investimenti/esposizione', A)).j;
verifica(esp.area[0].voce === 'Stati Uniti' && esp.area[0].peso === 62 && esp.area.some((x) => x.voce === 'Non indicato'), 'esposizione', esp.area);
const and = (await r('GET', '/investimenti/andamento?mesi=12', A)).j;
verifica(and.length === 12 && and[11].valore === '1950.00', 'andamento', and.at(-1));
verifica((await r('GET', '/investimenti/portafoglio', Bt)).j.posizioni.length === 0, 'investimenti privati');

// Analisi
const mese = (await r('GET', '/analisi/mese?mese=2026-10', A)).j;
// stipendio 2000; fisse: affitto 420 (60%); periodiche: luce 30 + tari 20; budget 400; rate: telefono 50 (10/10) + divano 100 (05/10)
verifica(mese.voci.fisse === '420.00' && mese.voci.periodiche_mensilizzate === '50.00' && mese.voci.budget === '400.00', 'voci del mese', mese.voci);
verifica(mese.voci.rate === '150.00' && mese.resta === '980.00' && mese.semaforo === 'ok', 'quanto resta', mese);
const st = (await r('GET', '/analisi/storico?mesi=3&mese=2026-10', A)).j;
verifica(st.length === 3 && st[2].mese === '2026-10' && st[2].uscite === '65.30', 'storico: solo i movimenti veri, non le spunte', st[2]);
const pat = (await r('GET', '/analisi/patrimonio', A)).j;
verifica(pat.investimenti === '1950.00', 'patrimonio', pat);
const pro = (await r('GET', '/analisi/proiezione', A)).j;
verifica(pro.punti.length >= 3 && pro.punti.at(-1).mesi === 60, 'proiezione', pro.punti.at(-1));
const ctrl = (await r('GET', '/analisi/rate', A)).j;
verifica(ctrl.controlli.length === 2 && ctrl.controlli[0].rispettata === true, 'controllo rate', ctrl);
const posso = (await r('POST', '/analisi/posso-permettermelo', A, { prezzo: '1200', a_rate: true, numero_rate: 12 })).j;
verifica(posso.esito === 'no' && posso.regole.some((x) => !x.rispettata), 'posso permettermelo: troppe rate', posso);
const posso2 = (await r('POST', '/analisi/posso-permettermelo', A, { prezzo: '300', vita_utile_mesi: 36 })).j;
verifica(posso2.esito === 'si', 'posso permettermelo: sì', posso2);

console.log(`prove: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
