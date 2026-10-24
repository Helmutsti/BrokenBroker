import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { Tono } from '../componenti/base.tsx';
import type { ElencoSpese, Obiettivo, Profilo, Rata, Spesa } from '../dati/tipi.ts';
import { dataSpesa, euro, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, useTema } from '../tema/tema.tsx';

// Pezzi condivisi tra le schermate.

export function Caricamento({ errore }: { errore?: string | null }) {
  const { c } = useTema();
  if (errore) return <Esito tono="errore" testo={errore} />;
  return <View style={{ padding: d['spazio-gruppo'], alignItems: 'center' }}><ActivityIndicator color={c['sfondo-accento']} /></View>;
}

export const aggiungiMesi = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  const t = a * 12 + (m - 1) + n, aa = Math.floor(t / 12), mm = t % 12;
  const ultimo = new Date(Date.UTC(aa, mm + 1, 0)).getUTCDate();
  return `${aa}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`;
};

// Il mese "AAAA-MM" dell'app: dal giorno di inizio al giorno prima dello stesso giorno del mese dopo.
export function periodoDi(mese: string, inizio: number): { dal: string; al: string } {
  const dal = `${mese}-${String(inizio).padStart(2, '0')}`;
  const fine = new Date(`${aggiungiMesi(dal, 1)}T00:00:00Z`);
  fine.setUTCDate(fine.getUTCDate() - 1);
  return { dal, al: fine.toISOString().slice(0, 10) };
}

// Prossima scadenza da oggi di una voce che parte da `prima` e si ripete ogni `ogni` mesi.
export function prossimaScadenza(prima: string | null, ogni: number | null, da = oggiIso()): string | null {
  if (!prima) return null;
  if (!ogni) return prima >= da ? prima : null;
  let k = 0;
  while (aggiungiMesi(prima, k * ogni) < da && k < 2000) k++;
  return aggiungiMesi(prima, k * ogni);
}

// Prossima uscita di una spesa: se il giorno non è scelto vale tutto il mese, quindi il mese in corso conta ancora.
export const proxSpesa = (s: Pick<Spesa, 'prossima_scadenza' | 'ogni_mesi' | 'senza_giorno'>, da = oggiIso()) =>
  prossimaScadenza(s.prossima_scadenza, s.ogni_mesi, s.senza_giorno ? `${da.slice(0, 7)}-01` : da);

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
export function quando(s: Spesa): string {
  if (s.tipo === 'budget') return 'Tutto il mese';
  if (s.ogni_mesi === null) return `Una volta · ${dataSpesa(s.prossima_scadenza, s.senza_giorno)}`;
  const giorno = s.prossima_scadenza ? Number(s.prossima_scadenza.slice(8, 10)) : null;
  if (s.ogni_mesi === 1) return giorno ? `Il ${giorno} · ogni mese` : 'Ogni mese';
  const prossima = proxSpesa(s);
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

// Le voci del mese divise per tipo. Il contenitore delle annuali non ha più un promemoria suo: se ne restano di vecchi, non si contano (la quota è già nelle annuali).
// Annuali non ordinate; "delConto" sono tutte le voci che escono dal conto (le annuali con la quota del mese).
export function vociDelMese(el: ElencoSpese, profilo: Profilo, perUscita?: (a: Spesa, b: Spesa) => number) {
  const delMese = el.spese.filter((s) => s.attiva && s.nel_mese && !eAnnuale(s) && !s.obiettivo_id
    && !(profilo.obiettivo_annuali && s.alimenta_obiettivo_id === profilo.obiettivo_annuali));
  if (perUscita) delMese.sort(perUscita);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const budget = delMese.filter((s) => s.tipo === 'budget');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento' && !s.alimenta_obiettivo_id);
  // "Mettici da parte": spuntate, i soldi vanno nel salvadanaio.
  const salvadanai = delMese.filter((s) => s.alimenta_obiettivo_id);
  const annuali = el.spese.filter(eAnnuale);
  return { fisse, budget, investimenti, salvadanai, annuali, delConto: [...fisse, ...budget, ...investimenti, ...salvadanai, ...annuali] };
}

// Le rate che cadono nel periodo, in ordine di data.
export const rateDelMese = (rate: Rata[], dal: string, al: string) =>
  rate.map((x) => ({ r: x, quando: x.scadenza ?? scadenzaRataNel(x, dal, al) })).filter((x) => x.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));

export type ScadenzaAnnuale = { s: Spesa; quando: string; copertura: { testo: string; tono: Tono } };

// Prossime uscite annuali in ordine di data. Quelle pagate da un obiettivo sono
// "coperte" finché il saldo dell'obiettivo basta, contando le uscite precedenti;
// oltre `entroMesi` mesi si stanno ancora preparando.
export function prossimeAnnuali(spese: Spesa[], obiettivi: Obiettivo[], entroMesi = 3, da = oggiIso()) {
  const saldi = new Map(tuttiGliObiettivi(obiettivi).map((o) => [o.id, Number(o.saldo)]));
  const limite = aggiungiMesi(da, entroMesi);
  const voci = spese.filter(eAnnuale).map((s) => ({ s, quando: proxSpesa(s, da) }))
    .filter((x): x is { s: Spesa; quando: string } => !!x.quando).sort((a, b) => a.quando.localeCompare(b.quando));
  const usato = new Map<string, number>();
  let serve = 0, mancano = 0;
  const elenco: ScadenzaAnnuale[] = voci.map(({ s, quando }) => {
    const importo = Number(s.mia_quota);
    if (quando > limite) return { s, quando, copertura: { testo: 'Si prepara', tono: 'neutro' } };
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

// Uscite annuali di ognuno dei prossimi 12 mesi di calendario, a partire da questo.
export function calendarioAnnuali(spese: Spesa[], da = oggiIso()) {
  const inizio = `${da.slice(0, 7)}-01`;
  const mesi = Array.from({ length: 12 }, (_, i) => ({ mese: aggiungiMesi(inizio, i).slice(0, 7), importo: 0 }));
  const fine = aggiungiMesi(inizio, 12);
  for (const s of spese.filter(eAnnuale)) {
    let q = proxSpesa(s, inizio);
    while (q && q < fine) {
      const m = mesi.find((x) => x.mese === q!.slice(0, 7));
      if (m) m.importo += Number(s.mia_quota);
      q = aggiungiMesi(q, s.ogni_mesi!);
    }
  }
  return mesi;
}

// Mesi interi da oggi alla scadenza, almeno 1: il mese della scadenza conta.
export function mesiFino(scadenza: string, da = oggiIso()): number {
  const [a1, m1] = da.split('-').map(Number), [a2, m2] = scadenza.split('-').map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1) + 1);
}
export const fraMesi = (scadenza: string) => {
  if (scadenza < oggiIso()) return 'scaduto';
  const n = mesiFino(scadenza) - 1;
  return n <= 0 ? 'questo mese' : n === 1 ? 'fra 1 mese' : `fra ${n} mesi`;
};

// Quanto mettere da parte per arrivare al traguardo in tempo: al mese (quanto manca
// diviso i mesi rimasti) o all'anno (diviso gli anni rimasti, almeno uno). Per un
// obiettivo con sotto-obiettivi è la somma di quanto serve a ciascuno; senza
// scadenza non c'è proposta.
export function proposta(o: Obiettivo, ogni: number): number | null {
  if (o.figli.length) {
    const parti = o.figli.map((f) => proposta(f, ogni)).filter((x): x is number => x !== null);
    return parti.length ? parti.reduce((t, x) => t + x, 0) : null;
  }
  const { mancano } = ritmoObiettivo(o);
  if (mancano === null || !o.scadenza || o.scadenza < oggiIso()) return null;
  const mesi = mesiFino(o.scadenza);
  return ogni === 1 ? mancano / mesi : mancano / Math.max(1, Math.ceil(mesi / ogni));
}

// Come si divide una cifra che entra in un salvadanaio con sotto-obiettivi: come fa l'API,
// in proporzione a quanto serve a ciascuno al mese, al massimo quanto gli manca; il resto
// resta nel salvadanaio.
const bisogno = (o: Obiettivo): number => { const { mancano, alMese } = ritmoObiettivo(o); return alMese ?? mancano ?? 0; };
export function divisioneTraSotto(o: Obiettivo, importo: number) {
  const tot = o.figli.reduce((t, f) => t + bisogno(f), 0);
  const parti = o.figli.map((f) => ({ obiettivo: f, importo: tot > 0 ? Math.min(importo * bisogno(f) / tot, ritmoObiettivo(f).mancano ?? Infinity) : 0 }));
  return { parti, resto: Math.max(0, importo - parti.reduce((t, p) => t + p.importo, 0)) };
}

// Quanto manca al traguardo e quanto versare ogni mese per arrivarci in tempo.
export function ritmoObiettivo(o: Obiettivo) {
  const traguardo = o.traguardo_effettivo === null ? null : Number(o.traguardo_effettivo);
  const mancano = traguardo === null ? null : Math.max(0, traguardo - Number(o.saldo));
  const alMese = mancano !== null && o.scadenza && o.scadenza >= oggiIso() ? mancano / mesiFino(o.scadenza) : null;
  return { traguardo, mancano, alMese };
}
