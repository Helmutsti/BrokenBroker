import type { PoolClient } from 'pg';
import type { Periodo } from './periodo.ts';
import { SQL_USCITA } from './transazioni.ts';

// Budget (decisioni 49, 57, 61, 70 e 71): uno per categoria, ed è un LIMITE DI SPESA. Lo SPESO sono tutte le uscite del mese personale con la
// categoria del budget (o registrate dal budget), da qualunque conto o senza: quelle scritte a mano e quelle nate spuntando una spesa o una rata
// (sono uscite vere). Togliendo la spunta l'uscita sparisce e lo speso scende. I giroconti non hanno categoria e non contano. Se lo speso supera
// la cifra si conta tutto lo stesso e si mostra di quanto si è sforato (`sforo`). Un budget è solo di chi lo crea: niente divisione né condivisione.

export type Uscita = { id: string; budget_id: string | null; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };

export type BudgetDelMese = {
  id: string; categoria_id: string; categoria: string; categoria_padre: string | null; nome: string; icona: string | null; colore: string | null;
  importo: string; attivo: boolean;
  speso: string; speso_per_conto: Record<string, string>;
  sforo: string; // di quanto lo speso supera la cifra del budget (0 se non la supera)
  uscite: Uscita[];
};

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function budgetDelMese(db: PoolClient, p: Periodo, soloId?: string): Promise<BudgetDelMese[]> {
  const { rows } = await db.query(
    `select b.id, b.categoria_id, c.nome as categoria, pc.nome as categoria_padre, c.nome as nome,
            (with recursive su as (
               select id, padre_id, icona from categorie where id = c.id
               union all
               select k.id, k.padre_id, k.icona from categorie k join su on k.id = su.padre_id where su.icona is null)
             select icona from su where icona is not null limit 1) as icona,
            coalesce(c.colore, pc.colore) as colore,
            b.importo::text as importo, b.attivo
       from budget b
       join categorie c on c.id = b.categoria_id
       left join categorie pc on pc.id = c.padre_id
      where ($1::uuid is null or b.id = $1)
      order by c.nome, b.id`, [soloId ?? null]);
  if (!rows.length) return [];

  // Le categorie di ogni budget: la sua e tutte le sottocategorie, a qualsiasi livello (come l'Excel, dove «Casa» raccoglieva tutte le righe che la contenevano).
  const figliDi = new Map<string, string[]>();
  for (const k of (await db.query<{ id: string; padre_id: string | null }>('select id, padre_id from categorie')).rows) {
    if (k.padre_id) figliDi.set(k.padre_id, [...(figliDi.get(k.padre_id) ?? []), k.id]);
  }
  const discendenti = (id: string): Set<string> => {
    const out = new Set([id]);
    for (const x of out) for (const f of figliDi.get(x) ?? []) out.add(f);
    return out;
  };

  // Le uscite del mese: del budget (budget_id) o della sua categoria (o di una sua sottocategoria).
  const mov = (await db.query<Uscita & { categoria_id: string | null }>(
    `select m.id, m.budget_id, m.categoria_id, m.importo::text as importo, m.momento, m.momento::date as data, m.descrizione,
            m.da_conto_id as conto_id, c.nome as conto, u.nome as utente, (m.utente_id = fp_me() and m.spunta_id is null) as modificabile
       from movimenti m left join conti c on c.id = m.da_conto_id left join utenti u on u.id = m.utente_id
      where ${SQL_USCITA} and m.momento >= $1::date and m.momento < $2::date + 1
      order by m.momento desc, m.id desc`, [p.dal, p.al])).rows;

  return rows.map((b) => {
    const categorie = discendenti(b.categoria_id);
    const usciteBudget = mov.filter((m) => m.budget_id === b.id || (m.categoria_id !== null && categorie.has(m.categoria_id)));
    const perConto: Record<string, number> = {};
    for (const m of usciteBudget) { const k = m.conto_id ?? 'senza'; perConto[k] = (perConto[k] ?? 0) + Number(m.importo); }
    const speso = usciteBudget.reduce((t, m) => t + Number(m.importo), 0);
    return {
      ...b,
      speso: cent(speso),
      speso_per_conto: Object.fromEntries(Object.entries(perConto).map(([k, x]) => [k, cent(x)])),
      sforo: cent(Math.max(0, speso - Number(b.importo))),
      uscite: usciteBudget.map(({ categoria_id: _c, ...u }) => u),
    } as BudgetDelMese;
  });
}
