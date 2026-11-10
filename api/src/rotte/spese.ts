import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { oggi, periodo, periodoRichiesto } from '../periodo.ts';
import { eAnnuale, meseScadenzaInCorso, speseDelMese } from '../spese.ts';
import { uscitaDaSpunta } from '../transazioni.ts';
import * as v from '../valida.ts';

export const rotteSpese = Router();

const TIPI = ['fissa', 'investimento'] as const;

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

// Le categorie non si condividono (decisione 43): su una spesa si sceglie solo una categoria propria.
async function categoriaMia(db: PoolClient, id: string | null | undefined) {
  if (!id) return;
  if (!(await db.query('select 1 from categorie where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw nonTrovato('Categoria');
}

// I gruppi non si condividono (decisione 74): su una spesa si sceglie solo un gruppo proprio.
async function gruppoMio(db: PoolClient, id: string | null | undefined) {
  if (!id) return;
  if (!(await db.query('select 1 from gruppi where id = $1 and proprietario_id = fp_me()', [id])).rowCount) throw nonTrovato('Gruppo');
}

function leggi(c: Record<string, unknown>, nuova: boolean) {
  const importo = v.importo(c, 'importo', nuova);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  return {
    nome: v.testo(c, 'nome', nuova, 120),
    importo,
    // La cesta (decisione 73): il raccolto si può correggere a mano, anche sotto zero.
    raccolto: v.importo(c, 'raccolto'),
    ogni_mesi: v.annullabile(c, 'ogni_mesi', () => v.intero(c, 'ogni_mesi', 1, 120)),
    prossima_scadenza: v.annullabile(c, 'prossima_scadenza', () => v.data(c, 'prossima_scadenza')),
    senza_giorno: v.booleano(c, 'senza_giorno'),
    giorno_mese: v.annullabile(c, 'giorno_mese', () => v.intero(c, 'giorno_mese', 1, 31)),
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
    gruppo_id: v.annullabile(c, 'gruppo_id', () => v.id(c, 'gruppo_id')),
    tipo: v.scelta(c, 'tipo', TIPI),
    attiva: v.booleano(c, 'attiva'),
    note: v.annullabile(c, 'note', () => v.testo(c, 'note', false, 500)),
  };
}

type Campi = ReturnType<typeof leggi>;

const ERRORE_RACCOLTO_MENSILE = 'Una spesa mensile non ha la cesta: serve per le spese ogni 2 mesi o più e per quelle una volta sola';

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
  // ogni_mesi assente = ogni mese; null esplicito = una volta sola.
  if (!('ogni_mesi' in c)) campi.ogni_mesi = 1;
  normalizzaMensile(campi, undefined);
  if (campi.senza_giorno && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa senza giorno ha bisogno almeno del mese');
  if (campi.ogni_mesi === null && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa una tantum ha bisogno della data');
  if (campi.raccolto !== undefined && campi.ogni_mesi === 1) throw new ErroreApi(400, ERRORE_RACCOLTO_MENSILE);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    await categoriaMia(db, campi.categoria_id);
    await gruppoMio(db, campi.gruppo_id);
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    const p = await periodoRichiesto(db, undefined);
    return (await speseDelMese(db, p, rows[0].id))[0];
  });
  res.status(201).json(spesa);
});

rotteSpese.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = leggi(c, false);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const sua = (await db.query<{ mia: boolean }>('select proprietario_id = fp_me() as mia from spese_previste where id = $1', [id])).rows[0];
    if (!sua) return undefined;
    const prima = (await db.query<{ ogni_mesi: number | null }>('select ogni_mesi from spese_previste where id = $1', [id])).rows[0];
    normalizzaMensile(campi, prima.ogni_mesi);
    const ogniDopo = campi.ogni_mesi !== undefined ? campi.ogni_mesi : prima.ogni_mesi;
    if (campi.raccolto !== undefined && ogniDopo === 1) throw new ErroreApi(400, ERRORE_RACCOLTO_MENSILE);
    // Da mensile a periodica serve la data (il mese): niente più «mensile» da cui ricavarla.
    if (prima.ogni_mesi === 1 && campi.ogni_mesi !== undefined && campi.ogni_mesi !== 1 && !campi.prossima_scadenza) {
      throw new ErroreApi(400, campi.ogni_mesi === null ? 'Una spesa una tantum ha bisogno della data' : 'Una spesa non mensile ha bisogno almeno del mese');
    }
    await categoriaMia(db, campi.categoria_id);
    await gruppoMio(db, campi.gruppo_id);
    // Chi riceve la spesa cambia solo la SUA categoria, senza toccare quella del creatore.
    const categoriaRicevuta = sua.mia ? undefined : campi.categoria_id;
    const modifiche = sua.mia ? campi : { ...campi, categoria_id: undefined, gruppo_id: undefined };
    const vuote = Object.values(modifiche).every((x) => x === undefined);
    if (vuote && categoriaRicevuta === undefined) throw new ErroreApi(400, 'Nessun campo da modificare');
    const set = vuote ? null : v.setParziale(modifiche, 2);
    if (categoriaRicevuta !== undefined) {
      await db.query(
        `insert into spese_dati_utente (spesa_prevista_id, utente_id, categoria_id, vista_il) values ($1, fp_me(), $2, now())
         on conflict (spesa_prevista_id, utente_id) do update set categoria_id = $2, vista_il = coalesce(spese_dati_utente.vista_il, now())`,
        [id, categoriaRicevuta]);
    }
    if (set) {
      const { rowCount } = await db.query(`update spese_previste set ${set.sql} where id = $1`, [id, ...set.valori]);
      if (!rowCount) return undefined;
    } else if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) return undefined;
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
    if ((await db.query('delete from spese_previste where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from spese_previste where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato la spesa può cancellarla') : nonTrovato('Spesa prevista');
  });
  res.status(204).end();
});

// Le non mensili (ogni_mesi null o >= 2, decisione 73) hanno due gesti. La QUOTA DEL MESE (`/quota`, la casella della riga): la spunti in ogni mese, una per mese
// personale; salva la tua quota «Al mese» di quel momento (`quote_annuali.importo`), il raccolto sale e il saldo scende della stessa cifra (saldi.ts);
// togliendola tutto torna esattamente com'era. La spesa PAGATA (`/spunta`, «Segna pagata»): è l'uscita vera della scadenza in corso, anche in anticipo;
// scende solo il raccolto (la tua quota della scadenza, `raccolto_scalato`, via trigger), il saldo no (i soldi sono già usciti mese per mese con le quote)
// e non nasce nessun movimento. Togliendo la spunta il raccolto torna com'era.
// Mensili: la spunta crea la tua uscita (la tua quota, con la categoria) e il saldo scende; si spunta solo nel mese in cui cadono.
// Annuali e una tantum: la spunta vale per la scadenza in corso (vedi `meseScadenzaInCorso`), per intero; `per_mese` ricorda il mese della scadenza pagata.
rotteSpese.post('/:id/quota', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const risultato = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    if (!eAnnuale(s.ogni_mesi)) throw new ErroreApi(400, 'La quota del mese vale solo per le spese ogni 2 mesi o più e per quelle una volta sola');
    if (!s.attiva) throw new ErroreApi(400, 'La spesa non è attiva');
    if (s.quota_spuntata) throw new ErroreApi(409, 'La quota di questo mese è già spuntata');
    return (await db.query<{ id: string; importo: string }>(
      'insert into quote_annuali (spesa_prevista_id, utente_id, per_mese, importo) values ($1, fp_me(), $2, $3) returning id, importo::text as importo',
      [id, `${p.mese}-01`, s.al_mese])).rows[0];
  });
  res.status(201).json(risultato);
});

rotteSpese.delete('/:id/quota', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) throw nonTrovato('Spesa prevista');
    const { rowCount } = await db.query('delete from quote_annuali where spesa_prevista_id = $1 and utente_id = fp_me() and per_mese = $2', [id, `${p.mese}-01`]);
    if (!rowCount) throw nonTrovato('Quota del mese');
  });
  res.status(204).end();
});

rotteSpese.post('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const risultato = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    const annuale = eAnnuale(s.ogni_mesi);
    if (annuale ? !s.attiva || !s.scadenza_in_corso : !s.nel_mese) throw new ErroreApi(400, 'Questa spesa non cade in questo mese');
    if (s.uscita) throw new ErroreApi(409, annuale ? 'La scadenza in corso di questa spesa è già pagata' : 'Questa spesa è già uscita in questo mese');
    let data: string;
    let perMese: string | null = null;
    if (annuale) {
      // Di base oggi (è quando i soldi escono davvero), anche se la scadenza è un altro mese.
      data = v.data(c, 'data') ?? oggi();
      perMese = `${s.scadenza_in_corso}-01`;
    } else {
      // Di base oggi se siamo nel mese, altrimenti il giorno della scadenza.
      data = v.data(c, 'data') ?? (oggi() >= p.dal && oggi() <= p.al ? oggi() : s.scadenza ?? p.dal);
      if (data < p.dal || data > p.al) throw new ErroreApi(400, 'La data deve cadere nel mese della spunta');
    }
    const spunta = (await db.query<{ id: string; data: string }>(
      'insert into spunte (utente_id, spesa_prevista_id, data, per_mese, raccolto_scalato) values (fp_me(), $1, $2, $3, $4) returning id, data',
      [id, data, perMese, annuale ? s.mia_quota : '0.00'])).rows[0];
    // Le non mensili segnate pagate non toccano il saldo (le quote del mese sono già uscite): niente uscita.
    if (!annuale) await uscitaDaSpunta(db, { spunta, mia: Number(s.mia_quota), descrizione: s.nome, categoria: s.categoria_id });
    return spunta;
  });
  res.status(201).json(risultato);
});

// Toglie la spunta (e con lei la sua uscita, se c'è; il raccolto torna com'era): per le annuali quella della scadenza in corso vista da `mese`.
rotteSpese.delete('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    const mese = eAnnuale(s.ogni_mesi) ? meseScadenzaInCorso(s, p) : null;
    const tolte = mese
      ? await db.query(
        `delete from spunte where spesa_prevista_id = $1
            and (per_mese = $2 or (per_mese is null and data between $3 and $4))`, [id, `${mese}-01`, periodo(mese, p.inizio).dal, periodo(mese, p.inizio).al])
      : await db.query('delete from spunte where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al]);
    if (!tolte.rowCount) throw nonTrovato('Spunta');
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
