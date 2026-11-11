import { Router } from 'express';
import { assetDelSalvadanaio, assetDisponibili } from '../asset-dei-salvadanai.ts';
import { alberoSalvadanai, cent, eliminaSalvadanaio, trova, versatoProprio } from '../ceste.ts';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import * as v from '../valida.ts';

// I salvadanai (decisione 72): liberi (non stanno in nessun conto), annidabili, con traguardo e data facoltativi e traguardi di copertura.
// Si versa e si preleva a mano (POST /sposta). Sono obiettivi (decisione 73): le spese non mensili hanno la loro cesta, un numero sulla spesa.
// Montate su /salvadanai (e, come prima, su /ceste).

export const rotteCeste = Router();

// Gli errori che il database scrive con un messaggio chiaro (regole sui salvadanai) diventano 400.
const traduci = (e: unknown): never => {
  if ((e as { code?: string }).code === 'P0001') throw new ErroreApi(400, (e as Error).message);
  throw e;
};

rotteCeste.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, alberoSalvadanai));
});

rotteCeste.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const s = await conUtente(res.locals.utenteId, async (db) => trova(await alberoSalvadanai(db), id));
  if (!s) throw nonTrovato('Salvadanaio');
  res.json(s);
});

function leggi(c: Record<string, unknown>, nuovo: boolean) {
  const traguardo = v.annullabile(c, 'traguardo', () => v.importo(c, 'traguardo'));
  if (traguardo && Number(traguardo) <= 0) throw new ErroreApi(400, 'Il traguardo deve essere positivo');
  return {
    nome: v.testo(c, 'nome', nuovo, 120),
    icona: v.annullabile(c, 'icona', () => v.testo(c, 'icona', false, 60)),
    traguardo,
    scadenza: v.annullabile(c, 'scadenza', () => v.data(c, 'scadenza')),
    padre_id: v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')),
  };
}

// Corpo: nome, icona, traguardo, scadenza, padre_id (il salvadanaio che lo contiene; vuoto = in cima: tutti facoltativi tranne il nome).
rotteCeste.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = leggi(c, true);
  const s = await conUtente(res.locals.utenteId, async (db) => {
    if (campi.padre_id && !(await db.query('select 1 from ceste where id = $1', [campi.padre_id])).rowCount) throw nonTrovato('Salvadanaio superiore');
    try {
      const { rows } = await db.query<{ id: string }>(
        `insert into ceste (proprietario_id, padre_id, nome, icona, traguardo, scadenza) values (fp_me(), $1, $2, $3, $4, $5) returning id`,
        [campi.padre_id ?? null, campi.nome, campi.icona ?? 'piggy-bank', campi.traguardo ?? null, campi.scadenza ?? null]);
      return trova(await alberoSalvadanai(db), rows[0].id);
    } catch (e) { return traduci(e); }
  });
  res.status(201).json(s);
});

rotteCeste.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = leggi(c, false);
  const s = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) return undefined;
    if (campi.padre_id && !(await db.query('select 1 from ceste where id = $1', [campi.padre_id])).rowCount) throw nonTrovato('Salvadanaio superiore');
    const set = v.setParziale(campi, 2);
    try {
      await db.query(`update ceste set ${set.sql} where id = $1`, [id, ...set.valori]);
    } catch (e) { return traduci(e); }
    return trova(await alberoSalvadanai(db), id);
  });
  if (!s) throw nonTrovato('Salvadanaio');
  res.json(s);
});

// Si elimina sempre. I sotto-salvadanai salgono in quello che lo
// conteneva e i suoi soldi propri vanno lì (se è in cima, escono da ogni salvadanaio).
rotteCeste.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) throw nonTrovato('Salvadanaio');
    await eliminaSalvadanaio(db, id);
  });
  res.status(204).end();
});

// Versa e preleva: `da` e `a` sono un salvadanaio o null (= fuori da ogni salvadanaio); almeno uno è un salvadanaio. Versare da null è
// sempre possibile (nessun limite: non è il saldo); da un salvadanaio si prende al massimo quanto c'è nella sua parte propria (i
// sotto-salvadanai hanno i loro soldi). Risponde con l'albero di tutti i salvadanai.
rotteCeste.post('/sposta', async (req, res) => {
  const c = v.corpo(req.body);
  const da = v.annullabile(c, 'da', () => v.id(c, 'da')) ?? null;
  const a = v.annullabile(c, 'a', () => v.id(c, 'a')) ?? null;
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  if (!da && !a) throw new ErroreApi(400, 'Scegli almeno un salvadanaio');
  if (da === a) throw new ErroreApi(400, 'Scegli due posti diversi');
  const momento = v.data(c, 'data') ?? null;
  const descrizione = v.testo(c, 'descrizione', false, 200) ?? '';
  const albero = await conUtente(res.locals.utenteId, async (db) => {
    const trovati = (await db.query<{ id: string; nome: string }>('select id, nome from ceste where id = any($1::uuid[]) order by id for update', [[da, a].filter(Boolean)])).rows;
    const dk = da ? trovati.find((x) => x.id === da) : undefined;
    if ((da && !dk) || (a && !trovati.some((x) => x.id === a))) throw nonTrovato('Salvadanaio');
    const quanto = Number(importo);
    if (da) {
      const propria = await versatoProprio(db, da);
      if (quanto > propria + 0.005) throw new ErroreApi(400, `Nel salvadanaio «${dk!.nome}» puoi prendere al massimo ${cent(Math.max(0, propria))} €: il resto è nei suoi sotto-salvadanai`);
    }
    await db.query(
      `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, momento, descrizione)
       values (fp_me(), $1, $2, $3, case when $4::date is null or $4::date = current_date then now() else ($4::date + time '12:00')::timestamptz end, $5)`,
      [da, a, cent(quanto), momento, descrizione]);
    return alberoSalvadanai(db);
  });
  res.status(201).json(albero);
});

// Traguardi di copertura.
rotteCeste.post('/:id/traguardi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const nome = v.testo(c, 'nome', true, 120), ordine = v.intero(c, 'ordine', 0, 1000) ?? null;
  const traguardo = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) throw nonTrovato('Salvadanaio');
    return (await db.query(
      `insert into traguardi_copertura (cesta_id, nome, importo, ordine)
       values ($1, $2, $3, coalesce($4, (select count(*) from traguardi_copertura where cesta_id = $1)))
       returning id, cesta_id, nome, importo::text as importo, ordine`, [id, nome, importo, ordine])).rows[0];
  });
  res.status(201).json(traguardo);
});

rotteCeste.patch('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo');
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const set = v.setParziale({ nome: v.testo(c, 'nome', false, 120), importo, ordine: v.intero(c, 'ordine', 0, 1000) }, 2);
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `update traguardi_copertura set ${set.sql} where id = $1 returning id, cesta_id, nome, importo::text as importo, ordine`, [id, ...set.valori])).rows[0]);
  if (!traguardo) throw nonTrovato('Traguardo');
  res.json(traguardo);
});

rotteCeste.delete('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cancellati = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('delete from traguardi_copertura where id = $1', [id])).rowCount);
  if (!cancellati) throw nonTrovato('Traguardo');
  res.status(204).end();
});

// Investimenti collegati (decisione 75): solo etichetta, nessun numero del salvadanaio cambia. Privati di chi li collega.
// GET /asset/disponibili: gli asset di chi chiede (titoli per portafoglio e beni) con il valore di oggi, da cui scegliere.
rotteCeste.get('/asset/disponibili', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, assetDisponibili));
});

rotteCeste.get('/:id/asset', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  res.json(await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) throw nonTrovato('Salvadanaio');
    return assetDelSalvadanaio(db, id);
  }));
});

// Corpo: o `bene_id`, oppure `titolo_id` + `portafoglio_id` (una posizione). Già collegato: 409.
rotteCeste.post('/:id/asset', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const beneId = v.id(c, 'bene_id'), titoloId = v.id(c, 'titolo_id'), portafoglioId = v.id(c, 'portafoglio_id');
  if (beneId ? titoloId || portafoglioId : !(titoloId && portafoglioId)) throw new ErroreApi(400, 'Indica un bene, oppure un titolo con il suo portafoglio');
  const esito = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('select 1 from ceste where id = $1', [id])).rowCount) throw nonTrovato('Salvadanaio');
    const esiste = beneId
      ? await db.query('select 1 from beni where id = $1', [beneId])
      : await db.query(`select 1 from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto' limit 1`, [titoloId, portafoglioId]);
    if (!esiste.rowCount) throw nonTrovato(beneId ? 'Bene' : 'Titolo nel portafoglio');
    const doppio = await db.query(
      `select 1 from collegamenti_asset where cesta_id = $1 and proprietario_id = fp_me() and (($2::uuid is not null and bene_id = $2) or ($2::uuid is null and titolo_id = $3 and portafoglio_id = $4))`,
      [id, beneId ?? null, titoloId ?? null, portafoglioId ?? null]);
    if (doppio.rowCount) throw new ErroreApi(409, 'Questo investimento è già collegato al salvadanaio');
    await db.query(
      'insert into collegamenti_asset (proprietario_id, cesta_id, titolo_id, portafoglio_id, bene_id) values (fp_me(), $1, $2, $3, $4)',
      [id, titoloId ?? null, portafoglioId ?? null, beneId ?? null]);
    return assetDelSalvadanaio(db, id);
  });
  res.status(201).json(esito);
});

rotteCeste.delete('/:id/asset/:collegamentoId', async (req, res) => {
  const id = v.idPercorso(req.params.id), collegamentoId = v.idPercorso(req.params.collegamentoId);
  await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query('delete from collegamenti_asset where id = $1 and cesta_id = $2 and proprietario_id = fp_me()', [collegamentoId, id])).rowCount) throw nonTrovato('Collegamento');
  });
  res.status(204).end();
});
