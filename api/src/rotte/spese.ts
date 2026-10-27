import { Router } from 'express';
import type { PoolClient } from 'pg';
import { bloccoSpesa, erroreSpesaBloccata, vietaCampi, vietaPromemoria } from '../collegamenti.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { oggi, periodoRichiesto } from '../periodo.ts';
import { annullaSpunta, giroconto, importoSulConto, muoviPerSpunta, vietaMesePassato } from '../movimenti.ts';
import { creaSalvadanaioDaSpesa } from './obiettivi.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';

export const rotteSpese = Router();

const TIPI = ['fissa', 'budget', 'investimento'] as const;

// Elenco con lo stato nel mese richiesto (?mese=AAAA-MM, di base il mese in corso).
// ?solo_mese=true tiene solo le spese che cadono nel mese.
rotteSpese.get('/', async (req, res) => {
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const spese = await speseDelMese(db, p);
    return { periodo: { mese: p.mese, dal: p.dal, al: p.al },
             spese: req.query.solo_mese === 'true' ? spese.filter((s) => s.nel_mese) : spese };
  });
  res.json(risposta);
});

rotteSpese.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) return undefined;
    const quote = (await db.query(
      `select q.utente_id, u.nome, q.percentuale::text as percentuale from quote q join utenti u on u.id = q.utente_id
        where q.spesa_prevista_id = $1 order by u.nome`, [id])).rows;
    return { ...s, quote };
  });
  if (!spesa) throw nonTrovato('Spesa prevista');
  res.json(spesa);
});

function obiettivoNull(c: Record<string, unknown>): null | undefined {
  if (!('obiettivo_id' in c) || c.obiettivo_id === undefined) return undefined;
  if (c.obiettivo_id !== null) throw new ErroreApi(400, 'Il salvadanaio di una spesa non si sceglie: usa "nuovo_salvadanaio" per crearne uno nuovo, oppure obiettivo_id = null per scollegarla');
  return null;
}

// { padre_id?: uuid | null, contenitore?: nome } (non entrambi): dove mettere il salvadanaio nuovo della spesa.
function leggiNuovoSalvadanaio(c: Record<string, unknown>): { padre_id?: string | null; contenitore?: string } | undefined {
  if (!('nuovo_salvadanaio' in c) || c.nuovo_salvadanaio === undefined || c.nuovo_salvadanaio === null) return undefined;
  const n = v.corpo(c.nuovo_salvadanaio);
  if (n.padre_id !== undefined && n.padre_id !== null && n.contenitore !== undefined) throw new ErroreApi(400, 'Indica un salvadanaio esistente (padre_id) oppure un contenitore nuovo (contenitore), non entrambi');
  const contenitore = n.contenitore === undefined ? undefined : v.testo(n, 'contenitore', true, 120);
  return { padre_id: n.padre_id === undefined ? undefined : v.annullabile(n, 'padre_id', () => v.id(n, 'padre_id')), contenitore };
}

// Le categorie non si condividono (decisione 43): su una spesa si sceglie solo una categoria propria.
async function categoriaMia(db: PoolClient, id: string | null | undefined) {
  if (!id) return;
  if (!(await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw nonTrovato('Categoria');
}

function leggi(c: Record<string, unknown>, nuova: boolean) {
  const importo = v.importo(c, 'importo', nuova);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  return {
    nome: v.testo(c, 'nome', nuova, 120),
    importo,
    ogni_mesi: v.annullabile(c, 'ogni_mesi', () => v.intero(c, 'ogni_mesi', 1, 120)),
    prossima_scadenza: v.annullabile(c, 'prossima_scadenza', () => v.data(c, 'prossima_scadenza')),
    senza_giorno: v.booleano(c, 'senza_giorno'),
    giorno_mese: v.annullabile(c, 'giorno_mese', () => v.intero(c, 'giorno_mese', 1, 31)),
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
    tipo: v.scelta(c, 'tipo', TIPI),
    attiva: v.booleano(c, 'attiva'),
    note: v.annullabile(c, 'note', () => v.testo(c, 'note', false, 500)),
    // Il collegamento a un salvadanaio non si sceglie più (decisione 39): si crea un salvadanaio nuovo con
    // `nuovo_salvadanaio`, oppure si scollega con null.
    obiettivo_id: obiettivoNull(c),
    alimenta_obiettivo_id: v.annullabile(c, 'alimenta_obiettivo_id', () => v.id(c, 'alimenta_obiettivo_id')),
    // Budget (decisione 48): il modo e, per «sposto i soldi», i due conti del giroconto.
    budget_modo: v.scelta(c, 'budget_modo', MODI_BUDGET) as (typeof MODI_BUDGET)[number] | null | undefined,
    conto_partenza_id: v.annullabile(c, 'conto_partenza_id', () => v.id(c, 'conto_partenza_id')),
    conto_arrivo_id: v.annullabile(c, 'conto_arrivo_id', () => v.id(c, 'conto_arrivo_id')),
  };
}

const MODI_BUDGET = ['sposto', 'conto'] as const;

// Modo e conti di un budget (decisione 48). `prima` = come sono ora (PATCH). Un budget ha sempre un modo (di base «sposto»);
// i conti esistono solo nel modo «sposto» e devono essere due conti diversi che si vedono; una spesa che non è un budget
// non ha né modo né conti.
async function normalizzaBudget(db: PoolClient, campi: Campi, prima: { tipo: string; budget_modo: string | null; conto_partenza_id: string | null; conto_arrivo_id: string | null } | undefined): Promise<void> {
  const tipo = campi.tipo ?? prima?.tipo;
  if (tipo !== 'budget') {
    if (campi.budget_modo !== undefined || (campi.conto_partenza_id ?? null) !== null || (campi.conto_arrivo_id ?? null) !== null) throw new ErroreApi(400, 'Il modo e i conti di partenza e di arrivo valgono solo per i budget');
    if (prima?.tipo === 'budget') { campi.budget_modo = null; campi.conto_partenza_id = null; campi.conto_arrivo_id = null; }
    return;
  }
  const modo = campi.budget_modo ?? (prima?.budget_modo === 'conto' ? 'conto' : 'sposto');
  campi.budget_modo = modo;
  if (modo === 'conto') {
    if ((campi.conto_partenza_id ?? null) !== null || (campi.conto_arrivo_id ?? null) !== null) throw new ErroreApi(400, 'I conti di partenza e di arrivo valgono solo per «Sposto i soldi»');
    campi.conto_partenza_id = null; campi.conto_arrivo_id = null;
    return;
  }
  const partenza = campi.conto_partenza_id !== undefined ? campi.conto_partenza_id : prima?.conto_partenza_id ?? null;
  const arrivo = campi.conto_arrivo_id !== undefined ? campi.conto_arrivo_id : prima?.conto_arrivo_id ?? null;
  if (partenza && arrivo && partenza === arrivo) throw new ErroreApi(400, 'Il conto di partenza e quello di arrivo devono essere diversi');
  for (const x of [campi.conto_partenza_id, campi.conto_arrivo_id]) {
    if (x && !(await db.query('select 1 from conti where id = $1', [x])).rowCount) throw nonTrovato('Conto');
  }
}

type Campi = ReturnType<typeof leggi>;

// Decisione 44: una spesa mensile ha solo il giorno del mese, non una data. `prossima_scadenza` con ogni_mesi = 1
// non si rifiuta (compatibilità coi vecchi client): diventa il giorno di quella data (a meno che `giorno_mese` non
// sia già scritto) e non si salva. Le altre cadenze non hanno giorno_mese. `ogniPrima` = cadenza attuale (PATCH).
function normalizzaMensile(campi: Campi, ogniPrima: number | null | undefined): void {
  const ogni = campi.ogni_mesi !== undefined ? campi.ogni_mesi : ogniPrima;
  if (ogni === 1) {
    if (campi.giorno_mese === undefined) {
      if (campi.prossima_scadenza && !campi.senza_giorno) campi.giorno_mese = Number(campi.prossima_scadenza.slice(8, 10));
      else if (campi.prossima_scadenza !== undefined || campi.senza_giorno || ogniPrima !== 1) campi.giorno_mese = null;
    }
    if (campi.prossima_scadenza !== undefined || ogniPrima !== 1) campi.prossima_scadenza = null;
    if (campi.senza_giorno !== undefined || ogniPrima !== 1) campi.senza_giorno = false;
  } else {
    if (campi.giorno_mese !== undefined && campi.giorno_mese !== null) throw new ErroreApi(400, 'Il giorno del mese vale solo per le spese mensili');
    if (campi.ogni_mesi !== undefined && ogniPrima === 1) campi.giorno_mese = null;
  }
}

rotteSpese.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = leggi(c, true);
  const nuovo = leggiNuovoSalvadanaio(c);
  // ogni_mesi assente = ogni mese; null esplicito = una volta sola.
  if (!('ogni_mesi' in c)) campi.ogni_mesi = 1;
  normalizzaMensile(campi, undefined);
  // I budget non sono legati ai conti (decisione 47 E): hanno una categoria e basta.
  if (campi.tipo === 'budget') campi.conto_id = null;
  if (campi.senza_giorno && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa senza giorno ha bisogno almeno del mese');
  if (campi.ogni_mesi === null && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa una tantum ha bisogno della data');
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    if (campi.alimenta_obiettivo_id) await vietaPromemoria(db, campi.alimenta_obiettivo_id);
    await categoriaMia(db, campi.categoria_id);
    await normalizzaBudget(db, campi, undefined);
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    if (nuovo) await creaSalvadanaioDaSpesa(db, rows[0].id, nuovo);
    const p = await periodoRichiesto(db, undefined);
    return (await speseDelMese(db, p, rows[0].id))[0];
  });
  res.status(201).json(spesa);
});

rotteSpese.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = leggi(c, false);
  const nuovo = leggiNuovoSalvadanaio(c);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const blocco = await bloccoSpesa(db, id);
    vietaCampi(blocco, nuovo ? [...Object.keys(c), 'obiettivo_id'] : Object.keys(c), erroreSpesaBloccata);
    if (campi.alimenta_obiettivo_id) await vietaPromemoria(db, campi.alimenta_obiettivo_id);
    const sua = (await db.query<{ mia: boolean }>('select proprietario_id = fp_me() as mia from spese_previste where id = $1', [id])).rows[0];
    if (!sua) return undefined;
    const prima = (await db.query<{ ogni_mesi: number | null; prossima_scadenza: string | null; tipo: string; budget_modo: string | null; conto_partenza_id: string | null; conto_arrivo_id: string | null }>(
      'select ogni_mesi, prossima_scadenza, tipo, budget_modo, conto_partenza_id, conto_arrivo_id from spese_previste where id = $1', [id])).rows[0];
    normalizzaMensile(campi, prima.ogni_mesi);
    await normalizzaBudget(db, campi, prima);
    if ((campi.tipo ?? prima.tipo) === 'budget') campi.conto_id = null;
    // Da mensile a periodica serve la data (il mese): niente più «mensile» da cui ricavarla.
    if (prima.ogni_mesi === 1 && campi.ogni_mesi !== undefined && campi.ogni_mesi !== 1 && !campi.prossima_scadenza) {
      throw new ErroreApi(400, campi.ogni_mesi === null ? 'Una spesa una tantum ha bisogno della data' : 'Una spesa non mensile ha bisogno almeno del mese');
    }
    await categoriaMia(db, campi.categoria_id);
    // Chi riceve la spesa cambia solo la SUA categoria, senza toccare quella del creatore.
    const categoriaRicevuta = sua.mia ? undefined : campi.categoria_id;
    const modifiche = sua.mia ? campi : { ...campi, categoria_id: undefined };
    const vuote = Object.values(modifiche).every((x) => x === undefined);
    if (vuote && !nuovo && categoriaRicevuta === undefined) throw new ErroreApi(400, 'Nessun campo da modificare');
    const set = vuote ? null : v.setParziale(modifiche, 2);
    if (categoriaRicevuta !== undefined) {
      await db.query(
        `insert into spese_dati_utente (spesa_prevista_id, utente_id, categoria_id, vista_il) values ($1, fp_me(), $2, now())
         on conflict (spesa_prevista_id, utente_id) do update set categoria_id = $2, vista_il = coalesce(spese_dati_utente.vista_il, now())`,
        [id, categoriaRicevuta]);
    }
    if (campi.obiettivo_id === null) {
      const g = (await db.query<{ nome: string }>('select o.nome from spese_previste s join obiettivi o on o.id = s.obiettivo_id where s.id = $1 and o.da_spesa', [id])).rows[0];
      if (g) throw new ErroreApi(409, `Il salvadanaio «${g.nome}» è stato creato da questa spesa: non si scollega.`);
    }
    if (set) {
      const { rowCount } = await db.query(`update spese_previste set ${set.sql} where id = $1`, [id, ...set.valori]);
      if (!rowCount) return undefined;
    } else if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) return undefined;
    if (nuovo) await creaSalvadanaioDaSpesa(db, id, nuovo);
    const p = await periodoRichiesto(db, undefined);
    return (await speseDelMese(db, p, id))[0];
  });
  if (!spesa) throw nonTrovato('Spesa prevista');
  res.json(spesa);
});

// Chi riceve una spesa condivisa la segna come vista aprendola: l'etichetta «Nuova» sparisce. Per gli altri non fa nulla.
rotteSpese.post('/:id/vista', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) throw nonTrovato('Spesa prevista');
    await db.query('update spese_dati_utente set vista_il = coalesce(vista_il, now()) where spesa_prevista_id = $1 and utente_id = fp_me()', [id]);
  });
  res.status(204).end();
});

rotteSpese.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const blocco = await bloccoSpesa(db, id);
    if (blocco) throw erroreSpesaBloccata(blocco);
    if ((await db.query('delete from spese_previste where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from spese_previste where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato la spesa può cancellarla') : nonTrovato('Spesa prevista');
  });
  res.status(204).end();
});

// La spunta dice che la spesa è uscita nel mese e muove il saldo del conto (decisione 47):
//  - spesa con conto: movimento negativo sul conto (conto condiviso: importo intero; conto solo tuo: la tua quota);
//  - budget «sposto i soldi»: il giroconto tra i due conti del budget (due movimenti collegati); senza i conti solo un segno;
//    budget «conto le uscite»: non si spunta (409), le uscite si registrano da /budget;
//  - promemoria di un salvadanaio: solo un segno, nessun movimento;
//  - spesa pagata da un salvadanaio (non periodica): preleva dal salvadanaio, il conto non si muove;
//  - spesa annuale/periodica: la quota del mese passa dal conto al salvadanaio collegato (movimento negativo + versamento
//    positivo, legati); senza conto solo il versamento; senza salvadanaio solo il movimento (la quota messa da parte).
// I mesi precedenti a quello in corso non si cambiano più (409).
rotteSpese.post('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const risultato = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    await vietaMesePassato(db, p);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    if (s.tipo === 'budget' && s.budget_modo === 'conto') throw new ErroreApi(409, 'Questo budget conta le uscite: non si spunta, si registrano le uscite dalla pagina Budget');
    // Le annuali contano ogni mese come quota: si spuntano anche fuori dal mese della scadenza.
    const annuale = s.attiva && s.tipo !== 'budget' && !s.alimenta_obiettivo_id && s.ogni_mesi !== null && s.ogni_mesi > 1;
    if (!s.nel_mese && !annuale) throw new ErroreApi(400, 'Questa spesa non cade in questo mese');
    if (s.uscita) throw new ErroreApi(409, 'Questa spesa è già uscita in questo mese');
    // Di base oggi se siamo nel mese, altrimenti il giorno della scadenza (una annuale fuori dal mese della scadenza: l'inizio del mese).
    const data = v.data(c, 'data') ?? (oggi() >= p.dal && oggi() <= p.al ? oggi() : (s.nel_mese ? s.scadenza : null) ?? p.dal);
    if (data < p.dal || data > p.al) throw new ErroreApi(400, 'La data deve cadere nel mese della spunta');
    const spunta = (await db.query<{ id: string; data: string }>(
      'insert into spunte (utente_id, spesa_prevista_id, data) values (fp_me(), $1, $2) returning id, data', [id, data])).rows[0];
    // Il movimento e il versamento li scrive il database (decisione 48 B): valgono anche se il conto o il salvadanaio della
    // spesa li vede solo chi l'ha creata.
    if (s.tipo === 'budget') {
      // «Sposto i soldi»: il giroconto tra i due conti del budget (la tua quota). Senza i due conti la spunta è solo un segno.
      if (s.budget_modo === 'sposto' && s.conto_partenza_id && s.conto_arrivo_id) await giroconto(db, spunta.id, Number(s.mia_quota));
      return spunta;
    }
    if (s.alimenta_obiettivo_id) return spunta;
    if (annuale) {
      const quota = Number(s.quota_mensile), intera = Number(s.importo) / s.ogni_mesi!;
      const versamento = s.obiettivo_id && quota >= 0.005 ? quota : 0;
      const sulConto = s.conto_id ? await importoSulConto(db, s.conto_id, intera, quota) : 0;
      // Con un versamento la descrizione («Versato in … (quota di …)») la scrive il database, che il nome del salvadanaio lo vede sempre.
      await muoviPerSpunta(db, spunta.id, { conto: sulConto, causa: versamento ? 'versamento' : 'spesa', versamento, data, descrizione: s.nome });
    } else if (s.obiettivo_id) {
      await muoviPerSpunta(db, spunta.id, { conto: 0, causa: 'spesa', versamento: -Number(s.mia_quota), data, descrizione: s.nome });
    } else if (s.conto_id) {
      const sulConto = await importoSulConto(db, s.conto_id, Number(s.importo), Number(s.mia_quota));
      await muoviPerSpunta(db, spunta.id, { conto: sulConto, causa: 'spesa', versamento: 0, data, descrizione: s.nome });
    }
    return spunta;
  });
  res.status(201).json(risultato);
});

// Toglie la spunta del mese: i soldi tornano (sparisce il movimento sul conto, e il versamento nel salvadanaio o il prelievo). Solo nel mese in corso o futuro.
rotteSpese.delete('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    await vietaMesePassato(db, p);
    const spunte = (await db.query<{ id: string }>('select id from spunte where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al])).rows;
    if (!spunte.length) throw nonTrovato('Spunta');
    for (const x of spunte) await annullaSpunta(db, x.id);
    await db.query('delete from spunte where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al]);
  });
  res.status(204).end();
});

// Come si divide la spesa: [{utente_id, percentuale}], la somma deve fare 100
// (oppure una sola quota, la tua, tra 0 e 100 esclusi: divisione non specificata).
// Elenco vuoto = torna alla divisione di base (tutto a chi l'ha creata, metà se condivisa).
rotteSpese.put('/:id/quote', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  if (!Array.isArray(c.quote)) throw new ErroreApi(400, 'Serve un elenco "quote"');
  const quote = c.quote.map((q) => {
    const r = v.corpo(q);
    return { utente: v.id(r, 'utente_id', true)!, pct: v.importo(r, 'percentuale', true)! };
  });
  const somma = quote.reduce((t, q) => t + Number(q.pct), 0);
  // Una sola quota, la mia, tra 0 e 100 esclusi = divisione «non specificata» (con chi, non si dice).
  const nonSpecificata = quote.length === 1 && quote[0].utente === res.locals.utenteId && Number(quote[0].pct) > 0 && Number(quote[0].pct) < 100;
  if (quote.length && !nonSpecificata && Math.abs(somma - 100) > 0.001) throw new ErroreApi(400, 'Le quote devono fare 100%');
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) throw nonTrovato('Spesa prevista');
    await db.query('delete from quote where spesa_prevista_id = $1', [id]);
    for (const q of quote) {
      await db.query('insert into quote (spesa_prevista_id, utente_id, percentuale) values ($1, $2, $3)', [id, q.utente, q.pct]);
    }
  });
  res.status(204).end();
});
