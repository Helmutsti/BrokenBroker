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
const sql = (q) => execSync(`docker compose exec -T db psql -U fp_admin -d finanza -tAc "${q}"`, { cwd: cartella }).toString().trim();

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

const comune = (await r('POST', '/conti', A, { nome: 'Revolut comune', tipo: 'corrente', saldo_iniziale: '100', data_saldo_iniziale: '2026-10-01' })).j;
const privato = (await r('POST', '/conti', A, { nome: 'Intesa', tipo: 'corrente', saldo_iniziale: '500.00', data_saldo_iniziale: '2026-10-01' })).j;
verifica(comune.saldo === '100.00' && comune.mio === true && comune.condiviso === false, 'conto creato');

const m1 = await r('POST', '/movimenti', A, { conto_id: privato.id, importo: '-45.30', esercente: 'Esselunga', categoria_id: supermercato.id, data: '2026-10-20' });
verifica(m1.s === 201, 'movimento');
const m2 = await r('POST', '/movimenti', A, { importo: '-12', esercente: 'esselunga' });
verifica(m2.s === 201 && m2.j.conto_id === privato.id && m2.j.categoria_id === supermercato.id, 'inserimento veloce con suggerimento');
verifica((await r('GET', '/conti/' + privato.id, A)).j.saldo === '442.70', 'saldo dopo movimenti');

const t = await r('POST', '/movimenti/trasferimento', A, { da_conto_id: privato.id, a_conto_id: comune.id, importo: '50', data: '2026-10-21' });
verifica(t.s === 201, 'trasferimento');
verifica((await r('GET', '/conti/' + comune.id, A)).j.saldo === '150.00', 'saldo comune dopo trasferimento');
verifica((await r('PATCH', '/movimenti/' + t.j.movimenti[0].id, A, { importo: '10' })).s === 400, 'importo trasferimento non modificabile');
verifica((await r('GET', '/movimenti?categoria_id=' + albero.find((x) => x.nome === 'Cibo').id, A)).j.length === 2, 'filtro categoria con sottocategorie');

// Bruno non vede niente di Anna
verifica((await r('GET', '/conti', Bt)).j.length === 0, 'B non vede conti di A');
verifica((await r('GET', '/conti/' + privato.id, Bt)).s === 404, 'B 404 su conto A');
verifica((await r('GET', '/movimenti', Bt)).j.length === 0, 'B non vede movimenti A');
verifica((await r('POST', '/movimenti', Bt, { conto_id: comune.id, importo: '-1' })).s === 403, 'B non scrive su conto non condiviso');

// Anna condivide il conto comune (per ora solo da SQL)
sql(`insert into condivisioni (proprietario_id, condiviso_con_id, conto_id) values ('${a.j.utente_id}', '${b.j.utente_id}', '${comune.id}')`);
const contiB = (await r('GET', '/conti', Bt)).j;
verifica(contiB.length === 1 && contiB[0].id === comune.id && contiB[0].mio === false && contiB[0].condiviso === true, 'B vede conto condiviso');
verifica((await r('GET', '/movimenti?conto_id=' + comune.id, Bt)).j.length === 1, 'B vede movimenti del conto condiviso');
const mb = await r('POST', '/movimenti', Bt, { conto_id: comune.id, importo: '-20', esercente: 'Bar' });
verifica(mb.s === 201, 'B scrive sul conto condiviso');
verifica((await r('PATCH', '/conti/' + comune.id, Bt, { nome: 'Revolut casa' })).s === 200, 'B modifica conto condiviso');
verifica((await r('DELETE', '/conti/' + comune.id, Bt)).s === 403, 'B non cancella conto di A');
verifica((await r('GET', '/conti/' + privato.id, Bt)).s === 404, 'B ancora non vede conto privato');
verifica((await r('GET', '/movimenti/' + t.j.movimenti[0].id, Bt)).s === 404, 'B non vede la metà del trasferimento sul conto privato');
verifica((await r('GET', '/movimenti?conto_id=' + comune.id, A)).j.length === 2, 'A vede movimento di B');
verifica((await r('DELETE', '/movimenti/' + mb.j.id, A)).s === 204, 'A (proprietario conto) cancella movimento di B');

// Categorie
const sport = elenco.find((x) => x.nome === 'Sport');
verifica((await r('PATCH', '/categorie/' + sport.id, A, { colore: '#FF8800', icona: 'bici' })).j.colore === '#FF8800', 'categoria colore');
const salute = albero.find((x) => x.nome === 'Salute e cura');
verifica((await r('PATCH', '/categorie/' + salute.id, A, { padre_id: sport.id })).s === 400, 'ciclo categorie bloccato');
verifica((await r('DELETE', '/categorie/' + supermercato.id, A)).s === 409, 'categoria in uso 409');
const cibo = albero.find((x) => x.nome === 'Cibo');
verifica((await r('DELETE', `/categorie/${supermercato.id}?sposta_su=${cibo.id}`, A)).s === 204, 'cancella con sposta_su');
verifica((await r('GET', '/movimenti/' + m1.j.id, A)).j.categoria_id === cibo.id, 'movimento spostato su Cibo');
verifica((await r('PATCH', '/categorie/' + cibo.id, Bt, { nome: 'x' })).s === 404, 'B non modifica categorie di A');

// Uscita
verifica((await r('POST', '/accesso/uscita', A)).s === 204, 'uscita');
verifica((await r('GET', '/conti', A)).s === 401, 'token chiuso 401');
verifica((await r('GET', '/conti')).s === 401, 'senza token 401');
console.log(`OK ${ok}, falliti ${ko}`);
