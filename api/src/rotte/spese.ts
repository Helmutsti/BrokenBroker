import { Router } from 'express';
import type { PoolClient } from 'pg';
import { accendiMettiDaParte, scalaSalvadanaioDellaSpesa, spegniMettiDaParte } from '../ceste.ts';
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

const ERRORE_MENSILE_DA_PARTE = 'Una spesa mensile non si mette da parte: serve per le annuali e le una tantum';

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
  };
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
  // ogni_mesi assente = ogni mese; null esplicito = una volta sola.
  if (!('ogni_mesi' in c)) campi.ogni_mesi = 1;
  normalizzaMensile(campi, undefined);
  if (campi.senza_giorno && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa senza giorno ha bisogno almeno del mese');
  if (campi.ogni_mesi === null && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa una tantum ha bisogno della data');
  const mettiDaParte = v.booleano(c, 'metti_da_parte');
  if (mettiDaParte && campi.ogni_mesi === 1) throw new ErroreApi(400, ERRORE_MENSILE_DA_PARTE);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    await categoriaMia(db, campi.categoria_id);
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    if (mettiDaParte) await accendiMettiDaParte(db, { id: rows[0].id, nome: campi.nome! });
    const p = await periodoRichiesto(db, undefined);
    return (await speseDelMese(db, p, rows[0].id))[0];
  });
  res.status(201).json(spesa);
});

rotteSpese.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = leggi(c, false);
  const mettiDaParte = v.booleano(c, 'metti_da_parte');
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const sua = (await db.query<{ mia: boolean }>('select proprietario_id = fp_me() as mia from spese_previste where id = $1', [id])).rows[0];
    if (!sua) return undefined;
    const prima = (await db.query<{ ogni_mesi: number | null; nome: string }>('select ogni_mesi, nome from spese_previste where id = $1', [id])).rows[0];
    if (mettiDaParte !== undefined && !sua.mia) throw new ErroreApi(403, 'Solo chi ha creato la spesa può metterla da parte');
    normalizzaMensile(campi, prima.ogni_mesi);
    const ogniDopo = campi.ogni_mesi !== undefined ? campi.ogni_mesi : prima.ogni_mesi;
    if (mettiDaParte && ogniDopo === 1) throw new ErroreApi(400, ERRORE_MENSILE_DA_PARTE);
    // Da mensile a periodica serve la data (il mese): niente più «mensile» da cui ricavarla.
    if (prima.ogni_mesi === 1 && campi.ogni_mesi !== undefined && campi.ogni_mesi !== 1 && !campi.prossima_scadenza) {
      throw new ErroreApi(400, campi.ogni_mesi === null ? 'Una spesa una tantum ha bisogno della data' : 'Una spesa non mensile ha bisogno almeno del mese');
    }
    await categoriaMia(db, campi.categoria_id);
    // Chi riceve la spesa cambia solo la SUA categoria, senza toccare quella del creatore.
    const categoriaRicevuta = sua.mia ? undefined : campi.categoria_id;
    const modifiche = sua.mia ? campi : { ...campi, categoria_id: undefined };
    const vuote = Object.values(modifiche).every((x) => x === undefined);
    if (vuote && categoriaRicevuta === undefined && mettiDaParte === undefined) throw new ErroreApi(400, 'Nessun campo da modificare');
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
    // Il salvadanaio collegato segue la spesa: spento se la spesa diventa mensile o se lo si spegne, acceso se lo si accende, altrimenti
    // ne segue il nome.
    if (sua.mia) {
      const nome = campi.nome ?? prima.nome;
      if (mettiDaParte === false || ogniDopo === 1) await spegniMettiDaParte(db, id);
      else if (mettiDaParte === true || campi.nome !== undefined) {
        if (mettiDaParte === true || (await db.query('select 1 from ceste where spesa_id = $1', [id])).rowCount) await accendiMettiDaParte(db, { id, nome });
      }
    }
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
    // Un salvadanaio collegato alla spesa si spegne prima (i suoi soldi vanno in «Spese annuali»); se la spesa non è di chi chiede non esiste per lui.
    await spegniMettiDaParte(db, id);
    if ((await db.query('delete from spese_previste where id = $1', [id])).rowCount) return;
    const visibile = (await db.query('select 1 from spese_previste where id = $1', [id])).rowCount;
    throw visibile ? new ErroreApi(403, 'Solo chi ha creato la spesa può cancellarla') : nonTrovato('Spesa prevista');
  });
  res.status(204).end();
});

// La spunta dice che la spesa è uscita e crea la sua uscita (la tua quota, con la categoria): il saldo scende (rotte/saldo.ts) e, se c'è, il
// salvadanaio collegato scende. Togliendo la spunta tutto torna com'era.
// Mensili: si spunta solo nel mese in cui cadono. Annuali e una tantum (ogni_mesi null o >= 2): si spunta in qualunque mese e la spunta vale per la
// scadenza in corso (vedi `meseScadenzaInCorso`), per intero; `per_mese` ricorda il mese della scadenza pagata, anche se si paga in anticipo.
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
      'insert into spunte (utente_id, spesa_prevista_id, data, per_mese) values (fp_me(), $1, $2, $3) returning id, data', [id, data, perMese])).rows[0];
    await uscitaDaSpunta(db, { spunta, mia: Number(s.mia_quota), descrizione: s.nome, categoria: s.categoria_id });
    // Se un salvadanaio è collegato a questa spesa, scende della stessa quota (non sotto zero); togliendo la spunta torna com'era.
    await scalaSalvadanaioDellaSpesa(db, id, spunta.id, Number(s.mia_quota), s.nome);
    return spunta;
  });
  res.status(201).json(risultato);
});

// Toglie la spunta (e con lei la sua uscita e lo spostamento dal salvadanaio): per le annuali quella della scadenza in corso vista da `mese`.
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
