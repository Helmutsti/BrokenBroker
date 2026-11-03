import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { ElencoSpese, Rata, Spesa } from '../dati/tipi.ts';
import { data, dataSpesa, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { aggiungiMesi, mesiFinoScadenza, meseDi, meseDiVoce, mesiTraChiavi, periodoDi, proxOccorrenza, spostaChiave } from '../mesePersonale.ts';
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

// Prossima scadenza ancora da pagare di una spesa: se la scadenza in corso (annuali) è già pagata, anche in anticipo, è la successiva
// (una tantum: resta la sua data, ormai pagata).
export function proxSpesaDaPagare(s: Spesa, da = oggiIso(), inizio = 1): string | null {
  if (s.uscita && s.scadenza_in_corso && s.ogni_mesi !== null && s.ogni_mesi >= 2) {
    return proxSpesa(s, periodoDi(spostaChiave(s.scadenza_in_corso, s.ogni_mesi), inizio).dal, inizio);
  }
  return proxSpesa(s, da, inizio);
}

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


// ---- Uscite (decisione 72): come si raccontano le spese ----

// «A giugno e dicembre»: elenco con la virgola e la «e» prima dell'ultimo.
export const elencoConE = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

// «ogni mese», «ogni 6 mesi», «ogni anno», «ogni 2 anni», «una volta».
export const cadenza = (ogni: number | null) => (ogni === null ? 'una volta' : ogni === 1 ? 'ogni mese' : ogni === 12 ? 'ogni anno' : ogni === 24 ? 'ogni 2 anni' : `ogni ${ogni} mesi`);

// I mesi dell'anno (nomi) in cui cade una spesa che si ripete ogni `ogni` mesi, partendo dalla data di riferimento; vuoto se il ciclo non entra in un anno (es. ogni 5 mesi).
export function mesiDelCiclo(ogni: number, riferimento: string, senzaGiorno: boolean, inizio: number): string[] {
  if (ogni < 2 || 12 % ogni !== 0) return [];
  const base = Number(meseDiVoce(riferimento, senzaGiorno, inizio).slice(5, 7)) - 1;
  const mesi = Array.from({ length: 12 / ogni }, (_, k) => (base + k * ogni) % 12).sort((a, b) => a - b);
  return mesi.map((m) => nomeMeseMinuscolo(`2000-${String(m + 1).padStart(2, '0')}`));
}

// «prossima tra 1 mese», «prossima questo mese», «scaduta a maggio» (rispetto a oggi, per mesi personali).
export function traMesi(scadenza: string, inizio: number): string {
  const n = mesiTraChiavi(meseDi(oggiIso(), inizio), meseDi(scadenza, inizio));
  if (n < 0) return `scaduta a ${nomeMeseMinuscolo(meseDi(scadenza, inizio))}`;
  return n === 0 ? 'prossima questo mese' : n === 1 ? 'prossima tra 1 mese' : `prossima tra ${n} mesi`;
}

// Le due date che seguono una scadenza, ogni N mesi: «16 giugno 2027, 16 dicembre 2027…».
export const poiDate = (iso: string, ogni: number) => `${data(aggiungiMesi(iso, ogni))}, ${data(aggiungiMesi(iso, ogni * 2))}…`;

// «a metà» o «60%»: solo se la spesa è divisa.
export const quotaInTesto = (s: Pick<Spesa, 'mia_percentuale'>) => (s.mia_percentuale >= 100 ? null : s.mia_percentuale === 50 ? 'a metà' : `${s.mia_percentuale}%`);
