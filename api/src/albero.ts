import type { PoolClient } from 'pg';
import { inizioMese, mesiFino, oggi } from './periodo.ts';

// L'albero dei salvadanai (obiettivi annidabili, decisione 20) con i saldi: usato dalle rotte dei salvadanai e dal calcolo della quota
// mensile del promemoria nelle spese (decisione 51).

export type Nodo = {
  id: string; padre_id: string | null; nome: string; traguardo: string | null; scadenza: string | null;
  crea_spesa: boolean; spesa_creata_id: string | null; icona: string | null; nascosto: boolean; mio: boolean; condiviso: boolean; versato: string;
  saldo?: string; traguardo_effettivo?: string | null; percentuale?: number | null;
  traguardi?: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  // Il promemoria «Mostra nelle spese» del salvadanaio (decisione 51): `importo` è la quota di questo mese (con una scadenza e un traguardo
  // è (traguardo - già messo) / mesi personali rimasti, minimo 0; altrimenti la cifra fissa scritta da chi l'ha creato, `importo_fisso`).
  alimentato_da?: { id: string; importo: string; importo_fisso: string; automatica: boolean; ogni_mesi: number | null; conto_id: string | null } | null;
  // Il conto del salvadanaio (decisione 45): conto_proprio_id è quello scelto, conto_id quello che vale
  // (se manca eredita dal padre); conto_ereditato dice che viene dal padre. Chi non vede il conto lo vede vuoto.
  conto_proprio_id: string | null; conto_id: string | null; conto: string | null; conto_icona: string | null; conto_ereditato: boolean;
  figli: Nodo[];
};

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

// Albero degli obiettivi visibili. Il saldo di un obiettivo è la somma dei suoi
// versamenti e di quelli dei sotto-obiettivi; il traguardo, se manca, è la somma
// dei traguardi dei sotto-obiettivi. Ogni traguardo di copertura si confronta
// con tutto il saldo dell'obiettivo, al massimo 100%.
export async function alberoObiettivi(db: PoolClient): Promise<Nodo[]> {
  const nodi = (await db.query<Nodo>(
    `select o.id, o.padre_id, o.nome, o.traguardo::text as traguardo, o.scadenza, o.crea_spesa, o.spesa_creata_id, o.icona, o.nascosto,
            o.proprietario_id = fp_me() as mio,
            exists (select 1 from condivisioni s where s.obiettivo_id = o.id) as condiviso,
            c.id as conto_proprio_id, c.nome as conto, c.icona as conto_icona,
            coalesce((select sum(x.importo) from versamenti x where x.obiettivo_id = o.id), 0)::text as versato
       from obiettivi o left join conti c on c.id = o.conto_id order by o.nome`)).rows;
  const traguardi = (await db.query(
    `select id, obiettivo_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;
  const promemoria = (await db.query<{ id: string; alimenta_obiettivo_id: string; importo: string; ogni_mesi: number | null; conto_id: string | null }>(
    `select id, alimenta_obiettivo_id, importo::text as importo, ogni_mesi, conto_id from spese_previste
      where attiva and alimenta_obiettivo_id is not null`)).rows;
  const perId = new Map(nodi.map((n) => {
    const alim = promemoria.find((s) => s.alimenta_obiettivo_id === n.id);
    const nodo: Nodo = { ...n, conto_id: n.conto_proprio_id, conto_ereditato: false, figli: [],
      alimentato_da: alim ? { id: alim.id, importo: alim.importo, importo_fisso: alim.importo, automatica: false, ogni_mesi: alim.ogni_mesi, conto_id: alim.conto_id } : null };
    return [n.id, nodo];
  }));
  const radici: Nodo[] = [];
  for (const n of perId.values()) {
    const padre = n.padre_id ? perId.get(n.padre_id) : undefined;
    (padre ? padre.figli : radici).push(n);
  }
  // Il conto che vale: il proprio, altrimenti quello del padre (e così via verso l'alto).
  const risolviConto = (n: Nodo, padre?: Nodo): void => {
    if (!n.conto_proprio_id && padre?.conto_id) {
      n.conto_id = padre.conto_id; n.conto = padre.conto; n.conto_icona = padre.conto_icona; n.conto_ereditato = true;
    }
    n.figli.forEach((f) => risolviConto(f, n));
  };
  radici.forEach((n) => risolviConto(n));
  const calcola = (n: Nodo): void => {
    n.figli.forEach(calcola);
    const saldo = Number(n.versato) + n.figli.reduce((t, f) => t + Number(f.saldo), 0);
    const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo_effettivo ?? 0), 0);
    const traguardo = n.traguardo !== null ? Number(n.traguardo) : daFigli > 0 ? daFigli : null;
    n.saldo = cent(saldo);
    n.traguardo_effettivo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(saldo, traguardo) : null;
    n.traguardi = traguardi.filter((t) => t.obiettivo_id === n.id).map(({ obiettivo_id: _, ...t }) => ({
      ...t, percentuale: percento(Math.max(0, saldo), Number(t.importo)),
    }));
  };
  radici.forEach(calcola);
  // La quota del mese del promemoria, con la scadenza e il traguardo che ci sono ora.
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

// La quota del mese del promemoria di un salvadanaio (decisione 51): con una scadenza e un traguardo è quanto manca al traguardo diviso i mesi
// personali rimasti fino alla scadenza (il mese di `da` conta, minimo 1; quanto manca, minimo 0); senza scadenza (o senza traguardo)
// è la cifra fissa scritta da chi ha acceso il promemoria.
export function quotaPromemoria(n: Nodo, fissa: number, da: string, inizio: number): { importo: number; automatica: boolean } {
  if (!n.scadenza || n.traguardo_effettivo === null || n.traguardo_effettivo === undefined) return { importo: fissa, automatica: false };
  const manca = Math.max(0, Number(n.traguardo_effettivo) - Number(n.saldo));
  return { importo: Math.round((manca / mesiFino(n.scadenza, da, inizio)) * 100) / 100, automatica: true };
}

export function trova(radici: Nodo[], id: string): Nodo | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}
