import { ActivityIndicator, View } from 'react-native';
import { Esito } from '../componenti/base.tsx';
import type { Rata, Spesa } from '../dati/tipi.ts';
import { data, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, useTema } from '../tema/tema.tsx';

// Pezzi condivisi tra le schermate.

export function Caricamento({ errore }: { errore?: string | null }) {
  const { c } = useTema();
  if (errore) return <Esito tono="errore" testo={errore} />;
  return <View style={{ padding: d['spazio-gruppo'], alignItems: 'center' }}><ActivityIndicator color={c['sfondo-accento']} /></View>;
}

const aggiungiMesi = (iso: string, n: number) => {
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
