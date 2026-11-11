import type { PoolClient } from 'pg';
import { caricaDati, cent, riepilogo } from './investimenti.ts';

// Gli investimenti collegati a un salvadanaio (decisione 75): solo etichetta, nessun numero del salvadanaio cambia.
// Nome, portafoglio e valore attuale vengono da `riepilogo` (gli stessi della pagina Investimenti): qui non si ricalcola niente.
// Il valore è quello di tutta la posizione o di tutto il bene, non una quota.

export type AssetCollegato = {
  id: string; tipo: 'titolo' | 'bene'; titolo_id: string | null; portafoglio_id: string | null; bene_id: string | null;
  nome: string; portafoglio: string | null; valore: string | null; stato: string;
};

type Riga = { id: string; cesta_id: string; titolo_id: string | null; portafoglio_id: string | null; bene_id: string | null };

// Tutti gli asset di chi chiede (anche dei portafogli di prova), come la pagina Investimenti li descrive.
export async function assetDisponibili(db: PoolClient) {
  const d = await caricaDati(db);
  const r = riepilogo(d, new Set(d.portafogli.map((p) => p.id)));
  const titoli: AssetCollegato[] = r.posizioni.map((p) => ({
    id: '', tipo: 'titolo', titolo_id: p.titolo_id, portafoglio_id: p.portafoglio_id, bene_id: null,
    nome: p.nome, portafoglio: p.portafoglio, valore: p.valore, stato: p.stato,
  }));
  const beni: AssetCollegato[] = r.beni.map((b) => ({
    id: '', tipo: 'bene', titolo_id: null, portafoglio_id: b.portafoglio_id, bene_id: b.id,
    nome: b.nome, portafoglio: b.portafoglio, valore: b.valore, stato: b.stato,
  }));
  return [...titoli, ...beni];
}

const chiave = (a: { titolo_id: string | null; portafoglio_id: string | null; bene_id: string | null }) =>
  a.bene_id ? `b:${a.bene_id}` : `t:${a.titolo_id}:${a.portafoglio_id}`;

// I collegamenti di un salvadanaio con i valori di oggi e il totale (somma dei valori noti).
export async function assetDelSalvadanaio(db: PoolClient, cestaId: string) {
  const righe = (await db.query<Riga>(
    'select id, cesta_id, titolo_id, portafoglio_id, bene_id from collegamenti_asset where cesta_id = $1 and proprietario_id = fp_me() order by creato_il, id', [cestaId])).rows;
  const asset = righe.length ? new Map((await assetDisponibili(db)).map((a) => [chiave(a), a])) : new Map<string, AssetCollegato>();
  const elenco = righe.flatMap((c) => {
    const a = asset.get(chiave(c));
    return a ? [{ ...a, id: c.id }] : [];
  });
  elenco.sort((x, y) => (x.portafoglio ?? '').localeCompare(y.portafoglio ?? '', 'it') || x.nome.localeCompare(y.nome, 'it'));
  const totale = elenco.reduce((t, a) => t + Number(a.valore ?? 0), 0);
  return { totale: cent(totale), incompleto: elenco.some((a) => a.valore === null), asset: elenco };
}
