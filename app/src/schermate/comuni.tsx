import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { ElencoSpese, Rata, Spesa } from '../dati/tipi.ts';
import { dataSpesa, oggiIso } from '../formato.ts';
import { aggiungiMesi, mesiFinoScadenza, meseDi, periodoDi, proxOccorrenza } from '../mesePersonale.ts';
import { d, useTema } from '../tema/tema.tsx';

// Pezzi condivisi tra le schermate.

export function Caricamento({ errore }: { errore?: string | null }) {
  const { c } = useTema();
  if (errore) return <Esito tono="errore" testo={errore} />;
  return <View style={{ padding: d['spazio-gruppo'], alignItems: 'center' }}><ActivityIndicator color={c['sfondo-accento']} /></View>;
}

// Il mese è sempre il mese personale (decisione 41): vedi ../mesePersonale.ts.
export { aggiungiMesi, periodoDi };

// Una spesa mensile ha solo il giorno del mese e può non averlo (decisione 44).
export const mensileSenzaGiorno = (s: Pick<Spesa, 'ogni_mesi' | 'giorno_mese'>) => s.ogni_mesi === 1 && s.giorno_mese === null;

// Prossima uscita di una spesa, per mesi personali: il mese personale in corso conta ancora anche se il giorno è
// già passato (senza giorno: l'inizio del mese personale, vale tutto il mese).
export const proxSpesa = (s: Pick<Spesa, 'prossima_scadenza' | 'ogni_mesi' | 'senza_giorno' | 'giorno_mese'>, da = oggiIso(), inizio = 1) =>
  proxOccorrenza(s, da, inizio);

// La scadenza della rata dentro un periodo, se c'è.
export function scadenzaRataNel(r: Rata, dal: string, al: string): string | null {
  if (r.chiusa) return null;
  for (let i = 0; i < r.numero_rate; i++) {
    const s = aggiungiMesi(r.prima_scadenza, i);
    if (s > al) return null;
    if (s >= dal) return s;
  }
  return null;
}

// "Il 5 · ogni mese", "15 novembre · ogni 6 mesi", "Marzo · ogni anno" (senza giorno), "Una volta · 20 novembre", "Tutto il mese".
export function quando(s: Spesa, inizio = 1): string {
  if (s.ogni_mesi === null) return `Una volta · ${dataSpesa(s.prossima_scadenza, s.senza_giorno)}`;
  if (s.ogni_mesi === 1) return s.giorno_mese ? `Il ${s.giorno_mese} · ogni mese` : 'Ogni mese';
  const prossima = proxSpesa(s, oggiIso(), inizio);
  const mese = prossima ? dataSpesa(prossima, s.senza_giorno) : '';
  const nome = mese.charAt(0).toUpperCase() + mese.slice(1);
  return `${nome} · ${s.ogni_mesi === 12 ? 'ogni anno' : s.ogni_mesi === 24 ? 'ogni 2 anni' : `ogni ${s.ogni_mesi} mesi`}`;
}

// Da dove esce una spesa (decisione 61): il conto, o «BPER → Deposito» se va su un altro conto (uno spostamento, non una spesa).
export const daA = (s: Pick<Spesa, 'conto' | 'a_conto_id' | 'a_conto'>): string | null =>
  s.a_conto_id ? `${s.conto ?? 'Senza conto'} → ${s.a_conto ?? 'un altro conto'}` : s.conto;

// Quota scritta accanto all'importo: "58,90 € · ½" quando la spesa è divisa a metà.
export const segnoQuota = (s: Spesa) => (s.mia_percentuale === 50 ? ' · ½' : s.mia_percentuale > 0 && s.mia_percentuale < 100 ? ` · ${s.mia_percentuale}%` : '');

// ---- Spese annuali ----

// Spese annuali o periodiche: escono ogni N mesi (N > 1). Sono promemoria come le altre: si vedono e si spuntano solo nel mese in cui cadono, per intero (decisione 50).
export const eAnnuale = (s: Spesa) => s.attiva && s.ogni_mesi !== null && s.ogni_mesi > 1;

// Le voci del mese divise per tipo; "delConto" sono tutte le voci che escono dal conto (annuali comprese, nel loro mese).
export function vociDelMese(el: ElencoSpese, perUscita?: (a: Spesa, b: Spesa) => number) {
  const delMese = el.spese.filter((s) => s.attiva && s.nel_mese);
  if (perUscita) delMese.sort(perUscita);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento');
  return { fisse, investimenti, delConto: [...fisse, ...investimenti] };
}

// Le rate che cadono nel periodo, in ordine di data.
export const rateDelMese = (rate: Rata[], dal: string, al: string) =>
  rate.map((x) => ({ r: x, quando: x.scadenza ?? scadenzaRataNel(x, dal, al) })).filter((x) => x.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));

// Mesi personali da oggi alla scadenza, almeno 1: il mese della scadenza conta.
export const mesiFino = (scadenza: string, da = oggiIso(), inizio = 1) => mesiFinoScadenza(scadenza, da, inizio);
export const fraMesi = (scadenza: string, inizio = 1) => {
  const n = mesiFino(scadenza, oggiIso(), inizio) - 1;
  if (meseDi(scadenza, inizio) < meseDi(oggiIso(), inizio)) return 'scaduto';
  return n <= 0 ? 'questo mese' : n === 1 ? 'fra 1 mese' : `fra ${n} mesi`;
};

