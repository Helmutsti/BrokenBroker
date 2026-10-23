import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { Tono } from '../componenti/base.tsx';
import type { Obiettivo, Rata, Spesa } from '../dati/tipi.ts';
import { data, euro, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
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

// "Il 5 · ogni mese", "Novembre · ogni 6 mesi", "Una volta · 20 novembre 2026", "Tutto il mese".
export function quando(s: Spesa): string {
  if (s.tipo === 'budget') return 'Tutto il mese';
  if (s.ogni_mesi === null) return `Una volta · ${data(s.prossima_scadenza)}`;
  const giorno = s.prossima_scadenza ? Number(s.prossima_scadenza.slice(8, 10)) : null;
  if (s.ogni_mesi === 1) return giorno ? `Il ${giorno} · ogni mese` : 'Ogni mese';
  const prossima = prossimaScadenza(s.prossima_scadenza, s.ogni_mesi);
  const mese = prossima ? nomeMeseMinuscolo(prossima.slice(0, 7)) : '';
  const nome = mese.charAt(0).toUpperCase() + mese.slice(1);
  return `${nome} · ${s.ogni_mesi === 12 ? 'ogni anno' : s.ogni_mesi === 24 ? 'ogni 2 anni' : `ogni ${s.ogni_mesi} mesi`}`;
}

// Quota scritta accanto all'importo: "58,90 € · ½" quando la spesa è divisa a metà.
export const segnoQuota = (s: Spesa) => (s.mia_percentuale === 50 ? ' · ½' : s.mia_percentuale > 0 && s.mia_percentuale < 100 ? ` · ${s.mia_percentuale}%` : '');

// ---- Annuali e obiettivi (proposta v2) ----

export const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);

// Spese annuali o periodiche: escono ogni N mesi (N > 1), budget esclusi.
export const eAnnuale = (s: Spesa) => s.attiva && s.tipo !== 'budget' && s.ogni_mesi !== null && s.ogni_mesi > 1;

export type ScadenzaAnnuale = { s: Spesa; quando: string; copertura: { testo: string; tono: Tono } };

// Prossime uscite annuali in ordine di data. Quelle pagate da un obiettivo sono
// "coperte" finché il saldo dell'obiettivo basta, contando le uscite precedenti;
// oltre `entroMesi` mesi si stanno ancora preparando.
export function prossimeAnnuali(spese: Spesa[], obiettivi: Obiettivo[], entroMesi = 3, da = oggiIso()) {
  const saldi = new Map(tuttiGliObiettivi(obiettivi).map((o) => [o.id, Number(o.saldo)]));
  const limite = aggiungiMesi(da, entroMesi);
  const voci = spese.filter(eAnnuale).map((s) => ({ s, quando: prossimaScadenza(s.prossima_scadenza, s.ogni_mesi, da) }))
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
    let q = prossimaScadenza(s.prossima_scadenza, s.ogni_mesi, inizio);
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

// Quanto manca al traguardo e quanto versare ogni mese per arrivarci in tempo.
export function ritmoObiettivo(o: Obiettivo) {
  const traguardo = o.traguardo_effettivo === null ? null : Number(o.traguardo_effettivo);
  const mancano = traguardo === null ? null : Math.max(0, traguardo - Number(o.saldo));
  const alMese = mancano !== null && o.scadenza && o.scadenza >= oggiIso() ? mancano / mesiFino(o.scadenza) : null;
  return { traguardo, mancano, alMese };
}
