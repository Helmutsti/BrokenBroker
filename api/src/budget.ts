import type { PoolClient } from 'pg';
import type { Periodo } from './periodo.ts';

// Budget (decisioni 49, 57 e 59): uno per categoria. È una cifra da tenere sotto controllo, non un limite: lo SPESO sono le uscite scritte
// in Movimenti con la categoria del budget (o registrate dal budget) nel mese, con qualunque etichetta di conto o senza. Le spese della
// pagina Spese non contano (decisione 59: budget e movimenti sono uno strumento a parte). Se lo speso supera la cifra si conta tutto lo
// stesso e si mostra di quanto si è sforato (`sforo`). Nessun peso su alcun totale (Panoramica, Analisi, Categorie: decisione 58).

export type Uscita = { id: string; budget_id: string | null; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };

export type BudgetDelMese = {
  id: string; categoria_id: string; categoria: string; categoria_padre: string | null; nome: string; icona: string | null; colore: string | null;
  importo: string; attivo: boolean; note: string | null;
  mia: boolean; condiviso: boolean; creato_da: string | null; mia_percentuale: number; mia_quota: string;
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
            b.importo::text as importo, b.attivo, b.note,
            b.proprietario_id = fp_me() as mia,
            exists (select 1 from condivisioni x where x.budget_id = b.id) as condiviso,
            case when b.proprietario_id <> fp_me() then u.nome end as creato_da,
            (select q.percentuale::text from quote q where q.budget_id = b.id and q.utente_id = fp_me()) as percentuale_scritta
       from budget b
       join categorie c on c.id = b.categoria_id
       left join categorie pc on pc.id = c.padre_id
       join utenti u on u.id = b.proprietario_id
      where ($1::uuid is null or b.id = $1)
      order by c.nome, b.id`, [soloId ?? null]);
  if (!rows.length) return [];

  // Le uscite del mese: del budget (budget_id) o della sua categoria.
  const mov = (await db.query<Uscita & { categoria_id: string | null }>(
    `select m.id, m.budget_id, m.categoria_id, m.importo::text as importo, m.momento, m.momento::date as data, m.descrizione,
            m.conto_id, c.nome as conto, u.nome as utente, (m.utente_id = fp_me()) as modificabile
       from movimenti m left join conti c on c.id = m.conto_id left join utenti u on u.id = m.utente_id
      where m.tipo = 'uscita' and m.momento >= $1::date and m.momento < $2::date + 1
      order by m.momento desc, m.id desc`, [p.dal, p.al])).rows;

  return rows.map((b) => {
    const usciteBudget = mov.filter((m) => m.budget_id === b.id || m.categoria_id === b.categoria_id);
    const perConto: Record<string, number> = {};
    for (const m of usciteBudget) { const k = m.conto_id ?? 'senza'; perConto[k] = (perConto[k] ?? 0) + Number(m.importo); }
    const speso = usciteBudget.reduce((t, m) => t + Number(m.importo), 0);
    const pct = b.percentuale_scritta !== null ? Number(b.percentuale_scritta) : b.condiviso ? 50 : b.mia ? 100 : 0;
    const { percentuale_scritta: _omessa, ...resto } = b;
    return {
      ...resto,
      mia_percentuale: pct,
      mia_quota: cent(Number(b.importo) * pct / 100),
      speso: cent(speso),
      speso_per_conto: Object.fromEntries(Object.entries(perConto).map(([k, x]) => [k, cent(x)])),
      sforo: cent(Math.max(0, speso - Number(b.importo))),
      uscite: usciteBudget.map(({ categoria_id: _c, ...u }) => u),
    } as BudgetDelMese;
  });
}
