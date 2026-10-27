import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';

// Voci collegate (decisioni 37 e 50): ciò che nasce da un salvadanaio è bloccato e si modifica dal salvadanaio.
//  - il promemoria di un salvadanaio (alimenta_obiettivo_id) e la spesa creata al
//    raggiungimento (obiettivi.spesa_creata_id) nascono dal salvadanaio.
// (Dalla decisione 50 una spesa non crea né paga più un salvadanaio.)

// Campi della spesa che si cambiano solo dal salvadanaio (categoria, note, attiva e divisione restano liberi).
export const CAMPI_SPESA_PROMEMORIA = ['nome', 'importo', 'ogni_mesi', 'prossima_scadenza', 'senza_giorno', 'giorno_mese', 'tipo', 'alimenta_obiettivo_id', 'conto_id'] as const;
export const CAMPI_SPESA_CREATA = ['nome', 'importo', 'ogni_mesi', 'prossima_scadenza', 'senza_giorno', 'giorno_mese', 'tipo', 'alimenta_obiettivo_id'] as const;

const json = (xs: readonly string[]) => `'${JSON.stringify(xs)}'::jsonb`;

// Espressione SQL per una riga di spese_previste (alias `s`).
export const sqlBloccoSpesa = (s: string) => `
  case when ${s}.alimenta_obiettivo_id is not null
       then jsonb_build_object('tipo', 'salvadanaio', 'id', ${s}.alimenta_obiettivo_id,
              'nome', coalesce((select ob.nome from obiettivi ob where ob.id = ${s}.alimenta_obiettivo_id), 'un salvadanaio'), 'campi', ${json(CAMPI_SPESA_PROMEMORIA)})
       else (select jsonb_build_object('tipo', 'salvadanaio', 'id', ob.id, 'nome', ob.nome, 'campi', ${json(CAMPI_SPESA_CREATA)})
               from obiettivi ob where ob.spesa_creata_id = ${s}.id) end`;

export type Blocco = { tipo: 'salvadanaio'; id: string; nome: string; campi: string[] };

export const erroreSpesaBloccata = (b: Blocco) => new ErroreApi(409, `Questa spesa nasce dal salvadanaio «${b.nome}»: modificala dal salvadanaio.`);

export async function bloccoSpesa(db: PoolClient, id: string): Promise<Blocco | null> {
  const { rows } = await db.query<{ b: Blocco | null }>(`select ${sqlBloccoSpesa('s')} as b from spese_previste s where s.id = $1`, [id]);
  return rows[0]?.b ?? null;
}

// Rifiuta con 409 se tra i campi inviati ce n'è uno bloccato.
export function vietaCampi(blocco: Blocco | null, inviati: string[], errore: (b: Blocco) => ErroreApi): void {
  if (blocco && inviati.some((k) => blocco.campi.includes(k))) throw errore(blocco);
}
