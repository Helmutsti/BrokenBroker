import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { movimentoDelVersamento } from '../movimenti.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { alberoObiettivi, cent, type Nodo, trova } from '../albero.ts';
import { inizioMese, meseDi, mesiFino, oggi, periodoRichiesto } from '../periodo.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';

// Obiettivi annidabili (decisione 20) con versamenti, traguardi di copertura e
// "crea spesa al raggiungimento" (decisione 21).

export const rotteObiettivi = Router();

// Quanto serve ogni mese a un obiettivo per arrivare al traguardo in tempo
// (senza scadenza: tutto quello che manca, come peso).
function bisogno(n: Nodo, da: string, inizio: number): number {
  const manca = n.traguardo_effettivo === null ? 0 : Math.max(0, Number(n.traguardo_effettivo) - Number(n.saldo));
  return n.scadenza && meseDi(n.scadenza, inizio) >= meseDi(da, inizio) ? manca / mesiFino(n.scadenza, da, inizio) : manca;
}

// Un versamento in un obiettivo con sotto-obiettivi si divide tra loro in
// proporzione a quanto serve a ciascuno ogni mese, senza superare quanto gli
// manca; il resto resta nell'obiettivo. Senza sotto-obiettivi va tutto lì.
export async function dividiVersamento(db: PoolClient, id: string, importo: number): Promise<{ obiettivo_id: string; importo: string }[]> {
  const n = trova(await alberoObiettivi(db), id);
  if (!n || !n.figli.length || importo <= 0) return [{ obiettivo_id: id, importo: cent(importo) }];
  const da = oggi(), inizio = await inizioMese(db);
  const pesi = n.figli.map((f) => ({ f, peso: bisogno(f, da, inizio), manca: f.traguardo_effettivo === null ? 0 : Math.max(0, Number(f.traguardo_effettivo) - Number(f.saldo)) }));
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

// Dopo un versamento: gli obiettivi (e gli antenati) che arrivano al traguardo con
// "crea spesa" attiva generano la loro spesa una tantum, una volta sola.
// Un sotto-obiettivo senza traguardo conta come non completo.
export async function creaSpeseRaggiunte(db: PoolClient, id: string) {
  const radici = await alberoObiettivi(db);
  for (let n = trova(radici, id); n; n = n.padre_id ? trova(radici, n.padre_id) : undefined) {
    if (!n.crea_spesa || n.spesa_creata_id || !n.traguardo_effettivo) continue;
    if (Number(n.saldo) < Number(n.traguardo_effettivo)) continue;
    // Con il traguardo preso dai sotto-obiettivi servono tutti completi: la somma
    // cresce quando se ne aggiungono, e un solo figlio pieno non basta.
    if (n.traguardo === null && n.figli.some((f) => (f.percentuale ?? 0) < 100)) continue;
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza)
       select fp_me(), nome, $2, null, $3 from obiettivi where id = $1 returning id`,
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
      `select x.id, x.data, x.importo::text as importo, x.utente_id, u.nome as utente,
              sp.con as spostamento_con, coalesce(sp.con_padre, false) as spostamento_con_padre
         from versamenti x join utenti u on u.id = x.utente_id
         left join lateral (
           select string_agg(distinct o2.nome, ', ') as con, bool_or(o2.id = (select padre_id from obiettivi where id = x.obiettivo_id)) as con_padre
             from versamenti y join obiettivi o2 on o2.id = y.obiettivo_id
            where x.spostamento_id is not null and y.spostamento_id = x.spostamento_id and y.id <> x.id and sign(y.importo) <> sign(x.importo)) sp on true
        where x.obiettivo_id = $1 order by x.data desc, x.id desc`, [id])).rows;
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
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    nascosto: v.booleano(c, 'nascosto'),
  };
}

// Il conto scelto deve essere uno che si vede (le chiavi esterne non guardano la visibilità).
async function verificaConto(db: PoolClient, contoId: string | null | undefined): Promise<void> {
  if (contoId && !(await db.query('select 1 from conti where id = $1', [contoId])).rowCount) throw nonTrovato('Conto');
}

rotteObiettivi.post('/', async (req, res) => {
  const campi = leggi(v.corpo(req.body), true);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    await verificaConto(db, campi.conto_id);
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
  const campi = leggi(c, false);
  const set = v.setParziale(campi, 2);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    await verificaConto(db, campi.conto_id);
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
    if ((await db.query('delete from obiettivi where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from obiettivi where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, "Solo chi ha creato l'obiettivo può cancellarlo") : nonTrovato('Obiettivo');
  });
  res.status(204).end();
});

// Il promemoria del salvadanaio, «Mostra nelle spese come promemoria» (decisione 51): una voce in Spese con la quota del mese, fuori dai
// totali delle spese. Con una scadenza e un traguardo la quota è (traguardo - già messo) / mesi personali rimasti (minimo 0) e la
// calcola l'API; altrimenti serve la cifra fissa (`importo`). La spunta fa il versamento «Dal conto» (`conto_id`, di base il conto del
// salvadanaio; vuoto = «soldi nuovi»), togliendola nel mese in corso il versamento si annulla. Si accende, si cambia e si spegne da qui
// (dalla spesa è bloccato, decisione 37).
rotteObiettivi.put('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const fisso = v.importo(c, 'importo');
  if (fisso !== undefined && Number(fisso) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const contoScelto = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id'));
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoObiettivi(db), id);
    if (!n) throw nonTrovato('Obiettivo');
    const automatica = !!n.scadenza && n.traguardo_effettivo !== null;
    const esistente = (await db.query<{ id: string; importo: string; conto_id: string | null }>('select id, importo::text, conto_id from spese_previste where alimenta_obiettivo_id = $1 limit 1', [id])).rows[0];
    if (!automatica && fisso === undefined && !(esistente && Number(esistente.importo) > 0)) {
      throw new ErroreApi(400, 'Il salvadanaio non ha una scadenza con un traguardo: scrivi la cifra fissa da ricordare ogni mese');
    }
    await verificaConto(db, contoScelto);
    const conto = contoScelto !== undefined ? contoScelto : esistente ? esistente.conto_id : n.conto_id;
    const importo = fisso ?? esistente?.importo ?? '0';
    // La quota è mensile (ogni mese, senza giorno): vale per tutto il mese personale (decisione 41).
    const spesaId = esistente
      ? (await db.query<{ id: string }>(`update spese_previste set nome = $2, importo = $3, ogni_mesi = 1, conto_id = $4, tipo = 'investimento',
            giorno_mese = null, prossima_scadenza = null, senza_giorno = false where id = $1 returning id`,
          [esistente.id, n.nome, importo, conto])).rows[0].id
      : (await db.query<{ id: string }>(`insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, senza_giorno, tipo, alimenta_obiettivo_id, conto_id)
          values (fp_me(), $1, $2, 1, null, false, 'investimento', $3, $4) returning id`, [n.nome, importo, id, conto])).rows[0].id;
    return (await speseDelMese(db, await periodoRichiesto(db, undefined), spesaId))[0];
  });
  res.json(spesa);
});

// Il versamento fatto spuntando il promemoria del mese: la quota si divide tra i sotto-salvadanai come ogni versamento, tutte le parti
// legate alla spunta (togliendola spariscono insieme ai loro movimenti). Con un conto è «Dal conto» (decisione 52: nessun movimento se il salvadanaio sta su quel conto, giroconto se sta su un altro, conto -> Niente se non ha conto), uno per parte.
export async function versaPerPromemoria(db: PoolClient, obiettivoId: string, importo: number, spuntaId: string, data: string, contoId: string | null): Promise<void> {
  const parti = await dividiVersamento(db, obiettivoId, importo);
  for (const x of parti) {
    const { id: versamentoId } = (await db.query<{ id: string }>(
      'insert into versamenti (obiettivo_id, utente_id, data, importo, promemoria_spunta_id) values ($1, fp_me(), $2, $3, $4) returning id', [x.obiettivo_id, data, x.importo, spuntaId])).rows[0];
    if (contoId) {
      const nome = (await db.query<{ nome: string }>('select nome from obiettivi where id = $1', [x.obiettivo_id])).rows[0].nome;
      await movimentoDelVersamento(db, { contoScelto: contoId, obiettivoId: x.obiettivo_id, importo: Number(x.importo), versamentoId, nome });
    }
  }
  await creaSpeseRaggiunte(db, obiettivoId);
}

rotteObiettivi.delete('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    await db.query('delete from spese_previste where alimenta_obiettivo_id = $1', [id]);
  });
  res.status(204).end();
});

// Versamenti: importo positivo = metto via, negativo = prelevo.
// `conto_id` (facoltativo, decisioni 47 G e 52): i soldi vengono dal conto (importo positivo) o tornano sul conto (importo negativo). Il
// movimento dipende da dove sta il salvadanaio: sul conto scelto non si muove niente (sono solo messi da parte), su un altro conto è un
// giroconto, senza conto va da/verso Niente; sempre nella stessa transazione e legato al versamento. Senza `conto_id` sono
// «soldi nuovi» / «escono». Non si può unire a `da_liberi`. La data non può cadere in un mese passato (decisione 48 C).
rotteObiettivi.post('/:id/versamenti', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) === 0) throw new ErroreApi(400, "L'importo non può essere zero");
  const contoId = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  if (contoId && v.booleano(c, 'da_liberi')) throw new ErroreApi(400, 'I soldi vengono dal conto oppure dai liberi del salvadanaio superiore, non da tutti e due');
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from obiettivi where id = $1', [id])).rowCount) throw nonTrovato('Obiettivo');
    if (contoId && !(await db.query('select 1 from conti where id = $1', [contoId])).rowCount) throw nonTrovato('Conto');
    // Il passato non si cambia (decisione 48 C): nessun versamento, di nessun tipo, in un mese personale già finito.
    const dataScelta = v.data(c, 'data');
    if (dataScelta && dataScelta < (await periodoRichiesto(db, undefined)).dal) throw new ErroreApi(409, 'Il passato non si cambia: non si può versare o prelevare in un mese passato');
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
    const data = v.data(c, 'data') ?? null;
    const inserisci = async (obiettivoId: string, x: string, spunta: string | null, spostamento: string | null): Promise<string> => {
      const versamentoId = (await db.query<{ id: string }>(
        'insert into versamenti (obiettivo_id, utente_id, data, importo, promemoria_spunta_id, spostamento_id) values ($1, fp_me(), coalesce($2::date, current_date), $3, $4, $5) returning id',
        [obiettivoId, data, x, spunta, spostamento])).rows[0].id;
      // Dal conto: il movimento opposto, legato a questo versamento (se il versamento sparisce, sparisce anche lui).
      if (contoId) {
        const nome = (await db.query<{ nome: string }>('select nome from obiettivi where id = $1', [obiettivoId])).rows[0].nome;
        // Decisione 52: stesso conto del salvadanaio = nessun movimento; altro conto = giroconto; nessun conto = conto <-> Niente.
        await movimentoDelVersamento(db, { contoScelto: contoId, obiettivoId, importo: Number(x), versamentoId, nome });
      }
      return versamentoId;
    };
    if (v.booleano(c, 'da_liberi')) {
      // Spostamento (decisione 46): i soldi passano tra i liberi del salvadanaio superiore e questo sotto-salvadanaio,
      // il totale del superiore non cambia. Importo positivo = dai liberi al sotto-salvadanaio, negativo = dal sotto-salvadanaio ai liberi.
      const padre = (await db.query<{ padre_id: string | null }>('select padre_id from obiettivi where id = $1', [id])).rows[0].padre_id;
      if (!padre) throw new ErroreApi(400, 'Solo un sotto-salvadanaio ha i liberi di un salvadanaio superiore');
      // Blocco le due righe (sempre nello stesso ordine) così due spostamenti insieme non spendono due volte gli stessi liberi.
      await db.query('select id from obiettivi where id = any($1::uuid[]) order by id for update', [[id, padre]]);
      const propri = async (oid: string) => Number((await db.query<{ t: string }>('select coalesce(sum(importo), 0)::text as t from versamenti where obiettivo_id = $1', [oid])).rows[0].t);
      const quanto = Math.abs(Number(importo)), gruppo = randomUUID();
      if (Number(importo) > 0) {
        const liberi = await propri(padre);
        if (quanto > liberi + 0.005) throw new ErroreApi(400, `Nei liberi ci sono solo ${cent(Math.max(0, liberi)).replace('.', ',')} €`);
        const parti = v.booleano(c, 'dividi') ? await dividiVersamento(db, id, quanto) : [{ obiettivo_id: id, importo: cent(quanto) }];
        await inserisci(padre, cent(-quanto), null, gruppo);
        for (const [k, x] of parti.entries()) await inserisci(x.obiettivo_id, x.importo, k === 0 ? spuntaId : null, gruppo);
      } else {
        const proprio = await propri(id);
        if (quanto > proprio + 0.005) throw new ErroreApi(400, `Nel sotto-salvadanaio ci sono solo ${cent(Math.max(0, proprio)).replace('.', ',')} € di suoi: il resto è nei sotto-salvadanai`);
        await inserisci(id, cent(-quanto), null, gruppo);
        await inserisci(padre, cent(quanto), null, gruppo);
      }
    } else {
      // Con dividi = true un versamento positivo si divide tra i sotto-obiettivi.
      const parti = v.booleano(c, 'dividi') && Number(importo) > 0 ? await dividiVersamento(db, id, Number(importo)) : [{ obiettivo_id: id, importo }];
      for (const [k, x] of parti.entries()) await inserisci(x.obiettivo_id, x.importo, k === 0 ? spuntaId : null, null);
    }
    await creaSpeseRaggiunte(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  res.status(201).json(obiettivo);
});

rotteObiettivi.delete('/versamenti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    // Un versamento si annulla (insieme al suo eventuale movimento) solo nel mese in corso o dopo: il passato non si cambia (decisione 48 C).
    const mosso = (await db.query<{ data: string }>('select x.data from versamenti x where x.id = $1', [id])).rows[0];
    if (mosso && mosso.data < (await periodoRichiesto(db, undefined)).dal) throw new ErroreApi(409, 'Il passato non si cambia: un versamento di un mese passato non si annulla più');
    const eliminato = (await db.query<{ spunta: string | null; spostamento: string | null }>('delete from versamenti where id = $1 returning promemoria_spunta_id as spunta, spostamento_id as spostamento', [id])).rows[0];
    if (eliminato) {
      if (eliminato.spunta) await db.query('delete from spunte where id = $1', [eliminato.spunta]);
      // Uno spostamento si annulla per intero: spariscono anche gli altri versamenti dello stesso spostamento.
      if (eliminato.spostamento) {
        const altri = await db.query<{ spunta: string | null; obiettivo_id: string }>('delete from versamenti where spostamento_id = $1 returning promemoria_spunta_id as spunta, obiettivo_id', [eliminato.spostamento]);
        for (const x of altri.rows) if (x.spunta) await db.query('delete from spunte where id = $1', [x.spunta]);
        // Se i soldi spostati sono già stati usati (i liberi o il sotto-salvadanaio andrebbero sotto zero) lo spostamento non si annulla.
        const coinvolti = [...new Set(altri.rows.map((x) => x.obiettivo_id))];
        const sotto = await db.query('select obiettivo_id from versamenti where obiettivo_id = any($1::uuid[]) group by obiettivo_id having sum(importo) < -0.005', [coinvolti]);
        if (sotto.rowCount) throw new ErroreApi(409, 'Non si può annullare lo spostamento: i soldi spostati sono già stati usati');
      }
      return;
    }
    const visibile = (await db.query('select 1 from versamenti where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, "Può cancellarlo chi l'ha fatto o il proprietario dell'obiettivo") : nonTrovato('Versamento');
  });
  res.status(204).end();
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
