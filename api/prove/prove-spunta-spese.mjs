// Prove della spunta di spese e rate e del saldo unico (decisione 72): spuntare abbassa il saldo della tua quota, togliere la spunta lo fa risalire;
// riscrivere il saldo riparte da zero; i conti sono solo etichette.
// Uso: node api/prove/prove-spunta-spese.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea utenti di prova nuovi e alla fine li cancella con i loro dati
// (se può, con `docker compose exec db psql`, scegliendo il progetto con COMPOSE_PROJECT_NAME; altrimenti lo dice).

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
  const saldo = async () => (await r('GET', '/saldo', A)).j;
  const effettivo = async () => (await saldo()).effettivo;
  const cat = (await r('GET', '/categorie?formato=elenco', A)).j.find((c) => c.nome === 'Casa' && !c.padre_id);
  const principale = (await r('POST', '/conti', A, { nome: 'Principale' })).j;
  const periodo = (await r('GET', '/spese-previste', A)).j.periodo, mese = periodo.mese;
  const spesa = async (corpo) => (await r('POST', '/spese-previste', A, { importo: '100', giorno_mese: 15, ...corpo })).j;
  const spunta = (id) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togli = (id) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const movimentiDiSpunta = () => psql(`select count(*) from movimenti where spunta_id is not null and utente_id = '${me.id}'`);

  // Il saldo parte vuoto; il profilo non lo porta più.
  const vuoto = await saldo();
  verifica(vuoto.sul_conto === null && vuoto.effettivo === null && vuoto.uscite_spuntate === '0.00', 'il saldo parte vuoto', vuoto);
  verifica(!('sul_conto' in (await r('GET', '/profilo', A)).j), 'il profilo non porta più il saldo');
  verifica((await r('PUT', '/saldo', A, { importo: 'abc' })).s === 400, 'saldo non valido: 400');

  // Senza saldo scritto la spunta funziona lo stesso (il saldo resta vuoto).
  const prima = await spesa({ nome: 'Senza saldo', importo: '5' });
  verifica((await spunta(prima.id)).s === 201 && await effettivo() === null, 'spunta senza saldo scritto: il saldo resta vuoto');
  await togli(prima.id);

  const scritto = (await r('PUT', '/saldo', A, { importo: '1000' })).j;
  verifica(scritto.sul_conto === '1000.00' && scritto.effettivo === '1000.00' && scritto.scritto_il, 'saldo scritto: 1000', scritto);

  // Una spesa con categoria e un conto come etichetta: spuntata il saldo scende, tolta torna. L'uscita ha la categoria e nessun conto.
  const affitto = await spesa({ nome: 'Affitto', importo: '700', categoria_id: cat.id, conto_id: principale.id });
  verifica(affitto.categoria_id === cat.id && affitto.conto === 'Principale' && affitto.metti_da_parte === false && !('a_conto_id' in affitto), 'spesa con categoria e conto come etichetta', affitto);
  verifica(affitto.al_mese === '700.00' && affitto.all_anno === '8400.00', 'costo al mese e all\'anno di una mensile', [affitto.al_mese, affitto.all_anno]);
  const s1 = await spunta(affitto.id);
  verifica(s1.s === 201 && await effettivo() === '300.00', 'spesa spuntata: il saldo scende di 700', await saldo());
  const uscita = psql(`select categoria_id || '|' || coalesce(da_conto_id::text, '-') || '|' || coalesce(a_conto_id::text, '-') || '|' || verso from movimenti where spunta_id = '${s1.j.id}'`);
  verifica(uscita === `${cat.id}|-|-|uscita`, 'l\'uscita nata dalla spunta ha la categoria e nessun conto', uscita);
  verifica((await r('GET', '/spese-previste', A)).j.spese.find((x) => x.id === affitto.id).uscita === true, 'la spesa risulta uscita nel mese');
  verifica((await togli(affitto.id)).s === 204 && await effettivo() === '1000.00', 'tolta la spunta il saldo torna a 1000', await saldo());
  verifica((await togli(affitto.id)).s === 404, 'senza spunta: 404');

  // Annuale: il costo al mese è la quota diviso gli N mesi; una tantum: diviso 12.
  const annuale = await spesa({ nome: 'Bollo', importo: '120', ogni_mesi: 12, giorno_mese: undefined, prossima_scadenza: periodo.dal });
  verifica(annuale.al_mese === '10.00' && annuale.all_anno === '120.00', 'annuale: al mese 10, all\'anno 120', [annuale.al_mese, annuale.all_anno]);
  const unaTantum = await spesa({ nome: 'Divano', importo: '600', ogni_mesi: null, giorno_mese: undefined, prossima_scadenza: periodo.dal });
  verifica(unaTantum.al_mese === '50.00' && unaTantum.all_anno === '600.00', 'una tantum: al mese 50, all\'anno 600', [unaTantum.al_mese, unaTantum.all_anno]);

  // Il movimento è legato alla spunta: togliere la spunta elimina esattamente quello.
  const uno = await spesa({ nome: 'Uno', importo: '10' }), due = await spesa({ nome: 'Due', importo: '20' });
  await spunta(uno.id); await spunta(due.id);
  verifica(await movimentiDiSpunta() === '2' && await effettivo() === '970.00', 'due spunte, due uscite', await effettivo());
  await togli(uno.id);
  verifica(await movimentiDiSpunta() === '1' && await effettivo() === '980.00', 'tolta una spunta sparisce solo la sua uscita', await effettivo());
  await togli(due.id);
  verifica(await movimentiDiSpunta() === '0' && await effettivo() === '1000.00', 'tolte tutte, il saldo è com\'era');

  // Spesa condivisa: scende la quota di chi spunta (metà), non l'importo intero.
  const condivisa = await spesa({ nome: 'Condivisa', importo: '200', categoria_id: cat.id });
  await r('POST', '/condivisioni', A, { voce: 'spesa', id: condivisa.id, utente_id: altro.utente_id });
  const sc = (await r('GET', '/spese-previste', A)).j.spese.find((x) => x.id === condivisa.id);
  verifica(sc.mia_quota === '100.00' && sc.al_mese === '100.00', 'condivisa a metà: la mia quota è 100', sc.mia_quota);
  await spunta(condivisa.id);
  verifica(await effettivo() === '900.00', 'condivisa spuntata: scende la mia quota (100), non l\'intero', await effettivo());
  await togli(condivisa.id);
  verifica(await effettivo() === '1000.00', 'condivisa: tolta la spunta il saldo torna');

  // Rate: niente categoria; spuntata il saldo scende della rata, tolta torna. Il conto è solo un'etichetta.
  const rata = (await r('POST', '/rate', A, { oggetto: 'Telefono', importo_rata: '50', numero_rate: 3, prima_scadenza: periodo.dal, conto_id: principale.id, categoria_id: cat.id })).j;
  verifica(rata.conto_id === principale.id && !('categoria_id' in rata) && rata.al_mese === '50.00' && rata.all_anno === '600.00', 'rata: niente categoria, conto come etichetta, costo al mese e all\'anno', rata);
  const sr = await r('POST', `/rate/${rata.id}/spunta`, A, { mese });
  verifica(sr.s === 201 && await effettivo() === '950.00', 'rata spuntata: il saldo scende di 50', await saldo());
  verifica(psql(`select count(*) from movimenti where spunta_id = '${sr.j.id}' and categoria_id is null and verso = 'uscita'`) === '1', 'l\'uscita della rata non ha categoria');
  verifica((await r('DELETE', `/rate/${rata.id}/spunta?mese=${mese}`, A)).s === 204 && await effettivo() === '1000.00', 'rata: tolta la spunta il saldo torna');

  // Rate in anticipo: una rata che scade nel mese dopo si vede e si spunta già in questo mese; conta nelle spese di questo mese e non più in quello dopo.
  const prossimoMese = (await r('GET', '/spese-previste?mese=' + mese.replace(/(\d+)-(\d+)/, (_, a, m) => (m === '12' ? `${+a + 1}-01` : `${a}-${String(+m + 1).padStart(2, '0')}`)), A)).j.periodo;
  const rx = (await r('POST', '/rate', A, { oggetto: 'Amex', importo_rata: '300', numero_rate: 2, prima_scadenza: prossimoMese.dal })).j;
  const vistaRata = async (m) => (await r('GET', '/rate?mese=' + m, A)).j.find((x) => x.id === rx.id);
  let vr = await vistaRata(mese);
  verifica(vr.numero === 1 && vr.scadenza === prossimoMese.dal && !vr.pagata && vr.contate === 0, 'rata in anticipo: nel mese prima si vede la rata 1, non pagata e non conta', vr);
  const sx = await r('POST', `/rate/${rx.id}/spunta`, A, { mese });
  verifica(sx.s === 201 && await effettivo() === '700.00', 'rata in anticipo spuntata: il saldo scende di 300', await saldo());
  vr = await vistaRata(mese);
  verifica(vr.numero === 1 && vr.pagata && vr.contate === 1 && vr.contate_pagate === 1, 'rata in anticipo: resta spuntata e conta in questo mese', vr);
  vr = await vistaRata(prossimoMese.mese);
  verifica(vr.numero === 2 && !vr.pagata && vr.contate === 0, 'mese dopo: la rata 1 è già pagata, si vede la 2, non pagata e non conta', vr);
  verifica((await r('POST', `/rate/${rx.id}/spunta`, A, { mese })).s === 409, 'rata in anticipo già pagata: 409');
  verifica((await r('DELETE', `/rate/${rx.id}/spunta?mese=${prossimoMese.mese}`, A)).s === 404, 'la spunta in anticipo non si toglie dal mese dopo (qui si vede la rata 2)');
  verifica((await r('DELETE', `/rate/${rx.id}/spunta?mese=${mese}`, A)).s === 204 && await effettivo() === '1000.00', 'rata in anticipo: tolta nel mese giusto il saldo torna');
  vr = await vistaRata(prossimoMese.mese);
  verifica(vr.numero === 1 && !vr.pagata && vr.contate === 1 && vr.contate_pagate === 0, 'mese dopo: tolta la spunta la rata 1 torna lì e conta', vr);

  // Riscrivere il saldo riparte da zero: le spunte fatte prima non contano più, quelle dopo sì.
  const x = await spesa({ nome: 'X', importo: '100' }), y = await spesa({ nome: 'Y', importo: '30' });
  await spunta(x.id);
  verifica(await effettivo() === '900.00', 'prima della riscrittura: 900');
  const nuovo = (await r('PUT', '/saldo', A, { importo: '800' })).j;
  verifica(nuovo.effettivo === '800.00' && nuovo.uscite_spuntate === '0.00', 'riscritto 800: le spunte di prima non contano più', nuovo);
  await spunta(y.id);
  verifica(await effettivo() === '770.00', 'dopo la riscrittura una nuova spunta abbassa: 770', await saldo());
  await togli(x.id);
  verifica(await effettivo() === '770.00', 'togliere una spunta di prima non cambia il saldo riscritto', await saldo());
  await togli(y.id);
  verifica(await effettivo() === '800.00', 'togliere la spunta di dopo lo riporta a 800');
  verifica((await r('PUT', '/saldo', A, { importo: null })).j.effettivo === null, 'saldo tolto: di nuovo vuoto');

  // Una spesa senza conto va bene; un conto si elimina anche se usato (la spesa e la rata restano, senza etichetta); i giroconti non ci sono più.
  const senza = await r('POST', '/spese-previste', A, { nome: 'Senza conto', importo: '40', giorno_mese: 20 });
  verifica(senza.s === 201 && senza.j.conto_id === null, 'una spesa senza conto è valida', senza.j);
  const giro = await spesa({ nome: 'Ex giroconto', importo: '10', a_conto_id: principale.id });
  verifica(!('a_conto_id' in giro), 'il conto di arrivo non esiste più', giro);
  const usata = await spesa({ nome: 'Usa il conto', importo: '10', conto_id: principale.id });
  const sPrincipale = await spunta(usata.id);
  verifica((await r('DELETE', '/conti/' + principale.id, A)).s === 204, 'un conto usato da spese e rate si elimina (204)');
  verifica((await r('GET', '/spese-previste/' + usata.id, A)).j.conto_id === null, 'la spesa resta, senza conto');
  verifica((await r('GET', '/rate/' + rata.id, A)).j.conto_id === null, 'la rata resta, senza conto');
  verifica(sPrincipale.s === 201 && (await togli(usata.id)).s === 204, 'la spunta di una spesa il cui conto è stato eliminato si toglie');

  // Annuali spuntate in anticipo (decisione 72, aggiunte): in un mese in cui non scadono la spunta vale per la scadenza in corso, abbassa il saldo, il
  // salvadanaio collegato scende, la prossima scadenza passa alla successiva e nel mese della scadenza non è tra quelle che devono ancora uscire.
  await r('PUT', '/saldo', A, { importo: '1000' });
  const tra = (m) => { const [a, mm] = mese.split('-').map(Number), t = a * 12 + mm - 1 + m; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const scadenzaTra3 = `${tra(3)}-10`;
  const anticipo = (await r('POST', '/spese-previste', A, { nome: 'Assicurazione', importo: '300', ogni_mesi: 6, prossima_scadenza: scadenzaTra3, metti_da_parte: true })).j;
  const trovaA = async (m) => (await r('GET', `/spese-previste?mese=${m}`, A)).j.spese.find((x) => x.id === anticipo.id);
  const salv = async () => (await r('GET', '/salvadanai', A)).j;
  const cercaS = (alberi) => { for (const n of alberi) { if (n.spesa_id === anticipo.id) return n; const f = cercaS(n.figli ?? []); if (f) return f; } };
  const dentroS = async () => { const x = cercaS(await salv()); return x ? { dentro: x.dentro, scadenza: x.scadenza } : null; };
  verifica((await trovaA(mese)).nel_mese === false && (await trovaA(mese)).uscita === false, 'annuale non in scadenza: non è nel mese e non è uscita', await trovaA(mese));
  const sp0 = await dentroS();
  verifica(sp0 && sp0.scadenza === scadenzaTra3, 'il salvadanaio collegato ha la scadenza della prima scadenza', sp0);
  const idS = cercaS(await salv()).id;
  await r('POST', '/salvadanai/sposta', A, { da: null, a: idS, importo: '200' });
  const prima0 = await effettivo();
  const anti = await r('POST', `/spese-previste/${anticipo.id}/spunta`, A, { mese });
  verifica(anti.s === 201 && await effettivo() === (Number(prima0) - 300).toFixed(2), 'annuale spuntata in un mese senza scadenza: il saldo scende di 300', [anti.j, await effettivo()]);
  verifica((await trovaA(mese)).uscita === true, 'annuale spuntata in anticipo: risulta uscita');
  verifica((await trovaA(tra(1))).uscita === true, 'anche nel mese dopo (ancora prima della scadenza) risulta uscita');
  verifica((await r('POST', `/spese-previste/${anticipo.id}/spunta`, A, { mese })).s === 409, 'spuntarla due volte: 409');
  const sp1 = await dentroS();
  verifica(sp1 && sp1.dentro === '0.00', 'il salvadanaio collegato scende (200 versati, la quota è 300: si svuota)', sp1);
  verifica(sp1 && sp1.scadenza === `${tra(9)}-10`, 'dopo il pagamento la prossima scadenza del salvadanaio passa alla successiva', sp1);
  const delMese = await trovaA(tra(3));
  verifica(delMese.nel_mese === true && delMese.uscita === true, 'nel mese della scadenza conta nel mese ma non deve più uscire', delMese);
  const dopo = await trovaA(tra(4));
  verifica(dopo.uscita === false && dopo.nel_mese === false, 'passato il mese della scadenza la casella torna vuota (quella dopo)', dopo);
  verifica((await r('DELETE', `/spese-previste/${anticipo.id}/spunta?mese=${tra(2)}`, A)).s === 204 && await effettivo() === prima0, 'tolta la spunta il saldo torna com\'era', await effettivo());
  const sp2 = await dentroS();
  verifica((await trovaA(mese)).uscita === false && sp2 && sp2.dentro === '200.00' && sp2.scadenza === scadenzaTra3, 'tolta la spunta tornano la casella, il salvadanaio e la scadenza', sp2);
  // Spuntata nel mese della scadenza: vale lo stesso e la si toglie da lì.
  const nelMese = await r('POST', `/spese-previste/${anticipo.id}/spunta`, A, { mese: tra(3) });
  verifica(nelMese.s === 201 && (await trovaA(tra(3))).uscita === true && (await trovaA(mese)).uscita === true, 'spuntata nel mese della scadenza: vale per quella scadenza');
  verifica((await r('DELETE', `/spese-previste/${anticipo.id}/spunta?mese=${tra(3)}`, A)).s === 204 && await effettivo() === prima0, 'tolta dal mese della scadenza il saldo torna');

  // «Metti da parte» non vale per le mensili.
  const mensile = await r('POST', '/spese-previste', A, { nome: 'Mensile da parte', importo: '10', giorno_mese: 3, metti_da_parte: true });
  verifica(mensile.s === 400, 'una mensile non si mette da parte (400)', mensile.j);
} finally {
  try {
    psql(`delete from utenti where email like 'spunta%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, spunta-b${n}@prova.it`); }
}

console.log(`prove della spunta: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
