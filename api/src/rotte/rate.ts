import { Router } from 'express';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { mesiTra } from '../periodo.ts';
import { leggiRate } from '../rate.ts';
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

rotteRate.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, (db) => leggiRate(db)));
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
    v.id(c, 'conto_id') ?? null, v.id(c, 'categoria_id') ?? null];
  const rata = await conUtente(res.locals.utenteId, async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into rate (proprietario_id, oggetto, finanziaria, importo_totale, importo_rata, numero_rate, prima_scadenza, conto_id, categoria_id)
       values (fp_me(), $1, $2, $3, $4, $5, $6, $7, $8) returning id`, valori);
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
      categoria_id: v.annullabile(c, 'categoria_id', () => v.id(c, 'categoria_id')),
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
