import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { cent, leggiBeni } from '../investimenti.ts';
import { METALLI, quotazioniMetalli } from '../metalli.ts';
import { oggi } from '../periodo.ts';
import { statoPrezzo } from '../prezzi.ts';
import * as v from '../valida.ts';

// Beni: non quotati (nome, costo, valore scritto a mano) e con prezzo di mercato
// (voce del catalogo di metalli preziosi: valore = grammi fini × quotazione spot).

export const rotteBeni = Router();

const TIPI_NON_QUOTATI = ['fondo_pensione', 'crowdfunding', 'societa', 'immobile', 'altro'] as const;

// Numero positivo arrotondato ai decimali della colonna (es. 7,98805 g → 7.988).
function decimale(c: Record<string, unknown>, campo: string, decimali: number, nome: string, obbligatorio = false): string | undefined {
  if (c[campo] === undefined || c[campo] === null || c[campo] === '') {
    if (obbligatorio) throw new ErroreApi(400, `${nome} è obbligatorio`);
    return undefined;
  }
  const t = String(c[campo]).trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d+)?$/.test(t) || !(Number(t) > 0)) throw new ErroreApi(400, `${nome} deve essere un numero maggiore di zero, es. 7,988`);
  return Number(t).toFixed(decimali);
}

type Catalogo = { codice: string; nome: string; metallo: keyof typeof METALLI; unita: 'grammi' | 'pezzi'; grammi_fini: string | null; purezza_predefinita: string | null };
const voceCatalogo = async (db: PoolClient, codice: string) => {
  const c = (await db.query<Catalogo>('select codice, nome, metallo, unita, grammi_fini::text as grammi_fini, purezza_predefinita::text as purezza_predefinita from catalogo_beni where codice = $1', [codice])).rows[0];
  if (!c) throw new ErroreApi(400, 'Voce del catalogo sconosciuta');
  return c;
};
async function controllaPortafoglio(db: PoolClient, id: string) {
  const p = (await db.query<{ id: string }>('select id from portafogli where id = $1', [id])).rows[0];
  if (!p) throw nonTrovato('Portafoglio');
}
const dataPassata = (d: string | null | undefined) => {
  if (d && d > oggi()) throw new ErroreApi(400, 'La data di acquisto non può essere nel futuro');
};
function costoValido(costo: string | undefined, valore?: string) {
  if ((costo && Number(costo) < 0) || (valore && Number(valore) < 0)) throw new ErroreApi(400, 'Costo e valore non possono essere negativi');
}
function quantitaValida(q: string | undefined, c: Catalogo) {
  if (q !== undefined && c.unita === 'pezzi' && !Number.isInteger(Number(q))) throw new ErroreApi(400, 'Le monete si contano a pezzi interi');
}

// Elenco dei beni con valore e stato (?portafoglio_id= per uno solo).
rotteBeni.get('/beni', async (req, res) => {
  const id = v.id(req.query as Record<string, unknown>, 'portafoglio_id');
  res.json(await conUtente(res.locals.utenteId, (db) => leggiBeni(db, { portafoglioId: id })));
});

// Nuovo bene. Senza "catalogo" è non quotato (nome, tipo, costo, valore, valore_al?, data_acquisto?, dove?);
// con "catalogo" (codice) è un bene di mercato (quantita, purezza? solo per i grammi, costo, data_acquisto?, dove?, nome?).
rotteBeni.post('/beni', async (req, res) => {
  const c = v.corpo(req.body);
  const portafoglio = v.id(c, 'portafoglio_id', true)!;
  const codice = v.testo(c, 'catalogo', false, 40);
  const dataAcquisto = v.data(c, 'data_acquisto') ?? null;
  dataPassata(dataAcquisto);
  const dove = v.testo(c, 'dove', false, 200) ?? null;
  const bene = await conUtente(res.locals.utenteId, async (db) => {
    await controllaPortafoglio(db, portafoglio);
    let id: string;
    if (codice) {
      const cat = await voceCatalogo(db, codice);
      const quantita = decimale(c, 'quantita', 4, 'La quantità', true)!;
      quantitaValida(quantita, cat);
      const costo = v.importo(c, 'costo', true)!;
      costoValido(costo);
      const purezza = cat.unita === 'grammi' ? decimale(c, 'purezza', 1, 'La purezza') ?? cat.purezza_predefinita : null;
      if (purezza && Number(purezza) > 1000) throw new ErroreApi(400, 'La purezza è in millesimi, al massimo 1000');
      if (cat.unita === 'pezzi' && c.purezza !== undefined && c.purezza !== null && c.purezza !== '') throw new ErroreApi(400, 'Le monete non hanno una purezza da scrivere');
      id = (await db.query<{ id: string }>(
        `insert into beni (proprietario_id, portafoglio_id, nome, tipo, costo, valore, catalogo_codice, quantita, purezza, data_acquisto, dove)
         values (fp_me(), $1, $2, 'metallo', $3, null, $4, $5, $6, $7, $8) returning id`,
        [portafoglio, v.testo(c, 'nome', false, 200) || cat.nome, costo, cat.codice, quantita, purezza, dataAcquisto, dove])).rows[0].id;
    } else {
      const costo = v.importo(c, 'costo', true)!, valore = v.importo(c, 'valore', true)!;
      costoValido(costo, valore);
      id = (await db.query<{ id: string }>(
        `insert into beni (proprietario_id, portafoglio_id, nome, tipo, costo, valore, valore_al, data_acquisto, dove)
         values (fp_me(), $1, $2, $3, $4, $5, coalesce($6::date, current_date), $7, $8) returning id`,
        [portafoglio, v.testo(c, 'nome', true, 200), v.scelta(c, 'tipo', TIPI_NON_QUOTATI) ?? 'altro', costo, valore, v.data(c, 'valore_al') ?? null, dataAcquisto, dove])).rows[0].id;
    }
    return (await leggiBeni(db, { id }))[0];
  });
  res.status(201).json(bene);
});

// Modifica. Non quotato: nome, tipo, costo, valore, valore_al, data_acquisto, dove, portafoglio_id.
// Di mercato: nome, quantita, purezza, costo, data_acquisto, dove, portafoglio_id (la voce del catalogo non cambia).
rotteBeni.patch('/beni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const bene = await conUtente(res.locals.utenteId, async (db) => {
    const prima = (await db.query<{ catalogo_codice: string | null; valore_al: string }>('select catalogo_codice, valore_al from beni where id = $1', [id])).rows[0];
    if (!prima) return undefined;
    const campi: Record<string, unknown> = {
      portafoglio_id: v.id(c, 'portafoglio_id'), nome: v.testo(c, 'nome', false, 200), costo: v.importo(c, 'costo'),
      data_acquisto: v.annullabile(c, 'data_acquisto', () => v.data(c, 'data_acquisto')), dove: v.annullabile(c, 'dove', () => v.testo(c, 'dove', false, 200)),
    };
    dataPassata(campi.data_acquisto as string | null | undefined);
    if (campi.portafoglio_id) await controllaPortafoglio(db, campi.portafoglio_id as string);
    if (prima.catalogo_codice) {
      if (c.valore !== undefined || c.valore_al !== undefined || c.tipo !== undefined) throw new ErroreApi(400, 'Il valore di questo bene si calcola dalla quotazione');
      const cat = await voceCatalogo(db, prima.catalogo_codice);
      campi.quantita = decimale(c, 'quantita', 4, 'La quantità');
      quantitaValida(campi.quantita as string | undefined, cat);
      if (c.purezza !== undefined) {
        if (cat.unita === 'pezzi') throw new ErroreApi(400, 'Le monete non hanno una purezza da scrivere');
        campi.purezza = decimale(c, 'purezza', 1, 'La purezza') ?? cat.purezza_predefinita;
        if (Number(campi.purezza) > 1000) throw new ErroreApi(400, 'La purezza è in millesimi, al massimo 1000');
      }
      costoValido(campi.costo as string | undefined);
    } else {
      if (c.quantita !== undefined || c.purezza !== undefined) throw new ErroreApi(400, 'Quantità e purezza sono dei beni con prezzo di mercato');
      campi.tipo = v.scelta(c, 'tipo', TIPI_NON_QUOTATI);
      campi.valore = v.importo(c, 'valore');
      campi.valore_al = v.data(c, 'valore_al') ?? (campi.valore !== undefined ? oggi() : undefined);
      costoValido(campi.costo as string | undefined, campi.valore as string | undefined);
    }
    const set = v.setParziale(campi, 2);
    await db.query(`update beni set ${set.sql} where id = $1`, [id, ...set.valori]);
    return (await leggiBeni(db, { id }))[0];
  });
  if (!bene) throw nonTrovato('Bene');
  res.json(bene);
});

rotteBeni.delete('/beni/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const n = await conUtente(res.locals.utenteId, async (db) => (await db.query('delete from beni where id = $1', [id])).rowCount);
  if (!n) throw nonTrovato('Bene');
  res.status(204).end();
});

// Catalogo dei beni con prezzo di mercato, con la quotazione spot di oggi del loro metallo.
rotteBeni.get('/catalogo', async (_req, res) => {
  const voci = await conUtente(res.locals.utenteId, async (db) => {
    const righe = (await db.query<Catalogo & { ordine: number }>(
      'select codice, nome, metallo, unita, grammi_fini::text as grammi_fini, purezza_predefinita::text as purezza_predefinita, ordine from catalogo_beni order by ordine')).rows;
    const q = await quotazioniMetalli(db);
    return righe.map((r) => {
      const quot = q.get(r.metallo);
      // Valore di 1 pezzo, o di 1 grammo alla purezza proposta.
      const fini = r.unita === 'pezzi' ? Number(r.grammi_fini) : Number(r.purezza_predefinita) / 1000;
      return {
        codice: r.codice, nome: r.nome, metallo: r.metallo, metallo_nome: METALLI[r.metallo], unita: r.unita, grammi_fini: r.grammi_fini, purezza_predefinita: r.purezza_predefinita,
        euro_grammo: quot ? quot.euro_grammo.toFixed(4) : null, quotazione_al: quot?.data ?? null, stato: statoPrezzo(quot?.data),
        valore_unitario: quot ? cent(fini * quot.euro_grammo) : null,
      };
    });
  });
  res.json(voci);
});

// Quotazioni spot dei quattro metalli (euro per grammo di metallo fino): le ultime salvate.
rotteBeni.get('/metalli/quotazioni', async (_req, res) => {
  const out = await conUtente(res.locals.utenteId, async (db) => {
    const q = await quotazioniMetalli(db);
    return (Object.keys(METALLI) as (keyof typeof METALLI)[]).map((m) => ({
      metallo: m, nome: METALLI[m], euro_grammo: q.get(m)?.euro_grammo.toFixed(4) ?? null, data: q.get(m)?.data ?? null, fonte: q.get(m)?.fonte ?? null, stato: statoPrezzo(q.get(m)?.data),
    }));
  });
  res.json(out);
});
