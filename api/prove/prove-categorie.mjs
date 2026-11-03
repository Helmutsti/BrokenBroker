// Prove delle colonne Previste e Uscite della pagina Categorie, dell'eliminazione delle categorie e dell'eliminazione dei conti (decisioni 71 e 72; i budget non esistono più).
// Uso: node api/prove/prove-categorie.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea un utente di prova nuovo e alla fine lo cancella con i suoi dati (con `docker compose exec db psql`).
//  - le uscite di una categoria nel mese (a mano o da una spunta) contano nella colonna Uscite; tolta la spunta non contano più;
//  - un conto è solo un'etichetta: si elimina sempre, le spese e le rate che lo avevano restano senza conto;
//  - eliminando una categoria le sue uscite passano alla categoria scelta (anche quelle nate da una spunta).

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
const email = `categorie${n}@prova.it`;
const reg = await r('POST', '/accesso/registrazione', null, { email, nome: 'Anna', password: 'password-lunga-a' });
if (reg.s !== 201 && reg.s !== 200) { console.log('Registrazione chiusa? Avvia l\'API con REGISTRAZIONE_APERTA=si', reg.s, reg.j); process.exit(1); }
const A = reg.j.token;
const altro = (await r('POST', '/accesso/registrazione', null, { email: `categorie-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;

try {
  const conto = async (nome) => (await r('POST', '/conti', A, { nome })).j;
  const principale = await conto('Principale');
  const secondo = await conto('Secondo');
  const mese = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const cats = (await r('GET', '/categorie?formato=elenco', A)).j;
  const casa = cats.find((c) => c.nome === 'Casa' && !c.padre_id);
  const cibo = (await r('POST', '/categorie', A, { nome: 'Cibo prova' })).j;
  const spesa = async (corpo) => (await r('POST', '/spese-previste', A, { importo: '100', giorno_mese: 15, conto_id: principale.id, ...corpo })).j;
  const spunta = (id) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togli = (id) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);
  const righeSpese = async () => (await r('GET', `/categorie/spese?mese=${mese}`, A)).j;
  const rigaDi = async (id) => (await righeSpese()).find((x) => x.categoria_id === id);

  // Uscita scritta a mano e spesa spuntata: entrambe sono uscite con la categoria (colonna Uscite).
  const man = await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '50', conto_id: principale.id, categoria_id: cibo.id, descrizione: 'Spesa a mano' });
  verifica(man.s === 201, 'uscita a mano creata', man.j);
  verifica((await rigaDi(cibo.id))?.uscite === '50.00', 'uscita a mano: conta nelle Uscite della categoria', await rigaDi(cibo.id));
  const abbonamento = await spesa({ nome: 'Abbonamento cibo', importo: '100', categoria_id: cibo.id });
  const nonSpuntata = await rigaDi(cibo.id);
  verifica(nonSpuntata?.uscite === '50.00' && nonSpuntata?.previste === '100.00', 'spesa non spuntata: solo nelle Previste', nonSpuntata);
  verifica((await spunta(abbonamento.id)).s === 201, 'spesa spuntata');
  verifica((await rigaDi(cibo.id))?.uscite === '150.00', 'spesa spuntata: conta nelle Uscite (50 + 100)', await rigaDi(cibo.id));
  verifica((await togli(abbonamento.id)).s === 204 && (await rigaDi(cibo.id))?.uscite === '50.00', 'tolta la spunta: non conta più', await rigaDi(cibo.id));

  await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '400', conto_id: principale.id, categoria_id: cibo.id, descrizione: 'Grossa' });
  // Spesa senza conto (il conto è solo un'etichetta): spuntata conta lo stesso.
  const senzaConto = (await r('POST', '/spese-previste', A, { nome: 'Senza conto', importo: '70', giorno_mese: 3, categoria_id: cibo.id })).j;
  await spunta(senzaConto.id);
  verifica((await rigaDi(cibo.id))?.uscite === '520.00', 'spesa senza conto spuntata: conta nelle Uscite (450 + 70)', await rigaDi(cibo.id));
  await togli(senzaConto.id);
  verifica((await rigaDi(cibo.id))?.uscite === '450.00', 'tolta la spunta: torna a 450', await rigaDi(cibo.id));
  await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '9', conto_id: principale.id, categoria_id: casa.id, descrizione: 'Altra categoria' });
  verifica((await rigaDi(cibo.id))?.uscite === '450.00', 'uscita di un\'altra categoria: non conta');

  // Le colonne Previste e Uscite sono dirette (senza le figlie): la somma sui rami la fa l'app.
  const svago = (await r('POST', '/categorie', A, { nome: 'Svago prova' })).j;
  const cinema = (await r('POST', '/categorie', A, { nome: 'Cinema prova', padre_id: svago.id })).j;
  const popcorn = (await r('POST', '/categorie', A, { nome: 'Popcorn prova', padre_id: cinema.id })).j;
  const uscita = (cat, importo) => r('POST', '/movimenti', A, { tipo: 'uscita', importo, conto_id: principale.id, categoria_id: cat, descrizione: 'Prova sotto' });
  await uscita(svago.id, '10');
  await uscita(cinema.id, '20');
  await uscita(popcorn.id, '5');
  await uscita(casa.id, '3');
  verifica((await rigaDi(svago.id))?.uscite === '10.00' && (await rigaDi(cinema.id))?.uscite === '20.00' && (await rigaDi(popcorn.id))?.uscite === '5.00',
    'colonna Uscite: uscite vere di ogni categoria, senza le figlie', await righeSpese());
  const cine = await spesa({ nome: 'Abbonamento cinema', importo: '12', categoria_id: popcorn.id });
  const prima = await rigaDi(popcorn.id);
  verifica(prima?.uscite === '5.00' && prima?.previste === '12.00', 'spesa non spuntata: solo nelle Previste', prima);
  await spunta(cine.id);
  const dopoSp = await rigaDi(popcorn.id);
  verifica(dopoSp.previste === '12.00' && dopoSp.uscite === '17.00', 'spesa spuntata: Previste 12 e Uscite 5 + 12', dopoSp);
  await togli(cine.id);
  await r('DELETE', `/spese-previste/${cine.id}`, A);
  await r('DELETE', `/categorie/${svago.id}?sposta_su=${casa.id}`, A);
  // le uscite di Casa tornano a quelle di prima per il conteggio che segue
  const nCasaDopo = psql(`select count(*) from movimenti where categoria_id = '${casa.id}' and utente_id = (select id from utenti where email = '${email}')`);
  const extra = Number(nCasaDopo) - 1;

  // /categorie dice quante uscite ha ogni categoria, senza budget.
  const catCibo = (await r('GET', '/categorie?formato=elenco', A)).j.find((c) => c.id === cibo.id);
  verifica(catCibo.n_uscite === 2 && !('budget' in catCibo), 'la categoria dice le sue uscite, niente budget', catCibo);
  verifica((await r('GET', '/budget', A)).s === 404, 'la rotta dei budget non esiste più (404)');

  // Eliminare una categoria: le uscite (anche da spunta) passano alla categoria scelta.
  verifica((await spunta(abbonamento.id)).s === 201, 'rispunto l\'abbonamento (uscita da spunta con la categoria)');
  verifica((await r('DELETE', `/categorie/${cibo.id}`, A)).s === 409, 'una categoria con uscite si elimina solo scegliendo dove spostarle (409)');
  verifica((await r('DELETE', `/categorie/${cibo.id}?sposta_su=${casa.id}`, A)).s === 204, 'eliminata spostando su Casa');
  const nelleCasa = psql(`select count(*) from movimenti where categoria_id = '${casa.id}' and utente_id = (select id from utenti where email = '${email}')`);
  verifica(nelleCasa === String(4 + extra), 'le uscite di Cibo (2 a mano e 1 da spunta) sono passate a Casa, dove c era già 1 (più quelle spostate dalla prova sulle sottocategorie)', nelleCasa);
  await togli(abbonamento.id);

  // Un conto si elimina sempre: le spese e le rate che lo avevano restano, senza etichetta; le uscite restano, senza conto.
  const daEliminare = await conto('Da eliminare');
  const sp = await spesa({ nome: 'Parte da qui', importo: '20', conto_id: daEliminare.id, categoria_id: casa.id });
  const rata = await r('POST', '/rate', A, { oggetto: 'Rata prova', importo_rata: '10', numero_rate: 3, prima_scadenza: `${mese}-20`, conto_id: daEliminare.id });
  const uscitaConto = await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '4', conto_id: daEliminare.id, categoria_id: casa.id, descrizione: 'Con il conto da eliminare' });
  verifica(sp.conto === 'Da eliminare' && rata.s === 201 && rata.j.conto === 'Da eliminare' && uscitaConto.s === 201, 'spesa, rata e uscita con il conto come etichetta', [sp.conto, rata.j]);
  verifica((await r('DELETE', `/conti/${principale.id}`, altro.token)).s === 404, 'un conto che non vedi: 404');
  verifica((await r('DELETE', `/conti/${daEliminare.id}`, A)).s === 204, "conto usato da una spesa, una rata e un'uscita: si elimina (204)");
  verifica(!(await r('GET', '/conti', A)).j.some((c) => c.id === daEliminare.id), "il conto non c'è più");
  verifica((await r('GET', `/spese-previste/${sp.id}`, A)).j.conto_id === null && (await r('GET', `/rate/${rata.j.id}`, A)).j.conto_id === null, 'la spesa e la rata restano, senza conto');
  verifica((await r('GET', '/movimenti', A)).j.movimenti.find((x) => x.id === uscitaConto.j.id)?.da_conto_id === null, "l'uscita resta, senza conto");
  verifica((await r('DELETE', `/conti/${secondo.id}`, A)).s === 204, 'un conto non usato si elimina (204)');
} finally {
  try {
    psql(`delete from utenti where email like 'categorie%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, categorie-b${n}@prova.it`); }
}

console.log(`prove delle categorie e dei conti: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
