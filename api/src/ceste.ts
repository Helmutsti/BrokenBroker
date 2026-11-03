import type { PoolClient } from 'pg';
import { inizioMese, mesiFino, meseDi, oggi, periodo, prossimaUscita, spostaMese } from './periodo.ts';
import { scadenzaPagata, speseDelMese, spunteDellaSpesa } from './spese.ts';

// I salvadanai (decisione 72; la tabella si chiama `ceste`): liberi, cioè non stanno in nessun conto, e annidabili (il padre ne fa la somma).
// Non abbassano il saldo né l'avanzo: quanto c'è dentro lo dicono solo gli spostamenti (spostamenti_ceste), con il lato vuoto (null) che
// vuol dire «fuori da ogni salvadanaio». `versato` è la parte propria, `dentro` comprende i sotto-salvadanai.
// Un salvadanaio può essere collegato a una spesa annuale o una tantum («Metti da parte», spesa_id): vive dentro «Spese annuali», nome, traguardo
// (la tua quota della prossima scadenza) e data (la prossima scadenza) vengono dalla spesa e si cambiano solo da lì.

export const NOME_SPESE_ANNUALI = 'Spese annuali';

// `scadenza` è la prossima volta che cade (con `senza_giorno` conta solo il mese: il giorno è il primo del mese personale scritto).
export type SpesaDelSalvadanaio = { id: string; nome: string; importo: string; scadenza: string | null; senza_giorno: boolean; ogni_mesi: number | null; pagata: boolean };

export type Salvadanaio = {
  id: string; padre_id: string | null; nome: string; icona: string; spesa_id: string | null; collegato: boolean;
  versato: string; dentro: string;
  // Il traguardo che vale (scritto, o la tua quota della spesa collegata, o la somma di quelli dei sotto-salvadanai) e quello scritto a mano.
  traguardo: string | null; traguardo_scritto: string | null; scadenza: string | null; percentuale: number | null;
  // Quanto manca al traguardo; con traguardo e data: i mesi (almeno 1) fino alla data e quanto mettere al mese.
  mancano: string | null; mesi: number | null; metti_al_mese: string | null;
  spesa: SpesaDelSalvadanaio | null;
  traguardi: { id: string; nome: string; importo: string; ordine: number; percentuale: number }[];
  figli: Salvadanaio[];
};

export const cent = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const percento = (parte: number, tutto: number) => Math.min(100, Math.round((parte / tutto) * 100));

type Riga = { id: string; padre_id: string | null; nome: string; icona: string; traguardo: string | null; scadenza: string | null; spesa_id: string | null };

// L'albero di tutti i salvadanai di chi chiede, in cima quelli senza salvadanaio superiore.
export async function alberoSalvadanai(db: PoolClient): Promise<Salvadanaio[]> {
  const righe = (await db.query<Riga>(
    `select id, padre_id, nome, icona, traguardo::text as traguardo, scadenza::text as scadenza, spesa_id from ceste order by nome`)).rows;
  const propri = new Map((await db.query<{ id: string; v: string }>(
    `select id, sum(v)::text as v from (select a_cesta_id as id, importo as v from spostamenti_ceste where a_cesta_id is not null
                                        union all select da_cesta_id, -importo from spostamenti_ceste where da_cesta_id is not null) x group by id`)).rows.map((r) => [r.id, Number(r.v)]));
  const traguardi = (await db.query(
    `select id, cesta_id, nome, importo::text as importo, ordine from traguardi_copertura order by ordine, importo`)).rows;

  const inizio = await inizioMese(db), adesso = oggi();
  const spese = righe.some((r) => r.spesa_id) ? await speseDelMese(db, periodo(meseDi(adesso, inizio), inizio)) : [];
  const nodi = new Map<string, Salvadanaio>();
  for (const r of righe) {
    nodi.set(r.id, {
      id: r.id, padre_id: r.padre_id, nome: r.nome, icona: r.icona, spesa_id: r.spesa_id, collegato: r.spesa_id !== null,
      versato: '0.00', dentro: '0.00', traguardo: null, traguardo_scritto: r.traguardo, scadenza: r.scadenza, percentuale: null,
      mancano: null, mesi: null, metti_al_mese: null, spesa: null, traguardi: [], figli: [],
    });
  }
  const radici: Salvadanaio[] = [];
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
      const mese = meseDi(data, inizio);
      // Pagata anche in anticipo: una spunta fatta prima vale per la scadenza giusta (spunte.per_mese), e la prossima è quella dopo.
      if (!scadenzaPagata(await spunteDellaSpesa(db, s.id), mese, inizio)) return { data, pagata: false };
      if (s.ogni_mesi === null) return { data: null, pagata: true };
      da = periodo(spostaMese(mese, s.ogni_mesi), inizio).dal;
    }
    return { data: null, pagata: true };
  };

  const calcola = async (n: Salvadanaio): Promise<void> => {
    for (const f of n.figli) await calcola(f);
    const propria = propri.get(n.id) ?? 0;
    const dentro = propria + n.figli.reduce((t, f) => t + Number(f.dentro), 0);
    n.versato = cent(propria); n.dentro = cent(dentro);
    let traguardo: number | null;
    let pagata = false;
    const s = n.spesa_id ? spese.find((x) => x.id === n.spesa_id) : undefined;
    if (s) {
      const { data, pagata: p } = await prossima(s);
      pagata = p;
      traguardo = Number(s.mia_quota);
      n.nome = s.nome;
      n.scadenza = data && s.senza_giorno ? `${meseDi(data, inizio)}-01` : data;
      n.spesa = { id: s.id, nome: s.nome, importo: cent(traguardo), scadenza: n.scadenza, senza_giorno: s.senza_giorno && s.ogni_mesi !== 1, ogni_mesi: s.ogni_mesi, pagata };
    } else {
      const daFigli = n.figli.reduce((t, f) => t + Number(f.traguardo ?? 0), 0);
      traguardo = n.traguardo_scritto !== null ? Number(n.traguardo_scritto) : daFigli > 0 ? daFigli : null;
    }
    n.traguardo = traguardo === null ? null : cent(traguardo);
    n.percentuale = traguardo ? percento(Math.max(0, dentro), traguardo) : null;
    if (traguardo !== null) {
      const manca = pagata ? 0 : Math.max(0, traguardo - dentro);
      n.mancano = cent(manca);
      if (n.scadenza) {
        n.mesi = mesiFino(n.scadenza, adesso, inizio);
        n.metti_al_mese = cent(manca / n.mesi);
      }
    }
    n.traguardi = traguardi.filter((t) => t.cesta_id === n.id).map(({ cesta_id: _, ...t }) => ({ ...t, percentuale: percento(Math.max(0, dentro), Number(t.importo)) }));
  };
  for (const r of radici) await calcola(r);
  return radici;
}

export function trova(radici: Salvadanaio[], id: string): Salvadanaio | undefined {
  for (const n of radici) {
    if (n.id === id) return n;
    const f = trova(n.figli, id);
    if (f) return f;
  }
  return undefined;
}

// Quanto c'è nella parte propria di un salvadanaio (senza i sotto-salvadanai).
export async function versatoProprio(db: PoolClient, id: string): Promise<number> {
  return Number((await db.query<{ v: string }>(
    `select coalesce(sum(case when a_cesta_id = $1 then importo else -importo end), 0)::text as v from spostamenti_ceste where a_cesta_id = $1 or da_cesta_id = $1`, [id])).rows[0].v);
}

// «Spese annuali»: il salvadanaio in cima con questo nome (il più vecchio); se manca si crea.
export async function assicuraSpeseAnnuali(db: PoolClient): Promise<string> {
  const c = (await db.query<{ id: string }>(
    `select id from ceste where padre_id is null and nome = $1 and proprietario_id = fp_me() order by creata_il, id limit 1`, [NOME_SPESE_ANNUALI])).rows[0];
  if (c) return c.id;
  return (await db.query<{ id: string }>(
    `insert into ceste (proprietario_id, nome, icona) values (fp_me(), $1, 'calendar-clock') returning id`, [NOME_SPESE_ANNUALI])).rows[0].id;
}

// «Metti da parte» acceso: la spesa ha il suo salvadanaio dentro «Spese annuali» (uno solo). Se c'è già, ne segue il nome.
export async function accendiMettiDaParte(db: PoolClient, spesa: { id: string; nome: string }): Promise<void> {
  const c = (await db.query<{ id: string }>('select id from ceste where spesa_id = $1', [spesa.id])).rows[0];
  if (c) { await db.query('update ceste set nome = $2 where id = $1', [c.id, spesa.nome]); return; }
  const padre = await assicuraSpeseAnnuali(db);
  await db.query(`insert into ceste (proprietario_id, padre_id, nome, icona, spesa_id) values (fp_me(), $1, $2, 'piggy-bank', $3)`, [padre, spesa.nome, spesa.id]);
}

// «Metti da parte» spento (o spesa eliminata): i soldi del salvadanaio collegato vanno nel salvadanaio che lo contiene («Spese annuali») e
// il salvadanaio sparisce.
export async function spegniMettiDaParte(db: PoolClient, spesaId: string): Promise<void> {
  const c = (await db.query<{ id: string }>('select id from ceste where spesa_id = $1', [spesaId])).rows[0];
  if (c) await eliminaSalvadanaio(db, c.id);
}

// Eliminando un salvadanaio: i sotto-salvadanai salgono in quello che lo conteneva (con i loro soldi, che stanno su di loro) e i suoi soldi
// propri vanno lì; se era in cima, escono da ogni salvadanaio.
export async function eliminaSalvadanaio(db: PoolClient, id: string): Promise<void> {
  const n = (await db.query<{ padre_id: string | null; nome: string }>('select padre_id, nome from ceste where id = $1 for update', [id])).rows[0];
  if (!n) return;
  const propria = await versatoProprio(db, id);
  await db.query('update ceste set padre_id = $2 where padre_id = $1', [id, n.padre_id]);
  // Prima si scrive l'entrata nel padre, poi si cancella il salvadanaio: con lui spariscono i suoi spostamenti, compreso quello in uscita.
  if (n.padre_id && propria >= 0.005) {
    await db.query(
      `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, descrizione) values (fp_me(), null, $1, $2, $3)`,
      [n.padre_id, cent(propria), `Da «${n.nome}», eliminato`]);
  }
  await db.query('delete from ceste where id = $1', [id]);
}

// Quando una spesa collegata a un salvadanaio si spunta: il salvadanaio scende della quota di chi spunta (`mia`), ma non sotto zero (se
// contiene meno, si svuota). Lo spostamento è legato alla spunta: togliendo la spunta sparisce e il salvadanaio torna com'era.
export async function scalaSalvadanaioDellaSpesa(db: PoolClient, spesaId: string, spunta: string, mia: number, descrizione: string): Promise<void> {
  if (mia < 0.005) return;
  const c = (await db.query<{ id: string }>('select id from ceste where spesa_id = $1 for update', [spesaId])).rows[0];
  if (!c) return;
  const quanto = Math.min(Math.max(0, await versatoProprio(db, c.id)), mia);
  if (quanto < 0.005) return;
  await db.query(
    `insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, descrizione, spunta_id) values (fp_me(), $1, null, $2, $3, $4)`,
    [c.id, cent(quanto), descrizione, spunta]);
}
