import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { oggi, periodoRichiesto } from '../periodo.ts';
import { speseDelMese } from '../spese.ts';
import * as v from '../valida.ts';
import { dividiVersamento } from './obiettivi.ts';

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

function leggi(c: Record<string, unknown>, nuova: boolean) {
  const importo = v.importo(c, 'importo', nuova);
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  return {
    nome: v.testo(c, 'nome', nuova, 120),
    importo,
    ogni_mesi: v.annullabile(c, 'ogni_mesi', () => v.intero(c, 'ogni_mesi', 1, 120)),
    prossima_scadenza: v.annullabile(c, 'prossima_scadenza', () => v.data(c, 'prossima_scadenza')),
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
    tipo: v.scelta(c, 'tipo', TIPI),
    attiva: v.booleano(c, 'attiva'),
    note: v.annullabile(c, 'note', () => v.testo(c, 'note', false, 500)),
    obiettivo_id: v.annullabile(c, 'obiettivo_id', () => v.id(c, 'obiettivo_id')),
    alimenta_obiettivo_id: v.annullabile(c, 'alimenta_obiettivo_id', () => v.id(c, 'alimenta_obiettivo_id')),
  };
}

rotteSpese.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = leggi(c, true);
  // ogni_mesi assente = ogni mese; null esplicito = una volta sola.
  if (!('ogni_mesi' in c)) campi.ogni_mesi = 1;
  if (campi.ogni_mesi === null && !campi.prossima_scadenza) throw new ErroreApi(400, 'Una spesa una tantum ha bisogno della data');
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
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
  const set = v.setParziale(leggi(v.corpo(req.body), false), 2);
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const { rowCount } = await db.query(`update spese_previste set ${set.sql} where id = $1`, [id, ...set.valori]);
    if (!rowCount) return undefined;
    const p = await periodoRichiesto(db, undefined);
    return (await speseDelMese(db, p, id))[0];
  });
  if (!spesa) throw nonTrovato('Spesa prevista');
  res.json(spesa);
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

// La spunta "uscito" è solo un segno nel mese, come nell'Excel: niente movimento
// sul conto. Una spesa pagata da un salvadanaio, spuntata, preleva da lì.
rotteSpese.post('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const risultato = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    const [s] = await speseDelMese(db, p, id);
    if (!s) throw nonTrovato('Spesa prevista');
    if (s.tipo === 'budget') throw new ErroreApi(400, 'Un budget si riempie con i movimenti, non si spunta');
    if (!s.nel_mese) throw new ErroreApi(400, 'Questa spesa non cade in questo mese');
    if (s.uscita) throw new ErroreApi(409, 'Questa spesa è già uscita in questo mese');
    // Di base oggi se siamo nel mese, altrimenti il giorno della scadenza.
    const data = v.data(c, 'data') ?? (oggi() >= p.dal && oggi() <= p.al ? oggi() : s.scadenza ?? p.dal);
    if (data < p.dal || data > p.al) throw new ErroreApi(400, 'La data deve cadere nel mese della spunta');
    const spunta = (await db.query<{ id: string; data: string }>(
      'insert into spunte (utente_id, spesa_prevista_id, data) values (fp_me(), $1, $2) returning id, data', [id, data])).rows[0];
    if (s.obiettivo_id) {
      await db.query('insert into versamenti (obiettivo_id, utente_id, data, importo, spunta_id) values ($1, fp_me(), $2, $3, $4)',
        [s.obiettivo_id, data, `-${s.mia_quota}`, spunta.id]);
    }
    // "Mettici da parte": la cifra entra nel salvadanaio, divisa tra i sotto-obiettivi.
    if (s.alimenta_obiettivo_id) {
      for (const { obiettivo_id, importo } of await dividiVersamento(db, s.alimenta_obiettivo_id, Number(s.mia_quota))) {
        await db.query('insert into versamenti (obiettivo_id, utente_id, data, importo, spunta_id) values ($1, fp_me(), $2, $3, $4)',
          [obiettivo_id, data, importo, spunta.id]);
      }
    }
    return spunta;
  });
  res.status(201).json(risultato);
});

// Toglie la spunta del mese (e il prelievo dal salvadanaio). Toglie anche le
// spunte fatte prima con un movimento collegato.
rotteSpese.delete('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const spunte = (await db.query('delete from spunte where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al])).rowCount ?? 0;
    const { rows } = await db.query<{ id: string }>(
      'select id from movimenti where spesa_prevista_id = $1 and data between $2 and $3', [id, p.dal, p.al]);
    if (!rows.length && !spunte) throw nonTrovato('Spunta');
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await db.query('delete from versamenti where movimento_id = any($1)', [ids]);
      const { rowCount } = await db.query('delete from movimenti where id = any($1)', [ids]);
      if (rowCount !== ids.length) throw new ErroreApi(403, "Può togliere la spunta chi l'ha messa o il proprietario del conto");
    }
  });
  res.status(204).end();
});

// Come si divide la spesa: [{utente_id, percentuale}], la somma deve fare 100.
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
  if (quote.length && Math.abs(somma - 100) > 0.001) throw new ErroreApi(400, 'Le quote devono fare 100%');
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from spese_previste where id = $1', [id])).rowCount) throw nonTrovato('Spesa prevista');
    await db.query('delete from quote where spesa_prevista_id = $1', [id]);
    for (const q of quote) {
      await db.query('insert into quote (spesa_prevista_id, utente_id, percentuale) values ($1, $2, $3)', [id, q.utente, q.pct]);
    }
  });
  res.status(204).end();
});
