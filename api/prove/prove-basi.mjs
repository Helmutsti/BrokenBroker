import { execSync } from 'node:child_process';
const B = 'http://localhost:3000';
const cartella = process.argv[2];
let ok = 0, ko = 0;
const verifica = (cond, msg) => { if (cond) ok++; else { ko++; console.log('FALLITO:', msg); } };
async function r(metodo, path, token, body) {
  const res = await fetch(B + path, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  return { s: res.status, j: t ? JSON.parse(t) : null };
}
const sql = (q) => execSync(`docker compose exec -T db psql -U fp_admin -d finanza -tAc "${q}"`, { cwd: cartella, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

const n = Date.now();
verifica((await r('GET', '/salute')).s === 200, 'salute');
const a = await r('POST', '/accesso/registrazione', null, { email: `a${n}@t.it`, nome: 'Anna', password: 'password-lunga-a' });
const b = await r('POST', '/accesso/registrazione', null, { email: `b${n}@t.it`, nome: 'Bruno', password: 'password-lunga-b' });
verifica(a.s === 201 && b.s === 201, 'registrazione');
const A = a.j.token, Bt = b.j.token;
verifica((await r('POST', '/accesso/registrazione', null, { email: `A${n}@T.it`, nome: 'X', password: 'password-lunga-x' })).s === 409, 'email doppia 409');
verifica((await r('POST', '/accesso/accesso', null, { email: `a${n}@t.it`, password: 'sbagliata' })).s === 401, 'password errata 401');
verifica((await r('POST', '/accesso/accesso', null, { email: `a${n}@t.it`, password: 'password-lunga-a' })).s === 200, 'accesso ok');

const albero = (await r('GET', '/categorie', A)).j;
verifica(albero.length === 12, `12 radici, trovate ${albero.length}`);
const elenco = (await r('GET', '/categorie?formato=elenco', A)).j;
verifica(elenco.length === 61, `61 categorie, trovate ${elenco.length}`);
const bollette = albero.find((x) => x.nome === 'Casa').figli.find((x) => x.nome === 'Bollette');
verifica(bollette.figli.length === 3, 'bollette 3 figli');
verifica(albero.find((x) => x.nome === 'Entrate').figli.every((x) => x.tipo === 'entrata'), 'entrate tipo entrata');
const supermercato = elenco.find((x) => x.nome === 'Supermercato');

verifica((await r('PATCH', '/profilo', A, { stipendio_netto: '1800', giorno_paga: 27 })).j.stipendio_netto === '1800.00', 'profilo');
const sulConto = (await r('PATCH', '/profilo', A, { sul_conto: '1234.50' })).j;
verifica(sulConto.sul_conto === '1234.50' && sulConto.sul_conto_al, 'il saldo unico è sul profilo (sul_conto)');

// I conti sono solo etichette (decisione 59): nome, icona, archiviato.
const comune = (await r('POST', '/conti', A, { nome: 'Revolut comune' })).j;
const privato = (await r('POST', '/conti', A, { nome: 'Intesa', icona: 'piggy-bank' })).j;
verifica(comune.nome === 'Revolut comune' && comune.icona === 'landmark' && comune.archiviato === false && !('saldo' in comune) && !('mio' in comune), 'conto creato (solo etichetta)');
verifica(privato.icona === 'piggy-bank', 'icona scelta');

const m1 = await r('POST', '/movimenti', A, { tipo: 'uscita', conto_id: privato.id, importo: '45.30', descrizione: 'Esselunga', categoria_id: supermercato.id, data: '2026-10-20' });
verifica(m1.s === 201, 'movimento');
const m2 = await r('POST', '/movimenti', A, { tipo: 'entrata', importo: '12' });
verifica(m2.s === 201, 'movimento senza conto');
const mov = (await r('GET', '/movimenti', A)).j.movimenti;
verifica(mov.length === 2 && mov.find((x) => x.id === m1.j.id).conto === 'Intesa' && mov.find((x) => x.id === m1.j.id).categoria === 'Supermercato', 'elenco movimenti');
verifica((await r('GET', `/movimenti?conto=${privato.id}`, A)).j.movimenti.length === 1, 'filtro per conto');
verifica((await r('POST', '/movimenti', A, { tipo: 'giroconto', da_conto_id: privato.id, a_conto_id: comune.id, importo: '50' })).s === 400, 'giroconto non esiste più');

// Bruno non vede niente di Anna
verifica((await r('GET', '/conti', Bt)).j.length === 0, 'B non vede conti di A');
verifica((await r('GET', '/conti/' + privato.id, Bt)).s === 404, 'B 404 su conto A');
verifica((await r('GET', '/movimenti', Bt)).j.movimenti.length === 0, 'B non vede movimenti A');
verifica((await r('POST', '/movimenti', Bt, { tipo: 'uscita', conto_id: comune.id, importo: '1' })).s === 404, 'B non usa il conto di A');
verifica((await r('PATCH', '/conti/' + comune.id, Bt, { nome: 'Revolut casa' })).s === 404, 'B non modifica il conto di A');
verifica((await r('DELETE', '/conti/' + comune.id, Bt)).s === 404, 'B non cancella il conto di A');
verifica((await r('PATCH', '/movimenti/' + m1.j.id, Bt, { importo: '1' })).s === 404, 'B non modifica il movimento di A');

// I conti non si condividono: né dall'API né dal database
verifica((await r('POST', '/condivisioni', A, { voce: 'conto', id: comune.id, email: `b${n}@t.it` })).s === 400, 'condivisione di un conto: 400');
verifica(sql('select 1') === '1', 'il database risponde da psql');
let rifiutata = false;
try { sql(`insert into condivisioni (proprietario_id, condiviso_con_id, conto_id) values ('${a.j.utente_id}', '${b.j.utente_id}', '${comune.id}')`); } catch { rifiutata = true; }
verifica(rifiutata, 'il database rifiuta la condivisione di un conto');
verifica((await r('GET', '/conti', Bt)).j.length === 0, 'B continua a non vedere il conto');

// Categorie
const sport = elenco.find((x) => x.nome === 'Sport');
verifica((await r('PATCH', '/categorie/' + sport.id, A, { colore: '#FF8800', icona: 'bici' })).j.colore === '#FF8800', 'categoria colore');
const salute = albero.find((x) => x.nome === 'Salute e cura');
verifica((await r('PATCH', '/categorie/' + salute.id, A, { padre_id: sport.id })).s === 400, 'ciclo categorie bloccato');
const spesa = (await r('POST', '/spese-previste', A, { nome: 'Spesa', importo: '50', categoria_id: supermercato.id, conto_id: comune.id })).j;
verifica((await r('DELETE', '/categorie/' + supermercato.id, A)).s === 409, 'categoria in uso 409');
const cibo = albero.find((x) => x.nome === 'Cibo');
verifica((await r('DELETE', `/categorie/${supermercato.id}?sposta_su=${cibo.id}`, A)).s === 204, 'cancella con sposta_su');
verifica((await r('GET', '/spese-previste/' + spesa.id, A)).j.categoria_id === cibo.id, 'spesa spostata su Cibo');
verifica((await r('PATCH', '/categorie/' + cibo.id, Bt, { nome: 'x' })).s === 404, 'B non modifica categorie di A');

// Eliminare un conto: le voci restano senza etichetta
verifica((await r('DELETE', '/conti/' + privato.id, A)).s === 204, 'conto eliminato');
verifica((await r('GET', '/movimenti', A)).j.movimenti.find((x) => x.id === m1.j.id)?.conto_id === null, 'il movimento resta senza conto');

// Uscita
verifica((await r('POST', '/accesso/uscita', A)).s === 204, 'uscita');
verifica((await r('GET', '/conti', A)).s === 401, 'token chiuso 401');
verifica((await r('GET', '/conti')).s === 401, 'senza token 401');
console.log(`OK ${ok}, falliti ${ko}`);
