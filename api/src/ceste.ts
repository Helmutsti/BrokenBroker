import type { PoolClient } from 'pg';
import { inizioMese, mesiFino, oggi } from './periodo.ts';

// I salvadanai (decisione 72; la tabella si chiama `ceste`): liberi, cioè non stanno in nessun conto, e annidabili (il padre ne fa la somma).
// Non abbassano il saldo né l'avanzo: quanto c'è dentro lo dicono solo gli spostamenti (spostamenti_ceste), con il lato vuoto (null) che
// vuol dire «fuori da ogni salvadanaio». `versato` è la parte propria, `dentro` comprende i sotto-salvadanai.
// Sono obiettivi (decisione 73): non c'entrano con le spese. La cesta delle spese non mensili è solo un numero sulla spesa (`spese_previste.raccolto`).

export type Salvadanaio = {
  id: string; padre_id: string | null; nome: string; icona: string;
  versato: string; dentro: string;
  // Il traguardo che vale (scritto, o la somma di quelli dei sotto-salvadanai) e quello scritto a mano.
  traguardo: string | null; traguardo_scritto: string | null; scadenza: string | null; percentuale: number | null;
  // Quanto manca al traguardo; con traguardo e data: i mesi (almeno 1) fino alla data e quanto mettere al mese.
  mancano: string | null; mesi: number | null; metti_al_mese: string | null;
  traguardi: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  figli: Salvadanaio[];
};

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

type Riga = { id: string; padre_id: string | null; nome: string; icona: string; traguardo: string | null; scadenza: string | null };

// L'albero di tutti i salvadanai di chi chiede, in cima quelli senza salvadanaio superiore.
export async function alberoSalvadanai(db: PoolClient): Promise<Salvadanaio[]> {
  const righe = (await db.query<Riga>(
    `select id, padre_id, nome, icona, traguardo::text as traguardo, scadenza::text as scadenza from ceste order by nome`)).rows;
  const propri = new Map((await db.query<{ id: string; v: string }>(
    `select id, sum(v)::text as v from (select a_cesta_id as id, importo as v from spostamenti_ceste where a_cesta_id is not null
                                        union all select da_cesta_id, -importo from spostamenti_ceste where da_cesta_id is not null) x group by id`)).rows.map((r) => [r.id, Number(r.v)]));
  const traguardi = (await db.query(
    `select id, cesta_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;

  const inizio = await inizioMese(db), adesso = oggi();
  const nodi = new Map<string, Salvadanaio>();
  for (const r of righe) {
    nodi.set(r.id, {
      id: r.id, padre_id: r.padre_id, nome: r.nome, icona: r.icona,
      versato: '0.00', dentro: '0.00', traguardo: null, traguardo_scritto: r.traguardo, scadenza: r.scadenza, percentuale: null,
      mancano: null, mesi: null, metti_al_mese: null, traguardi: [], figli: [],
    });
  }
  const radici: Salvadanaio[] = [];
  for (const n of nodi.values()) {
    const padre = n.padre_id ? nodi.get(n.padre_id) : undefined;
    if (padre) padre.figli.push(n); else radici.push(n);
  }

  const calcola = async (n: Salvadanaio): Promise<void> => {
    for (const f of n.figli) await calcola(f);
    const propria = propri.get(n.id) ?? 0;
    const dentro = propria + n.figli.reduce((t, f) => t + Number(f.dentro), 0);
    n.versato = cent(propria); n.dentro = cent(dentro);
    const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo ?? 0), 0);
    const traguardo = n.traguardo_scritto !== null ? Number(n.traguardo_scritto) : daFigli > 0 ? daFigli : null;
    n.traguardo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(Math.max(0, dentro), traguardo) : null;
    if (traguardo !== null) {
      const manca = Math.max(0, traguardo - dentro);
      n.mancano = cent(manca);
      if (n.scadenza) {
        n.mesi = mesiFino(n.scadenza, adesso, inizio);
        n.metti_al_mese = cent(manca / n.mesi);
      }
    }
    n.traguardi = traguardi.filter((t) => t.cesta_id === n.id).map(({ cesta_id: _, ...t }) => ({ ...t, percentuale: percento(Math.max(0, dentro), Number(t.importo)) }));
  };
  for (const r of radici) await calcola(r);
  return radici;
}

export function trova(radici: Salvadanaio[], id: string): Salvadanaio | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}

// Quanto c'è nella parte propria di un salvadanaio (senza i sotto-salvadanai).
export async function versatoProprio(db: PoolClient, id: string): Promise<number> {
  return Number((await db.query<{ v: string }>(
    `select coalesce(sum(case when a_cesta_id = $1 then importo else -importo end), 0)::text as v from spostamenti_ceste where a_cesta_id = $1 or da_cesta_id = $1`, [id])).rows[0].v);
}

// Eliminando un salvadanaio: i sotto-salvadanai salgono in quello che lo conteneva (con i loro soldi, che stanno su di loro) e i suoi soldi
// propri vanno lì; se era in cima, escono da ogni salvadanaio.
export async function eliminaSalvadanaio(db: PoolClient, id: string): Promise<void> {
  const n = (await db.query<{ padre_id: string | null; nome: string }>('select padre_id, nome from ceste where id = $1 for update', [id])).rows[0];
  if (!n) return;
  const propria = await versatoProprio(db, id);
  await db.query('update ceste set padre_id = $2 where padre_id = $1', [id, n.padre_id]);
  // Prima si scrive l'entrata nel padre, poi si cancella il salvadanaio: con lui spariscono i suoi spostamenti, compreso quello in uscita.
  if (n.padre_id && propria >= 0.005) {
    await db.query(
      `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, descrizione) values (fp_me(), null, $1, $2, $3)`,
      [n.padre_id, cent(propria), `Da «${n.nome}», eliminato`]);
  }
  await db.query('delete from ceste where id = $1', [id]);
}
