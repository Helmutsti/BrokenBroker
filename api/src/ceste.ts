import type { PoolClient } from 'pg';
import { inizioMese, mesiFino, meseDi, oggi, periodo, prossimaUscita, spostaMese } from './periodo.ts';
import { speseDelMese } from './spese.ts';

// Le ceste (decisione 71): parti del saldo di un conto, annidabili (il padre ne fa la somma). Una cesta non muove il saldo del conto:
// quanto c'è dentro lo dicono gli spostamenti (spostamenti_ceste). `versato` è la parte propria, `saldo` comprende le sotto-ceste.
// Una cesta può puntare a una spesa prevista: allora cifra e data vengono dalla spesa (la tua quota, la prossima volta che cade) e si
// calcolano quanto manca e quanto mettere al mese.

// `scadenza` è la prossima volta che cade (con `senza_giorno` conta solo il mese: il giorno è il primo del mese personale scritto).
export type CestaSpesa = { id: string; nome: string; importo: string; scadenza: string | null; senza_giorno: boolean; ogni_mesi: number | null; pagata: boolean };

export type Cesta = {
  id: string; conto_id: string; conto: string; padre_id: string | null; nome: string; icona: string; traguardo: string | null; spesa_id: string | null;
  mio: boolean; versato: string; saldo: string;
  // Il traguardo che vale: quello scritto, la cifra della spesa collegata o la somma dei traguardi delle sotto-ceste.
  traguardo_effettivo: string | null; percentuale: number | null;
  // Solo con una spesa collegata: la spesa, quanto manca alla cifra, i mesi personali fino alla data (almeno 1) e quanto mettere al mese.
  spesa: CestaSpesa | null; manca: string | null; mesi: number | null; al_mese: string | null;
  traguardi: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  figli: Cesta[];
};

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

type Riga = { id: string; conto_id: string; conto: string; padre_id: string | null; nome: string; icona: string; traguardo: string | null; spesa_id: string | null; mio: boolean };

// L'albero di tutte le ceste che chi chiede vede, in cima quelle senza cesta superiore.
export async function alberoCeste(db: PoolClient): Promise<Cesta[]> {
  const righe = (await db.query<Riga>(
    `select k.id, k.conto_id, c.nome as conto, k.padre_id, k.nome, k.icona, k.traguardo::text as traguardo, k.spesa_id, k.proprietario_id = fp_me() as mio
       from ceste k join conti c on c.id = k.conto_id order by k.nome`)).rows;
  const propri = new Map((await db.query<{ id: string; v: string }>(
    `select id, sum(v)::text as v from (select a_cesta_id as id, importo as v from spostamenti_ceste where a_cesta_id is not null
                                        union all select da_cesta_id, -importo from spostamenti_ceste where da_cesta_id is not null) x group by id`)).rows.map((r) => [r.id, Number(r.v)]));
  const traguardi = (await db.query(
    `select id, cesta_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;

  const inizio = await inizioMese(db), adesso = oggi();
  const spese = righe.some((r) => r.spesa_id) ? await speseDelMese(db, periodo(meseDi(adesso, inizio), inizio)) : [];
  const nodi = new Map<string, Cesta>();
  for (const r of righe) {
    nodi.set(r.id, { ...r, versato: '0.00', saldo: '0.00', traguardo_effettivo: null, percentuale: null, spesa: null, manca: null, mesi: null, al_mese: null, traguardi: [], figli: [] });
  }
  const radici: Cesta[] = [];
  for (const n of nodi.values()) {
    const padre = n.padre_id ? nodi.get(n.padre_id) : undefined;
    if (padre) padre.figli.push(n); else radici.push(n);
  }

  // La prossima volta che cade la spesa: la prossima uscita da oggi, saltando quella già spuntata nel suo mese (togliendo la spunta torna).
  // Spesa una tantum già spuntata: niente più data (pagata).
  const prossima = async (s: (typeof spese)[number]): Promise<{ data: string | null; pagata: boolean }> => {
    let da = adesso;
    for (let i = 0; i < 3; i++) {
      const data = prossimaUscita(s.prossima_scadenza, s.ogni_mesi, da, s.senza_giorno, inizio, s.giorno_mese);
      const mese = meseDi(data, inizio), p = periodo(mese, inizio);
      const spuntata = (await db.query('select 1 from spunte where spesa_prevista_id = $1 and data between $2 and $3', [s.id, p.dal, p.al])).rowCount;
      if (!spuntata) return { data, pagata: false };
      if (s.ogni_mesi === null) return { data: null, pagata: true };
      da = periodo(spostaMese(mese, s.ogni_mesi), inizio).dal;
    }
    return { data: null, pagata: true };
  };

  const calcola = async (n: Cesta): Promise<void> => {
    for (const f of n.figli) await calcola(f);
    const propria = propri.get(n.id) ?? 0;
    const saldo = propria + n.figli.reduce((t, f) => t + Number(f.saldo), 0);
    n.versato = cent(propria); n.saldo = cent(saldo);
    let traguardo: number | null;
    const s = n.spesa_id ? spese.find((x) => x.id === n.spesa_id) : undefined;
    if (s) {
      const { data, pagata } = await prossima(s);
      const cifra = Number(s.mia_quota);
      const manca = pagata ? 0 : Math.max(0, cifra - saldo);
      const mesi = data ? mesiFino(data, adesso, inizio) : null;
      n.spesa = { id: s.id, nome: s.nome, importo: cent(cifra), scadenza: data && s.senza_giorno ? `${meseDi(data, inizio)}-01` : data, senza_giorno: s.senza_giorno && s.ogni_mesi !== 1, ogni_mesi: s.ogni_mesi, pagata };
      n.manca = cent(manca); n.mesi = mesi; n.al_mese = mesi ? cent(manca / mesi) : cent(0);
      traguardo = cifra;
    } else {
      const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo_effettivo ?? 0), 0);
      traguardo = n.traguardo !== null ? Number(n.traguardo) : daFigli > 0 ? daFigli : null;
    }
    n.traguardo_effettivo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(saldo, traguardo) : null;
    n.traguardi = traguardi.filter((t) => t.cesta_id === n.id).map(({ cesta_id: _, ...t }) => ({ ...t, percentuale: percento(Math.max(0, saldo), Number(t.importo)) }));
  };
  for (const r of radici) await calcola(r);
  return radici;
}

export function trova(radici: Cesta[], id: string): Cesta | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}

// Quando una spesa collegata a una cesta si spunta: la cesta scende della quota di chi spunta (`mia`), ma non sotto zero; se contiene meno,
// si svuota e il resto esce dai liberi (cioè non si fa nulla: i liberi sono saldo - ceste). Lo spostamento è legato alla spunta: togliendo la
// spunta sparisce e la cesta torna com'era.
export async function scalaCestaDellaSpesa(db: PoolClient, spesaId: string, spunta: string, mia: number, descrizione: string): Promise<void> {
  if (mia < 0.005) return;
  const cesta = (await db.query<{ id: string; conto_id: string }>('select id, conto_id from ceste where spesa_id = $1', [spesaId])).rows[0];
  if (!cesta) return;
  await db.query('select 1 from conti where id = $1 for update', [cesta.conto_id]);
  const dentro = Number((await db.query<{ v: string }>(
    `select coalesce(sum(case when a_cesta_id = $1 then importo else -importo end), 0)::text as v from spostamenti_ceste where a_cesta_id = $1 or da_cesta_id = $1`, [cesta.id])).rows[0].v);
  const quanto = Math.min(Math.max(0, dentro), mia);
  if (quanto < 0.005) return;
  await db.query(
    `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, descrizione, spunta_id) values (fp_me(), $1, null, $2, $3, $4)`,
    [cesta.id, cent(quanto), descrizione, spunta]);
}
