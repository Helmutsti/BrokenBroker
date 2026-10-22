import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { aggiungiGiorni, aggiungiMesi, oggi } from '../periodo.ts';
import * as v from '../valida.ts';

// Investimenti (privati): anagrafica comune dei titoli, operazioni proprie,
// prezzi inseriti a mano e portafoglio calcolato col prezzo medio di carico.

export const rotteInvestimenti = Router();

const TIPI_TITOLO = ['etf', 'azione', 'obbligazione', 'crypto', 'altro'] as const;
const DIMENSIONI = ['classe', 'area', 'settore'] as const;
const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

type Operazione = { titolo_id: string; data: string; verso: 'acquisto' | 'vendita'; quantita: string; prezzo: string; commissioni: string };

// Posizioni a una data: quote, costo (prezzo medio di carico) e soldi messi dentro.
function posizioni(operazioni: Operazione[], al: string) {
  const per = new Map<string, { quote: number; costo: number }>();
  let messo = 0;
  for (const o of operazioni) {
    if (o.data > al) continue;
    const p = per.get(o.titolo_id) ?? { quote: 0, costo: 0 };
    const q = Number(o.quantita), prezzo = Number(o.prezzo), comm = Number(o.commissioni);
    if (o.verso === 'acquisto') {
      p.costo += q * prezzo + comm; p.quote += q; messo += q * prezzo + comm;
    } else {
      const medio = p.quote > 0 ? p.costo / p.quote : 0;
      p.costo -= medio * Math.min(q, p.quote); p.quote -= q; messo -= q * prezzo - comm;
    }
    per.set(o.titolo_id, p);
  }
  return { per, messo };
}

async function caricaDati(db: PoolClient) {
  const operazioni = (await db.query<Operazione>(
    `select titolo_id, data, verso, quantita::text as quantita, prezzo::text as prezzo, commissioni::text as commissioni
       from operazioni order by data, id`)).rows;
  const ids = [...new Set(operazioni.map((o) => o.titolo_id))];
  const titoli = (await db.query('select id, isin, ticker, nome, tipo from titoli where id = any($1)', [ids])).rows;
  const prezzi = (await db.query<{ titolo_id: string; data: string; prezzo: string }>(
    'select titolo_id, data, prezzo::text as prezzo from prezzi where titolo_id = any($1) order by data', [ids])).rows;
  // Prezzo a una data: l'ultimo prezzo noto fino a quel giorno, o il prezzo dell'ultima operazione.
  const prezzoAl = (titolo: string, al: string) => {
    let ultimo: { data: string; prezzo: number } | undefined;
    for (const p of prezzi) if (p.titolo_id === titolo && p.data <= al) ultimo = { data: p.data, prezzo: Number(p.prezzo) };
    for (const o of operazioni) if (o.titolo_id === titolo && o.data <= al && (!ultimo || o.data > ultimo.data)) ultimo = { data: o.data, prezzo: Number(o.prezzo) };
    return ultimo;
  };
  return { operazioni, titoli, prezzoAl };
}

export async function portafoglio(db: PoolClient) {
  const { operazioni, titoli, prezzoAl } = await caricaDati(db);
  const al = oggi();
  const { per, messo } = posizioni(operazioni, al);
  const righe = titoli.map((t) => {
    const p = per.get(t.id) ?? { quote: 0, costo: 0 };
    const prezzo = prezzoAl(t.id, al);
    const valore = p.quote * (prezzo?.prezzo ?? 0);
    return {
      ...t, quote: p.quote.toString(), prezzo_medio: p.quote > 0 ? (p.costo / p.quote).toFixed(4) : null,
      prezzo: prezzo ? prezzo.prezzo.toFixed(4) : null, prezzo_del: prezzo?.data ?? null,
      costo: cent(p.costo), valore: cent(valore), guadagno: cent(valore - p.costo),
      guadagno_percentuale: p.costo > 0 ? Math.round(((valore - p.costo) / p.costo) * 1000) / 10 : null,
    };
  }).filter((r) => Number(r.quote) > 0);
  const totale = righe.reduce((t, r) => t + Number(r.valore), 0);
  const costo = righe.reduce((t, r) => t + Number(r.costo), 0);
  return {
    valore: cent(totale), costo: cent(costo), messo_dentro: cent(messo), guadagno: cent(totale - costo),
    guadagno_percentuale: costo > 0 ? Math.round(((totale - costo) / costo) * 1000) / 10 : null,
    posizioni: righe.map((r) => ({ ...r, peso: totale > 0 ? Math.round((Number(r.valore) / totale) * 1000) / 10 : 0 }))
      .sort((a, b) => Number(b.valore) - Number(a.valore)),
  };
}

rotteInvestimenti.get('/portafoglio', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, portafoglio));
});

// Valore e soldi messi dentro alla fine di ogni mese (?mesi=12).
rotteInvestimenti.get('/andamento', async (req, res) => {
  const mesi = v.intero(req.query as Record<string, unknown>, 'mesi', 1, 120) ?? 12;
  const punti = await conUtente(res.locals.utenteId, async (db) => {
    const { operazioni, prezzoAl } = await caricaDati(db);
    const fine = oggi();
    return Array.from({ length: mesi }, (_, i) => {
      // Ultimo giorno di ogni mese di calendario; l'ultimo punto è oggi.
      const inizio = `${aggiungiMesi(fine, i - mesi + 1).slice(0, 7)}-01`;
      const al = i === mesi - 1 ? fine : aggiungiGiorni(aggiungiMesi(inizio, 1), -1);
      const { per, messo } = posizioni(operazioni, al);
      let valore = 0;
      for (const [titolo, p] of per) valore += p.quote * (prezzoAl(titolo, al)?.prezzo ?? 0);
      return { al, mese: al.slice(0, 7), valore: cent(valore), messo_dentro: cent(messo) };
    });
  });
  res.json(punti);
});

// Esposizione del portafoglio per classe, area o settore, pesata sul valore.
rotteInvestimenti.get('/esposizione', async (_req, res) => {
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const p = await portafoglio(db);
    const totale = Number(p.valore);
    const { rows } = await db.query<{ titolo_id: string; dimensione: string; voce: string; peso: string }>(
      'select titolo_id, dimensione, voce, peso::text as peso from esposizioni where titolo_id = any($1)', [p.posizioni.map((x) => x.id)]);
    const esito: Record<string, { voce: string; peso: number }[]> = {};
    for (const d of DIMENSIONI) {
      const somme = new Map<string, number>();
      for (const pos of p.posizioni) {
        const voci = rows.filter((r) => r.titolo_id === pos.id && r.dimensione === d);
        const coperto = voci.reduce((t, r) => t + Number(r.peso), 0);
        for (const r of voci) somme.set(r.voce, (somme.get(r.voce) ?? 0) + Number(pos.valore) * Number(r.peso));
        if (coperto < 0.999) somme.set('Non indicato', (somme.get('Non indicato') ?? 0) + Number(pos.valore) * (1 - coperto));
      }
      esito[d] = [...somme].map(([voce, val]) => ({ voce, peso: totale > 0 ? Math.round((val / totale) * 1000) / 10 : 0 }))
        .filter((x) => x.peso > 0).sort((a, b) => b.peso - a.peso);
    }
    return esito;
  });
  res.json(risposta);
});

// Titoli: anagrafica comune. ?cerca= su nome, ISIN, ticker.
rotteInvestimenti.get('/titoli', async (req, res) => {
  const cerca = v.testo(req.query as Record<string, unknown>, 'cerca', false, 100);
  const titoli = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `select id, isin, ticker, nome, tipo from titoli
      where $1::text is null or nome ilike '%' || $1 || '%' or isin ilike $1 || '%' or ticker ilike $1 || '%'
      order by nome limit 50`, [cerca ?? null])).rows);
  res.json(titoli);
});

rotteInvestimenti.post('/titoli', async (req, res) => {
  const c = v.corpo(req.body);
  const isin = v.testo(c, 'isin', true, 12)!.toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new ErroreApi(400, 'ISIN non valido');
  const titolo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `insert into titoli (isin, ticker, nome, tipo) values ($1, $2, $3, $4)
     on conflict (isin) do update set isin = excluded.isin returning id, isin, ticker, nome, tipo`,
    [isin, v.testo(c, 'ticker', false, 20) ?? null, v.testo(c, 'nome', true, 200), v.scelta(c, 'tipo', TIPI_TITOLO) ?? 'etf'])).rows[0]);
  res.status(201).json(titolo);
});

// Prezzo di un giorno, inserito a mano.
rotteInvestimenti.put('/titoli/:id/prezzi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const prezzo = v.importo(c, 'prezzo', true)!;
  await conUtente(res.locals.utenteId, (db) => db.query(
    `insert into prezzi (titolo_id, data, prezzo) values ($1, coalesce($2::date, current_date), $3)
     on conflict (titolo_id, data) do update set prezzo = excluded.prezzo`, [id, v.data(c, 'data') ?? null, prezzo]));
  res.status(204).end();
});

// Composizione: { dimensione, voci: [{voce, peso}] } con pesi in percentuale (somma ≤ 100).
rotteInvestimenti.put('/titoli/:id/esposizioni', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const dimensione = v.scelta(c, 'dimensione', DIMENSIONI, true)!;
  if (!Array.isArray(c.voci)) throw new ErroreApi(400, 'Serve un elenco "voci"');
  const voci = c.voci.map((x) => { const r = v.corpo(x); return { voce: v.testo(r, 'voce', true, 80)!, peso: Number(v.importo(r, 'peso', true)) }; });
  if (voci.reduce((t, x) => t + x.peso, 0) > 100.001) throw new ErroreApi(400, 'I pesi superano il 100%');
  await conUtente(res.locals.utenteId, async (db) => {
    await db.query('delete from esposizioni where titolo_id = $1 and dimensione = $2', [id, dimensione]);
    for (const x of voci) await db.query('insert into esposizioni (titolo_id, dimensione, voce, peso) values ($1, $2, $3, $4)', [id, dimensione, x.voce, x.peso / 100]);
  });
  res.status(204).end();
});

// Operazioni di acquisto e vendita.
const CAMPI_OP = `o.id, o.titolo_id, t.nome as titolo, t.isin, t.ticker, o.conto_id, o.data, o.verso,
  o.quantita::text as quantita, o.prezzo::text as prezzo, o.commissioni::text as commissioni,
  (o.quantita * o.prezzo)::numeric(14,2)::text as controvalore`;

rotteInvestimenti.get('/operazioni', async (req, res) => {
  const titolo = v.id(req.query as Record<string, unknown>, 'titolo_id');
  const elenco = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `select ${CAMPI_OP} from operazioni o join titoli t on t.id = o.titolo_id
      where $1::uuid is null or o.titolo_id = $1 order by o.data desc, o.id`, [titolo ?? null])).rows);
  res.json(elenco);
});

function leggiOperazione(c: Record<string, unknown>, nuova: boolean) {
  const quantita = v.testo(c, 'quantita', nuova, 30);
  if (quantita !== undefined && !/^\d{1,12}(\.\d{1,6})?$/.test(quantita)) throw new ErroreApi(400, 'Quantità non valida');
  if (quantita !== undefined && Number(quantita) <= 0) throw new ErroreApi(400, 'La quantità deve essere positiva');
  return {
    titolo_id: v.id(c, 'titolo_id', nuova), conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    data: v.data(c, 'data', nuova), verso: v.scelta(c, 'verso', ['acquisto', 'vendita'] as const, nuova),
    quantita, prezzo: v.importo(c, 'prezzo', nuova), commissioni: v.importo(c, 'commissioni'),
  };
}

rotteInvestimenti.post('/operazioni', async (req, res) => {
  const campi = leggiOperazione(v.corpo(req.body), true);
  const operazione = await conUtente(res.locals.utenteId, async (db) => {
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into operazioni (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    return (await db.query(`select ${CAMPI_OP} from operazioni o join titoli t on t.id = o.titolo_id where o.id = $1`, [rows[0].id])).rows[0];
  });
  res.status(201).json(operazione);
});

rotteInvestimenti.patch('/operazioni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const set = v.setParziale(leggiOperazione(v.corpo(req.body), false), 2);
  const operazione = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query(`update operazioni set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    return (await db.query(`select ${CAMPI_OP} from operazioni o join titoli t on t.id = o.titolo_id where o.id = $1`, [id])).rows[0];
  });
  if (!operazione) throw nonTrovato('Operazione');
  res.json(operazione);
});

rotteInvestimenti.delete('/operazioni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query('delete from operazioni where id = $1', [id])).rowCount);
  if (!n) throw nonTrovato('Operazione');
  res.status(204).end();
});
