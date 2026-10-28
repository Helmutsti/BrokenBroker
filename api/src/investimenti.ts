import type { PoolClient } from 'pg';
import { nonTrovato } from './errori.ts';
import { aggiornaStoricoMetalli, quotazioniMetalli, storicoMetalli } from './metalli.ts';
import type { Metallo, Quotazione } from './metalli.ts';
import { aggiornaPrezzi, aggiornaStorico, statoPrezzo } from './prezzi.ts';
import { aggiungiGiorni, aggiungiMesi, oggi } from './periodo.ts';

// Calcoli degli investimenti (privati). Un portafoglio contiene lotti di titoli
// quotati e beni (non quotati o con prezzo di mercato). Stesso titolo + stesso portafoglio
// = una sola riga (tabella `lotti`, nome storico): quantità totale e prezzo medio di carico
// (PCM), data = ultimo acquisto; un nuovo acquisto la aggiorna. I portafogli con conta_nel_patrimonio = false (di prova)
// restano fuori dai totali generali.

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
// Quantità: al massimo 6 decimali, senza zeri inutili.
export const numero = (n: number) => String(Number(n.toFixed(6)));
export const percentuale = (valore: number, costo: number) => (costo > 0 ? Math.round(((valore - costo) / costo) * 1000) / 10 : null);

export type Lotto = { id: string; titolo_id: string; portafoglio_id: string; data: string; quantita: string; prezzo: string };
export type PortafoglioDb = { id: string; nome: string; icona: string; conta_nel_patrimonio: boolean; creato_il: string };
export type BeneDb = {
  id: string; portafoglio_id: string; nome: string; tipo: string; costo: string; valore: string | null; valore_al: string; data_acquisto: string | null; dove: string | null;
  creato: string; catalogo_codice: string | null; quantita: string | null; purezza: string | null;
  catalogo_nome: string | null; metallo: Metallo | null; unita: 'grammi' | 'pezzi' | null; grammi_fini: string | null; purezza_predefinita: string | null;
};
export type Titolo = { id: string; isin: string | null; ticker: string | null; nome: string; tipo: string; simbolo: string | null; borsa: string | null; valuta: string | null };
type Prezzo = { titolo_id: string; data: string; prezzo: number; fonte: string | null; aggiornato_il: string | null };
type Storico = Map<Metallo, { data: string; euro_grammo: number }[]>;

export const CAMPI_BENE = `b.id, b.portafoglio_id, b.nome, b.tipo, b.costo::text as costo, b.valore::text as valore, b.valore_al, b.data_acquisto, b.dove,
  to_char(b.creato_il, 'YYYY-MM-DD') as creato, b.catalogo_codice, b.quantita::text as quantita, b.purezza::text as purezza,
  c.nome as catalogo_nome, c.metallo, c.unita, c.grammi_fini::text as grammi_fini, c.purezza_predefinita::text as purezza_predefinita`;
export const DA_BENI = 'beni b left join catalogo_beni c on c.codice = b.catalogo_codice';

export async function caricaDati(db: PoolClient, conStorico = false) {
  // Le vendite (righe vecchie) non fanno parte del modello: si ignorano.
  const lotti = (await db.query<Lotto>(
    `select id, titolo_id, portafoglio_id, to_char(acquistato_il, 'YYYY-MM-DD') as data, quantita::text as quantita, prezzo::text as prezzo
       from lotti where verso = 'acquisto' order by acquistato_il, id`)).rows;
  const ids = [...new Set(lotti.map((o) => o.titolo_id))];
  // Il prezzo di oggi arriva da solo; resta valido l'ultimo noto se la fonte non risponde.
  await aggiornaPrezzi(db, ids);
  // Per l'andamento servono anche i prezzi passati (decisione 65).
  if (conStorico) await aggiornaStorico(db, ids);
  const titoli = new Map((await db.query<Titolo>('select id, isin, ticker, nome, tipo, simbolo, borsa, valuta from titoli where id = any($1)', [ids])).rows.map((t) => [t.id, t]));
  const portafogli = (await db.query<PortafoglioDb>('select id, nome, icona, conta_nel_patrimonio, creato_il from portafogli order by lower(nome), creato_il')).rows;
  const prezzi = (await db.query<{ titolo_id: string; data: string; prezzo: string; fonte: string | null; aggiornato_il: string | null }>(
    'select titolo_id, data, prezzo::text as prezzo, fonte, aggiornato_il from prezzi where titolo_id = any($1) order by data', [ids])).rows
    .map((p): Prezzo => ({ titolo_id: p.titolo_id, data: p.data, prezzo: Number(p.prezzo), fonte: p.fonte, aggiornato_il: p.aggiornato_il }));
  const beniDb = (await db.query<BeneDb>(`select ${CAMPI_BENE} from ${DA_BENI} order by b.nome`)).rows;
  const quotazioni = await quotazioniMetalli(db, [...new Set(beniDb.flatMap((b) => (b.metallo ? [b.metallo] : [])))]);
  // Anche per i metalli servono le quotazioni passate, dal giorno in cui ogni bene è stato comprato (decisione 65).
  if (conStorico) await aggiornaStoricoMetalli(db, beniDb.flatMap((b) => (b.metallo ? [{ metallo: b.metallo, dal: b.data_acquisto ?? b.creato }] : [])));
  const storico: Storico = conStorico ? await storicoMetalli(db) : new Map();
  const nomiPortafogli = new Map(portafogli.map((p) => [p.id, p.nome]));
  return { lotti, titoli, portafogli, nomiPortafogli, prezzi, beniDb, quotazioni, storico };
}
export type Dati = Awaited<ReturnType<typeof caricaDati>>;

// Portafogli che contano nei totali generali.
export const portafogliDelPatrimonio = (d: Dati) => new Set(d.portafogli.filter((p) => p.conta_nel_patrimonio).map((p) => p.id));

// Grammi di metallo fino di un bene del catalogo.
function grammiFini(b: BeneDb): number {
  return b.unita === 'pezzi' ? Number(b.quantita) * Number(b.grammi_fini) : (Number(b.quantita) * Number(b.purezza ?? b.purezza_predefinita)) / 1000;
}

// Un bene com'è oggi. Valore: scritto a mano (non quotati) oppure grammi fini × quotazione spot (catalogo);
// senza quotazione il valore è null e lo stato 'mancante'.
export function descriviBene(b: BeneDb, quotazioni: Map<Metallo, Quotazione>, nomiPortafogli: Map<string, string>) {
  const costo = Number(b.costo);
  let valore: number | null;
  let valoreAl: string | null;
  let fini: number | null = null;
  let euroGrammo: number | null = null;
  if (b.catalogo_codice) {
    fini = grammiFini(b);
    const q = quotazioni.get(b.metallo!);
    euroGrammo = q?.euro_grammo ?? null;
    valore = q ? fini * q.euro_grammo : null;
    valoreAl = q?.data ?? null;
  } else {
    valore = Number(b.valore);
    valoreAl = b.valore_al;
  }
  return {
    id: b.id, portafoglio_id: b.portafoglio_id, portafoglio: nomiPortafogli.get(b.portafoglio_id) ?? null, nome: b.nome, tipo: b.tipo,
    costo: cent(costo), valore: valore === null ? null : cent(valore), valore_al: valoreAl, valore_automatico: b.catalogo_codice !== null,
    stato: b.catalogo_codice ? statoPrezzo(valoreAl) : 'ok',
    data_acquisto: b.data_acquisto, dove: b.dove,
    catalogo: b.catalogo_codice ? { codice: b.catalogo_codice, nome: b.catalogo_nome, metallo: b.metallo, unita: b.unita } : null,
    quantita: b.quantita === null ? null : numero(Number(b.quantita)), purezza: b.purezza,
    grammi_fini: fini === null ? null : fini.toFixed(4), euro_grammo: euroGrammo === null ? null : euroGrammo.toFixed(4),
    guadagno: valore === null ? null : cent(valore - costo), guadagno_percentuale: valore === null ? null : percentuale(valore, costo),
  };
}

// Posizioni a una data: per (titolo, portafoglio) quantità e costo. Ogni posizione ha una sola riga, con la data dell'ultimo
// acquisto: prima di quella data non esiste, da quella in poi vale con la quantità totale.
function posizioniAl(lotti: Lotto[], al: string, portafogli: Set<string>) {
  const per = new Map<string, { titolo: string; portafoglio: string; quantita: number; costo: number }>();
  for (const o of lotti) {
    if (o.data > al || !portafogli.has(o.portafoglio_id)) continue;
    const k = `${o.titolo_id}|${o.portafoglio_id}`;
    const p = per.get(k) ?? { titolo: o.titolo_id, portafoglio: o.portafoglio_id, quantita: 0, costo: 0 };
    p.quantita += Number(o.quantita); p.costo += Number(o.quantita) * Number(o.prezzo);
    per.set(k, p);
  }
  return per;
}

// Ultimo prezzo noto di un titolo fino a una data (i prezzi sono in ordine di data).
function prezzoAl(prezzi: Prezzo[], titolo: string, al: string): Prezzo | undefined {
  let ultimo: Prezzo | undefined;
  for (const p of prezzi) if (p.titolo_id === titolo && p.data <= al) ultimo = p;
  return ultimo;
}

// Riepilogo di un insieme di portafogli: posizioni, beni e totali.
export function riepilogo(d: Dati, portafogli: Set<string>) {
  const al = oggi();
  const righe = [...posizioniAl(d.lotti, al, portafogli).values()].filter((p) => p.quantita > 1e-9).map((p) => {
    const prezzo = prezzoAl(d.prezzi, p.titolo, al);
    const valore = prezzo ? p.quantita * prezzo.prezzo : null;
    return {
      ...d.titoli.get(p.titolo)!, titolo_id: p.titolo, portafoglio_id: p.portafoglio, portafoglio: d.nomiPortafogli.get(p.portafoglio) ?? null,
      quantita: numero(p.quantita), prezzo_medio: (p.costo / p.quantita).toFixed(4), costo: cent(p.costo),
      prezzo: prezzo ? prezzo.prezzo.toFixed(4) : null, prezzo_al: prezzo?.data ?? null, prezzo_fonte: prezzo ? prezzo.fonte ?? 'mano' : null, prezzo_aggiornato_il: prezzo?.aggiornato_il ?? null, stato: statoPrezzo(prezzo?.data),
      valore: valore === null ? null : cent(valore),
      guadagno: valore === null ? null : cent(valore - p.costo), guadagno_percentuale: valore === null ? null : percentuale(valore, p.costo),
    };
  });
  const beni = d.beniDb.filter((b) => portafogli.has(b.portafoglio_id)).map((b) => descriviBene(b, d.quotazioni, d.nomiPortafogli));
  const conValore = [...righe, ...beni].filter((x) => x.valore !== null);
  const valoreTitoli = righe.reduce((t, r) => t + Number(r.valore ?? 0), 0);
  const valoreBeni = beni.reduce((t, b) => t + Number(b.valore ?? 0), 0);
  const totale = valoreTitoli + valoreBeni;
  const costo = [...righe, ...beni].reduce((t, x) => t + Number(x.costo), 0);
  // Il guadagno si calcola solo sulle voci che hanno un valore: una voce senza prezzo non diventa una perdita.
  const costoConValore = conValore.reduce((t, x) => t + Number(x.costo), 0);
  const guadagno = totale - costoConValore;
  const peso = (x: { valore: string | null }) => (x.valore === null || totale <= 0 ? null : Math.round((Number(x.valore) / totale) * 1000) / 10);
  const conta = (voci: { stato: string }[], stato: string) => voci.filter((x) => x.stato === stato).length;
  const ordina = <T extends { valore: string | null }>(v: T[]) => v.sort((a, b) => Number(b.valore ?? -1) - Number(a.valore ?? -1));
  return {
    valore: cent(totale), valore_titoli: cent(valoreTitoli), valore_beni: cent(valoreBeni), costo: cent(costo), messo_dentro: cent(costo),
    guadagno: cent(guadagno), guadagno_percentuale: percentuale(totale, costoConValore),
    titoli_senza_prezzo: conta(righe, 'mancante'), titoli_prezzo_vecchio: conta(righe, 'vecchio'),
    beni_senza_prezzo: conta(beni, 'mancante'), beni_prezzo_vecchio: conta(beni, 'vecchio'),
    incompleto: conta(righe, 'mancante') + conta(beni, 'mancante') > 0,
    posizioni: ordina(righe.map((r) => ({ ...r, peso: peso(r) }))),
    beni: ordina(beni.map((b) => ({ ...b, peso: peso(b) }))),
  };
}

// Portafoglio generale (solo i portafogli che contano nel patrimonio) o di un solo portafoglio.
export async function portafoglio(db: PoolClient, portafoglioId?: string) {
  const d = await caricaDati(db);
  return riepilogo(d, selezione(d, portafoglioId));
}

export function selezione(d: Dati, portafoglioId?: string): Set<string> {
  if (!portafoglioId) return portafogliDelPatrimonio(d);
  if (!d.portafogli.some((p) => p.id === portafoglioId)) throw nonTrovato('Portafoglio');
  return new Set([portafoglioId]);
}

// Elenco dei portafogli con i loro totali (anche quelli di prova).
export async function elencoPortafogli(db: PoolClient) {
  const d = await caricaDati(db);
  return d.portafogli.map((p) => riassuntoPortafoglio(d, p));
}

export function riassuntoPortafoglio(d: Dati, p: PortafoglioDb) {
  const r = riepilogo(d, new Set([p.id]));
  return {
    id: p.id, nome: p.nome, icona: p.icona, conta_nel_patrimonio: p.conta_nel_patrimonio, creato_il: p.creato_il,
    valore: r.valore, costo: r.costo, guadagno: r.guadagno, guadagno_percentuale: r.guadagno_percentuale,
    posizioni: r.posizioni.length, beni: r.beni.length, vuoto: r.posizioni.length + r.beni.length === 0,
    titoli_senza_prezzo: r.titoli_senza_prezzo, titoli_prezzo_vecchio: r.titoli_prezzo_vecchio,
    beni_senza_prezzo: r.beni_senza_prezzo, beni_prezzo_vecchio: r.beni_prezzo_vecchio, incompleto: r.incompleto,
  };
}

// Valore di un bene a una data (per l'andamento). I beni del catalogo valgono grammi fini × l'ultima
// quotazione nota a quella data (prima della prima: il costo); gli altri il costo fino al giorno
// del valore scritto, poi quel valore.
function beneAl(b: BeneDb, al: string, storico: Storico) {
  const costo = Number(b.costo);
  if (b.catalogo_codice) {
    if ((b.data_acquisto ?? b.creato) > al) return null;
    let q: number | undefined;
    for (const x of storico.get(b.metallo!) ?? []) if (x.data <= al) q = x.euro_grammo;
    return { valore: q !== undefined ? grammiFini(b) * q : costo, costo };
  }
  if ((b.data_acquisto ?? b.valore_al) > al) return null;
  return { valore: b.valore_al <= al ? Number(b.valore) : costo, costo };
}

// Valore e soldi messi dentro alla fine di ogni mese (mesi) o ogni settimana (settimane). L'ultimo punto è oggi.
// Per i titoli senza prezzo noto a quella data vale il PCM della riga.
// `esclusi`: gli asset tolti dal guadagno mentre si guarda la pagina (decisione 66), «t:<titolo>:<portafoglio>» o «b:<bene>».
export async function andamento(db: PoolClient, mesi: number, settimane: number | undefined, portafoglioId?: string, esclusi: Set<string> = new Set()) {
  const d = await caricaDati(db, true);
  const scelti = selezione(d, portafoglioId);
  const fine = oggi();
  const n = settimane ?? mesi;
  return Array.from({ length: n }, (_, i) => {
    // Ultimo giorno di ogni mese di calendario, o lo stesso giorno di ogni settimana.
    const inizio = `${aggiungiMesi(fine, i - n + 1).slice(0, 7)}-01`;
    const al = settimane ? aggiungiGiorni(fine, -7 * (n - 1 - i)) : i === n - 1 ? fine : aggiungiGiorni(aggiungiMesi(inizio, 1), -1);
    let valore = 0;
    let messo = 0;
    for (const p of posizioniAl(d.lotti, al, scelti).values()) {
      if (esclusi.has(`t:${p.titolo}:${p.portafoglio}`)) continue;
      const prezzo = prezzoAl(d.prezzi, p.titolo, al)?.prezzo ?? Number(d.lotti.filter((o) => o.titolo_id === p.titolo && o.data <= al).at(-1)?.prezzo ?? 0);
      valore += p.quantita * prezzo; messo += p.costo;
    }
    for (const b of d.beniDb) {
      if (!scelti.has(b.portafoglio_id) || esclusi.has(`b:${b.id}`)) continue;
      const x = beneAl(b, al, d.storico);
      if (x) { valore += x.valore; messo += x.costo; }
    }
    return { al, mese: al.slice(0, 7), valore: cent(valore), messo_dentro: cent(messo) };
  });
}

// Beni (uno o tutti, di un portafoglio o no) descritti come nel portafoglio.
export async function leggiBeni(db: PoolClient, filtro: { id?: string; portafoglioId?: string } = {}) {
  const righe = (await db.query<BeneDb>(
    `select ${CAMPI_BENE} from ${DA_BENI} where ($1::uuid is null or b.id = $1) and ($2::uuid is null or b.portafoglio_id = $2) order by b.nome`,
    [filtro.id ?? null, filtro.portafoglioId ?? null])).rows;
  const quotazioni = await quotazioniMetalli(db, [...new Set(righe.flatMap((b) => (b.metallo ? [b.metallo] : [])))]);
  const nomi = new Map((await db.query<{ id: string; nome: string }>('select id, nome from portafogli')).rows.map((p) => [p.id, p.nome]));
  return righe.map((b) => descriviBene(b, quotazioni, nomi));
}
