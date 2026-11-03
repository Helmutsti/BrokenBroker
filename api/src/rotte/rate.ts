import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { mesiTra, oggi, periodo as periodoMese, periodoRichiesto } from '../periodo.ts';
import { conSpunte, leggiRate, spunteDelleRate, statoRata } from '../rate.ts';
import { uscitaDaSpunta } from '../transazioni.ts';
import * as v from '../valida.ts';

// Rate (private). Si indica il numero di rate oppure la data dell'ultima,
// insieme alla prima scadenza: l'altro si calcola (decisione 24).

export const rotteRate = Router();

function numeroRate(c: Record<string, unknown>, prima: string | undefined): number | undefined {
  const numero = v.intero(c, 'numero_rate', 1, 600);
  const ultima = v.data(c, 'ultima_scadenza');
  if (numero !== undefined && ultima !== undefined) throw new ErroreApi(400, 'Indica il numero di rate oppure la data finale, non entrambi');
  if (ultima === undefined) return numero;
  if (!prima) throw new ErroreApi(400, 'Con la data finale serve anche la prima scadenza');
  const n = mesiTra(prima, ultima) + 1;
  if (n < 1) throw new ErroreApi(400, "L'ultima rata deve venire dopo la prima");
  return n;
}

function importoPositivo(c: Record<string, unknown>, campo: string, obbligatorio: boolean) {
  const i = v.importo(c, campo, obbligatorio);
  if (i !== undefined && Number(i) <= 0) throw new ErroreApi(400, `Il campo "${campo}" deve essere positivo`);
  return i;
}

// ?mese=AAAA-MM aggiunge a ogni rata la «rata in corso» (scadenza e numero), se è pagata (anche in anticipo) e quante scadenze contano nelle spese del mese.
rotteRate.get('/', async (req, res) => {
  res.json(await conUtente(res.locals.utenteId, async (db) => {
    const rate = await leggiRate(db);
    if (req.query.mese === undefined) return rate;
    const p = await periodoRichiesto(db, req.query.mese);
    const spunte = await spunteDelleRate(db, rate.map((r) => r.id));
    return rate.map((r0) => {
      const r = conSpunte(r0, spunte.get(r0.id) ?? [], p);
      const s = statoRata(r, spunte.get(r.id) ?? [], p);
      return { ...r, scadenza: s.in_corso?.scadenza ?? null, numero: s.in_corso?.numero ?? null, pagata: s.pagata, contate: s.contate, contate_pagate: s.contate_pagate };
    });
  }));
});

// La spunta «pagata» vale per la rata in corso (vedi `statoRata`), anche in anticipo, e crea l'uscita della rata (senza categoria, decisione 72):
// il saldo scende, togliendo la spunta risale. `per_mese` ricorda il mese della scadenza pagata.
rotteRate.post('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body ?? {});
  const spunta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, c.mese);
    const [r] = await leggiRate(db, id);
    if (!r) throw nonTrovato('Rata');
    const s = statoRata(r, (await spunteDelleRate(db, [id])).get(id) ?? [], p);
    if (!s.in_corso) throw new ErroreApi(400, 'Questa rata non ha una scadenza da pagare');
    if (s.pagata) throw new ErroreApi(409, 'Questa rata è già pagata');
    // Di base oggi (è quando i soldi escono davvero), anche se la scadenza è un altro mese.
    const data = v.data(c, 'data') ?? oggi();
    const spunta = (await db.query<{ id: string; data: string }>(
      'insert into spunte (utente_id, rata_id, data, per_mese) values (fp_me(), $1, $2, $3) returning id, data', [id, data, `${s.in_corso.mese}-01`])).rows[0];
    await uscitaDaSpunta(db, { spunta, mia: Number(r.importo_rata), descrizione: r.oggetto, categoria: null });
    return spunta;
  });
  res.status(201).json(spunta);
});

// Toglie la spunta della rata in corso vista da `mese`: si vede spuntata solo nel mese personale in cui conta, quindi si toglie da lì.
rotteRate.delete('/:id/spunta', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const p = await periodoRichiesto(db, req.query.mese);
    const [r] = await leggiRate(db, id);
    if (!r) throw nonTrovato('Rata');
    const s = statoRata(r, (await spunteDelleRate(db, [id])).get(id) ?? [], p);
    if (!s.in_corso || !s.pagata) throw nonTrovato('Spunta');
    const { rowCount } = await db.query(
      `delete from spunte where rata_id = $1 and (per_mese = $2 or (per_mese is null and data between $3 and $4))`,
      [id, `${s.in_corso.mese}-01`, periodoMese(s.in_corso.mese, p.inizio).dal, periodoMese(s.in_corso.mese, p.inizio).al]);
    if (!rowCount) throw nonTrovato('Spunta');
  });
  res.status(204).end();
});

rotteRate.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const [rata] = await conUtente(res.locals.utenteId, (db) => leggiRate(db, id));
  if (!rata) throw nonTrovato('Rata');
  res.json(rata);
});

rotteRate.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const prima = v.data(c, 'prima_scadenza', true)!;
  const numero = numeroRate(c, prima);
  if (numero === undefined) throw new ErroreApi(400, 'Indica il numero di rate oppure la data finale');
  const valori = [v.testo(c, 'oggetto', true, 120), v.testo(c, 'finanziaria', false, 120) ?? null,
    importoPositivo(c, 'importo_totale', false) ?? null, importoPositivo(c, 'importo_rata', true), numero, prima,
    v.id(c, 'conto_id') ?? null];
  const rata = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into rate (proprietario_id, oggetto, finanziaria, importo_totale, importo_rata, numero_rate, prima_scadenza, conto_id)
       values (fp_me(), $1, $2, $3, $4, $5, $6, $7) returning id`, valori);
    return (await leggiRate(db, rows[0].id))[0];
  });
  res.status(201).json(rata);
});

rotteRate.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const rata = await conUtente(res.locals.utenteId, async (db) => {
    const [attuale] = await leggiRate(db, id);
    if (!attuale) return undefined;
    const prima = v.data(c, 'prima_scadenza');
    const set = v.setParziale({
      oggetto: v.testo(c, 'oggetto', false, 120),
      finanziaria: v.annullabile(c, 'finanziaria', () => v.testo(c, 'finanziaria', false, 120)),
      importo_totale: v.annullabile(c, 'importo_totale', () => importoPositivo(c, 'importo_totale', false)),
      importo_rata: importoPositivo(c, 'importo_rata', false),
      numero_rate: numeroRate(c, prima ?? attuale.prima_scadenza),
      prima_scadenza: prima,
      conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
      chiusa: v.booleano(c, 'chiusa'),
    }, 2);
    await db.query(`update rate set ${set.sql} where id = $1`, [id, ...set.valori]);
    return (await leggiRate(db, id))[0];
  });
  if (!rata) throw nonTrovato('Rata');
  res.json(rata);
});

rotteRate.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cancellate = await conUtente(res.locals.utenteId, async (db) => (await db.query('delete from rate where id = $1', [id])).rowCount);
  if (!cancellate) throw nonTrovato('Rata');
  res.status(204).end();
});
