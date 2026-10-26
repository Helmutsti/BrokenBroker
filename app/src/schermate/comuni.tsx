import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { Tono } from '../componenti/base.tsx';
import type { ElencoSpese, Obiettivo, Profilo, Rata, Spesa } from '../dati/tipi.ts';
import { dataSpesa, euro, oggiIso } from '../formato.ts';
import { aggiungiMesi, mesiFinoScadenza, meseDi, mesiTraChiavi, periodoDi, proxOccorrenza, spostaChiave } from '../mesePersonale.ts';
import { d, useTema } from '../tema/tema.tsx';

// Pezzi condivisi tra le schermate.

export function Caricamento({ errore }: { errore?: string | null }) {
  const { c } = useTema();
  if (errore) return <Esito tono="errore" testo={errore} />;
  return <View style={{ padding: d['spazio-gruppo'], alignItems: 'center' }}><ActivityIndicator color={c['sfondo-accento']} /></View>;
}

// Il mese è sempre il mese personale (decisione 41): vedi ../mesePersonale.ts.
export { aggiungiMesi, periodoDi };

// Prossima uscita di una spesa, per mesi personali: il mese personale in corso conta ancora anche se il giorno è
// già passato (senza giorno: l'inizio del mese personale, vale tutto il mese).
export const proxSpesa = (s: Pick<Spesa, 'prossima_scadenza' | 'ogni_mesi' | 'senza_giorno'>, da = oggiIso(), inizio = 1) =>
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
  if (s.tipo === 'budget') return 'Tutto il mese';
  if (s.ogni_mesi === null) return `Una volta · ${dataSpesa(s.prossima_scadenza, s.senza_giorno)}`;
  const giorno = s.prossima_scadenza ? Number(s.prossima_scadenza.slice(8, 10)) : null;
  if (s.ogni_mesi === 1) return giorno ? `Il ${giorno} · ogni mese` : 'Ogni mese';
  const prossima = proxSpesa(s, oggiIso(), inizio);
  const mese = prossima ? dataSpesa(prossima, s.senza_giorno) : '';
  const nome = mese.charAt(0).toUpperCase() + mese.slice(1);
  return `${nome} · ${s.ogni_mesi === 12 ? 'ogni anno' : s.ogni_mesi === 24 ? 'ogni 2 anni' : `ogni ${s.ogni_mesi} mesi`}`;
}

// Quota scritta accanto all'importo: "58,90 € · ½" quando la spesa è divisa a metà.
export const segnoQuota = (s: Spesa) => (s.mia_percentuale === 50 ? ' · ½' : s.mia_percentuale > 0 && s.mia_percentuale < 100 ? ` · ${s.mia_percentuale}%` : '');

// ---- Annuali e obiettivi (proposta v2) ----

export const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);

// Spese annuali o periodiche: escono ogni N mesi (N > 1), budget esclusi; non le
// spese "mettici da parte", che riempiono un salvadanaio invece di uscire.
export const eAnnuale = (s: Spesa) => s.attiva && s.tipo !== 'budget' && !s.alimenta_obiettivo_id && s.ogni_mesi !== null && s.ogni_mesi > 1;

// Cifra del mese: la quota mensile per le annuali, la mia quota per le altre voci.
export const importoDelMese = (s: Spesa) => Number(eAnnuale(s) ? s.quota_mensile : s.mia_quota);

// Le voci del mese divise per tipo.
// Annuali non ordinate; "delConto" sono tutte le voci che escono dal conto (le annuali con la quota del mese).
export function vociDelMese(el: ElencoSpese, perUscita?: (a: Spesa, b: Spesa) => number) {
  const delMese = el.spese.filter((s) => s.attiva && s.nel_mese && !eAnnuale(s) && !s.obiettivo_id);
  if (perUscita) delMese.sort(perUscita);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const budget = delMese.filter((s) => s.tipo === 'budget');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento' && !s.alimenta_obiettivo_id);
  // "Mettici da parte": spuntate, i soldi vanno nel salvadanaio.
  const salvadanai = delMese.filter((s) => s.alimenta_obiettivo_id);
  const annuali = el.spese.filter(eAnnuale);
  return { fisse, budget, investimenti, salvadanai, annuali, delConto: [...fisse, ...budget, ...investimenti, ...salvadanai, ...annuali] };
}

// Quanto dovrebbe esserci oggi in un salvadanaio che paga una spesa periodica (ogni_mesi > 1):
// la spesa si riempie di 1/ogni_mesi al mese dalla scadenza precedente alla prossima.
// Per un salvadanaio che ne contiene (a qualunque livello) è la somma dei sotto-salvadanai
// che pagano una spesa. Senza spese periodiche dentro: null.
export function riempimento(o: Obiettivo, spese: Spesa[], oggi = oggiIso(), inizio = 1): { dovrebbe: number; ce: number; indietro: number } | null {
  const proprio = o.paga_spesa ? spese.find((s) => s.id === o.paga_spesa!.id) : null;
  if (proprio) {
    const quando = proxSpesa(proprio, oggi, inizio);
    if (!quando || proprio.ogni_mesi === null || proprio.ogni_mesi <= 1) return null;
    const ogni = proprio.ogni_mesi;
    // Per mesi personali interi: dal mese della scadenza precedente a quello in corso (nel mese di scadenza è tutto).
    const passati = Math.max(0, Math.min(ogni, mesiTraChiavi(spostaChiave(meseDi(quando, inizio), -ogni), meseDi(oggi, inizio))));
    const dovrebbe = Math.round(Number(proprio.mia_quota) * passati / ogni * 100) / 100, ce = Number(o.saldo);
    return { dovrebbe, ce, indietro: Math.max(0, dovrebbe - ce) };
  }
  const parti = o.figli.map((f) => riempimento(f, spese, oggi, inizio)).filter((x): x is NonNullable<typeof x> => x !== null);
  if (!parti.length) return null;
  const dovrebbe = parti.reduce((t, x) => t + x.dovrebbe, 0), ce = parti.reduce((t, x) => t + x.ce, 0);
  return { dovrebbe, ce, indietro: parti.reduce((t, x) => t + x.indietro, 0) };
}

// Le rate che cadono nel periodo, in ordine di data.
export const rateDelMese = (rate: Rata[], dal: string, al: string) =>
  rate.map((x) => ({ r: x, quando: x.scadenza ?? scadenzaRataNel(x, dal, al) })).filter((x) => x.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));

export type ScadenzaAnnuale = { s: Spesa; quando: string; copertura: { testo: string; tono: Tono } };

// Prossime uscite annuali in ordine di data. Quelle pagate da un salvadanaio sono
// "coperte" finché il saldo del salvadanaio basta, contando le uscite precedenti;
// oltre `entroMesi` mesi si stanno ancora preparando.
export function prossimeAnnuali(spese: Spesa[], obiettivi: Obiettivo[], entroMesi = 3, da = oggiIso(), inizio = 1) {
  const saldi = new Map(tuttiGliObiettivi(obiettivi).map((o) => [o.id, Number(o.saldo)]));
  // Il limite è un mese personale: «fino a gennaio» vuol dire fino alla fine del mese personale di gennaio.
  const meseLimite = spostaChiave(meseDi(da, inizio), entroMesi), limite = `${meseLimite}-01`;
  const voci = spese.filter(eAnnuale).map((s) => ({ s, quando: proxSpesa(s, da, inizio) }))
    .filter((x): x is { s: Spesa; quando: string } => !!x.quando).sort((a, b) => a.quando.localeCompare(b.quando));
  const usato = new Map<string, number>();
  let serve = 0, mancano = 0;
  const elenco: ScadenzaAnnuale[] = voci.map(({ s, quando }) => {
    const importo = Number(s.mia_quota);
    if (meseDi(quando, inizio) > meseLimite) return { s, quando, copertura: { testo: 'Si prepara', tono: 'neutro' } };
    if (!s.obiettivo_id || !saldi.has(s.obiettivo_id)) return { s, quando, copertura: { testo: 'Dal mese', tono: 'neutro' } };
    const prima = usato.get(s.obiettivo_id) ?? 0, saldo = saldi.get(s.obiettivo_id)!;
    usato.set(s.obiettivo_id, prima + importo); serve += importo;
    if (prima + importo <= saldo + 0.005) return { s, quando, copertura: { testo: 'Coperta', tono: 'ok' } };
    const manca = Math.min(importo, prima + importo - saldo); mancano += manca;
    return { s, quando, copertura: { testo: `Mancano ${euro(manca)}`, tono: 'attenzione' } };
  });
  const idSalvadanai = [...new Set(spese.filter(eAnnuale).map((s) => s.obiettivo_id).filter((x): x is string => !!x && saldi.has(x)))];
  const nelSalvadanaio = idSalvadanai.reduce((t, id) => t + saldi.get(id)!, 0);
  return { elenco, nelSalvadanaio, serve, mancano, conSalvadanaio: idSalvadanai.length > 0, limite };
}

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
