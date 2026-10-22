import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { oggiIso } from '../formato.ts';
import { useDati } from './api.ts';
import type { Categoria, Conto, Profilo } from './tipi.ts';

// Dati che servono a tutte le schermate: profilo, conti, categorie, mese scelto,
// e le finestre che si aprono da ovunque (nuovo movimento).

type Riferimenti = {
  profilo: Profilo | null; conti: Conto[]; categorie: Categoria[];
  categoria: (id: string | null | undefined) => Categoria | undefined;
  percorsoCategoria: (id: string | null | undefined) => string;
  iconaCategoria: (id: string | null | undefined) => string;
  conto: (id: string | null | undefined) => Conto | undefined;
  mese: string; meseOggi: string; setMese: (m: string) => void;
  nuovoMovimento: () => void;
};

const Contesto = createContext<Riferimenti | null>(null);

// Mese dell'app in corso, secondo il giorno di inizio del profilo.
export function meseInCorso(inizio: number): string {
  const o = oggiIso();
  const m = o.slice(0, 7);
  if (Number(o.slice(8, 10)) >= inizio) return m;
  const [a, mm] = m.split('-').map(Number);
  return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, '0')}`;
}

export function FornitoreRiferimenti({ children, nuovoMovimento }: { children: ReactNode; nuovoMovimento: () => void }) {
  const profilo = useDati<Profilo>('/profilo').dati;
  const conti = useDati<Conto[]>('/conti').dati ?? [];
  const categorie = useDati<Categoria[]>('/categorie?formato=elenco').dati ?? [];
  const [meseScelto, setMese] = useState<string | null>(null);
  const valore = useMemo<Riferimenti>(() => {
    const perId = new Map(categorie.map((c) => [c.id, c]));
    const categoria = (id: string | null | undefined) => (id ? perId.get(id) : undefined);
    const iconaCategoria = (id: string | null | undefined): string => {
      for (let c = categoria(id); c; c = categoria(c.padre_id)) if (c.icona) return c.icona;
      return 'ellipsis';
    };
    const percorsoCategoria = (id: string | null | undefined) => {
      const c = categoria(id); if (!c) return '—';
      const p = categoria(c.padre_id); return p ? `${p.nome} › ${c.nome}` : c.nome;
    };
    return {
      profilo, conti, categorie, categoria, percorsoCategoria, iconaCategoria,
      conto: (id) => conti.find((c) => c.id === id),
      mese: meseScelto ?? meseInCorso(profilo?.inizio_mese ?? 1), meseOggi: meseInCorso(profilo?.inizio_mese ?? 1), setMese, nuovoMovimento,
    };
  }, [profilo, conti, categorie, meseScelto, nuovoMovimento]);
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
}

export function useRiferimenti(): Riferimenti {
  const r = useContext(Contesto);
  if (!r) throw new Error('useRiferimenti fuori dal fornitore');
  return r;
}

// Albero per le tendine: categorie con rientro, di un tipo.
export function opzioniCategorie(categorie: Categoria[], tipo?: 'uscita' | 'entrata') {
  const out: { valore: string; testo: string; icona?: string; rientro: number }[] = [];
  const visita = (padre: string | null, livello: number) => {
    for (const c of categorie.filter((x) => x.padre_id === padre && (!tipo || x.tipo === tipo)).sort((a, b) => a.ordine - b.ordine)) {
      out.push({ valore: c.id, testo: c.nome, icona: c.icona ?? undefined, rientro: livello });
      visita(c.id, livello + 1);
    }
  };
  visita(null, 0);
  return out;
}

export const ICONA_CONTO: Record<string, string> = { corrente: 'landmark', carta: 'credit-card', risparmio: 'piggy-bank', investimenti: 'trending-up', contanti: 'banknote', digitale: 'smartphone' };
export const NOME_TIPO_CONTO: Record<string, string> = { corrente: 'Conto corrente', carta: 'Carta', risparmio: 'Conto risparmio', investimenti: 'Investimenti', contanti: 'Contanti', digitale: 'Conto digitale' };
