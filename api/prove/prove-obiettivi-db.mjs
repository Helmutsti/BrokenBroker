import { execSync } from 'node:child_process';
const cartella = process.argv[2];
let ok = 0, ko = 0;
const verifica = (c, m) => { if (c) ok++; else { ko++; console.log('FALLITO:', m); } };
const reg = async (n) => (await (await fetch('http://localhost:3000/accesso/registrazione', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${n}${Date.now()}@t.it`, nome: n, password: 'password-lunga-x' }) })).json()).utente_id;
const a = await reg('a'), b = await reg('b');
// Esegue SQL come ruolo dell'API, per conto di un utente. Ritorna stdout o "ERRORE".
const come = (u, q) => {
  const sql = `begin; set local role fp_app; select set_config('app.utente_id','${u}',true); ${q}; commit;`;
  try { return execSync('docker compose exec -T db psql -q -U fp_admin -d finanza -tA -v ON_ERROR_STOP=1', { cwd: cartella, input: sql, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim().split('\n').filter((l) => l && l !== 'BEGIN' && l !== 'SET' && l !== 'COMMIT' && l !== a && l !== b); }
  catch { return 'ERRORE'; }
};
const fondo = come(a, `insert into obiettivi (proprietario_id, nome) values ('${a}', 'Fondo emergenza') returning id`)[0];
verifica(/^[0-9a-f-]{36}/.test(fondo), 'crea padre senza traguardo e senza scadenza');
const mens = come(a, `insert into obiettivi (proprietario_id, nome, traguardo, padre_id) values ('${a}', '4 mensilità', 8000, '${fondo}') returning id`)[0];
come(a, `insert into obiettivi (proprietario_id, nome, traguardo, padre_id) values ('${a}', 'Casa', 1500, '${fondo}')`);
verifica(come(b, 'select count(*) from obiettivi')[0] === '0', 'B non vede obiettivi non condivisi');
verifica(come(b, `insert into obiettivi (proprietario_id, nome, padre_id) values ('${b}', 'Intruso', '${fondo}')`) === 'ERRORE', 'B non aggiunge dentro obiettivo non condiviso');
come(a, `insert into condivisioni (proprietario_id, condiviso_con_id, obiettivo_id) values ('${a}', '${b}', '${fondo}')`);
verifica(come(b, 'select count(*) from obiettivi')[0] === '3', 'B vede padre e figli condivisi');
const occhiali = come(b, `insert into obiettivi (proprietario_id, nome, traguardo, padre_id) values ('${b}', 'Occhiali', 500, '${fondo}') returning id`)[0];
verifica(/^[0-9a-f-]{36}/.test(occhiali), 'B aggiunge un sotto-obiettivo');
verifica(come(a, 'select count(*) from obiettivi')[0] === '4', 'A vede il sotto-obiettivo creato da B');
verifica(come(b, `insert into versamenti (obiettivo_id, utente_id, importo) values ('${mens}', '${b}', 100) returning id`) !== 'ERRORE', 'B versa su un figlio condiviso');
verifica(come(b, `update obiettivi set traguardo = 9000 where id = '${mens}' returning id`).length === 1, 'B modifica un figlio');
verifica(come(b, `delete from obiettivi where id = '${fondo}' returning id`).length === 0, 'B non cancella il padre di A');
// Traguardi di copertura
const priv = come(a, `insert into obiettivi (proprietario_id, nome, traguardo) values ('${a}', 'Privato', 100) returning id`)[0];
verifica(come(a, `insert into traguardi_copertura (obiettivo_id, nome, importo) values ('${fondo}', 'Auto', 500), ('${fondo}', 'Occhiali', 50) returning id`).length === 2, 'A crea traguardi di copertura');
verifica(come(b, `insert into traguardi_copertura (obiettivo_id, nome, importo) values ('${fondo}', 'Dentista', 100) returning id`).length === 1, 'B aggiunge un traguardo sul fondo condiviso');
verifica(come(b, `select count(*) from traguardi_copertura`)[0] === '3', 'B vede i traguardi del fondo condiviso');
verifica(come(b, `insert into traguardi_copertura (obiettivo_id, nome, importo) values ('${priv}', 'X', 10)`) === 'ERRORE', 'B non scrive traguardi su obiettivo privato di A');
verifica(come(a, `insert into traguardi_copertura (obiettivo_id, nome, importo) values ('${fondo}', 'Zero', 0)`) === 'ERRORE', 'importo zero rifiutato');
verifica(come(a, `update obiettivi set padre_id = '${mens}' where id = '${fondo}'`) === 'ERRORE', 'ciclo bloccato');
// Spese una tantum pagate da un obiettivo
const nikon = come(a, `insert into obiettivi (proprietario_id, nome, traguardo, scadenza, crea_spesa) values ('${a}', 'Nikon', 400, '2027-03-01', true) returning id`)[0];
verifica(/^[0-9a-f-]{36}/.test(nikon), 'obiettivo con crea spesa');
const sp = come(a, `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, obiettivo_id) values ('${a}', 'Nikon', 400, null, '2027-03-01', '${nikon}') returning id`)[0];
verifica(/^[0-9a-f-]{36}/.test(sp), 'spesa una tantum collegata all obiettivo');
verifica(come(a, `update obiettivi set spesa_creata_id = '${sp}' where id = '${nikon}' returning id`).length === 1, 'obiettivo ricorda la spesa creata');
verifica(come(b, `insert into spese_previste (proprietario_id, nome, importo, obiettivo_id) values ('${b}', 'Furbo', 10, '${nikon}')`) === 'ERRORE', 'B non collega spese a obiettivi privati di A');
verifica(come(b, `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, obiettivo_id) values ('${b}', 'Dal fondo', 50, null, '${mens}') returning id`).length === 1, 'B collega una spesa a un obiettivo condiviso');
verifica(come(a, `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi) values ('${a}', 'Zero mesi', 10, 0)`) === 'ERRORE', 'frequenza zero rifiutata');
verifica(come(a, `delete from obiettivi where id = '${fondo}' returning id`).length === 1, 'A cancella il padre');
verifica(come(a, 'select count(*) from obiettivi')[0] === '2', 'i figli spariscono con il padre (restano Privato e Nikon)');
verifica(come(a, 'select count(*) from traguardi_copertura')[0] === '0', 'i traguardi spariscono con il padre');
console.log(`OK ${ok}, falliti ${ko}`);
