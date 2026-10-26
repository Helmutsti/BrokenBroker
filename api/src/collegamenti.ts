import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';

// Voci collegate (decisione 37): ciò che nasce dall'altro è bloccato e si modifica
// dall'origine.
//  - un salvadanaio creato da una spesa (obiettivi.da_spesa, ovunque sia nell'albero) e
//    ancora pagato da una spesa nasce dalla spesa: eliminata la spesa, torna libero;
//  - il promemoria di un salvadanaio (alimenta_obiettivo_id) e la spesa creata al
//    raggiungimento (obiettivi.spesa_creata_id) nascono dal salvadanaio.

// Campi del salvadanaio che si cambiano solo dalla spesa.
export const CAMPI_OBIETTIVO_BLOCCATI = ['nome', 'traguardo', 'scadenza', 'padre_id', 'crea_spesa'] as const;
// Campi della spesa che si cambiano solo dal salvadanaio (categoria, note, attiva e divisione restano liberi).
export const CAMPI_SPESA_PROMEMORIA = ['nome', 'importo', 'ogni_mesi', 'prossima_scadenza', 'senza_giorno', 'tipo', 'obiettivo_id', 'alimenta_obiettivo_id', 'conto_id'] as const;
export const CAMPI_SPESA_CREATA = ['nome', 'importo', 'ogni_mesi', 'prossima_scadenza', 'senza_giorno', 'tipo', 'obiettivo_id', 'alimenta_obiettivo_id'] as const;

const json = (xs: readonly string[]) => `'${JSON.stringify(xs)}'::jsonb`;

// Espressioni SQL per una riga di obiettivi (alias `o`) o di spese_previste (alias `s`).
export const sqlBloccoObiettivo = (o: string) => `
  case when ${o}.da_spesa
       then (select jsonb_build_object('tipo', 'spesa', 'id', x.id, 'nome', x.nome, 'campi', ${json(CAMPI_OBIETTIVO_BLOCCATI)})
               from spese_previste x where x.obiettivo_id = ${o}.id order by x.attiva desc, x.nome limit 1) end`;

export const sqlBloccoSpesa = (s: string) => `
  case when ${s}.alimenta_obiettivo_id is not null
       then jsonb_build_object('tipo', 'salvadanaio', 'id', ${s}.alimenta_obiettivo_id,
              'nome', coalesce((select ob.nome from obiettivi ob where ob.id = ${s}.alimenta_obiettivo_id), 'un salvadanaio'), 'campi', ${json(CAMPI_SPESA_PROMEMORIA)})
       else (select jsonb_build_object('tipo', 'salvadanaio', 'id', ob.id, 'nome', ob.nome, 'campi', ${json(CAMPI_SPESA_CREATA)})
               from obiettivi ob where ob.spesa_creata_id = ${s}.id) end`;

export type Blocco = { tipo: 'spesa' | 'salvadanaio'; id: string; nome: string; campi: string[] };

export const erroreObiettivoBloccato = (b: Blocco) => new ErroreApi(409, `Questo salvadanaio nasce dalla spesa «${b.nome}»: modificalo dalla spesa.`);
export const erroreSpesaBloccata = (b: Blocco) => new ErroreApi(409, `Questa spesa nasce dal salvadanaio «${b.nome}»: modificala dal salvadanaio.`);

export async function bloccoObiettivo(db: PoolClient, id: string): Promise<Blocco | null> {
  const { rows } = await db.query<{ b: Blocco | null }>(`select ${sqlBloccoObiettivo('o')} as b from obiettivi o where o.id = $1`, [id]);
  return rows[0]?.b ?? null;
}

export async function bloccoSpesa(db: PoolClient, id: string): Promise<Blocco | null> {
  const { rows } = await db.query<{ b: Blocco | null }>(`select ${sqlBloccoSpesa('s')} as b from spese_previste s where s.id = $1`, [id]);
  return rows[0]?.b ?? null;
}

// Il promemoria "ricordami" non si crea su un salvadanaio generato da una spesa:
// la quota arriva già dalla spesa (niente cicli).
export async function vietaPromemoria(db: PoolClient, obiettivoId: string): Promise<void> {
  const b = await bloccoObiettivo(db, obiettivoId);
  if (b) throw erroreObiettivoBloccato(b);
}

// Rifiuta con 409 se tra i campi inviati ce n'è uno bloccato.
export function vietaCampi(blocco: Blocco | null, inviati: string[], errore: (b: Blocco) => ErroreApi): void {
  if (blocco && inviati.some((k) => blocco.campi.includes(k))) throw errore(blocco);
}
