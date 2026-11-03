import type { PoolClient } from 'pg';
import { meseDi, type Periodo, periodo, prossimaUscita, scadenzaNelPeriodo } from './periodo.ts';

// Spese previste lette per un mese: quando cadono, se sono già uscite
// (spuntate nel periodo) e la quota di chi guarda. La categoria è sempre quella di chi guarda:
// per le spese ricevute sta in spese_dati_utente (decisione 43), mai quella del creatore.

export type SpesaDelMese = {
  id: string; nome: string; importo: string; ogni_mesi: number | null; prossima_scadenza: string | null; senza_giorno: boolean; giorno_mese: number | null;
  // Il conto è solo un'etichetta (decisione 72): non cambia nessun numero.
  conto_id: string | null; conto: string | null; categoria_id: string | null; categoria: string | null;
  categoria_padre: string | null; icona: string | null; colore: string | null;
  tipo: 'fissa' | 'investimento'; attiva: boolean; note: string | null;
  mia: boolean; condivisa: boolean;
  // Per chi riceve una spesa condivisa: ancora da aprire / categorizzare, e chi l'ha creata (decisione 43).
  nuova: boolean; creata_da: string | null;
  percentuale_scritta: string | null;
  // calcolati
  scadenza: string | null; nel_mese: boolean; uscita: boolean;
  // Solo annuali e una tantum: la scadenza in corso (vedi `scadenzaInCorso`) e se è già pagata, anche in anticipo.
  scadenza_in_corso: string | null; mia_percentuale: number; mia_quota: string;
  // Quanto costa la tua quota al mese e all'anno (ogni N mesi: quota / N e quota x 12 / N; una tantum: quota / 12 e quota).
  al_mese: string; all_anno: string;
  // «Metti da parte» acceso: la spesa (annuale o una tantum) ha il suo salvadanaio dentro «Spese annuali».
  metti_da_parte: boolean;
};

// Annuale o una tantum: ogni_mesi null o >= 2. Mensili e rate non cambiano.
export const eAnnuale = (ogniMesi: number | null): boolean => ogniMesi === null || ogniMesi >= 2;

// Una spunta fatta: `data` è il giorno in cui è uscita; `per_mese` (giorno 1 del mese personale della scadenza che paga) c'è solo per le annuali
// (decisione 72, aggiunte di Manuel): serve a far valere una spunta fatta in anticipo per la scadenza giusta. Le vecchie spunte senza `per_mese`
// valgono per il mese personale in cui cadono.
export type SpuntaFatta = { data: string; per_mese: string | null };

// REGOLA: la «scadenza in corso» di un'annuale vista nel mese `p` è la prima scadenza che cade dal mese `p` in poi (il mese `p` conta ancora),
// pagata o no (`prossimaUscita` da inizio mese). Se è già pagata (anche in anticipo) la casella è spuntata; passato il mese di quella scadenza,
// quella dopo diventa la scadenza in corso e la casella torna vuota. Una tantum: la sua unica scadenza. Ritorna il mese personale (AAAA-MM).
export function meseScadenzaInCorso(s: { prossima_scadenza: string | null; ogni_mesi: number | null; senza_giorno: boolean }, p: Periodo): string | null {
  if (!s.prossima_scadenza) return null;
  const inizio = Number(p.dal.slice(8, 10));
  return meseDi(prossimaUscita(s.prossima_scadenza, s.ogni_mesi, p.dal, s.senza_giorno, inizio), inizio);
}

// La scadenza del mese personale `mese` è pagata?
export function scadenzaPagata(spunte: SpuntaFatta[], mese: string, inizio: number): boolean {
  const q = periodo(mese, inizio);
  return spunte.some((x) => (x.per_mese ? x.per_mese.slice(0, 7) === mese : x.data >= q.dal && x.data <= q.al));
}

export async function spunteDellaSpesa(db: PoolClient, id: string): Promise<SpuntaFatta[]> {
  return (await db.query<SpuntaFatta>('select data::text as data, per_mese::text as per_mese from spunte where spesa_prevista_id = $1', [id])).rows;
}

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function speseDelMese(db: PoolClient, p: Periodo, soloId?: string): Promise<SpesaDelMese[]> {
  const { rows } = await db.query(
    `select s.id, s.nome, s.importo::text as importo, s.ogni_mesi, s.prossima_scadenza, s.senza_giorno, s.giorno_mese, s.conto_id, co.nome as conto,
            exists (select 1 from ceste k where k.spesa_id = s.id) as metti_da_parte,
            c.id as categoria_id, c.nome as categoria, pc.nome as categoria_padre,
            (with recursive su as (
               select id, padre_id, icona from categorie where id = c.id
               union all
               select k.id, k.padre_id, k.icona from categorie k join su on k.id = su.padre_id where su.icona is null)
             select icona from su where icona is not null limit 1) as icona,
            coalesce(c.colore, pc.colore) as colore,
            s.tipo, s.attiva, s.note,
            s.proprietario_id = fp_me() as mia,
            (s.proprietario_id <> fp_me() and d.vista_il is null) as nuova,
            case when s.proprietario_id <> fp_me() then (select u.nome from utenti u where u.id = s.proprietario_id) end as creata_da,
            exists (select 1 from condivisioni x where x.spesa_prevista_id = s.id) as condivisa,
            (select q.percentuale::text from quote q where q.spesa_prevista_id = s.id and q.utente_id = fp_me()) as percentuale_scritta,
            exists (select 1 from spunte x where x.spesa_prevista_id = s.id and x.data between $1 and $2) as spuntata
       from spese_previste s
       left join conti co on co.id = s.conto_id
       left join spese_dati_utente d on d.spesa_prevista_id = s.id and d.utente_id = fp_me()
       left join categorie c on c.proprietario_id = fp_me()
                            and c.id = case when s.proprietario_id = fp_me() then s.categoria_id else d.categoria_id end
       left join categorie pc on pc.id = c.padre_id
      where ($3::uuid is null or s.id = $3)
      order by s.tipo, coalesce(pc.nome, c.nome), s.nome`,
    [p.dal, p.al, soloId ?? null]);

  const spunteAnnuali = new Map<string, SpuntaFatta[]>();
  for (const x of (await db.query<SpuntaFatta & { spesa: string }>(
    'select spesa_prevista_id as spesa, data::text as data, per_mese::text as per_mese from spunte where spesa_prevista_id is not null')).rows) {
    spunteAnnuali.set(x.spesa, [...(spunteAnnuali.get(x.spesa) ?? []), x]);
  }
  const inizioMese = Number(p.dal.slice(8, 10));

  const lista: SpesaDelMese[] = rows.map((s) => {
    const scadenza = scadenzaNelPeriodo(s.prossima_scadenza, s.ogni_mesi, p, s.senza_giorno, s.giorno_mese);
    const pct = s.percentuale_scritta !== null ? Number(s.percentuale_scritta) : s.condivisa ? 50 : s.mia ? 100 : 0;
    const meseInCorso = eAnnuale(s.ogni_mesi) ? meseScadenzaInCorso(s, p) : null;
    const importo = Number(s.importo);
    const quota = importo * pct / 100;
    return {
      ...s,
      importo: cent(importo),
      scadenza,
      nel_mese: s.attiva && scadenza !== null,
      // Uscita: spuntata nel mese (la spunta crea la transazione, decisione 61); un'annuale: la scadenza in corso è pagata, anche in anticipo.
      uscita: meseInCorso ? scadenzaPagata(spunteAnnuali.get(s.id) ?? [], meseInCorso, inizioMese) : s.spuntata,
      scadenza_in_corso: meseInCorso,
      mia_percentuale: pct,
      mia_quota: cent(quota),
      al_mese: cent(s.ogni_mesi === null ? quota / 12 : quota / s.ogni_mesi),
      all_anno: cent(s.ogni_mesi === null ? quota : quota * 12 / s.ogni_mesi),
    };
  });

  return lista;
}
