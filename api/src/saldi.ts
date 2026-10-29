import type { PoolClient } from 'pg';

// Saldi dei conti (decisioni 61 e 71). Il saldo scritto di un conto (con il momento in cui vale) è quello della banca; dopo quel momento lo
// muovono le transazioni che entrano o escono dal conto. Senza saldo scritto è la somma delle transazioni del conto (da sempre); senza
// saldo scritto e senza transazioni il saldo non c'è. Le ceste (ceste.ts) sono parti del saldo e non lo cambiano: `nelle_ceste` è quanto
// c'è in tutte le ceste del conto e `liberi` = saldo - nelle_ceste (può essere negativo; null senza saldo).
// Si calcola su tutti i conti che chi chiede vede.

export type SaldoConto = { saldo: number | null; nelle_ceste: number; liberi: number | null };
type Conto = { id: string; saldo_scritto: string | null; saldo_scritto_il: string | null };

const cent = (n: number) => Math.round(n * 100) / 100;

// Quanto c'è in tutte le ceste di ogni conto (la parte propria di ogni cesta, a qualsiasi profondità: la somma di tutte è anche quella delle
// ceste in cima con le loro sotto-ceste).
export async function nelleCeste(db: PoolClient): Promise<Map<string, number>> {
  const { rows } = await db.query<{ conto_id: string; somma: string }>(
    `select k.conto_id, sum(x.v)::text as somma
       from ceste k join (select a_cesta_id as id, importo as v from spostamenti_ceste where a_cesta_id is not null
                          union all select da_cesta_id, -importo from spostamenti_ceste where da_cesta_id is not null) x on x.id = k.id
      group by k.conto_id`);
  return new Map(rows.map((r) => [r.conto_id, Number(r.somma)]));
}

export async function saldiDeiConti(db: PoolClient): Promise<Map<string, SaldoConto>> {
  const conti = (await db.query<Conto>('select id, saldo_scritto::text, saldo_scritto_il::text from conti')).rows;
  const mov = (await db.query<{ da: string | null; a: string | null; importo: string; momento: string }>(
    `select da_conto_id as da, a_conto_id as a, importo::text, momento::text from movimenti
      where da_conto_id is not null or a_conto_id is not null`)).rows;
  const ceste = await nelleCeste(db);
  const risultato = new Map<string, SaldoConto>();
  for (const c of conti) {
    const proprie = mov.filter((m) => m.da === c.id || m.a === c.id);
    let saldo: number | null;
    if (c.saldo_scritto !== null) {
      const dal = Date.parse(c.saldo_scritto_il!);
      saldo = Number(c.saldo_scritto);
      for (const m of proprie) {
        if (Date.parse(m.momento) <= dal) continue;
        saldo += (m.a === c.id ? 1 : -1) * Number(m.importo);
      }
    } else saldo = proprie.length ? proprie.reduce((s, m) => s + (m.a === c.id ? 1 : -1) * Number(m.importo), 0) : null;
    const dentro = cent(ceste.get(c.id) ?? 0);
    risultato.set(c.id, { saldo: saldo === null ? null : cent(saldo), nelle_ceste: dentro, liberi: saldo === null ? null : cent(saldo - dentro) });
  }
  return risultato;
}
