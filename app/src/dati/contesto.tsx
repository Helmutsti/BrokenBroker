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

// L'albero dei conti (decisione 61) in ordine: ogni conto seguito dai suoi sotto-conti, con il livello. Un conto il cui contenitore
// non c'è nell'elenco (archiviato o non visibile) sta in cima.
export function alberoConti(conti: Conto[]): { conto: Conto; livello: number }[] {
  const ids = new Set(conti.map((c) => c.id));
  const out: { conto: Conto; livello: number }[] = [];
  const visita = (padre: string | null, livello: number) => {
    for (const c of conti.filter((x) => (padre === null ? !x.padre_id || !ids.has(x.padre_id) : x.padre_id === padre)).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))) {
      out.push({ conto: c, livello });
      visita(c.id, livello + 1);
    }
  };
  visita(null, 0);
  return out;
}

// Opzioni per le tendine dei conti, con rientro per i sotto-conti. Gli archiviati solo se sono in `tenere` (già scelti); `escludi` li toglie.
export function opzioniConti(conti: Conto[], { tenere = [], escludi = [] }: { tenere?: (string | null | undefined)[]; escludi?: (string | null | undefined)[] } = {}) {
  return alberoConti(conti.filter((c) => (!c.archiviato || tenere.includes(c.id)) && !escludi.includes(c.id)))
    .map(({ conto, livello }) => ({ valore: conto.id, testo: conto.nome, icona: conto.icona, rientro: livello }));
}

// Un conto è condiviso se lo è lui o un conto che lo contiene, o se è di un'altra persona: la spunta muove allora l'importo intero (decisione 61).
export function contoCondiviso(conti: Conto[], id: string | null | undefined): boolean {
  const visti = new Set<string>();
  for (let c = conti.find((x) => x.id === id); c && !visti.has(c.id); c = conti.find((x) => x.id === c!.padre_id)) {
    if (c.condiviso || !c.mio) return true;
    visti.add(c.id);
  }
  return false;
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
