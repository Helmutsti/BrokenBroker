import type { PoolClient } from 'pg';
import { sqlBloccoSpesa } from './collegamenti.ts';
import { type Periodo, scadenzaNelPeriodo } from './periodo.ts';

// Spese previste lette per un mese: quando cadono, se sono già uscite
// (spuntate nel periodo) e la quota di chi guarda.

export type SpesaDelMese = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean;
  conto_id: string | null; conto: string | null; categoria_id: string | null; categoria: string | null;
  categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: 'fissa' | 'budget' | 'investimento'; attiva: boolean; note: string | null; obiettivo_id: string | null;
  // La spesa "mettici da parte": spuntata, versa nel salvadanaio indicato.
  alimenta_obiettivo_id: string | null;
  mia: boolean; condivisa: boolean; percentuale_scritta: string | null;
  // calcolati
  scadenza: string | null; nel_mese: boolean; uscita: boolean; mia_percentuale: number; mia_quota: string;
  quota_mensile: string;
  // Se la spesa nasce da un salvadanaio (promemoria o spesa creata al raggiungimento): quali campi si cambiano solo da lì.
  bloccato_da: { tipo: 'salvadanaio'; id: string; nome: string; campi: string[] } | null;
};

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function speseDelMese(db: PoolClient, p: Periodo, soloId?: string): Promise<SpesaDelMese[]> {
  const { rows } = await db.query(
    `select s.id, s.nome, s.importo::text as importo, s.ogni_mesi, s.prossima_scadenza, s.senza_giorno, s.conto_id, co.nome as conto,
            s.categoria_id, c.nome as categoria, pc.nome as categoria_padre,
            (with recursive su as (
               select id, padre_id, icona from categorie where id = s.categoria_id
               union all
               select k.id, k.padre_id, k.icona from categorie k join su on k.id = su.padre_id where su.icona is null)
             select icona from su where icona is not null limit 1) as icona,
            coalesce(c.colore, pc.colore) as colore,
            s.tipo, s.attiva, s.note, s.obiettivo_id, s.alimenta_obiettivo_id,
            s.proprietario_id = fp_me() as mia,
            exists (select 1 from condivisioni x where x.spesa_prevista_id = s.id) as condivisa,
            (select q.percentuale::text from quote q where q.spesa_prevista_id = s.id and q.utente_id = fp_me()) as percentuale_scritta,
            ${sqlBloccoSpesa('s')} as bloccato_da,
            exists (select 1 from spunte x where x.spesa_prevista_id = s.id and x.data between $1 and $2) as spuntata
       from spese_previste s
       left join conti co on co.id = s.conto_id
       left join categorie c on c.id = s.categoria_id
       left join categorie pc on pc.id = c.padre_id
      where ($3::uuid is null or s.id = $3)
      order by s.tipo, coalesce(pc.nome, c.nome), s.nome`,
    [p.dal, p.al, soloId ?? null]);

  return rows.map((s) => {
    const scadenza = s.tipo === 'budget' ? p.dal : scadenzaNelPeriodo(s.prossima_scadenza, s.ogni_mesi, p, s.senza_giorno);
    const pct = s.percentuale_scritta !== null ? Number(s.percentuale_scritta) : s.condivisa ? 50 : s.mia ? 100 : 0;
    const importo = Number(s.importo);
    return {
      ...s,
      scadenza,
      nel_mese: s.attiva && scadenza !== null,
      // Uscita: spuntata (la spunta è un segno nel mese).
      uscita: s.spuntata,
      mia_percentuale: pct,
      mia_quota: cent(importo * pct / 100),
      quota_mensile: cent(s.ogni_mesi && s.ogni_mesi > 1 ? importo * pct / 100 / s.ogni_mesi : importo * pct / 100),
    };
  });
}
