import type { PoolClient } from 'pg';

// Saldi dei conti (decisione 61). I conti sono un albero: un conto con sotto-conti è il loro CONTENITORE.
//  - Il saldo scritto di un conto (con il momento in cui vale) è quello della banca e comprende i suoi sotto-conti.
//  - Dopo quel momento lo muovono le transazioni che ENTRANO o ESCONO dal contenitore; uno spostamento tra conti dello stesso contenitore
//    non ne cambia il totale.
//  - Senza saldo scritto il totale è la somma dei sotto-conti più le transazioni del conto stesso (da sempre).
//  - non_assegnato = totale − totale dei sotto-conti (la parte del contenitore che non sta in nessun sotto-conto).
// Si calcola su tutti i conti che chi chiede vede.

export type SaldoConto = { saldo: number | null; non_assegnato: number | null };
type Conto = { id: string; padre_id: string | null; saldo_scritto: string | null; saldo_scritto_il: string | null };
type Mov = { da: string | null; a: string | null; importo: string; momento: string };

const cent = (n: number) => Math.round(n * 100) / 100;

export async function saldiDeiConti(db: PoolClient): Promise<Map<string, SaldoConto>> {
  const conti = (await db.query<Conto>('select id, padre_id, saldo_scritto::text, saldo_scritto_il::text from conti')).rows;
  const mov = (await db.query<Mov>(
    `select da_conto_id as da, a_conto_id as a, importo::text, momento::text from movimenti
      where da_conto_id is not null or a_conto_id is not null`)).rows;
  const figli = new Map<string, string[]>();
  for (const c of conti) if (c.padre_id) figli.set(c.padre_id, [...(figli.get(c.padre_id) ?? []), c.id]);
  // Il sotto-albero di ogni conto (lui compreso), per sapere se una transazione entra o esce dal contenitore.
  const albero = new Map<string, Set<string>>();
  const sotto = (id: string): Set<string> => {
    let s = albero.get(id);
    if (s) return s;
    s = new Set([id]);
    for (const f of figli.get(id) ?? []) for (const x of sotto(f)) s.add(x);
    albero.set(id, s);
    return s;
  };
  const totali = new Map<string, number | null>();
  const totale = (c: Conto): number | null => {
    if (totali.has(c.id)) return totali.get(c.id)!;
    const dentro = sotto(c.id);
    let t: number | null;
    if (c.saldo_scritto !== null) {
      const dal = Date.parse(c.saldo_scritto_il!);
      t = Number(c.saldo_scritto);
      for (const m of mov) {
        if (Date.parse(m.momento) <= dal) continue;
        const esce = !!m.da && dentro.has(m.da), entra = !!m.a && dentro.has(m.a);
        if (esce && !entra) t -= Number(m.importo);
        if (entra && !esce) t += Number(m.importo);
      }
    } else {
      // Senza saldo scritto: i sotto-conti più le transazioni del conto stesso. Se nessuno ha un saldo, il saldo non c'è.
      const parti = (figli.get(c.id) ?? []).map((f) => totale(conti.find((x) => x.id === f)!));
      const proprie = mov.filter((m) => m.da === c.id || m.a === c.id);
      if (parti.every((x) => x === null) && !proprie.length) t = null;
      else t = parti.reduce<number>((s, x) => s + (x ?? 0), 0) + proprie.reduce((s, m) => s + (m.a === c.id ? 1 : -1) * Number(m.importo), 0);
    }
    totali.set(c.id, t === null ? null : cent(t));
    return totali.get(c.id)!;
  };
  const risultato = new Map<string, SaldoConto>();
  for (const c of conti) {
    const t = totale(c);
    const f = figli.get(c.id) ?? [];
    const assegnato = f.reduce((s, x) => s + (totale(conti.find((k) => k.id === x)!) ?? 0), 0);
    risultato.set(c.id, { saldo: t, non_assegnato: t === null || !f.length ? null : cent(t - assegnato) });
  }
  return risultato;
}
