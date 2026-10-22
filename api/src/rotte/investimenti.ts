import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { cercaSulMercato } from '../mercato.ts';
import { grammiFini, quotazioneOro, storicoOro } from '../oro.ts';
import { aggiornaPrezzi } from '../prezzi.ts';
import { aggiungiGiorni, aggiungiMesi, oggi } from '../periodo.ts';
import * as v from '../valida.ts';

// Investimenti (privati): anagrafica comune dei titoli, operazioni proprie,
// prezzi inseriti a mano e portafoglio calcolato col prezzo medio di carico.

export const rotteInvestimenti = Router();

const TIPI_TITOLO = ['etf', 'azione', 'obbligazione', 'crypto', 'altro'] as const;
const DIMENSIONI = ['classe', 'area', 'settore'] as const;
const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const TIPI_BENE = ['fondo_pensione', 'crowdfunding', 'societa', 'immobile', 'oro', 'altro'] as const;
const CAMPI_BENE = `b.id, b.nome, b.tipo, b.costo::text as costo, b.valore::text as valore, b.valore_al, b.data_acquisto, b.conto_id, c.nome as conto,
  b.forma, b.purezza::text as purezza, b.peso_grammi::text as peso_grammi, b.dove`;

type Operazione = { titolo_id: string; conto_id: string | null; data: string; verso: 'acquisto' | 'vendita'; quantita: string; prezzo: string; commissioni: string };
type Bene = { id: string; nome: string; tipo: string; costo: string; valore: string; valore_al: string; data_acquisto: string | null; conto_id: string | null;
  conto: string | null; forma: string | null; purezza: string | null; peso_grammi: string | null; dove: string | null };

// Una posizione è un titolo dentro un portafoglio (il conto dove sta).
const chiave = (titolo: string, conto: string | null) => `${titolo}|${conto ?? ''}`;

// Posizioni a una data: quote, costo (prezzo medio di carico) e soldi messi dentro.
function posizioni(operazioni: Operazione[], al: string) {
  const per = new Map<string, { titolo: string; conto: string | null; quote: number; costo: number }>();
  let messo = 0;
  for (const o of operazioni) {
    if (o.data > al) continue;
    const k = chiave(o.titolo_id, o.conto_id);
    const p = per.get(k) ?? { titolo: o.titolo_id, conto: o.conto_id, quote: 0, costo: 0 };
    const q = Number(o.quantita), prezzo = Number(o.prezzo), comm = Number(o.commissioni);
    if (o.verso === 'acquisto') {
      p.costo += q * prezzo + comm; p.quote += q; messo += q * prezzo + comm;
    } else {
      const medio = p.quote > 0 ? p.costo / p.quote : 0;
      p.costo -= medio * Math.min(q, p.quote); p.quote -= q; messo -= q * prezzo - comm;
    }
    per.set(k, p);
  }
  return { per, messo };
}

// Valore di un bene a una data. L'oro vale grammi fini × l'ultima quotazione nota
// a quella data; gli altri beni il costo fino al giorno del valore scritto, poi quel valore.
type StoricoOro = { data: string; euro_grammo: number }[];
const beneAl = (b: Bene, al: string, oro: StoricoOro) => {
  if ((b.data_acquisto ?? b.valore_al) > al) return null;
  const fini = b.tipo === 'oro' ? grammiFini(b.peso_grammi, b.purezza) : null;
  if (fini !== null) {
    let q: number | undefined;
    for (const x of oro) if (x.data <= al) q = x.euro_grammo;
    return { valore: q !== undefined ? fini * q : Number(b.valore), costo: Number(b.costo) };
  }
  return { valore: b.valore_al <= al ? Number(b.valore) : Number(b.costo), costo: Number(b.costo) };
};

async function caricaDati(db: PoolClient) {
  const operazioni = (await db.query<Operazione>(
    `select titolo_id, conto_id, data, verso, quantita::text as quantita, prezzo::text as prezzo, commissioni::text as commissioni
       from operazioni order by data, id`)).rows;
  const ids = [...new Set(operazioni.map((o) => o.titolo_id))];
  // Il prezzo di oggi arriva da solo; resta valido l'ultimo noto se la fonte non risponde.
  await aggiornaPrezzi(db, ids);
  const titoli = (await db.query('select id, isin, ticker, nome, tipo, simbolo, borsa from titoli where id = any($1)', [ids])).rows;
  const conti = new Map((await db.query<{ id: string; nome: string }>('select id, nome from conti')).rows.map((c) => [c.id, c.nome]));
  const prezzi = (await db.query<{ titolo_id: string; data: string; prezzo: string }>(
    'select titolo_id, data, prezzo::text as prezzo from prezzi where titolo_id = any($1) order by data', [ids])).rows;
  // L'oro prende il valore di oggi dalla quotazione; resta quello salvato se non c'è.
  const quotazione = await quotazioneOro(db);
  const oro = await storicoOro(db);
  const beni = (await db.query<Bene>(`select ${CAMPI_BENE} from beni b left join conti c on c.id = b.conto_id order by b.nome`)).rows.map((b) => {
    const fini = b.tipo === 'oro' ? grammiFini(b.peso_grammi, b.purezza) : null;
    if (fini === null || !quotazione) return { ...b, valore_automatico: false };
    return { ...b, valore: cent(fini * quotazione.euro_grammo), valore_al: quotazione.data, valore_automatico: true };
  });
  // Prezzo a una data: l'ultimo prezzo noto fino a quel giorno, o il prezzo dell'ultima operazione.
  const prezzoAl = (titolo: string, al: string) => {
    let ultimo: { data: string; prezzo: number } | undefined;
    for (const p of prezzi) if (p.titolo_id === titolo && p.data <= al) ultimo = { data: p.data, prezzo: Number(p.prezzo) };
    for (const o of operazioni) if (o.titolo_id === titolo && o.data <= al && (!ultimo || o.data > ultimo.data)) ultimo = { data: o.data, prezzo: Number(o.prezzo) };
    return ultimo;
  };
  return { operazioni, titoli, conti, beni, prezzoAl, oro, quotazione };
}

const percentuale = (valore: number, costo: number) => (costo > 0 ? Math.round(((valore - costo) / costo) * 1000) / 10 : null);

// Portafoglio: titoli per portafoglio e beni non quotati (oro compreso), con i pesi sul totale.
export async function portafoglio(db: PoolClient) {
  const { operazioni, titoli, conti, beni, prezzoAl } = await caricaDati(db);
  const al = oggi();
  const { per, messo } = posizioni(operazioni, al);
  const perId = new Map(titoli.map((t) => [t.id, t]));
  const righe = [...per.values()].filter((p) => p.quote > 1e-9).map((p) => {
    const prezzo = prezzoAl(p.titolo, al);
    const valore = p.quote * (prezzo?.prezzo ?? 0);
    return {
      ...perId.get(p.titolo), conto_id: p.conto, conto: p.conto ? conti.get(p.conto) ?? null : null,
      quote: p.quote.toString(), prezzo_medio: (p.costo / p.quote).toFixed(4),
      prezzo: prezzo ? prezzo.prezzo.toFixed(4) : null, prezzo_del: prezzo?.data ?? null,
      costo: cent(p.costo), valore: cent(valore), guadagno: cent(valore - p.costo), guadagno_percentuale: percentuale(valore, p.costo),
    };
  });
  const valoreTitoli = righe.reduce((t, r) => t + Number(r.valore), 0);
  const valoreBeni = beni.reduce((t, b) => t + Number(b.valore), 0);
  const totale = valoreTitoli + valoreBeni;
  const costo = righe.reduce((t, r) => t + Number(r.costo), 0) + beni.reduce((t, b) => t + Number(b.costo), 0);
  const peso = (v: string) => (totale > 0 ? Math.round((Number(v) / totale) * 1000) / 10 : 0);
  return {
    valore: cent(totale), valore_titoli: cent(valoreTitoli), costo: cent(costo), messo_dentro: cent(messo + beni.reduce((t, b) => t + Number(b.costo), 0)),
    guadagno: cent(totale - costo), guadagno_percentuale: percentuale(totale, costo),
    posizioni: righe.map((r) => ({ ...r, peso: peso(r.valore) })).sort((a, b) => Number(b.valore) - Number(a.valore)),
    beni: beni.map((b) => ({ ...b, guadagno: cent(Number(b.valore) - Number(b.costo)), guadagno_percentuale: percentuale(Number(b.valore), Number(b.costo)), peso: peso(b.valore) })),
  };
}

rotteInvestimenti.get('/portafoglio', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, portafoglio));
});

// Valore e soldi messi dentro alla fine di ogni mese (?mesi=12), oppure ogni
// settimana per i periodi brevi (?settimane=5). L'ultimo punto è sempre oggi.
rotteInvestimenti.get('/andamento', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const settimane = v.intero(q, 'settimane', 2, 26);
  const mesi = v.intero(q, 'mesi', 1, 600) ?? 12;
  const punti = await conUtente(res.locals.utenteId, async (db) => {
    const { operazioni, beni, prezzoAl, oro } = await caricaDati(db);
    const fine = oggi();
    const n = settimane ?? mesi;
    return Array.from({ length: n }, (_, i) => {
      // Ultimo giorno di ogni mese di calendario, o lo stesso giorno di ogni settimana.
      const inizio = `${aggiungiMesi(fine, i - n + 1).slice(0, 7)}-01`;
      const al = settimane ? aggiungiGiorni(fine, -7 * (n - 1 - i)) : i === n - 1 ? fine : aggiungiGiorni(aggiungiMesi(inizio, 1), -1);
      const { per, messo } = posizioni(operazioni, al);
      let valore = 0;
      let messoTot = messo;
      for (const p of per.values()) valore += p.quote * (prezzoAl(p.titolo, al)?.prezzo ?? 0);
      for (const b of beni) { const x = beneAl(b, al, oro); if (x) { valore += x.valore; messoTot += x.costo; } }
      return { al, mese: al.slice(0, 7), valore: cent(valore), messo_dentro: cent(messoTot) };
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
      // I beni non quotati contano solo per tipo: paese e settore si calcolano sui titoli.
      if (d === 'classe') for (const b of p.beni) {
        const voce = b.tipo === 'oro' ? 'Oro' : 'Non quotati';
        somme.set(voce, (somme.get(voce) ?? 0) + Number(b.valore));
      }
      const base = d === 'classe' ? totale : Number(p.valore_titoli);
      esito[d] = [...somme].map(([voce, val]) => ({ voce, peso: base > 0 ? Math.round((val / base) * 1000) / 10 : 0 }))
        .filter((x) => x.peso > 0).sort((a, b) => b.peso - a.peso);
    }
    return esito;
  });
  res.json(risposta);
});

// Quotazione dell'oro di oggi (euro per grammo di oro fino), o l'ultima salvata.
rotteInvestimenti.get('/oro/quotazione', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, quotazioneOro));
});

// Titoli: anagrafica comune. ?cerca= su nome, ISIN, ticker o simbolo.
const CAMPI_TITOLO = 'id, isin, ticker, nome, tipo, simbolo, borsa';
rotteInvestimenti.get('/titoli', async (req, res) => {
  const cerca = v.testo(req.query as Record<string, unknown>, 'cerca', false, 100);
  const titoli = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `select ${CAMPI_TITOLO} from titoli
      where $1::text is null or nome ilike '%' || $1 || '%' or isin ilike $1 || '%' or ticker ilike $1 || '%' or simbolo ilike $1 || '%'
      order by nome limit 50`, [cerca ?? null])).rows);
  res.json(titoli);
});

// Ricerca sui mercati per ISIN, ticker o nome (titoli non ancora nell'elenco).
rotteInvestimenti.get('/titoli/mercato', async (req, res) => {
  const cerca = v.testo(req.query as Record<string, unknown>, 'cerca', true, 100)!;
  if (cerca.length < 2) { res.json([]); return; }
  res.json(await cercaSulMercato(cerca));
});

// Aggiunge un titolo all'elenco comune; se c'è già (stesso ISIN o simbolo) restituisce quello.
rotteInvestimenti.post('/titoli', async (req, res) => {
  const c = v.corpo(req.body);
  const isin = v.testo(c, 'isin', false, 12)?.toUpperCase() ?? null;
  const simbolo = v.testo(c, 'simbolo', false, 30)?.toUpperCase() ?? null;
  if (isin && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new ErroreApi(400, 'ISIN non valido');
  if (!isin && !simbolo) throw new ErroreApi(400, 'Serve l\'ISIN o il simbolo di borsa');
  const titolo = await conUtente(res.locals.utenteId, async (db) => {
    const esistente = (await db.query(`select ${CAMPI_TITOLO} from titoli where ($1::text is not null and isin = $1) or ($2::text is not null and simbolo = $2) limit 1`, [isin, simbolo])).rows[0];
    if (esistente) return esistente;
    return (await db.query(
      `insert into titoli (isin, ticker, nome, tipo, simbolo, borsa) values ($1, $2, $3, $4, $5, $6) returning ${CAMPI_TITOLO}`,
      [isin, v.testo(c, 'ticker', false, 20) ?? null, v.testo(c, 'nome', true, 200), v.scelta(c, 'tipo', TIPI_TITOLO) ?? 'etf', simbolo, v.testo(c, 'borsa', false, 60) ?? null])).rows[0];
  });
  res.status(201).json(titolo);
});

// Prezzo di un giorno, inserito a mano.
rotteInvestimenti.put('/titoli/:id/prezzi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const prezzo = v.prezzo(c, 'prezzo', true)!;
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
const leggiOp = async (db: PoolClient, id: string) =>
  (await db.query(`select ${CAMPI_OP} from operazioni o join titoli t on t.id = o.titolo_id where o.id = $1`, [id])).rows[0];

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
    quantita, prezzo: v.prezzo(c, 'prezzo', nuova), commissioni: v.importo(c, 'commissioni'),
  };
}

rotteInvestimenti.post('/operazioni', async (req, res) => {
  const campi = leggiOperazione(v.corpo(req.body), true);
  const operazione = await conUtente(res.locals.utenteId, async (db) => {
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into operazioni (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    return leggiOp(db, rows[0].id);
  });
  res.status(201).json(operazione);
});

rotteInvestimenti.patch('/operazioni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const set = v.setParziale(leggiOperazione(v.corpo(req.body), false), 2);
  const operazione = await conUtente(res.locals.utenteId, async (db) => {
    if (!(await db.query(`update operazioni set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    return leggiOp(db, id);
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

// La situazione di un titolo in un portafoglio, scritta a mano: quantità e prezzo
// medio di carico di oggi. Sostituisce le operazioni di quel titolo in quel
// portafoglio con un solo acquisto (l'app tiene la situazione, non lo storico).
rotteInvestimenti.put('/posizioni', async (req, res) => {
  const c = v.corpo(req.body);
  const titolo = v.id(c, 'titolo_id', true)!;
  const contoPrima = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  const contoDopo = c.nuovo_conto_id === undefined ? contoPrima : v.annullabile(c, 'nuovo_conto_id', () => v.id(c, 'nuovo_conto_id')) ?? null;
  const quantita = v.testo(c, 'quantita', true, 30)!;
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(quantita) || Number(quantita) <= 0) throw new ErroreApi(400, 'La quantità deve essere un numero maggiore di zero');
  const prezzo = v.prezzo(c, 'prezzo_medio', true)!;
  if (Number(prezzo) < 0) throw new ErroreApi(400, 'Il prezzo medio non può essere negativo');
  const data = v.data(c, 'data');
  if (data && data > oggi()) throw new ErroreApi(400, 'La data di acquisto non può essere nel futuro');
  await conUtente(res.locals.utenteId, async (db) => {
    const prima = (await db.query<{ data: string | null }>('select min(data) as data from operazioni where titolo_id = $1 and conto_id is not distinct from $2', [titolo, contoPrima])).rows[0].data;
    await db.query('delete from operazioni where titolo_id = $1 and conto_id is not distinct from $2', [titolo, contoPrima]);
    if (contoDopo !== contoPrima && (await db.query('select 1 from operazioni where titolo_id = $1 and conto_id is not distinct from $2', [titolo, contoDopo])).rowCount)
      throw new ErroreApi(409, 'In quel portafoglio questo titolo c\'è già: correggi quello');
    await db.query(`insert into operazioni (proprietario_id, titolo_id, conto_id, data, verso, quantita, prezzo, commissioni)
                    values (fp_me(), $1, $2, $3, 'acquisto', $4, $5, 0)`, [titolo, contoDopo, data ?? prima ?? oggi(), quantita, prezzo]);
  });
  res.status(204).end();
});

// Toglie un titolo da un portafoglio.
rotteInvestimenti.delete('/posizioni', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const titolo = v.id(q, 'titolo_id', true)!;
  const conto = v.id(q, 'conto_id') ?? null;
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query('delete from operazioni where titolo_id = $1 and conto_id is not distinct from $2', [titolo, conto])).rowCount);
  if (!n) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});

// Beni non quotati (fondo pensione, crowdfunding, oro fisico…): costo e valore scritti a mano.
// Numero positivo arrotondato ai decimali della colonna (es. 7,98805 g → 7.988).
function decimale(c: Record<string, unknown>, campo: string, decimali: number, nome = campo): string | undefined {
  if (c[campo] === undefined || c[campo] === null || c[campo] === '') return undefined;
  const t = String(c[campo]).trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d+)?$/.test(t) || !(Number(t) > 0)) throw new ErroreApi(400, `${nome} deve essere un numero maggiore di zero, es. 7,988`);
  return Number(t).toFixed(decimali);
}

function leggiBene(c: Record<string, unknown>, nuovo: boolean) {
  const campi = {
    nome: v.testo(c, 'nome', nuovo, 200), tipo: v.scelta(c, 'tipo', TIPI_BENE, nuovo),
    costo: v.importo(c, 'costo', nuovo), valore: v.importo(c, 'valore', nuovo && c.tipo !== 'oro'), valore_al: v.data(c, 'valore_al'),
    data_acquisto: v.annullabile(c, 'data_acquisto', () => v.data(c, 'data_acquisto')),
    conto_id: v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')),
    forma: v.annullabile(c, 'forma', () => v.scelta(c, 'forma', ['lingotto', 'moneta'] as const)),
    purezza: v.annullabile(c, 'purezza', () => decimale(c, 'purezza', 1, 'La purezza')),
    peso_grammi: v.annullabile(c, 'peso_grammi', () => decimale(c, 'peso_grammi', 3, 'Il peso')),
    dove: v.annullabile(c, 'dove', () => v.testo(c, 'dove', false, 200)),
  };
  if ((campi.costo && Number(campi.costo) < 0) || (campi.valore && Number(campi.valore) < 0)) throw new ErroreApi(400, 'Costo e valore non possono essere negativi');
  // L'oro fisico non sta in un portafoglio; gli altri beni non hanno i campi dell'oro.
  if (campi.data_acquisto && campi.data_acquisto > oggi()) throw new ErroreApi(400, 'La data di acquisto non può essere nel futuro');
  if (campi.tipo === 'oro') { campi.conto_id = null; if (nuovo && !campi.peso_grammi) throw new ErroreApi(400, 'Scrivi il peso in grammi'); }
  else if (campi.tipo) { campi.forma = null; campi.purezza = null; campi.peso_grammi = null; }
  return campi;
}

// Per l'oro il valore si calcola dalla quotazione: se manca, va scritto a mano.
async function valoreOro(db: PoolClient, bene: ReturnType<typeof leggiBene>, destinazione = bene) {
  if (bene.tipo !== 'oro') return;
  const fini = grammiFini(bene.peso_grammi ?? null, bene.purezza ?? null);
  const q = fini !== null ? await quotazioneOro(db) : null;
  if (q && fini !== null) { destinazione.valore = cent(fini * q.euro_grammo); destinazione.valore_al = q.data; return; }
  if (!bene.valore) throw new ErroreApi(400, 'Non riesco a leggere la quotazione dell\'oro: scrivi quanto vale oggi');
}

const leggiBeneDb = async (db: PoolClient, id: string) =>
  (await db.query(`select ${CAMPI_BENE} from beni b left join conti c on c.id = b.conto_id where b.id = $1`, [id])).rows[0];

rotteInvestimenti.get('/beni', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, async (db) => (await db.query(`select ${CAMPI_BENE} from beni b left join conti c on c.id = b.conto_id order by b.nome`)).rows));
});

rotteInvestimenti.post('/beni', async (req, res) => {
  const campi = leggiBene(v.corpo(req.body), true);
  const bene = await conUtente(res.locals.utenteId, async (db) => {
    await valoreOro(db, campi);
    const voci = Object.entries(campi).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into beni (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    return leggiBeneDb(db, rows[0].id);
  });
  res.status(201).json(bene);
});

rotteInvestimenti.patch('/beni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const campi = leggiBene(v.corpo(req.body), false);
  const bene = await conUtente(res.locals.utenteId, async (db) => {
    const prima = (await db.query<{ tipo: string; peso_grammi: string | null; purezza: string | null }>(
      'select tipo, peso_grammi::text as peso_grammi, purezza::text as purezza from beni where id = $1', [id])).rows[0];
    if (!prima) return undefined;
    await valoreOro(db, { tipo: prima.tipo, peso_grammi: prima.peso_grammi, purezza: prima.purezza, ...Object.fromEntries(Object.entries(campi).filter(([, x]) => x !== undefined)) } as typeof campi, campi);
    const set = v.setParziale(campi, 2);
    if (!(await db.query(`update beni set ${set.sql} where id = $1`, [id, ...set.valori])).rowCount) return undefined;
    return leggiBeneDb(db, id);
  });
  if (!bene) throw nonTrovato('Investimento');
  res.json(bene);
});

rotteInvestimenti.delete('/beni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query('delete from beni where id = $1', [id])).rowCount);
  if (!n) throw nonTrovato('Investimento');
  res.status(204).end();
});
