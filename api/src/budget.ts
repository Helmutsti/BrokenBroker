import type { PoolClient } from 'pg';
import { type Periodo, periodoRichiesto } from './periodo.ts';
import { speseDelMese } from './spese.ts';

// Budget (decisioni 49 e 51): uno per categoria, senza modi. È una cifra da tenere sotto controllo, non un limite: lo SPESO è tutto ciò
// che esce con la categoria del budget, da qualunque conto o senza conto (le uscite scritte a mano con quella categoria, cioè movimenti
// conto -> Niente di causa 'budget' o 'a_mano' (Movimenti, decisione 53), e le spese previste spuntate nel mese con quella categoria: solo quelle che escono davvero,
// annuali e una tantum comprese nel loro mese; non i «Ricordami» dei salvadanai). Se lo speso supera la cifra si conta tutto lo
// stesso e si mostra di quanto si è sforato (`sforo`). Un budget è solo una LENTE sui movimenti di una categoria (decisione 57): nessun
// promemoria, nessun conto, nessuna spunta, e nessun peso su alcun totale (Panoramica, Analisi, Categorie: decisione 58); se serve spostare dei soldi su un altro conto si fa un giroconto da Movimenti.

export type Uscita = { id: string; budget_id: string | null; importo: string; momento: string; data: string; descrizione: string; conto_id: string | null; conto: string | null; utente: string | null; modificabile: boolean };
export type SpesaContata = { id: string; nome: string; importo: string; conto_id: string | null; conto: string | null };

export type BudgetDelMese = {
  id: string; categoria_id: string; categoria: string; categoria_padre: string | null; nome: string; icona: string | null; colore: string | null;
  importo: string; attivo: boolean; note: string | null;
  mia: boolean; condiviso: boolean; creato_da: string | null; mia_percentuale: number; mia_quota: string;
  speso: string; speso_per_conto: Record<string, string>; speso_da_spese: string;
  sforo: string; // di quanto lo speso supera la cifra del budget (0 se non la supera)
  uscite: Uscita[]; spese_contate: SpesaContata[];
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

  const adesso = await periodoRichiesto(db, undefined);
  // Le uscite a mano del mese: del budget (budget_id) o della sua categoria. Ognuna conta per un budget solo.
  const mov = (await db.query<Omit<Uscita, 'modificabile'> & { categoria_id: string | null; togliere: boolean }>(
    `select m.id, m.budget_id, m.categoria_id, m.importo::text as importo, m.momento, m.momento::date as data, m.descrizione, m.da_conto_id as conto_id, c.nome as conto, u.nome as utente, (m.causa = 'budget' or m.utente_id = fp_me()) as togliere
       from movimenti_conto m left join conti c on c.id = m.da_conto_id left join utenti u on u.id = m.utente_id
      where m.causa in ('budget', 'a_mano') and m.a_conto_id = fp_niente() and m.momento >= $1::date and m.momento < $2::date + 1
      order by m.momento desc, m.id desc`, [p.dal, p.al])).rows;
  // Spese previste spuntate nel mese con la categoria del budget (la categoria di chi guarda).
  const spese = (await speseDelMese(db, p)).filter((s) => s.uscita && s.tipo === 'fissa' && !s.alimenta_obiettivo_id && s.categoria_id);

  return rows.map((b) => {
    const usciteBudget = mov.filter((m) => m.budget_id === b.id || m.categoria_id === b.categoria_id);
    const contate = b.mia ? spese.filter((s) => s.categoria_id === b.categoria_id) : [];
    const perConto: Record<string, number> = {};
    for (const m of usciteBudget) { const k = m.conto_id ?? 'senza'; perConto[k] = (perConto[k] ?? 0) + Number(m.importo); }
    for (const s of contate) { const k = s.conto_id ?? 'senza'; perConto[k] = (perConto[k] ?? 0) + Number(s.mia_quota); }
    const daSpese = contate.reduce((t, s) => t + Number(s.mia_quota), 0);
    const daUscite = usciteBudget.reduce((t, m) => t + Number(m.importo), 0);
    const pct = b.percentuale_scritta !== null ? Number(b.percentuale_scritta) : b.condiviso ? 50 : b.mia ? 100 : 0;
    const { percentuale_scritta: _omessa, ...resto } = b;
    return {
      ...resto,
      mia_percentuale: pct,
      mia_quota: cent(Number(b.importo) * pct / 100),
      speso: cent(daUscite + daSpese),
      speso_per_conto: Object.fromEntries(Object.entries(perConto).map(([k, x]) => [k, cent(x)])),
      speso_da_spese: cent(daSpese),
      sforo: cent(Math.max(0, daUscite + daSpese - Number(b.importo))),
      // Le uscite del passato non si cambiano più (decisione 48 C).
      uscite: usciteBudget.map(({ categoria_id: _c, togliere, ...u }) => ({ ...u, modificabile: togliere && p.mese >= adesso.mese })),
      spese_contate: contate.map((s) => ({ id: s.id, nome: s.nome, importo: s.mia_quota, conto_id: s.conto_id, conto: s.conto })),
    } as BudgetDelMese;
  });
}
