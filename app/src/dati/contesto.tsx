import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { oggiIso } from '../formato.ts';
import { meseDi } from '../mesePersonale.ts';
import { useDati } from './api.ts';
import type { Categoria, Conto, Profilo } from './tipi.ts';

// Dati che servono a tutte le schermate: profilo, conti, categorie, mese scelto,
// e il mese scelto.

type Riferimenti = {
  profilo: Profilo | null; conti: Conto[]; categorie: Categoria[];
  categoria: (id: string | null | undefined) => Categoria | undefined;
  percorsoCategoria: (id: string | null | undefined) => string;
  iconaCategoria: (id: string | null | undefined) => string;
  conto: (id: string | null | undefined) => Conto | undefined;
  mese: string; meseOggi: string; setMese: (m: string) => void;
};

const Contesto = createContext<Riferimenti | null>(null);

// Mese dell'app in corso, secondo il giorno di inizio del profilo.
export const meseInCorso = (inizio: number): string => meseDi(oggiIso(), inizio);

export function FornitoreRiferimenti({ children }: { children: ReactNode }) {
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
      mese: meseScelto ?? meseInCorso(profilo?.inizio_mese ?? 1), meseOggi: meseInCorso(profilo?.inizio_mese ?? 1), setMese,
    };
  }, [profilo, conti, categorie, meseScelto]);
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
