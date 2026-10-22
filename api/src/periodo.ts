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
  const { rows } = await db.query<{ inizio_mese: number }>('select inizio_mese from utenti where id = fp_me()');
  const inizio = rows[0]?.inizio_mese ?? 1;
  if (valore !== undefined && (typeof valore !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valore))) {
    throw new ErroreApi(400, 'Il mese deve essere AAAA-MM');
  }
  return { ...periodo((valore as string | undefined) ?? meseDi(oggi(), inizio), inizio), inizio };
}

// Prima scadenza che cade nel periodo per una voce che si ripete ogni `ogni` mesi
// a partire da `prima` (ogni = null: una volta sola). Nessuna scadenza: null.
export function scadenzaNelPeriodo(prima: string | null, ogni: number | null, p: Periodo): string | null {
  if (!prima) return ogni === 1 ? p.dal : null;
  if (ogni === null) return prima >= p.dal && prima <= p.al ? prima : null;
  let k = Math.max(0, Math.floor(mesiTra(prima, p.dal) / ogni) - 1);
  for (let data = aggiungiMesi(prima, k * ogni); data <= p.al; data = aggiungiMesi(prima, ++k * ogni)) {
    if (data >= p.dal) return data;
  }
  return null;
}
