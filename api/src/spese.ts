import type { PoolClient } from 'pg';
import { alberoObiettivi, type Nodo, quotaPromemoria, trova } from './albero.ts';
import { sqlBloccoSpesa } from './collegamenti.ts';
import { inizioMese, oggi, type Periodo, scadenzaNelPeriodo } from './periodo.ts';

// Spese previste lette per un mese: quando cadono, se sono già uscite
// (spuntate nel periodo) e la quota di chi guarda. La categoria è sempre quella di chi guarda:
// per le spese ricevute sta in spese_dati_utente (decisione 43), mai quella del creatore.

export type SpesaDelMese = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean; giorno_mese: number | null;
  // Promemoria di una transazione (decisione 61): esce da `conto_id` e va su `a_conto_id` (vuoto = fuori: è una spesa vera).
  conto_id: string | null; conto: string | null; a_conto_id: string | null; a_conto: string | null; categoria_id: string | null; categoria: string | null;
  categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: 'fissa' | 'investimento'; attiva: boolean; note: string | null;
  // Il promemoria «Ricordami» di un salvadanaio (la spunta è solo un segno).
  alimenta_obiettivo_id: string | null;
  mia: boolean; condivisa: boolean;
  // Per chi riceve una spesa condivisa: ancora da aprire / categorizzare, e chi l'ha creata (decisione 43).
  nuova: boolean; creata_da: string | null;
  percentuale_scritta: string | null;
  // calcolati
  scadenza: string | null; nel_mese: boolean; uscita: boolean; mia_percentuale: number; mia_quota: string;
  // Se la spesa nasce da un salvadanaio (promemoria o spesa creata al raggiungimento): quali campi si cambiano solo da lì.
  bloccato_da: { tipo: 'salvadanaio'; id: string; nome: string; campi: string[] } | null;
};

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function speseDelMese(db: PoolClient, p: Periodo, soloId?: string): Promise<SpesaDelMese[]> {
  const { rows } = await db.query(
    `select s.id, s.nome, s.importo::text as importo, s.ogni_mesi, s.prossima_scadenza, s.senza_giorno, s.giorno_mese, s.conto_id, co.nome as conto,
            s.a_conto_id, ca.nome as a_conto,
            c.id as categoria_id, c.nome as categoria, pc.nome as categoria_padre,
            (with recursive su as (
               select id, padre_id, icona from categorie where id = c.id
               union all
               select k.id, k.padre_id, k.icona from categorie k join su on k.id = su.padre_id where su.icona is null)
             select icona from su where icona is not null limit 1) as icona,
            coalesce(c.colore, pc.colore) as colore,
            s.tipo, s.attiva, s.note, s.alimenta_obiettivo_id,
            s.proprietario_id = fp_me() as mia,
            (s.proprietario_id <> fp_me() and d.vista_il is null) as nuova,
            case when s.proprietario_id <> fp_me() then (select u.nome from utenti u where u.id = s.proprietario_id) end as creata_da,
            exists (select 1 from condivisioni x where x.spesa_prevista_id = s.id) as condivisa,
            (select q.percentuale::text from quote q where q.spesa_prevista_id = s.id and q.utente_id = fp_me()) as percentuale_scritta,
            ${sqlBloccoSpesa('s')} as bloccato_da,
            exists (select 1 from spunte x where x.spesa_prevista_id = s.id and x.data between $1 and $2) as spuntata,
            (select sum(m.importo)::text from movimenti m join spunte x on x.id = m.spunta_id
              where x.spesa_prevista_id = s.id and x.data between $1 and $2) as mosso_con_spunta
       from spese_previste s
       left join conti co on co.id = s.conto_id
       left join conti ca on ca.id = s.a_conto_id
       left join spese_dati_utente d on d.spesa_prevista_id = s.id and d.utente_id = fp_me()
       left join categorie c on c.proprietario_id = fp_me()
                            and c.id = case when s.proprietario_id = fp_me() then s.categoria_id else d.categoria_id end
       left join categorie pc on pc.id = c.padre_id
      where ($3::uuid is null or s.id = $3)
      order by s.tipo, coalesce(pc.nome, c.nome), s.nome`,
    [p.dal, p.al, soloId ?? null]);

  // Il promemoria di un salvadanaio (decisione 51): la quota del mese la calcola l'API; spuntato, vale quanto è stato versato con la spunta.
  const conPromemoria = rows.some((s) => s.alimenta_obiettivo_id);
  const radici = conPromemoria ? await alberoObiettivi(db) : [];
  const inizio = conPromemoria ? await inizioMese(db) : 1;
  const da = oggi() >= p.dal && oggi() <= p.al ? oggi() : p.dal;
  // Spuntato, il promemoria di un salvadanaio vale quanto è stato spostato con la spunta.
  const quotaDelMese = (s: { alimenta_obiettivo_id: string | null; importo: string; spuntata: boolean; mosso_con_spunta: string | null }): string => {
    if (!s.alimenta_obiettivo_id) return s.importo;
    if (s.spuntata && s.mosso_con_spunta !== null) return s.mosso_con_spunta;
    const n: Nodo | undefined = trova(radici, s.alimenta_obiettivo_id);
    return n ? cent(quotaPromemoria(n, Number(s.importo), da, inizio).importo) : s.importo;
  };

  const lista: SpesaDelMese[] = rows.map((r) => {
    const { mosso_con_spunta: _m, ...s } = r;
    const scadenza = scadenzaNelPeriodo(s.prossima_scadenza, s.ogni_mesi, p, s.senza_giorno, s.giorno_mese);
    const pct = s.percentuale_scritta !== null ? Number(s.percentuale_scritta) : s.condivisa ? 50 : s.mia ? 100 : 0;
    const importo = Number(quotaDelMese(r));
    return {
      ...s,
      importo: cent(importo),
      scadenza,
      nel_mese: s.attiva && scadenza !== null,
      // Uscita: spuntata nel mese (la spunta crea la transazione, decisione 61).
      uscita: s.spuntata,
      mia_percentuale: pct,
      mia_quota: cent(importo * pct / 100),
    };
  });

  return lista;
}
