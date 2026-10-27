import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { ElencoSpese, Obiettivo, Profilo, Rata, Spesa } from '../dati/tipi.ts';
import { dataSpesa, oggiIso } from '../formato.ts';
import { aggiungiMesi, mesiFinoScadenza, meseDi, meseDiVoce, periodoDi, proxOccorrenza, spostaChiave } from '../mesePersonale.ts';
import { d, useTema } from '../tema/tema.tsx';

// Pezzi condivisi tra le schermate.

// Calcoli della finestra della cifra di un salvadanaio (puri, provati anche dalle prove dell'API).
export { liberiDi, mancaAlTraguardo, pianoCifra, quotaMensileSalvadanaio } from '../calcoliCifra.ts';

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

// Quota scritta accanto all'importo: "58,90 € · ½" quando la spesa è divisa a metà.
export const segnoQuota = (s: Spesa) => (s.mia_percentuale === 50 ? ' · ½' : s.mia_percentuale > 0 && s.mia_percentuale < 100 ? ` · ${s.mia_percentuale}%` : '');

// ---- Annuali e obiettivi (proposta v2) ----

export const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);
// Filtro per conto in Salvadanai (decisione 45): 'tutti', 'senza' (nessun conto) o l'id di un conto.
// Un salvadanaio conta per il suo conto che vale (proprio o ereditato) e solo con i soldi messi direttamente in lui (`versato`).
export const suQuelConto = (o: Obiettivo, filtro: string) => (filtro === 'tutti' ? true : filtro === 'senza' ? !o.conto_id : o.conto_id === filtro);
export const sommaSuConto = (radici: Obiettivo[], filtro: string) =>
  tuttiGliObiettivi(radici).filter((o) => suQuelConto(o, filtro)).reduce((t, o) => t + Number(o.versato), 0);

// Spese annuali o periodiche: escono ogni N mesi (N > 1); non i «Ricordami» dei salvadanai. Sono promemoria come
// le altre: si vedono e si spuntano solo nel mese in cui cadono, per intero (decisione 50).
export const eAnnuale = (s: Spesa) => s.attiva && !s.alimenta_obiettivo_id && s.ogni_mesi !== null && s.ogni_mesi > 1;

// Cifra del mese: la mia quota.
export const importoDelMese = (s: Spesa) => Number(s.mia_quota);

// Le voci del mese divise per tipo; "delConto" sono tutte le voci che escono dal conto (annuali comprese, nel loro mese).
export function vociDelMese(el: ElencoSpese, perUscita?: (a: Spesa, b: Spesa) => number) {
  const delMese = el.spese.filter((s) => s.attiva && s.nel_mese);
  if (perUscita) delMese.sort(perUscita);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento' && !s.alimenta_obiettivo_id);
  // «Ricordami»: la spunta è solo un segno.
  const salvadanai = delMese.filter((s) => s.alimenta_obiettivo_id);
  return { fisse, investimenti, salvadanai, delConto: [...fisse, ...investimenti, ...salvadanai] };
}

// Le rate che cadono nel periodo, in ordine di data.
export const rateDelMese = (rate: Rata[], dal: string, al: string) =>
  rate.map((x) => ({ r: x, quando: x.scadenza ?? scadenzaRataNel(x, dal, al) })).filter((x) => x.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));

// Uscite annuali di ognuno dei prossimi 12 mesi personali, a partire da quello in corso (chiave «AAAA-MM» del mese personale).
export function calendarioAnnuali(spese: Spesa[], da = oggiIso(), inizio = 1) {
  const primo = meseDi(da, inizio), fine = spostaChiave(primo, 12);
  const mesi = Array.from({ length: 12 }, (_, i) => ({ mese: spostaChiave(primo, i), importo: 0 }));
  for (const s of spese.filter(eAnnuale)) {
    const q = proxSpesa(s, da, inizio);
    if (!q) continue;
    for (let m = meseDi(q, inizio); m < fine; m = spostaChiave(m, s.ogni_mesi!)) {
      const x = mesi.find((y) => y.mese === m);
      if (x) x.importo += Number(s.mia_quota);
    }
  }
  return mesi;
}

// Ordine dei salvadanai per prossima scadenza nel ciclo del mese personale (come le annuali): chiave = mese
// personale + giorno (senza giorno = inizio mese). Gli scaduti non raggiunti hanno un mese passato, quindi
// vengono per primi (urgenti); uno scaduto già raggiunto conta come mese in corso. Senza scadenza in fondo,
// poi per nome. Ordina anche i figli; un padre usa la scadenza più vicina tra sé e i suoi discendenti.
export function ordinaPerScadenza(xs: Obiettivo[], da = oggiIso(), inizio = 1): Obiettivo[] {
  const adesso = meseDi(da, inizio);
  const propria = (o: Obiettivo): string | null => {
    const dt = o.scadenza;
    if (!dt) return null;
    const mese = meseDiVoce(dt, false, inizio), giorno = dt.slice(8, 10);
    return mese < adesso && o.percentuale !== null && o.percentuale >= 100 ? `${adesso}-00` : `${mese}-${giorno}`;
  };
  const rami = xs.map((o) => ({ ...o, figli: ordinaPerScadenza(o.figli, da, inizio) }));
  const chiave = (o: Obiettivo): string | null => [propria(o), ...o.figli.map(chiave)].filter((k): k is string => !!k).sort()[0] ?? null;
  const k = new Map(rami.map((o) => [o.id, chiave(o)]));
  return rami.sort((a, b) => (k.get(a.id) ?? '9999').localeCompare(k.get(b.id) ?? '9999') || a.nome.localeCompare(b.nome, 'it'));
}

// Mesi personali da oggi alla scadenza, almeno 1: il mese della scadenza conta.
export const mesiFino = (scadenza: string, da = oggiIso(), inizio = 1) => mesiFinoScadenza(scadenza, da, inizio);
export const fraMesi = (scadenza: string, inizio = 1) => {
  const n = mesiFino(scadenza, oggiIso(), inizio) - 1;
  if (meseDi(scadenza, inizio) < meseDi(oggiIso(), inizio)) return 'scaduto';
  return n <= 0 ? 'questo mese' : n === 1 ? 'fra 1 mese' : `fra ${n} mesi`;
};

// Quanto mettere da parte per arrivare al traguardo in tempo: al mese (quanto manca
// diviso i mesi rimasti) o all'anno (diviso gli anni rimasti, almeno uno). Per un
// obiettivo con sotto-obiettivi è la somma di quanto serve a ciascuno; senza
// scadenza non c'è proposta.
export function proposta(o: Obiettivo, ogni: number, inizio = 1): number | null {
  if (o.figli.length) {
    const parti = o.figli.map((f) => proposta(f, ogni, inizio)).filter((x): x is number => x !== null);
    return parti.length ? parti.reduce((t, x) => t + x, 0) : null;
  }
  const { mancano } = ritmoObiettivo(o, inizio);
  if (mancano === null || !o.scadenza || meseDi(o.scadenza, inizio) < meseDi(oggiIso(), inizio)) return null;
  const mesi = mesiFino(o.scadenza, oggiIso(), inizio);
  return ogni === 1 ? mancano / mesi : mancano / Math.max(1, Math.ceil(mesi / ogni));
}

// Come si divide una cifra che entra in un salvadanaio con sotto-obiettivi: come fa l'API,
// in proporzione a quanto serve a ciascuno al mese, al massimo quanto gli manca; il resto
// resta nel salvadanaio.
const bisogno = (o: Obiettivo, inizio: number): number => { const { mancano, alMese } = ritmoObiettivo(o, inizio); return alMese ?? mancano ?? 0; };
export function divisioneTraSotto(o: Obiettivo, importo: number, inizio = 1) {
  const tot = o.figli.reduce((t, f) => t + bisogno(f, inizio), 0);
  const parti = o.figli.map((f) => ({ obiettivo: f, importo: tot > 0 ? Math.min(importo * bisogno(f, inizio) / tot, ritmoObiettivo(f, inizio).mancano ?? Infinity) : 0 }));
  return { parti, resto: Math.max(0, importo - parti.reduce((t, p) => t + p.importo, 0)) };
}

// Quanto manca al traguardo e quanto versare ogni mese per arrivarci in tempo.
export function ritmoObiettivo(o: Obiettivo, inizio = 1) {
  const traguardo = o.traguardo_effettivo === null ? null : Number(o.traguardo_effettivo);
  const mancano = traguardo === null ? null : Math.max(0, traguardo - Number(o.saldo));
  const alMese = mancano !== null && o.scadenza && meseDi(o.scadenza, inizio) >= meseDi(oggiIso(), inizio) ? mancano / mesiFino(o.scadenza, oggiIso(), inizio) : null;
  return { traguardo, mancano, alMese };
}
