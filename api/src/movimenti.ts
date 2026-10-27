import type { PoolClient } from 'pg';
import { ErroreApi } from './errori.ts';
import { meseDi, periodoRichiesto, type Periodo } from './periodo.ts';

// Movimenti del conto (decisioni 47 e 51). Il saldo di un conto è UNO, uguale per chi lo vede:
// saldo attuale = saldo di partenza + movimenti registrati DOPO il momento del saldo di partenza.
// Ogni movimento ha una sorgente (da) e una destinazione (a) e un importo positivo: spese, rate, uscite e versamenti vanno dal conto a
// «Niente», le entrate da «Niente» al conto, i giroconti da un conto a un altro (una riga sola). «Niente» è un conto speciale e nascosto.

// Il conto speciale «Niente» (migrazione 038): id fisso, uguale per tutti, mai visibile in elenchi.
export const NIENTE = '00000000-0000-0000-0000-000000000001';

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

// Scrive un movimento: `da` = conto sorgente (null solo per un'uscita di budget senza conto, causa 'budget'), `a` = conto destinazione.
export async function registraMovimento(db: PoolClient, m: {
  da: string | null; a: string; importo: number; causa: 'spesa' | 'rata' | 'versamento' | 'giroconto' | 'budget' | 'a_mano'; descrizione: string;
  spunta_id?: string | null; versamento_id?: string | null;
}): Promise<void> {
  if (Math.abs(m.importo) < 0.005) return;
  await db.query(
    `insert into movimenti_conto (da_conto_id, a_conto_id, importo, utente_id, causa, descrizione, spunta_id, versamento_id)
     values ($1, $2, $3, fp_me(), $4, $5, $6, $7)`,
    [m.da, m.a, cent(Math.abs(m.importo)), m.causa, m.descrizione, m.spunta_id ?? null, m.versamento_id ?? null]);
}

// Il movimento di un versamento «Dal conto» (decisione 52). Il salvadanaio può stare su un conto (il proprio o quello del superiore più
// vicino, solo se chi chiama lo vede: `fp_conto_del_salvadanaio`). `importo` ha il segno del versamento (positivo = metto via, negativo = prelevo).
//   - il salvadanaio sta sullo STESSO conto scelto: nessun movimento, il saldo resta uguale (i soldi sono solo messi da parte lì);
//   - sta su un ALTRO conto: un giroconto, una riga (versando: scelto -> conto del salvadanaio; prelevando: al contrario);
//   - non sta su nessun conto: conto scelto -> Niente (versando) o Niente -> conto scelto (prelevando), come prima.
export async function movimentoDelVersamento(db: PoolClient, m: { contoScelto: string; obiettivoId: string; importo: number; versamentoId: string; nome: string }): Promise<void> {
  const sul = (await db.query<{ conto: string | null }>('select fp_conto_del_salvadanaio($1) as conto', [m.obiettivoId])).rows[0]?.conto ?? null;
  if (sul === m.contoScelto) return;
  const verso = m.importo > 0;
  const altro = sul ?? NIENTE;   // dall'altra parte del movimento: il conto del salvadanaio, o Niente
  await registraMovimento(db, {
    da: verso ? m.contoScelto : altro, a: verso ? altro : m.contoScelto, importo: m.importo,
    causa: sul ? 'giroconto' : 'versamento', versamento_id: m.versamentoId,
    descrizione: verso ? `Versato in ${m.nome}` : `Tornato da ${m.nome}`,
  });
}

// Il movimento della spunta di una SPESA, scritto dal database: vale anche quando il conto della spesa lo vede solo
// chi l'ha creata (decisione 48 B). `conto` = quanto esce dal conto della spesa (positivo, 0 = niente): conto -> Niente.
export async function muoviPerSpunta(db: PoolClient, spuntaId: string, m: { conto: number; descrizione: string }): Promise<void> {
  if (Math.abs(m.conto) < 0.005) return;
  await db.query('select fp_spunta_muovi($1, $2, $3)', [spuntaId, cent(m.conto), m.descrizione]);
}

// Il mese personale (AAAA-MM) di una data per chi chiama, e se è precedente a quello in corso.
export async function mesePassato(db: PoolClient, data: string): Promise<boolean> {
  const adesso = await periodoRichiesto(db, undefined);
  return meseDi(data, adesso.inizio) < adesso.mese;
}

// Toglie la spunta: sparisce anche il movimento sul conto.
export async function annullaSpunta(db: PoolClient, spuntaId: string): Promise<void> {
  await db.query('select fp_annulla_spunta($1)', [spuntaId]);
}
