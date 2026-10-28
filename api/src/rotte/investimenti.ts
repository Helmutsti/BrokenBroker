import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { aggiornaPrezzi, rileggiPrezzo } from '../prezzi.ts';
import { andamento, caricaDati, portafoglio, riepilogo, selezione } from '../investimenti.ts';
import { cercaSulMercato } from '../mercato.ts';
import { METALLI } from '../metalli.ts';
import * as v from '../valida.ts';
import { rotteBeni } from './beni.ts';
import { rottePortafogli } from './portafogli.ts';

// Investimenti (privati): anagrafica comune dei titoli, lotti propri (un lotto è un acquisto),
// prezzi, portafogli e beni. I calcoli sono in src/investimenti.ts.

export const rotteInvestimenti = Router();
rotteInvestimenti.use('/portafogli', rottePortafogli);
rotteInvestimenti.use(rotteBeni);

const TIPI_TITOLO = ['etf', 'azione', 'obbligazione', 'crypto', 'altro'] as const;
const DIMENSIONI = ['classe', 'area', 'settore'] as const;

// Portafoglio generale: solo i portafogli che contano nel patrimonio. ?portafoglio_id= per uno solo (anche di prova).
rotteInvestimenti.get('/portafoglio', async (req, res) => {
  const id = v.id(req.query as Record<string, unknown>, 'portafoglio_id');
  res.json(await conUtente(res.locals.utenteId, (db) => portafoglio(db, id)));
});

// Valore e soldi messi dentro alla fine di ogni mese (?mesi=12), oppure ogni settimana (?settimane=5).
// ?portafoglio_id= per uno solo. ?escludi=t:<titolo>:<portafoglio>,b:<bene> toglie degli asset dal guadagno (decisione 66).
rotteInvestimenti.get('/andamento', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const settimane = v.intero(q, 'settimane', 2, 26);
  const mesi = v.intero(q, 'mesi', 1, 600) ?? 12;
  const id = v.id(q, 'portafoglio_id');
  const esclusi = new Set((v.testo(q, 'escludi', false, 8000) ?? '').split(',').filter(Boolean));
  res.json(await conUtente(res.locals.utenteId, (db) => andamento(db, mesi, settimane, id, esclusi)));
});

// Esposizione per classe, area o settore, pesata sul valore. Contano le posizioni che hanno un prezzo.
rotteInvestimenti.get('/esposizione', async (req, res) => {
  const id = v.id(req.query as Record<string, unknown>, 'portafoglio_id');
  const risposta = await conUtente(res.locals.utenteId, async (db) => {
    const d = await caricaDati(db);
    const p = riepilogo(d, selezione(d, id));
    const posizioni = p.posizioni.filter((x) => x.valore !== null);
    const totale = Number(p.valore);
    const { rows } = await db.query<{ titolo_id: string; dimensione: string; voce: string; peso: string }>(
      'select titolo_id, dimensione, voce, peso::text as peso from esposizioni where titolo_id = any($1)', [posizioni.map((x) => x.titolo_id)]);
    const esito: Record<string, { voce: string; peso: number }[]> = {};
    for (const dim of DIMENSIONI) {
      const somme = new Map<string, number>();
      for (const pos of posizioni) {
        const voci = rows.filter((r) => r.titolo_id === pos.titolo_id && r.dimensione === dim);
        const coperto = voci.reduce((t, r) => t + Number(r.peso), 0);
        for (const r of voci) somme.set(r.voce, (somme.get(r.voce) ?? 0) + Number(pos.valore) * Number(r.peso));
        if (coperto < 0.999) somme.set('Non indicato', (somme.get('Non indicato') ?? 0) + Number(pos.valore) * (1 - coperto));
      }
      // I beni contano solo per classe (il metallo, o «Non quotati»): paese e settore si calcolano sui titoli.
      if (dim === 'classe') for (const b of p.beni) {
        if (b.valore === null) continue;
        const voce = b.catalogo?.metallo ? METALLI[b.catalogo.metallo] : 'Non quotati';
        somme.set(voce, (somme.get(voce) ?? 0) + Number(b.valore));
      }
      const base = dim === 'classe' ? totale : Number(p.valore_titoli);
      esito[dim] = [...somme].map(([voce, val]) => ({ voce, peso: base > 0 ? Math.round((val / base) * 1000) / 10 : 0 }))
        .filter((x) => x.peso > 0).sort((a, b) => b.peso - a.peso);
    }
    return esito;
  });
  res.json(risposta);
});

// Titoli: anagrafica comune. ?cerca= su nome, ISIN, ticker o simbolo.
const CAMPI_TITOLO = 'id, isin, ticker, nome, tipo, simbolo, borsa, valuta';
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

// Prezzo di un giorno, inserito a mano. Sempre in euro.
rotteInvestimenti.put('/titoli/:id/prezzi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const prezzo = v.prezzo(c, 'prezzo', true)!;
  await conUtente(res.locals.utenteId, (db) => db.query(
    `insert into prezzi (titolo_id, data, prezzo, valuta, prezzo_valuta, cambio, fonte, aggiornato_il) values ($1, coalesce($2::date, current_date), $3, 'EUR', null, null, null, now())
     on conflict (titolo_id, data) do update set prezzo = excluded.prezzo, valuta = 'EUR', prezzo_valuta = null, cambio = null, fonte = null, aggiornato_il = now()`, [id, v.data(c, 'data') ?? null, prezzo]));
  res.status(204).end();
});

// «Leggi dalla borsa»: scarta il prezzo di oggi (anche scritto a mano), ignora il blocco dopo un errore e rilegge subito dalla fonte.
// Se la fonte non risponde: 502 e il prezzo di prima resta. Risponde con prezzo (euro), data, stato, fonte e ora.
rotteInvestimenti.post('/titoli/:id/prezzi/leggi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const letto = await conUtente(res.locals.utenteId, (db) => rileggiPrezzo(db, id));
  if (!letto) throw new ErroreApi(502, 'La borsa non risponde in questo momento: riprova tra poco o scrivi il prezzo a mano');
  res.json(letto);
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

// «Lotti» (nome storico della tabella): una riga per posizione, cioè per titolo + portafoglio, con quantità totale,
// prezzo medio di carico (PCM) e data e ora dell'ultimo acquisto. Un nuovo acquisto aggiorna la riga esistente.
const CAMPI_LOTTO = `l.id, l.titolo_id, t.nome as titolo, t.isin, t.ticker, l.portafoglio_id, p.nome as portafoglio,
  l.quantita::text as quantita, l.prezzo::numeric(14,4)::text as prezzo, (l.quantita * l.prezzo)::numeric(14,2)::text as controvalore,
  l.acquistato_il, to_char(l.acquistato_il, 'YYYY-MM-DD') as data, to_char(l.acquistato_il, 'HH24:MI') as ora`;
const DA_LOTTI = 'lotti l join titoli t on t.id = l.titolo_id join portafogli p on p.id = l.portafoglio_id';
const leggiLotto = async (db: PoolClient, id: string) =>
  (await db.query(`select ${CAMPI_LOTTO} from ${DA_LOTTI} where l.id = $1 and l.verso = 'acquisto'`, [id])).rows[0];

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
function leggiLotto_(c: Record<string, unknown>, nuovo: boolean) {
  const quantita = v.testo(c, 'quantita', nuovo, 30);
  if (quantita !== undefined && (!/^\d{1,12}(\.\d{1,6})?$/.test(quantita) || Number(quantita) <= 0)) throw new ErroreApi(400, 'La quantità deve essere un numero maggiore di zero');
  const ora = v.testo(c, 'ora', false, 5);
  if (ora !== undefined && !ORA.test(ora)) throw new ErroreApi(400, 'L\'ora deve essere HH:MM');
  return {
    titolo_id: v.id(c, 'titolo_id', nuovo), portafoglio_id: v.id(c, 'portafoglio_id', nuovo), quantita, prezzo: v.prezzo(c, 'prezzo', nuovo),
    data: v.data(c, 'data'), ora,
  };
}

async function controllaPortafoglio(db: PoolClient, id: string) {
  const p = (await db.query<{ id: string }>('select id from portafogli where id = $1', [id])).rows[0];
  if (!p) throw nonTrovato('Portafoglio');
}
const nonNelFuturo = async (db: PoolClient, id: string) => {
  if ((await db.query('select 1 from lotti where id = $1 and acquistato_il > now() + interval \'1 minute\'', [id])).rowCount) throw new ErroreApi(400, 'La data di acquisto non può essere nel futuro');
};

// Posizioni (righe) ?titolo_id=&portafoglio_id=; senza filtri, tutte.
rotteInvestimenti.get('/lotti', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const titolo = v.id(q, 'titolo_id') ?? null, port = v.id(q, 'portafoglio_id') ?? null;
  res.json(await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `select ${CAMPI_LOTTO} from ${DA_LOTTI} where l.verso = 'acquisto' and ($1::uuid is null or l.titolo_id = $1) and ($2::uuid is null or l.portafoglio_id = $2)
      order by t.nome, p.nome`, [titolo, port])).rows));
});

// Acquisto. Se il titolo è già nel portafoglio si unisce alla riga esistente (nella stessa istruzione, che ne blocca la riga):
// quantità = somma, PCM = media pesata, data e ora = quelle dell'ultimo acquisto. Se non c'è, la riga si crea.
// Senza data né ora vale adesso. Con la sola data: adesso se è oggi, altrimenti mezzogiorno. Con l'ora: quell'ora.
// Risponde 201 se la riga è nuova, 200 se è stata aggiornata.
rotteInvestimenti.post('/lotti', async (req, res) => {
  const c = leggiLotto_(v.corpo(req.body), true);
  const { lotto, nuova } = await conUtente(res.locals.utenteId, async (db) => {
    await controllaPortafoglio(db, c.portafoglio_id!);
    if (!(await db.query('select 1 from titoli where id = $1', [c.titolo_id])).rowCount) throw nonTrovato('Titolo');
    const { rows } = await db.query<{ id: string; nuova: boolean }>(
      `insert into lotti as l (proprietario_id, titolo_id, portafoglio_id, verso, quantita, prezzo, acquistato_il)
       values (fp_me(), $1, $2, 'acquisto', $3, $4,
         case when $5::date is null and $6::time is null then now()
              when $6::time is null and $5::date = current_date then now()
              else (coalesce($5::date, current_date) + coalesce($6::time, time '12:00')) at time zone current_setting('TimeZone') end)
       on conflict (proprietario_id, titolo_id, portafoglio_id) where verso = 'acquisto' do update set
         prezzo = (l.quantita * l.prezzo + excluded.quantita * excluded.prezzo) / (l.quantita + excluded.quantita),
         quantita = l.quantita + excluded.quantita,
         acquistato_il = greatest(l.acquistato_il, excluded.acquistato_il)
       returning id, (xmax = 0) as nuova`, [c.titolo_id, c.portafoglio_id, c.quantita, c.prezzo, c.data ?? null, c.ora ?? null]);
    // La data nuova non può stare nel futuro (si controlla sulla riga: se fallisce, l'unione si annulla).
    await nonNelFuturo(db, rows[0].id);
    return { lotto: await leggiLotto(db, rows[0].id), nuova: rows[0].nuova };
  });
  // Il prezzo di un titolo che non ce l'ha per oggi si legge subito (al massimo 10 secondi: se la fonte
  // non risponde la risposta è comunque valida e lo stato resta «mancante»).
  await Promise.race([
    conUtente(res.locals.utenteId, (db) => aggiornaPrezzi(db, [c.titolo_id!])).catch(() => undefined),
    new Promise((ok) => setTimeout(ok, 10000)),
  ]);
  res.status(nuova ? 201 : 200).json(lotto);
});

// Correzione diretta della riga: quantità totale, PCM (campo «prezzo»), data e ora dell'ultimo acquisto.
// Il titolo e il portafoglio non cambiano qui (per spostare c'è PATCH /posizioni).
rotteInvestimenti.patch('/lotti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const { titolo_id: _t, portafoglio_id: _p, ...c } = leggiLotto_(v.corpo(req.body), false);
  if (Object.values(c).every((x) => x === undefined)) throw new ErroreApi(400, 'Nessun campo da modificare');
  const lotto = await conUtente(res.locals.utenteId, async (db) => {
    const fuso = `current_setting('TimeZone')`;
    const { rowCount } = await db.query(
      `update lotti set quantita = coalesce($2, quantita), prezzo = coalesce($3, prezzo),
         acquistato_il = least((coalesce($4::date, (acquistato_il at time zone ${fuso})::date) + coalesce($5::time, (acquistato_il at time zone ${fuso})::time)) at time zone ${fuso},
                               case when $5::time is null then now() else 'infinity'::timestamptz end)
       where id = $1 and verso = 'acquisto'`, [id, c.quantita ?? null, c.prezzo ?? null, c.data ?? null, c.ora ?? null]);
    if (!rowCount) return undefined;
    if (c.data || c.ora) await nonNelFuturo(db, id);
    return leggiLotto(db, id);
  });
  if (!lotto) throw nonTrovato('Posizione');
  res.json(lotto);
});

rotteInvestimenti.delete('/lotti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query(`delete from lotti where id = $1 and verso = 'acquisto'`, [id])).rowCount);
  if (!n) throw nonTrovato('Posizione');
  res.status(204).end();
});

// Sposta una posizione in un altro portafoglio: se là il titolo c'è già, le due righe si uniscono (stessa regola dell'acquisto).
rotteInvestimenti.patch('/posizioni', async (req, res) => {
  const c = v.corpo(req.body);
  const titolo = v.id(c, 'titolo_id', true)!, da = v.id(c, 'portafoglio_id', true)!, a = v.id(c, 'nuovo_portafoglio_id', true)!;
  const trovata = await conUtente(res.locals.utenteId, async (db) => {
    await controllaPortafoglio(db, a);
    const origine = (await db.query<{ id: string }>(
      `select id from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto' for update`, [titolo, da])).rows[0];
    if (!origine) return false;
    if (da === a) return true;
    const destinazione = (await db.query<{ id: string }>(
      `select id from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto' for update`, [titolo, a])).rows[0];
    if (!destinazione) {
      await db.query('update lotti set portafoglio_id = $2 where id = $1', [origine.id, a]);
    } else {
      await db.query(
        `update lotti d set prezzo = (d.quantita * d.prezzo + o.quantita * o.prezzo) / (d.quantita + o.quantita),
           quantita = d.quantita + o.quantita, acquistato_il = greatest(d.acquistato_il, o.acquistato_il)
           from lotti o where d.id = $1 and o.id = $2`, [destinazione.id, origine.id]);
      await db.query('delete from lotti where id = $1', [origine.id]);
    }
    return true;
  });
  if (!trovata) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});

// Toglie un titolo da un portafoglio: cancella la sua riga.
rotteInvestimenti.delete('/posizioni', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const titolo = v.id(q, 'titolo_id', true)!, port = v.id(q, 'portafoglio_id', true)!;
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query(`delete from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto'`, [titolo, port])).rowCount);
  if (!n) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});
