import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';
import { meseDi, periodoRichiesto, type Periodo } from './periodo.ts';

// Movimenti del conto (decisione 47). Il saldo di un conto è UNO, uguale per chi lo vede:
// saldo attuale = saldo di partenza + movimenti registrati DOPO il momento del saldo di partenza.

const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// Il passato non si cambia (47 D): le spunte (e i loro movimenti) dei mesi personali precedenti a quello in corso
// non si aggiungono né si tolgono.
export async function vietaMesePassato(db: PoolClient, p: Periodo): Promise<void> {
  const adesso = await periodoRichiesto(db, undefined);
  if (p.mese < adesso.mese) throw new ErroreApi(409, 'Il passato non si cambia: le spunte dei mesi precedenti a quello in corso non si possono più cambiare');
}

// Quanto esce dal conto per una voce di importo `intero` di cui chi spunta paga `mia` (47 C): se il CONTO è
// condiviso esce l'importo intero; altrimenti (conto solo di una persona) esce la quota di chi spunta.
// Funziona anche per un conto che chi spunta non vede (spesa condivisa, 48 B).
export async function importoSulConto(db: PoolClient, contoId: string, intero: number, mia: number): Promise<number> {
  const { rows } = await db.query<{ condiviso: boolean }>('select fp_conto_condiviso($1) as condiviso', [contoId]);
  return rows[0]?.condiviso ? intero : mia;
}

export async function registraMovimento(db: PoolClient, m: {
  conto_id: string; importo: number; causa: 'spesa' | 'rata' | 'versamento'; descrizione: string; spunta_id?: string | null; versamento_id?: string | null;
}): Promise<void> {
  if (Math.abs(m.importo) < 0.005) return;
  await db.query(
    `insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id, versamento_id)
     values ($1, $2, fp_me(), $3, $4, $5, $6)`,
    [m.conto_id, cent(m.importo), m.causa, m.descrizione, m.spunta_id ?? null, m.versamento_id ?? null]);
}

// Il movimento (e il versamento) della spunta di una SPESA, scritti dal database: valgono anche quando il conto o il
// salvadanaio della spesa li vede solo chi l'ha creata (decisione 48 B). `conto` = quanto esce dal conto della spesa
// (positivo, 0 = niente), `versamento` = quanto entra (+) o esce (−) dal salvadanaio della spesa (0 = niente).
export async function muoviPerSpunta(db: PoolClient, spuntaId: string, m: {
  conto: number; causa: 'spesa' | 'versamento'; descrizione: string; versamento: number; data: string;
}): Promise<void> {
  if (Math.abs(m.conto) < 0.005 && Math.abs(m.versamento) < 0.005) return;
  await db.query('select fp_spunta_muovi($1, $2, $3, $4, $5, $6)',
    [spuntaId, Math.abs(m.conto) < 0.005 ? null : cent(-m.conto), m.causa, m.descrizione, Math.abs(m.versamento) < 0.005 ? null : cent(m.versamento), m.data]);
}

// Il giroconto della spunta di un budget «sposto»: due movimenti collegati tra i conti del budget.
export async function giroconto(db: PoolClient, spuntaId: string, importo: number): Promise<void> {
  await db.query('select fp_spunta_giroconto($1, $2)', [spuntaId, cent(importo)]);
}

// Il mese personale (AAAA-MM) di una data per chi chiama, e se è precedente a quello in corso.
export async function mesePassato(db: PoolClient, data: string): Promise<boolean> {
  const adesso = await periodoRichiesto(db, undefined);
  return meseDi(data, adesso.inizio) < adesso.mese;
}

// Toglie la spunta: sparisce anche il movimento (e il versamento della quota, se c'era).
export async function annullaSpunta(db: PoolClient, spuntaId: string): Promise<void> {
  await db.query('select fp_annulla_spunta($1)', [spuntaId]);
}
