import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { aggiornaPrezzi, prezzoDelGiorno, rileggiPrezzo } from '../prezzi.ts';
import { andamento, caricaDati, portafoglio, riepilogo, selezione } from '../investimenti.ts';
import { cercaSulMercato } from '../mercato.ts';
import { METALLI } from '../metalli.ts';
import { oggi } from '../periodo.ts';
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

// Valore e soldi messi dentro alla fine di ogni mese (?mesi=12), oppure ogni settimana (?settimane=26) o ogni giorno (?giorni=31).
// ?portafoglio_id= per uno solo. ?escludi=t:<titolo>:<portafoglio>,b:<bene> toglie degli asset dal guadagno (decisione 66).
rotteInvestimenti.get('/andamento', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const giorni = v.intero(q, 'giorni', 2, 62);
  const settimane = giorni ? undefined : v.intero(q, 'settimane', 2, 160);
  const mesi = v.intero(q, 'mesi', 1, 600) ?? 12;
  const id = v.id(q, 'portafoglio_id');
  const esclusi = new Set((v.testo(q, 'escludi', false, 8000) ?? '').split(',').filter(Boolean));
  res.json(await conUtente(res.locals.utenteId, (db) => andamento(db, mesi, giorni ? { giorni } : settimane ? { settimane } : undefined, id, esclusi)));
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

// «Lotti» (nome storico della tabella): un acquisto per riga, con quantità, data e il prezzo di borsa di quel giorno, preso dall'app
// (decisione 67, rivede la 42). La posizione (titolo + portafoglio) è la somma dei suoi acquisti; si allinea alla banca con
// PUT /posizioni/allinea e torna a Yahoo con DELETE /posizioni/allinea («Sincronizza», decisione 68).
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
    titolo_id: v.id(c, 'titolo_id', nuovo), portafoglio_id: v.id(c, 'portafoglio_id', nuovo), quantita, data: v.data(c, 'data'), ora,
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
      order by t.nome, p.nome, l.acquistato_il, l.id`, [titolo, port])).rows));
});

// Il prezzo di borsa del giorno di un acquisto; se la fonte non risponde l'acquisto non si salva.
async function prezzoAcquisto(db: PoolClient, titoloId: string, data: string | undefined) {
  if (data && data > oggi()) throw new ErroreApi(400, 'La data di acquisto non può essere nel futuro');
  const p = await prezzoDelGiorno(db, titoloId, data ?? oggi());
  if (p === null) throw new ErroreApi(502, 'Non trovo il prezzo di borsa di quel giorno: la borsa non risponde o il titolo non ha un simbolo. Riprova tra poco');
  return p.toFixed(8);
}

// Acquisto: data e quote; il prezzo è la chiusura di borsa di quel giorno. Una riga nuova anche se il titolo è già nel portafoglio
// (la posizione è la somma degli acquisti). Senza data né ora vale adesso. Con la sola data: adesso se è oggi, altrimenti mezzogiorno.
rotteInvestimenti.post('/lotti', async (req, res) => {
  const c = leggiLotto_(v.corpo(req.body), true);
  const lotto = await conUtente(res.locals.utenteId, async (db) => {
    await controllaPortafoglio(db, c.portafoglio_id!);
    if (!(await db.query('select 1 from titoli where id = $1', [c.titolo_id])).rowCount) throw nonTrovato('Titolo');
    const prezzo = await prezzoAcquisto(db, c.titolo_id!, c.data);
    const { rows } = await db.query<{ id: string }>(
      `insert into lotti (proprietario_id, titolo_id, portafoglio_id, verso, quantita, prezzo, acquistato_il)
       values (fp_me(), $1, $2, 'acquisto', $3, $4,
         case when $5::date is null and $6::time is null then now()
              when $6::time is null and $5::date = current_date then now()
              else (coalesce($5::date, current_date) + coalesce($6::time, time '12:00')) at time zone current_setting('TimeZone') end)
       returning id`, [c.titolo_id, c.portafoglio_id, c.quantita, prezzo, c.data ?? null, c.ora ?? null]);
    await nonNelFuturo(db, rows[0].id);
    return leggiLotto(db, rows[0].id);
  });
  // Il prezzo di un titolo che non ce l'ha per oggi si legge subito (al massimo 10 secondi: se la fonte
  // non risponde la risposta è comunque valida e lo stato resta «mancante»).
  await Promise.race([
    conUtente(res.locals.utenteId, (db) => aggiornaPrezzi(db, [c.titolo_id!])).catch(() => undefined),
    new Promise((ok) => setTimeout(ok, 10000)),
  ]);
  res.status(201).json(lotto);
});

// Correzione di un acquisto: quantità, data e ora. Cambiando la data il prezzo diventa quello di borsa del nuovo giorno.
// Il titolo e il portafoglio non cambiano qui (per spostare c'è PATCH /posizioni).
rotteInvestimenti.patch('/lotti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const { titolo_id: _t, portafoglio_id: _p, ...c } = leggiLotto_(v.corpo(req.body), false);
  if (Object.values(c).every((x) => x === undefined)) throw new ErroreApi(400, 'Nessun campo da modificare');
  const lotto = await conUtente(res.locals.utenteId, async (db) => {
    const fuso = `current_setting('TimeZone')`;
    const titolo = (await db.query<{ titolo_id: string }>(`select titolo_id from lotti where id = $1 and verso = 'acquisto'`, [id])).rows[0]?.titolo_id;
    if (!titolo) return undefined;
    const prezzo = c.data ? await prezzoAcquisto(db, titolo, c.data) : null;
    const { rowCount } = await db.query(
      `update lotti set quantita = coalesce($2, quantita), prezzo = coalesce($3, prezzo),
         acquistato_il = least((coalesce($4::date, (acquistato_il at time zone ${fuso})::date) + coalesce($5::time, (acquistato_il at time zone ${fuso})::time)) at time zone ${fuso},
                               case when $5::time is null then now() else 'infinity'::timestamptz end)
       where id = $1 and verso = 'acquisto'`, [id, c.quantita ?? null, prezzo, c.data ?? null, c.ora ?? null]);
    if (!rowCount) return undefined;
    if (c.data || c.ora) await nonNelFuturo(db, id);
    return leggiLotto(db, id);
  });
  if (!lotto) throw nonTrovato('Acquisto');
  res.json(lotto);
});

// Toglie un acquisto. Se era l'ultimo del titolo nel portafoglio, sparisce anche l'allineamento alla banca.
rotteInvestimenti.delete('/lotti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const n = await conUtente(res.locals.utenteId, async (db) => {
    const tolto = (await db.query<{ titolo_id: string; portafoglio_id: string }>(`delete from lotti where id = $1 and verso = 'acquisto' returning titolo_id, portafoglio_id`, [id])).rows[0];
    if (tolto) await db.query(`delete from allineamenti_banca s where titolo_id = $1 and portafoglio_id = $2
                                 and not exists (select 1 from lotti l where l.titolo_id = s.titolo_id and l.portafoglio_id = s.portafoglio_id and l.verso = 'acquisto')`, [tolto.titolo_id, tolto.portafoglio_id]);
    return tolto ? 1 : 0;
  });
  if (!n) throw nonTrovato('Acquisto');
  res.status(204).end();
});

// Sposta un titolo in un altro portafoglio con tutti i suoi acquisti. L'allineamento alla banca va con lui, se là il titolo non ne ha già uno.
rotteInvestimenti.patch('/posizioni', async (req, res) => {
  const c = v.corpo(req.body);
  const titolo = v.id(c, 'titolo_id', true)!, da = v.id(c, 'portafoglio_id', true)!, a = v.id(c, 'nuovo_portafoglio_id', true)!;
  const trovata = await conUtente(res.locals.utenteId, async (db) => {
    await controllaPortafoglio(db, a);
    if (!(await db.query(`select 1 from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto'`, [titolo, da])).rowCount) return false;
    if (da === a) return true;
    await db.query(`update lotti set portafoglio_id = $3 where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto'`, [titolo, da, a]);
    if ((await db.query('select 1 from allineamenti_banca where titolo_id = $1 and portafoglio_id = $2', [titolo, a])).rowCount) {
      await db.query('delete from allineamenti_banca where titolo_id = $1 and portafoglio_id = $2', [titolo, da]);
    } else {
      await db.query('update allineamenti_banca set portafoglio_id = $3 where titolo_id = $1 and portafoglio_id = $2', [titolo, da, a]);
    }
    return true;
  });
  if (!trovata) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});

// Toglie un titolo da un portafoglio: tutti i suoi acquisti e l'allineamento alla banca.
rotteInvestimenti.delete('/posizioni', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const titolo = v.id(q, 'titolo_id', true)!, port = v.id(q, 'portafoglio_id', true)!;
  const n = await conUtente(res.locals.utenteId, async (db) => {
    await db.query('delete from allineamenti_banca where titolo_id = $1 and portafoglio_id = $2', [titolo, port]);
    return (await db.query(`delete from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto'`, [titolo, port])).rowCount;
  });
  if (!n) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});

// Allinea un titolo alla banca (decisione 68): PCM e/o prezzo di mercato come li mostra la banca. Ciascuno si confronta con quello di
// Yahoo in questo momento (il PCM dei prezzi di borsa degli acquisti, l'ultimo prezzo di mercato) e se ne salva il rapporto: tutti i
// prezzi di acquisto, e tutti i prezzi di mercato anche nel passato del grafico, si moltiplicano per lui finché non si sincronizza.
rotteInvestimenti.put('/posizioni/allinea', async (req, res) => {
  const c = v.corpo(req.body);
  const titolo = v.id(c, 'titolo_id', true)!, port = v.id(c, 'portafoglio_id', true)!;
  const pcm = v.prezzo(c, 'pcm'), prezzo = v.prezzo(c, 'prezzo');
  if (!pcm && !prezzo) throw new ErroreApi(400, 'Scrivi il PCM o il prezzo di mercato della banca');
  if ((pcm && Number(pcm) <= 0) || (prezzo && Number(prezzo) <= 0)) throw new ErroreApi(400, 'PCM e prezzo devono essere maggiori di zero');
  const trovata = await conUtente(res.locals.utenteId, async (db) => {
    const borsa = (await db.query<{ pcm: string | null }>(
      `select (sum(quantita * prezzo) / nullif(sum(quantita), 0))::text as pcm from lotti where titolo_id = $1 and portafoglio_id = $2 and verso = 'acquisto'`, [titolo, port])).rows[0]?.pcm;
    if (borsa == null) return false;
    const mercato = (await db.query<{ prezzo: string }>('select prezzo::text as prezzo from prezzi where titolo_id = $1 order by data desc limit 1', [titolo])).rows[0]?.prezzo;
    if (prezzo && !mercato) throw new ErroreApi(409, 'Manca il prezzo di Yahoo di questo titolo: non c\'è niente da allineare. Riprova quando arriva');
    const fPcm = pcm ? Number(pcm) / Number(borsa) : null, fPrezzo = prezzo ? Number(prezzo) / Number(mercato) : null;
    await db.query(`insert into allineamenti_banca (proprietario_id, titolo_id, portafoglio_id, fattore_pcm, fattore_prezzo) values (fp_me(), $1, $2, $3, $4)
                    on conflict (proprietario_id, titolo_id, portafoglio_id) do update set
                      fattore_pcm = coalesce(excluded.fattore_pcm, allineamenti_banca.fattore_pcm),
                      fattore_prezzo = coalesce(excluded.fattore_prezzo, allineamenti_banca.fattore_prezzo), salvato_il = now()`,
      [titolo, port, fPcm?.toFixed(10) ?? null, fPrezzo?.toFixed(10) ?? null]);
    return true;
  });
  if (!trovata) throw nonTrovato('Titolo nel portafoglio');
  res.status(204).end();
});

// «Sincronizza»: toglie l'allineamento, PCM e prezzi tornano quelli di Yahoo.
rotteInvestimenti.delete('/posizioni/allinea', async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const titolo = v.id(q, 'titolo_id', true)!, port = v.id(q, 'portafoglio_id', true)!;
  await conUtente(res.locals.utenteId, (db) => db.query('delete from allineamenti_banca where titolo_id = $1 and portafoglio_id = $2', [titolo, port]));
  res.status(204).end();
});
