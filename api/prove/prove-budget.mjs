// Prove del budget semplice (e delle sottocategorie e delle colonne Previste e Uscite della pagina Categorie) e dell'eliminazione dei conti (decisione 71).
// Uso: node api/prove/prove-budget.mjs [indirizzo]   (di base http://localhost:3000)
// Serve l'API con REGISTRAZIONE_APERTA=si: crea un utente di prova nuovo e alla fine lo cancella con i suoi dati (con `docker compose exec db psql`).
//  - il budget è un limite di spesa: conta tutte le uscite della categoria nel mese, a mano o da una spunta; tolta la spunta non conta più;
//    i giroconti non contano; niente divisione, condivisione e note;
//  - un conto da cui parte (o su cui arriva) una spesa o una rata non si elimina (409, «sposta prima le spese su un altro conto»);
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
const email = `budget${n}@prova.it`;
const reg = await r('POST', '/accesso/registrazione', null, { email, nome: 'Anna', password: 'password-lunga-a' });
if (reg.s !== 201 && reg.s !== 200) { console.log('Registrazione chiusa? Avvia l\'API con REGISTRAZIONE_APERTA=si', reg.s, reg.j); process.exit(1); }
const A = reg.j.token;
const altro = (await r('POST', '/accesso/registrazione', null, { email: `budget-b${n}@prova.it`, nome: 'Bruno', password: 'password-lunga-b' })).j;

try {
  const conto = async (nome, saldo) => {
    const k = (await r('POST', '/conti', A, { nome })).j;
    await r('PUT', `/conti/${k.id}/saldo`, A, { importo: saldo });
    return k;
  };
  const principale = await conto('Principale', '1000');
  const secondo = await conto('Secondo', '200');
  const mese = (await r('GET', '/spese-previste', A)).j.periodo.mese;
  const cats = (await r('GET', '/categorie?formato=elenco', A)).j;
  const casa = cats.find((c) => c.nome === 'Casa' && !c.padre_id);
  const cibo = (await r('POST', '/categorie', A, { nome: 'Cibo prova' })).j;
  const budgetDi = async (id) => (await r('GET', `/budget?mese=${mese}`, A)).j.budget.find((b) => b.id === id);
  const spesa = async (corpo) => (await r('POST', '/spese-previste', A, { importo: '100', giorno_mese: 15, conto_id: principale.id, ...corpo })).j;
  const spunta = (id) => r('POST', `/spese-previste/${id}/spunta`, A, { mese });
  const togli = (id) => r('DELETE', `/spese-previste/${id}/spunta?mese=${mese}`, A);

  // Il budget: categoria, cifra, attivo. Niente note, divisione, condivisione.
  const bud = (await r('POST', '/budget', A, { categoria_id: cibo.id, importo: '300', note: 'ignorata' })).j;
  verifica(bud.categoria === 'Cibo prova' && bud.importo === '300.00' && bud.attivo === true && bud.speso === '0.00', 'budget creato: categoria, cifra, attivo, speso 0', bud);
  verifica(!('note' in bud) && !('condiviso' in bud) && !('mia_percentuale' in bud) && !('mia_quota' in bud), 'il budget non ha note, condivisione né quote', Object.keys(bud));
  verifica((await r('POST', '/condivisioni', A, { voce: 'budget', id: bud.id, utente_id: altro.utente_id })).s === 400, 'un budget non si condivide (400)');
  verifica((await r('PUT', `/budget/${bud.id}/quote`, A, { quote: [] })).s === 404, 'un budget non ha quote (404)');
  verifica((await r('PATCH', `/budget/${bud.id}`, A, { importo: '300', note: 'x' })).s === 200, 'una nota nel corpo è ignorata, non dà errore');

  // Uscita scritta a mano: conta.
  const man = await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '50', conto_id: principale.id, categoria_id: cibo.id, descrizione: 'Spesa a mano' });
  verifica(man.s === 201, 'uscita a mano creata', man.j);
  verifica((await budgetDi(bud.id)).speso === '50.00', 'uscita a mano: conta nel budget', (await budgetDi(bud.id)).speso);

  // Spesa spuntata: conta; tolta la spunta non conta più.
  const abbonamento = await spesa({ nome: 'Abbonamento cibo', importo: '100', categoria_id: cibo.id });
  verifica((await budgetDi(bud.id)).speso === '50.00', 'spesa non spuntata: non conta ancora');
  verifica((await spunta(abbonamento.id)).s === 201, 'spesa spuntata');
  const dopo = await budgetDi(bud.id);
  verifica(dopo.speso === '150.00' && dopo.sforo === '0.00', 'spesa spuntata: conta nel budget (50 + 100)', dopo);
  verifica((await togli(abbonamento.id)).s === 204 && (await budgetDi(bud.id)).speso === '50.00', 'tolta la spunta: non conta più', (await budgetDi(bud.id)).speso);

  // Sforo: si conta tutto lo stesso.
  await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '400', conto_id: principale.id, categoria_id: cibo.id, descrizione: 'Grossa' });
  const sf = await budgetDi(bud.id);
  verifica(sf.speso === '450.00' && sf.sforo === '150.00', 'sforo: speso 450, sforato di 150', sf);

  // Giroconto (senza categoria): non conta. Spuntato, il budget non cambia.
  const giro = await spesa({ nome: 'Giro', importo: '70', a_conto_id: secondo.id });
  await spunta(giro.id);
  verifica((await budgetDi(bud.id)).speso === '450.00', 'giroconto spuntato: non conta nel budget', (await budgetDi(bud.id)).speso);
  verifica((await r('POST', '/spese-previste', A, { nome: 'Giro con categoria', importo: '5', giorno_mese: 3, conto_id: principale.id, a_conto_id: secondo.id, categoria_id: cibo.id })).s === 400, 'un giroconto non può avere categoria (400)');
  await togli(giro.id);

  // Uscita di un'altra categoria: non conta.
  await r('POST', '/movimenti', A, { tipo: 'uscita', importo: '9', conto_id: principale.id, categoria_id: casa.id, descrizione: 'Altra categoria' });
  verifica((await budgetDi(bud.id)).speso === '450.00', 'uscita di un\'altra categoria: non conta');

  // Il budget conta anche le sottocategorie (come l'Excel): uscite in figlia e nipote contano nel budget del padre; le uscite di una categoria
  // accanto (o del padre, per il budget di una figlia) no. Le colonne Previste e Uscite di /categorie/spese sono dirette: la somma sui rami la fa l'app.
  const svago = (await r('POST', '/categorie', A, { nome: 'Svago prova' })).j;
  const cinema = (await r('POST', '/categorie', A, { nome: 'Cinema prova', padre_id: svago.id })).j;
  const popcorn = (await r('POST', '/categorie', A, { nome: 'Popcorn prova', padre_id: cinema.id })).j;
  const budSvago = (await r('POST', '/budget', A, { categoria_id: svago.id, importo: '100' })).j;
  const budCinema = (await r('POST', '/budget', A, { categoria_id: cinema.id, importo: '40' })).j;
  const uscita = (cat, importo) => r('POST', '/movimenti', A, { tipo: 'uscita', importo, conto_id: principale.id, categoria_id: cat, descrizione: 'Prova sotto' });
  await uscita(svago.id, '10');
  await uscita(cinema.id, '20');
  await uscita(popcorn.id, '5');
  await uscita(casa.id, '3');
  const bs = await budgetDi(budSvago.id), bc = await budgetDi(budCinema.id);
  verifica(bs.speso === '35.00' && bs.uscite.length === 3, 'il budget del padre conta le uscite di figlia e nipote (10 + 20 + 5)', bs);
  verifica(bc.speso === '25.00' && bc.uscite.length === 2, 'il budget della figlia conta la figlia e il nipote, non il padre (20 + 5)', bc);
  const spCat = (await r('GET', `/categorie/spese?mese=${mese}`, A)).j;
  const riga = (id) => spCat.find((x) => x.categoria_id === id);
  verifica(riga(svago.id)?.uscite === '10.00' && riga(cinema.id)?.uscite === '20.00' && riga(popcorn.id)?.uscite === '5.00', 'colonna Uscite: uscite vere di ogni categoria, senza le figlie', spCat);
  // Una spesa prevista (non spuntata) pesa nelle Previste e non nelle Uscite; spuntata, pesa in entrambe.
  const cine = await spesa({ nome: 'Abbonamento cinema', importo: '12', categoria_id: popcorn.id });
  verifica(riga(popcorn.id)?.uscite === '5.00' && (await r('GET', `/categorie/spese?mese=${mese}`, A)).j.find((x) => x.categoria_id === popcorn.id).previste === '12.00', 'spesa non spuntata: solo nelle Previste', (await r('GET', `/categorie/spese?mese=${mese}`, A)).j);
  await spunta(cine.id);
  const dopoSp = (await r('GET', `/categorie/spese?mese=${mese}`, A)).j.find((x) => x.categoria_id === popcorn.id);
  verifica(dopoSp.previste === '12.00' && dopoSp.uscite === '17.00', 'spesa spuntata: Previste 12 e Uscite 5 + 12', dopoSp);
  verifica((await budgetDi(budSvago.id)).speso === '47.00', 'la spesa spuntata in una nipote conta nel budget del nonno', (await budgetDi(budSvago.id)).speso);
  await togli(cine.id);
  verifica((await budgetDi(budSvago.id)).speso === '35.00', 'tolta la spunta lo speso del padre scende');
  for (const b of [budSvago, budCinema]) await r('DELETE', `/budget/${b.id}`, A);
  await r('DELETE', `/spese-previste/${cine.id}`, A);
  await r('DELETE', `/categorie/${svago.id}?sposta_su=${casa.id}`, A);
  // le uscite di Casa tornano a quelle di prima per il conteggio che segue
  const nCasaDopo = psql(`select count(*) from movimenti where categoria_id = '${casa.id}' and utente_id = (select id from utenti where email = '${email}')`);
  const extra = Number(nCasaDopo) - 1;

  // /categorie dice quante uscite ha ogni categoria e il suo budget.
  const catCibo = (await r('GET', '/categorie?formato=elenco', A)).j.find((c) => c.id === cibo.id);
  verifica(catCibo.budget?.id === bud.id && catCibo.n_uscite === 2, 'la categoria dice il suo budget e le sue uscite', catCibo);

  // Eliminare una categoria: con un budget no; poi, senza budget, le uscite (anche da spunta) passano alla categoria scelta.
  verifica((await r('DELETE', `/categorie/${cibo.id}`, A)).s === 409, 'una categoria con un budget non si elimina (409)');
  verifica((await spunta(abbonamento.id)).s === 201, 'rispunto l\'abbonamento (uscita da spunta con la categoria)');
  verifica((await r('DELETE', `/budget/${bud.id}`, A)).s === 204 && (await r('GET', `/budget/${bud.id}`, A)).s === 404, 'budget eliminato');
  verifica((await r('DELETE', `/categorie/${cibo.id}`, A)).s === 409, 'una categoria con uscite si elimina solo scegliendo dove spostarle (409)');
  verifica((await r('DELETE', `/categorie/${cibo.id}?sposta_su=${casa.id}`, A)).s === 204, 'eliminata spostando su Casa');
  const nelleCasa = psql(`select count(*) from movimenti where categoria_id = '${casa.id}' and utente_id = (select id from utenti where email = '${email}')`);
  verifica(nelleCasa === String(4 + extra), 'le uscite di Cibo (2 a mano e 1 da spunta) sono passate a Casa, dove c era già 1 (più quelle spostate dalla prova sulle sottocategorie)', nelleCasa);
  await togli(abbonamento.id);

  // Un conto con spese (o rate) non si elimina; senza, sì.
  const daEliminare = await conto('Da eliminare', '10');
  const sp = await spesa({ nome: 'Parte da qui', importo: '20', conto_id: daEliminare.id, categoria_id: casa.id });
  const e1 = await r('DELETE', `/conti/${daEliminare.id}`, A);
  verifica(e1.s === 409 && /sposta prima le spese su un altro conto/.test(e1.j?.errore ?? ''), 'conto con una spesa che parte da lì: 409 con messaggio chiaro', e1);
  verifica((await r('GET', '/conti', A)).j.some((c) => c.id === daEliminare.id), 'il conto c\'è ancora');
  const rata = await r('POST', '/rate', A, { oggetto: 'Rata prova', importo_rata: '10', numero_rate: 3, prima_scadenza: `${mese}-20`, conto_id: secondo.id, categoria_id: casa.id });
  if (rata.s === 201) verifica((await r('DELETE', `/conti/${secondo.id}`, A)).s === 409, 'conto con una rata: 409');
  else console.log('SALTATA la prova della rata (corpo non accettato):', rata.s, JSON.stringify(rata.j));
  // Spesa che porta i soldi su un conto (giroconto verso): anche questo lo blocca.
  const giroVerso = await spesa({ nome: 'Verso il da eliminare', importo: '5', a_conto_id: daEliminare.id });
  await r('DELETE', `/spese-previste/${sp.id}`, A);
  verifica((await r('DELETE', `/conti/${daEliminare.id}`, A)).s === 409, 'conto su cui arriva un giroconto: 409');
  await r('DELETE', `/spese-previste/${giroVerso.id}`, A);
  verifica((await r('DELETE', `/conti/${daEliminare.id}`, A)).s === 204, 'senza più spese il conto si elimina (204)');
  verifica((await r('DELETE', `/conti/${principale.id}`, altro.token)).s === 404, 'un conto che non vedi: 404');
} finally {
  try {
    psql(`delete from utenti where email like 'budget%${n}@prova.it' or email = '${email}'`);
  } catch { console.log(`Utenti di prova da cancellare a mano: ${email}, budget-b${n}@prova.it`); }
}

console.log(`prove del budget: ${ok} passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
