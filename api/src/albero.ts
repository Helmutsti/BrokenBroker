import type { PoolClient } from 'pg';
import { inizioMese, mesiFino, oggi } from './periodo.ts';
import { saldiDeiConti } from './saldi.ts';

// L'albero dei salvadanai (decisione 61, terza tappa): un salvadanaio è un SOTTO-CONTO, cioè un conto dentro un altro conto (il fondo di
// emergenza e le ceste dentro il deposito). In cima ci sono i sotto-conti dei conti principali; `conto_id` / `conto` è il conto che li
// contiene. Il saldo è quello del conto (saldi.ts); `versato` è la parte propria, senza i sotto-salvadanai. Usato dalle rotte dei
// salvadanai e dalla quota mensile del promemoria nelle spese.

export type Nodo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null; durata_mesi: number | null;
  crea_spesa: boolean; spesa_creata_id: string | null; icona: string | null; nascosto: boolean; mio: boolean; condiviso: boolean; versato: string;
  saldo?: string; traguardo_effettivo?: string | null; percentuale?: number | null;
  traguardi?: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  // Il promemoria «Mostra nelle spese» del salvadanaio: `importo` è la quota di questo mese (con una scadenza e un traguardo è
  // (traguardo - già messo) / mesi personali rimasti, minimo 0; altrimenti la cifra fissa, `importo_fisso`). `conto_id` è da dove partono i soldi.
  alimentato_da?: { id: string; importo: string; importo_fisso: string; automatica: boolean; ogni_mesi: number | null; conto_id: string | null } | null;
  // Il conto che contiene il salvadanaio (in cima all'albero). Per i sotto-salvadanai è quello del superiore (`conto_ereditato`).
  conto_proprio_id: string | null; conto_id: string | null; conto: string | null; conto_icona: string | null; conto_ereditato: boolean;
  figli: Nodo[];
};

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

type Riga = {
  id: string; padre_id: string | null; nome: string; icona: string | null; traguardo: string | null; scadenza: string | null; durata_mesi: number | null;
  crea_spesa: boolean; spesa_creata_id: string | null; nascosto: boolean; mio: boolean; condiviso: boolean;
};

// Il saldo di un salvadanaio è quello del suo conto (sotto-salvadanai compresi); il traguardo, se manca, è la somma dei traguardi dei
// sotto-salvadanai. Ogni traguardo di copertura si confronta con tutto il saldo, al massimo 100%.
export async function alberoObiettivi(db: PoolClient): Promise<Nodo[]> {
  const conti = (await db.query<Riga>(
    `select c.id, c.padre_id, c.nome, c.icona, c.traguardo::text as traguardo, c.scadenza, c.durata_mesi, c.crea_spesa, c.spesa_creata_id, c.nascosto,
            c.proprietario_id = fp_me() as mio, exists (select 1 from condivisioni s where s.conto_id = c.id) as condiviso
       from conti c where not c.archiviato order by c.nome`)).rows;
  const saldi = await saldiDeiConti(db);
  const traguardi = (await db.query(
    `select id, conto_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;
  const promemoria = (await db.query<{ id: string; alimenta_obiettivo_id: string; importo: string; ogni_mesi: number | null; conto_id: string | null }>(
    `select id, alimenta_obiettivo_id, importo::text as importo, ogni_mesi, conto_id from spese_previste
      where attiva and alimenta_obiettivo_id is not null`)).rows;
  const perId = new Map(conti.map((c) => [c.id, c]));
  const nodi = new Map<string, Nodo>();
  for (const c of conti) {
    if (!c.padre_id || !perId.has(c.padre_id)) continue; // i conti in cima non sono salvadanai
    const alim = promemoria.find((s) => s.alimenta_obiettivo_id === c.id);
    nodi.set(c.id, { ...c, versato: '0', conto_proprio_id: null, conto_id: null, conto: null, conto_icona: null, conto_ereditato: false, figli: [],
      alimentato_da: alim ? { id: alim.id, importo: alim.importo, importo_fisso: alim.importo, automatica: false, ogni_mesi: alim.ogni_mesi, conto_id: alim.conto_id } : null });
  }
  const radici: Nodo[] = [];
  for (const n of nodi.values()) {
    const padre = nodi.get(n.padre_id!);
    if (padre) padre.figli.push(n);
    else {
      // In cima: il padre è un conto principale, che è il «conto del salvadanaio».
      const conto = perId.get(n.padre_id!)!;
      Object.assign(n, { conto_proprio_id: conto.id, conto_id: conto.id, conto: conto.nome, conto_icona: conto.icona, padre_id: null });
      radici.push(n);
    }
  }
  const eredita = (n: Nodo): void => n.figli.forEach((f) => {
    Object.assign(f, { conto_id: n.conto_id, conto: n.conto, conto_icona: n.conto_icona, conto_ereditato: true });
    eredita(f);
  });
  radici.forEach(eredita);
  const calcola = (n: Nodo): void => {
    n.figli.forEach(calcola);
    const saldo = saldi.get(n.id)?.saldo ?? 0;
    const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo_effettivo ?? 0), 0);
    const traguardo = n.traguardo !== null ? Number(n.traguardo) : daFigli > 0 ? daFigli : null;
    n.saldo = cent(saldo);
    n.versato = cent(saldo - n.figli.reduce((t, f) => t + Number(f.saldo), 0));
    n.traguardo_effettivo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(saldo, traguardo) : null;
    n.traguardi = traguardi.filter((t) => t.conto_id === n.id).map(({ conto_id: _, ...t }) => ({
      ...t, percentuale: percento(Math.max(0, saldo), Number(t.importo)),
    }));
  };
  radici.forEach(calcola);
  const inizio = await inizioMese(db), adesso = oggi();
  const quote = (n: Nodo): void => {
    if (n.alimentato_da) {
      const q = quotaPromemoria(n, Number(n.alimentato_da.importo_fisso), adesso, inizio);
      n.alimentato_da.importo = cent(q.importo); n.alimentato_da.automatica = q.automatica;
    }
    n.figli.forEach(quote);
  };
  radici.forEach(quote);
  return radici;
}

// La quota del mese del promemoria di un salvadanaio:
//  - con una scadenza e un traguardo è quanto manca al traguardo diviso i mesi personali rimasti fino alla scadenza (il mese di `da` conta,
//    minimo 1; quanto manca, minimo 0);
//  - con una durata che si ripete e un traguardo è il traguardo diviso i mesi della durata, sempre uguale (decisione 63);
//  - senza scadenza né durata proprie ma con dei sotto-salvadanai che ne hanno (le ceste delle annuali, decisione 62) è la SOMMA delle loro
//    quote: per quelli con scadenza quanto serve ogni mese per arrivare pieni in tempo (i soldi liberi del salvadanaio contano come già
//    messi, prima in quelli che scadono prima), per quelli con durata il traguardo diviso la durata;
//  - altrimenti è la cifra fissa.
const conTraguardo = (x: Nodo) => x.traguardo_effettivo !== null && x.traguardo_effettivo !== undefined;
export const haTempo = (x: Nodo) => (!!x.scadenza || !!x.durata_mesi) && conTraguardo(x);
export function quotaPromemoria(n: Nodo, fissa: number, da: string, inizio: number): { importo: number; automatica: boolean } {
  if (n.scadenza && conTraguardo(n)) {
    const manca = Math.max(0, Number(n.traguardo_effettivo) - Number(n.saldo));
    return { importo: Math.round((manca / mesiFino(n.scadenza, da, inizio)) * 100) / 100, automatica: true };
  }
  if (n.durata_mesi && conTraguardo(n)) return { importo: Math.round((Number(n.traguardo_effettivo) / n.durata_mesi) * 100) / 100, automatica: true };
  const ceste: { manca: number; scadenza: string }[] = [];
  let ripetute = 0;
  const raccogli = (x: Nodo): void => x.figli.forEach((f) => {
    if (f.scadenza && conTraguardo(f)) ceste.push({ manca: Math.max(0, Number(f.traguardo_effettivo) - Number(f.saldo)), scadenza: f.scadenza });
    else if (f.durata_mesi && conTraguardo(f)) ripetute += Number(f.traguardo_effettivo) / f.durata_mesi;
    else raccogli(f);
  });
  raccogli(n);
  if (!ceste.length && !ripetute) return { importo: fissa, automatica: false };
  let liberi = Math.max(0, Number(n.versato));
  let totale = ripetute;
  for (const k of ceste.sort((a, b) => a.scadenza.localeCompare(b.scadenza))) {
    const coperto = Math.min(liberi, k.manca);
    liberi -= coperto;
    totale += (k.manca - coperto) / mesiFino(k.scadenza, da, inizio);
  }
  return { importo: Math.round(totale * 100) / 100, automatica: true };
}

export function trova(radici: Nodo[], id: string): Nodo | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}
