// Numeri e date all'italiana, scritti a mano per avere sempre il punto delle
// migliaia (Intl in italiano non lo mette sotto 10.000) e lo stesso risultato
// su web e iPhone.

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export function numero(valore: number | string, decimali = 2): string {
  const n = Number(valore);
  if (!Number.isFinite(n)) return '—';
  const [intera, dec] = Math.abs(n).toFixed(decimali).split('.');
  const conPunti = intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '−' : ''}${conPunti}${dec ? ',' + dec : ''}`;
}

// 1234.5 → "1.234,50 €"; con segno → "+1.234,50 €" / "−1.234,50 €".
export function euro(valore: number | string | null | undefined, opzioni: { segno?: boolean; decimali?: number } = {}): string {
  if (valore === null || valore === undefined || valore === '') return '—';
  const n = Number(valore);
  return `${opzioni.segno && n > 0 ? '+' : ''}${numero(n, opzioni.decimali ?? 2)} €`;
}

// Euro tondi per i numeri grandi delle proiezioni: "27.217 €".
export const euroTondi = (v: number | string) => euro(v, { decimali: 0 });

// Da testo italiano ("1.234,50" o "1234.50") a importo per l'API ("1234.50"). null se non valido.
export function leggiImporto(testo: string): string | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(/−/g, '-');
  const normale = pulito.includes(',') ? pulito.replace(/\./g, '').replace(',', '.') : pulito;
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(normale)) return null;
  return normale;
}

// Importo dell'API in testo da modificare: "1234.50" → "1.234,50".
export const importoInTesto = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '' : numero(v).replace('−', '-'));

const daIso = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
export const oggiIso = () => {
  const o = new Date();
  return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`;
};

// "2026-10-22" → "22 ottobre 2026"; corta: "22 ott."
export function data(s: string | null | undefined, forma: 'lunga' | 'corta' | 'giorno' = 'lunga'): string {
  if (!s) return '—';
  const dt = daIso(s);
  const g = dt.getUTCDate(), m = dt.getUTCMonth(), a = dt.getUTCFullYear();
  if (forma === 'corta') return `${g} ${MESI[m].slice(0, 3)}`;
  if (forma === 'giorno') return `${GIORNI[dt.getUTCDay()]} ${g} ${MESI[m]}`;
  return `${g} ${MESI[m]} ${a}`;
}

// "2026-10" → "Ottobre 2026"
export function nomeMese(mese: string, conAnno = true): string {
  const [a, m] = mese.split('-').map(Number);
  const nome = MESI[m - 1].charAt(0).toUpperCase() + MESI[m - 1].slice(1);
  return conAnno ? `${nome} ${a}` : nome;
}
export const meseCorto = (mese: string) => MESI[Number(mese.slice(5, 7)) - 1].slice(0, 3);
export const nomeMeseMinuscolo = (mese: string) => MESI[Number(mese.slice(5, 7)) - 1];

export function spostaMese(mese: string, n: number): string {
  const [a, m] = mese.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// "22/10/2026" o "2026-10-22" → "2026-10-22"; null se non valida.
export function leggiData(testo: string): string | null {
  const t = testo.trim();
  let a: number, m: number, g: number;
  const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (it) [g, m, a] = [Number(it[1]), Number(it[2]), Number(it[3])];
  else if (iso) [a, m, g] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, g));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== g) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}
export const dataInTesto = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export const percento = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${numero(v, Number.isInteger(v) ? 0 : 1)}%`);
