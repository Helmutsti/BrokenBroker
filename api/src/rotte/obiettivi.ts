import { Router } from 'express';
import type { PoolClient } from 'pg';
import { bloccoObiettivo, erroreObiettivoBloccato, vietaCampi, vietaPromemoria, sqlBloccoObiettivo, type Blocco } from '../collegamenti.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { aggiungiMesi, mesiTra, oggi, periodoRichiesto } from '../periodo.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';

// Obiettivi annidabili (decisione 20) con versamenti, traguardi di copertura e
// "crea spesa al raggiungimento" (decisione 21).

export const rotteObiettivi = Router();

type Nodo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null;
  crea_spesa: boolean; spesa_creata_id: string | null; icona: string | null; nascosto: boolean; mio: boolean; condiviso: boolean; versato: string;
  saldo?: string; traguardo_effettivo?: string | null; percentuale?: number | null;
  traguardi?: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  // La spesa annuale che questo obiettivo paga: traguardo e scadenza vengono da lei.
  paga_spesa?: { id: string; nome: string; ogni_mesi: number; importo: string; prossima: string; senza_giorno: boolean } | null;
  // La spesa "mettici da parte" che riempie l'obiettivo.
  alimentato_da?: { id: string; importo: string; ogni_mesi: number | null; conto_id: string | null } | null;
  // Se il salvadanaio nasce da una spesa (Dividi per spesa): quali campi si cambiano solo da lì.
  bloccato_da: Blocco | null;
  // È il salvadanaio delle spese annuali: non ha un promemoria suo.
  contenitore_annuali: boolean;
  figli: Nodo[];
};

// Prossima uscita da `da` di una voce che parte da `prima` e si ripete ogni `ogni` mesi.
export function prossimaUscita(prima: string | null, ogni: number, da: string, senzaGiorno = false): string {
  // Una spesa senza giorno cade nel mese: tutto il mese conta, anche se il giorno 1 è già passato.
  if (senzaGiorno) da = `${da.slice(0, 7)}-01`;
  let q = prima ?? da;
  for (let k = 1; q < da && k < 2400; k++) q = aggiungiMesi(prima ?? da, k * ogni);
  return q;
}
// Mesi da oggi alla scadenza, almeno 1: il mese della scadenza conta.
const mesiFino = (scadenza: string, da: string) => Math.max(1, mesiTra(da, scadenza) + 1);

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

// Albero degli obiettivi visibili. Il saldo di un obiettivo è la somma dei suoi
// versamenti e di quelli dei sotto-obiettivi; il traguardo, se manca, è la somma
// dei traguardi dei sotto-obiettivi. Ogni traguardo di copertura si confronta
// con tutto il saldo dell'obiettivo, al massimo 100%.
export async function alberoObiettivi(db: PoolClient): Promise<Nodo[]> {
  const nodi = (await db.query<Nodo>(
    `select o.id, o.padre_id, o.nome, o.traguardo::text as traguardo, o.scadenza, o.crea_spesa, o.spesa_creata_id, o.icona, o.nascosto,
            o.proprietario_id = fp_me() as mio,
            exists (select 1 from condivisioni s where s.obiettivo_id = o.id) as condiviso,
            ${sqlBloccoObiettivo('o')} as bloccato_da,
            exists (select 1 from utenti u where u.obiettivo_annuali = o.id) as contenitore_annuali,
            coalesce((select sum(x.importo) from versamenti x where x.obiettivo_id = o.id), 0)::text as versato
       from obiettivi o order by o.nome`)).rows;
  const traguardi = (await db.query(
    `select id, obiettivo_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;
  const collegate = (await db.query<{ id: string; nome: string; obiettivo_id: string | null; alimenta_obiettivo_id: string | null; ogni_mesi: number | null;
    prossima_scadenza: string | null; senza_giorno: boolean; importo: string; conto_id: string | null }>(
    `select id, nome, obiettivo_id, alimenta_obiettivo_id, ogni_mesi, prossima_scadenza, senza_giorno, importo::text as importo, conto_id from spese_previste
      where attiva and (alimenta_obiettivo_id is not null or (obiettivo_id is not null and ogni_mesi > 1 and tipo <> 'budget'))`)).rows;
  const oggiQui = oggi();
  const perId = new Map(nodi.map((n) => {
    const paga = collegate.find((s) => s.obiettivo_id === n.id && s.ogni_mesi && s.ogni_mesi > 1);
    const alim = collegate.find((s) => s.alimenta_obiettivo_id === n.id);
    const nodo: Nodo = { ...n, figli: [],
      paga_spesa: paga ? { id: paga.id, nome: paga.nome, ogni_mesi: paga.ogni_mesi!, importo: paga.importo, prossima: prossimaUscita(paga.prossima_scadenza, paga.ogni_mesi!, oggiQui, paga.senza_giorno), senza_giorno: paga.senza_giorno } : null,
      alimentato_da: alim ? { id: alim.id, importo: alim.importo, ogni_mesi: alim.ogni_mesi, conto_id: alim.conto_id } : null };
    // Un salvadanaio di una spesa annuale si prepara per la prossima uscita, del suo importo.
    if (nodo.paga_spesa) { nodo.scadenza = nodo.paga_spesa.prossima; if (nodo.traguardo === null) nodo.traguardo = nodo.paga_spesa.importo; }
    return [n.id, nodo];
  }));
  const radici: Nodo[] = [];
  for (const n of perId.values()) {
    const padre = n.padre_id ? perId.get(n.padre_id) : undefined;
    (padre ? padre.figli : radici).push(n);
  }
  const calcola = (n: Nodo): void => {
    n.figli.forEach(calcola);
    const saldo = Number(n.versato) + n.figli.reduce((t, f) => t + Number(f.saldo), 0);
    const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo_effettivo ?? 0), 0);
    const traguardo = n.traguardo !== null ? Number(n.traguardo) : daFigli > 0 ? daFigli : null;
    n.saldo = cent(saldo);
    n.traguardo_effettivo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(saldo, traguardo) : null;
    n.traguardi = traguardi.filter((t) => t.obiettivo_id === n.id).map(({ obiettivo_id: _, ...t }) => ({
      ...t, percentuale: percento(Math.max(0, saldo), Number(t.importo)),
    }));
  };
  radici.forEach(calcola);
  return radici;
}

// Quanto serve ogni mese a un obiettivo per arrivare al traguardo in tempo
// (senza scadenza: tutto quello che manca, come peso).
function bisogno(n: Nodo, da: string): number {
  const manca = n.traguardo_effettivo === null ? 0 : Math.max(0, Number(n.traguardo_effettivo) - Number(n.saldo));
  return n.scadenza && n.scadenza >= da ? manca / mesiFino(n.scadenza, da) : manca;
}

// Un versamento in un obiettivo con sotto-obiettivi si divide tra loro in
// proporzione a quanto serve a ciascuno ogni mese, senza superare quanto gli
// manca; il resto resta nell'obiettivo. Senza sotto-obiettivi va tutto lì.
export async function dividiVersamento(db: PoolClient, id: string, importo: number): Promise<{ obiettivo_id: string; importo: string }[]> {
  const n = trova(await alberoObiettivi(db), id);
  if (!n || !n.figli.length || importo <= 0) return [{ obiettivo_id: id, importo: cent(importo) }];
  const da = oggi();
  const pesi = n.figli.map((f) => ({ f, peso: bisogno(f, da), manca: f.traguardo_effettivo === null ? 0 : Math.max(0, Number(f.traguardo_effettivo) - Number(f.saldo)) }));
  const totale = pesi.reduce((t, x) => t + x.peso, 0);
  const parti: { obiettivo_id: string; importo: string }[] = [];
  let resto = Math.round(importo * 100);
  if (totale > 0) for (const x of pesi) {
    const centesimi = Math.min(resto, Math.round(x.manca * 100), Math.round((importo * x.peso / totale) * 100));
    if (centesimi > 0) { parti.push({ obiettivo_id: x.f.id, importo: (centesimi / 100).toFixed(2) }); resto -= centesimi; }
  }
  if (resto > 0) parti.push({ obiettivo_id: id, importo: (resto / 100).toFixed(2) });
  return parti;
}

function trova(radici: Nodo[], id: string): Nodo | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}

// Dopo un versamento: gli obiettivi (e gli antenati) che arrivano al traguardo con
// "crea spesa" attiva generano la loro spesa una tantum, una volta sola.
// Un sotto-obiettivo senza traguardo conta come non completo.
async function creaSpeseRaggiunte(db: PoolClient, id: string) {
  const radici = await alberoObiettivi(db);
  for (let n = trova(radici, id); n; n = n.padre_id ? trova(radici, n.padre_id) : undefined) {
    if (!n.crea_spesa || n.spesa_creata_id || !n.traguardo_effettivo) continue;
    if (Number(n.saldo) < Number(n.traguardo_effettivo)) continue;
    // Con il traguardo preso dai sotto-obiettivi servono tutti completi: la somma
    // cresce quando se ne aggiungono, e un solo figlio pieno non basta.
    if (n.traguardo === null && n.figli.some((f) => (f.percentuale ?? 0) < 100)) continue;
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, obiettivo_id)
       select fp_me(), nome, $2, null, $3, id from obiettivi where id = $1 returning id`,
      [n.id, n.traguardo_effettivo, n.scadenza && n.scadenza > oggi() ? n.scadenza : oggi()]);
    if (rows[0]) await db.query('update obiettivi set spesa_creata_id = $2 where id = $1', [n.id, rows[0].id]);
  }
}

rotteObiettivi.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, alberoObiettivi));
});

rotteObiettivi.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoObiettivi(db), id);
    if (!n) return undefined;
    const versamenti = (await db.query(
      `select x.id, x.data, x.importo::text as importo, x.utente_id, u.nome as utente
         from versamenti x join utenti u on u.id = x.utente_id where x.obiettivo_id = $1 order by x.data desc`, [id])).rows;
    return { ...n, versamenti };
  });
  if (!obiettivo) throw nonTrovato('Obiettivo');
  res.json(obiettivo);
});

function leggi(c: Record<string, unknown>, nuovo: boolean) {
  const traguardo = v.annullabile(c, 'traguardo', () => v.importo(c, 'traguardo'));
  if (traguardo && Number(traguardo) <= 0) throw new ErroreApi(400, 'Il traguardo deve essere positivo');
  return {
    nome: v.testo(c, 'nome', nuovo, 120),
    padre_id: v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')),
    traguardo,
    scadenza: v.annullabile(c, 'scadenza', () => v.data(c, 'scadenza')),
    crea_spesa: v.booleano(c, 'crea_spesa'),
    icona: v.annullabile(c, 'icona', () => v.testo(c, 'icona', false, 60)),
    nascosto: v.booleano(c, 'nascosto'),
  };
}

rotteObiettivi.post('/', async (req, res) => {
  const campi = leggi(v.corpo(req.body), true);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into obiettivi (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    return trova(await alberoObiettivi(db), rows[0].id);
  });
  res.status(201).json(obiettivo);
});

rotteObiettivi.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const set = v.setParziale(leggi(c, false), 2);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    vietaCampi(await bloccoObiettivo(db, id), Object.keys(c), erroreObiettivoBloccato);
    const { rowCount } = await db.query(`update obiettivi set ${set.sql} where id = $1`, [id, ...set.valori]);
    if (!rowCount) return undefined;
    await creaSpeseRaggiunte(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  if (!obiettivo) throw nonTrovato('Obiettivo');
  res.json(obiettivo);
});

// Cancellare un obiettivo cancella anche quelli che contiene (decisione 16: solo il proprietario).
rotteObiettivi.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const blocco = await bloccoObiettivo(db, id);
    if (blocco) throw erroreObiettivoBloccato(blocco);
    if ((await db.query('delete from obiettivi where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from obiettivi where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, "Solo chi ha creato l'obiettivo può cancellarlo") : nonTrovato('Obiettivo');
  });
  res.status(204).end();
});

// Il promemoria "ricordami" del salvadanaio: la spesa che lo ricorda in Spese. Si crea,
// si cambia e si toglie da qui (dalla spesa è bloccata, decisione 37).
rotteObiettivi.put('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const ogni = v.intero(c, 'ogni_mesi', 1, 120) ?? 1;
  const conto = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const nome = (await db.query<{ nome: string }>('select nome from obiettivi where id = $1', [id])).rows[0]?.nome;
    if (!nome) throw nonTrovato('Obiettivo');
    await vietaPromemoria(db, id);
    const esistente = (await db.query<{ id: string }>('select id from spese_previste where alimenta_obiettivo_id = $1 limit 1', [id])).rows[0];
    const spesaId = esistente
      ? (await db.query<{ id: string }>(`update spese_previste set nome = $2, importo = $3, ogni_mesi = $4, conto_id = $5, tipo = 'investimento' where id = $1 returning id`,
          [esistente.id, nome, importo, ogni, conto])).rows[0].id
      : (await db.query<{ id: string }>(`insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, tipo, alimenta_obiettivo_id, conto_id)
          values (fp_me(), $1, $2, $3, $4, 'investimento', $5, $6) returning id`, [nome, importo, ogni, ogni === 1 ? null : oggi(), id, conto])).rows[0].id;
    return (await speseDelMese(db, await periodoRichiesto(db, undefined), spesaId))[0];
  });
  res.json(spesa);
});

rotteObiettivi.delete('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    await db.query('delete from spese_previste where alimenta_obiettivo_id = $1', [id]);
  });
  res.status(204).end();
});

// Versamenti: importo positivo = metto via, negativo = prelevo.
rotteObiettivi.post('/:id/versamenti', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) === 0) throw new ErroreApi(400, "L'importo non può essere zero");
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from obiettivi where id = $1', [id])).rowCount) throw nonTrovato('Obiettivo');
    // "Aggiungi quota mensile": il versamento spunta anche il promemoria del mese, se c'è e non è già spuntato.
    let spuntaId: string | null = null;
    if (v.booleano(c, 'promemoria')) {
      const voce = (await db.query<{ id: string }>('select id from spese_previste where alimenta_obiettivo_id = $1 and attiva', [id])).rows[0];
      const p = await periodoRichiesto(db, undefined);
      const s = voce && (await speseDelMese(db, p, voce.id))[0];
      if (s && s.nel_mese && !s.uscita) {
        const giorno = oggi() >= p.dal && oggi() <= p.al ? oggi() : s.scadenza ?? p.dal;
        spuntaId = (await db.query<{ id: string }>('insert into spunte (utente_id, spesa_prevista_id, data) values (fp_me(), $1, $2) returning id', [voce.id, giorno])).rows[0].id;
      }
    }
    // Con dividi = true un versamento positivo si divide tra i sotto-obiettivi.
    const parti = v.booleano(c, 'dividi') && Number(importo) > 0 ? await dividiVersamento(db, id, Number(importo)) : [{ obiettivo_id: id, importo }];
    for (const [k, x] of parti.entries()) {
      await db.query('insert into versamenti (obiettivo_id, utente_id, data, importo, promemoria_spunta_id) values ($1, fp_me(), coalesce($2::date, current_date), $3, $4)',
        [x.obiettivo_id, v.data(c, 'data') ?? null, x.importo, k === 0 ? spuntaId : null]);
    }
    await creaSpeseRaggiunte(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  res.status(201).json(obiettivo);
});

rotteObiettivi.delete('/versamenti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const eliminato = (await db.query<{ spunta: string | null }>('delete from versamenti where id = $1 returning promemoria_spunta_id as spunta', [id])).rows[0];
    if (eliminato) {
      if (eliminato.spunta) await db.query('delete from spunte where id = $1', [eliminato.spunta]);
      return;
    }
    const visibile = (await db.query('select 1 from versamenti where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, "Può cancellarlo chi l'ha fatto o il proprietario dell'obiettivo") : nonTrovato('Versamento');
  });
  res.status(204).end();
});

// Inserisce un salvadanaio (usato da "Dividi per spesa" e dal modulo della spesa).
// da_spesa = true: nasce da una spesa e resta bloccato finché una spesa lo paga (decisione 37).
export async function inserisciSalvadanaio(db: PoolClient, o: { nome: string; padre_id?: string | null; traguardo?: string | null; scadenza?: string | null; icona?: string | null; da_spesa?: boolean }): Promise<string> {
  return (await db.query<{ id: string }>(
    'insert into obiettivi (proprietario_id, nome, padre_id, traguardo, scadenza, icona, da_spesa) values (fp_me(), $1, $2, $3, $4, $5, $6) returning id',
    [o.nome, o.padre_id ?? null, o.traguardo ?? null, o.scadenza ?? null, o.icona ?? null, o.da_spesa ?? false])).rows[0].id;
}

// Dal modulo della spesa (decisione 39): crea il salvadanaio NUOVO della spesa e la collega.
// Dove: da solo (padre_id assente/null), sotto un salvadanaio tuo (padre_id) o dentro un
// contenitore nuovo e libero (contenitore). Traguardo = la quota solo per annuali e una tantum;
// scadenza = prossima uscita (vuota se senza giorno); icona = quella della spesa.
export async function creaSalvadanaioDaSpesa(db: PoolClient, spesaId: string, dove: { padre_id?: string | null; contenitore?: string }): Promise<string> {
  const [s] = await speseDelMese(db, await periodoRichiesto(db, undefined), spesaId);
  if (!s) throw nonTrovato('Spesa prevista');
  if (!s.mia) throw new ErroreApi(403, 'Solo chi ha creato la spesa può crearle il salvadanaio');
  if (!s.nome.trim()) throw new ErroreApi(400, 'La spesa ha bisogno di un nome per creare il salvadanaio');
  if (s.obiettivo_id) {
    const g = (await db.query<{ da_spesa: boolean; nome: string }>('select da_spesa, nome from obiettivi where id = $1', [s.obiettivo_id])).rows[0];
    if (g?.da_spesa) throw new ErroreApi(409, `Questa spesa ha già il suo salvadanaio «${g.nome}»`);
  }
  let padre = dove.padre_id ?? null;
  if (padre) {
    const p = (await db.query<{ mio: boolean; da_spesa: boolean }>('select proprietario_id = fp_me() as mio, da_spesa from obiettivi where id = $1', [padre])).rows[0];
    if (!p) throw new ErroreApi(404, 'Il salvadanaio scelto come contenitore non esiste');
    if (!p.mio) throw new ErroreApi(403, 'Il salvadanaio scelto come contenitore non è tuo');
    if (p.da_spesa) throw new ErroreApi(400, 'Un salvadanaio creato da una spesa non può contenerne altri');
  } else if (dove.contenitore !== undefined) {
    padre = await inserisciSalvadanaio(db, { nome: dove.contenitore });
  }
  const periodica = s.tipo !== 'budget' && s.ogni_mesi !== 1;
  const prossima = s.prossima_scadenza && !s.senza_giorno ? (s.ogni_mesi === null ? s.prossima_scadenza : prossimaUscita(s.prossima_scadenza, s.ogni_mesi, oggi())) : null;
  const id = await inserisciSalvadanaio(db, { nome: s.nome, padre_id: padre, traguardo: periodica ? s.mia_quota : null,
    scadenza: periodica ? prossima : null, icona: s.icona, da_spesa: true });
  await db.query('update spese_previste set obiettivo_id = $2 where id = $1', [spesaId, id]);
  return id;
}

// Il salvadanaio delle spese annuali diviso per spesa: per ogni spesa annuale o
// periodica pagata dal salvadanaio stesso nasce un sotto-obiettivo che la paga (le
// annuali pagate da un altro salvadanaio restano lì) (traguardo e scadenza vengono
// dalla spesa). I soldi già messi da parte vanno ai sotto-obiettivi come se si fossero
// riempiti di un dodicesimo al mese, prima le scadenze più vicine.
// Non nasce nessuna voce mensile per il contenitore: la quota di ogni annuale conta da sola.
async function dividiAnnuali(db: PoolClient, id: string) {
  const padre = trova(await alberoObiettivi(db), id);
  if (!padre) throw nonTrovato('Obiettivo');
  if (!padre.mio) throw new ErroreApi(403, "Solo chi ha creato l'obiettivo può dividerlo");
  const da = oggi();
  const spese = (await speseDelMese(db, await periodoRichiesto(db, undefined)))
    .filter((s) => s.attiva && s.mia && s.tipo !== 'budget' && !s.alimenta_obiettivo_id && s.ogni_mesi !== null && s.ogni_mesi > 1 && s.obiettivo_id === id);
  const nuove: { figlio: string; quando: string; dovrebbe: number }[] = [];
  for (const s of spese) {
    const figlio = await inserisciSalvadanaio(db, { nome: s.nome, padre_id: id, traguardo: s.mia_quota, da_spesa: true });
    await db.query('update spese_previste set obiettivo_id = $2 where id = $1', [s.id, figlio]);
    const quando = prossimaUscita(s.prossima_scadenza, s.ogni_mesi!, da, s.senza_giorno);
    const passati = Math.max(0, Math.min(s.ogni_mesi!, mesiTra(aggiungiMesi(quando, -s.ogni_mesi!), da) - (Number(da.slice(8)) < Number(quando.slice(8)) ? 1 : 0)));
    nuove.push({ figlio, quando, dovrebbe: Math.round(Number(s.mia_quota) * passati / s.ogni_mesi! * 100) / 100 });
  }
  let resto = Math.max(0, Number(padre.versato));
  for (const x of nuove.sort((a, b) => a.quando.localeCompare(b.quando))) {
    const parte = Math.min(resto, x.dovrebbe);
    if (parte <= 0) continue;
    await db.query('insert into versamenti (obiettivo_id, utente_id, data, importo) values ($1, fp_me(), $2, $3), ($4, fp_me(), $2, $5)',
      [id, da, (-parte).toFixed(2), x.figlio, parte.toFixed(2)]);
    resto -= parte;
  }
  await db.query('update utenti set obiettivo_annuali = $1 where id = fp_me()', [id]);
}

rotteObiettivi.post('/:id/annuali', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const tutte = v.booleano(v.corpo(req.body ?? {}), 'tutte');
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    // "Aggiungi tutte le annuali": prima prende le annuali senza salvadanaio (quelle pagate da un altro non si toccano).
    if (tutte) await db.query(`update spese_previste set obiettivo_id = $1
                               where proprietario_id = fp_me() and attiva and tipo <> 'budget' and alimenta_obiettivo_id is null and ogni_mesi > 1 and obiettivo_id is null`, [id]);
    await dividiAnnuali(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  res.json(obiettivo);
});

// Traguardi di copertura.
rotteObiettivi.post('/:id/traguardi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `insert into traguardi_copertura (obiettivo_id, nome, importo, ordine)
     values ($1, $2, $3, coalesce($4, (select count(*) from traguardi_copertura where obiettivo_id = $1)))
     returning id, obiettivo_id, nome, importo::text as importo, ordine`,
    [id, v.testo(c, 'nome', true, 120), importo, v.intero(c, 'ordine', 0, 1000) ?? null])).rows[0]);
  res.status(201).json(traguardo);
});

rotteObiettivi.patch('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo');
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const set = v.setParziale({ nome: v.testo(c, 'nome', false, 120), importo, ordine: v.intero(c, 'ordine', 0, 1000) }, 2);
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `update traguardi_copertura set ${set.sql} where id = $1
     returning id, obiettivo_id, nome, importo::text as importo, ordine`, [id, ...set.valori])).rows[0]);
  if (!traguardo) throw nonTrovato('Traguardo');
  res.json(traguardo);
});

rotteObiettivi.delete('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cancellati = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('delete from traguardi_copertura where id = $1', [id])).rowCount);
  if (!cancellati) throw nonTrovato('Traguardo');
  res.status(204).end();
});
