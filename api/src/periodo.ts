import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';

// Date come testo AAAA-MM-GG, calcoli in UTC per non dipendere dal fuso orario.

export type Periodo = { mese: string; dal: string; al: string };

const testo = (d: Date) => d.toISOString().slice(0, 10);
const daTesto = (s: string) => new Date(`${s}T00:00:00Z`);
const giorniNelMese = (anno: number, mese0: number) => new Date(Date.UTC(anno, mese0 + 1, 0)).getUTCDate();

// "Oggi" è il giorno di chi usa l'app (di base l'Italia), non quello di Greenwich:
// dopo mezzanotte in Italia è già domani anche se in UTC non lo è ancora.
export const FUSO_ORARIO = process.env.FUSO_ORARIO || 'Europe/Rome';
const formatoGiorno = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_ORARIO, year: 'numeric', month: '2-digit', day: '2-digit' });
export function oggi(): string {
  return formatoGiorno.format(new Date());
}

// Aggiunge n mesi tenendo il giorno; se il mese è più corto si ferma all'ultimo giorno.
export function aggiungiMesi(data: string, n: number): string {
  const d = daTesto(data);
  const totale = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const anno = Math.floor(totale / 12);
  const mese0 = totale - anno * 12;
  return testo(new Date(Date.UTC(anno, mese0, Math.min(d.getUTCDate(), giorniNelMese(anno, mese0)))));
}

export function aggiungiGiorni(data: string, n: number): string {
  const d = daTesto(data);
  d.setUTCDate(d.getUTCDate() + n);
  return testo(d);
}

// Mesi interi tra due date (b - a), contando solo anno e mese.
export function mesiTra(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

// Il mese "AAAA-MM" dell'app va dal giorno di inizio al giorno prima dello stesso giorno del mese dopo.
export function periodo(mese: string, inizio: number): Periodo {
  const dal = `${mese}-${String(inizio).padStart(2, '0')}`;
  return { mese, dal, al: aggiungiGiorni(aggiungiMesi(dal, 1), -1) };
}

export function meseDi(data: string, inizio: number): string {
  const mese = data.slice(0, 7);
  return Number(data.slice(8, 10)) >= inizio ? mese : aggiungiMesi(`${mese}-01`, -1).slice(0, 7);
}

export function spostaMese(mese: string, n: number): string {
  return aggiungiMesi(`${mese}-01`, n).slice(0, 7);
}

// Legge ?mese=AAAA-MM (o usa il mese in corso) con l'inizio del mese dell'utente.
export async function periodoRichiesto(db: PoolClient, valore: unknown): Promise<Periodo & { inizio: number }> {
  const inizio = await inizioMese(db);
  if (valore !== undefined && (typeof valore !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valore))) {
    throw new ErroreApi(400, 'Il mese deve essere AAAA-MM');
  }
  return { ...periodo((valore as string | undefined) ?? meseDi(oggi(), inizio), inizio), inizio };
}

export async function inizioMese(db: PoolClient): Promise<number> {
  const { rows } = await db.query<{ inizio_mese: number }>('select inizio_mese from utenti where id = fp_me()');
  return rows[0]?.inizio_mese ?? 1;
}

// ---- Il mese personale è l'unico "mese" dell'app (decisione 41) ----
// Una voce con giorno cade nel mese personale che contiene quella data; una voce senza giorno ("marzo")
// vale per tutto il mese personale di marzo, e la data salvata (giorno 1) dice solo quale. Il ciclo di una
// voce periodica si conta sempre per mesi personali interi: il giorno serve per l'ordine e per mostrarlo.

// Fine (ultimo giorno) del mese personale "AAAA-MM".
export const fineMese = (mese: string, inizio: number): string => periodo(mese, inizio).al;

// In che mese personale ("AAAA-MM") cade una data salvata di una voce: senza giorno è il mese scritto.
export const meseDiVoce = (data: string, senzaGiorno: boolean, inizio: number): string =>
  senzaGiorno ? data.slice(0, 7) : meseDi(data, inizio);

// La data del giorno `giorno` dentro il mese personale `mese` (ferma all'ultimo giorno se il mese è più corto).
export function dataNelMese(mese: string, giorno: number, inizio: number): string {
  const base = giorno >= inizio ? mese : spostaMese(mese, 1);
  const [a, m] = base.split('-').map(Number);
  return `${base}-${String(Math.min(giorno, giorniNelMese(a, m - 1))).padStart(2, '0')}`;
}

// Prima scadenza che cade nel periodo per una voce che si ripete ogni `ogni` mesi personali
// a partire dal mese personale di `prima` (ogni = null: una volta sola). Nessuna scadenza: null.
// Senza giorno la scadenza è l'inizio del periodo (vale tutto il mese).
export function scadenzaNelPeriodo(prima: string | null, ogni: number | null, p: Periodo, senzaGiorno = false): string | null {
  if (!prima) return ogni === 1 ? p.dal : null;
  const inizio = Number(p.dal.slice(8, 10));
  const d = mesiTra(`${meseDiVoce(prima, senzaGiorno, inizio)}-01`, `${p.mese}-01`);
  if (d < 0 || (ogni === null ? d !== 0 : d % ogni !== 0)) return null;
  return senzaGiorno ? p.dal : dataNelMese(p.mese, Number(prima.slice(8, 10)), inizio);
}

// Prossima uscita da `da` (il mese personale di `da` conta ancora) di una voce che parte da `prima` e si ripete
// ogni `ogni` mesi personali (null: una volta sola). Con giorno: la data di quel giorno nel mese; senza giorno:
// l'ultimo giorno del mese personale. Passa alla successiva solo a mese personale finito.
export function prossimaUscita(prima: string | null, ogni: number | null, da: string, senzaGiorno: boolean, inizio: number): string {
  if (!prima) return da;
  const primo = meseDiVoce(prima, senzaGiorno, inizio), ora = meseDi(da, inizio);
  const arretrati = mesiTra(`${primo}-01`, `${ora}-01`);
  const k = ogni === null || arretrati <= 0 ? 0 : Math.ceil(arretrati / ogni);
  const mese = spostaMese(primo, k * (ogni ?? 0));
  return senzaGiorno ? fineMese(mese, inizio) : dataNelMese(mese, Number(prima.slice(8, 10)), inizio);
}

// Mesi personali da `da` alla scadenza, almeno 1: il mese della scadenza conta.
export const mesiFino = (scadenza: string, da: string, inizio: number): number =>
  Math.max(1, mesiTra(`${meseDi(da, inizio)}-01`, `${meseDi(scadenza, inizio)}-01`) + 1);
