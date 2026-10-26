import { Router } from 'express';
import { bloccoSpesa, erroreSpesaBloccata, vietaCampi, vietaPromemoria } from '../collegamenti.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { oggi, periodoRichiesto } from '../periodo.ts';
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

function leggi(c: Record<string, unknown>, nuova: boolean) {
  const importo = v.importo(c, 'importo', nuova);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  return {
    nome: v.testo(c, 'nome', nuova, 120),
    importo,
    ogni_mesi: v.annullabile(c, 'ogni_mesi', () => v.intero(c, 'ogni_mesi', 1, 120)),
    prossima_scadenza: v.annullabile(c, 'prossima_scadenza', () => v.data(c, 'prossima_scadenza')),
    senza_giorno: v.booleano(c, 'senza_giorno'),
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
    tipo: v.scelta(c, 'tipo', TIPI),
    attiva: v.booleano(c, 'attiva'),
    note: v.annullabile(c, 'note', () => v.testo(c, 'note', false, 500)),
    // Il collegamento a un salvadanaio non si sceglie più (decisione 39): si crea un salvadanaio nuovo con
    // `nuovo_salvadanaio`, oppure si scollega con null.
    obiettivo_id: obiettivoNull(c),
    alimenta_obiettivo_id: v.annullabile(c, 'alimenta_obiettivo_id', () => v.id(c, 'alimenta_obiettivo_id')),
  };
}

rotteSpese.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = leggi(c, true);
  const nuovo = leggiNuovoSalvadanaio(c);
  // ogni_mesi assente = ogni mese; null esplicito = una volta sola.
  if (!('ogni_mesi' in c)) campi.ogni_mesi = 1;
  if (campi.senza_giorno && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa senza giorno ha bisogno almeno del mese');
  if (campi.ogni_mesi === null && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa una tantum ha bisogno della data');
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    if (campi.alimenta_obiettivo_id) await vietaPromemoria(db, campi.alimenta_obiettivo_id);
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
  const set = nuovo && Object.values(campi).every((x) => x === undefined) ? null : v.setParziale(campi, 2);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const blocco = await bloccoSpesa(db, id);
    vietaCampi(blocco, nuovo ? [...Object.keys(c), 'obiettivo_id'] : Object.keys(c), erroreSpesaBloccata);
    if (campi.alimenta_obiettivo_id) await vietaPromemoria(db, campi.alimenta_obiettivo_id);
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

// La spunta è solo un segno nel mese, come nell'Excel. Per una spesa annuale vuol dire "quota del mese messa da parte" e non preleva nulla (il prelievo dal salvadanaio, quando la spesa esce davvero, lo scrive l'utente). Un'altra spesa pagata da un salvadanaio, spuntata, preleva da lì; il promemoria di un salvadanaio, spuntato, non muove soldi.
rotteSpese.post('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const risultato = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    // Le annuali contano ogni mese come quota: si spuntano anche fuori dal mese della scadenza.
    const annuale = s.attiva && s.tipo !== 'budget' && !s.alimenta_obiettivo_id && s.ogni_mesi !== null && s.ogni_mesi > 1;
    if (!s.nel_mese && !annuale) throw new ErroreApi(400, 'Questa spesa non cade in questo mese');
    if (s.uscita) throw new ErroreApi(409, 'Questa spesa è già uscita in questo mese');
    // Di base oggi se siamo nel mese, altrimenti il giorno della scadenza (una annuale fuori dal mese della scadenza: l'inizio del mese).
    const data = v.data(c, 'data') ?? (oggi() >= p.dal && oggi() <= p.al ? oggi() : (s.nel_mese ? s.scadenza : null) ?? p.dal);
    if (data < p.dal || data > p.al) throw new ErroreApi(400, 'La data deve cadere nel mese della spunta');
    const spunta = (await db.query<{ id: string; data: string }>(
      'insert into spunte (utente_id, spesa_prevista_id, data) values (fp_me(), $1, $2) returning id, data', [id, data])).rows[0];
    if (s.obiettivo_id && !annuale) {
      await db.query('insert into versamenti (obiettivo_id, utente_id, data, importo, spunta_id) values ($1, fp_me(), $2, $3, $4)',
        [s.obiettivo_id, data, `-${s.mia_quota}`, spunta.id]);
    }
    return spunta;
  });
  res.status(201).json(risultato);
});

// Toglie la spunta del mese (e il prelievo dal salvadanaio).
rotteSpese.delete('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const spunte = (await db.query('delete from spunte where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al])).rowCount ?? 0;
    if (!spunte) throw nonTrovato('Spunta');
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
