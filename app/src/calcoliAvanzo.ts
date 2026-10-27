// Quanto pesa un budget su «Devono uscire», «Usciti» e «Avanzo» (decisione 48). Calcoli puri, senza import: li provano anche
// le prove dell'API (api/prove/prove-funzioni.mjs). Gli importi sono numeri in euro.
//
// «Sposto i soldi»: il budget è un giroconto dal conto di partenza a quello di arrivo. Finché non è spuntato esce dalla
// partenza («devono uscire») ed entra nell'arrivo («in arrivo»); spuntato è già nei saldi. Con «Tutti i conti» partenza e
// arrivo sono dentro tutti e due: uscita e arrivo si annullano e l'Avanzo non cambia; con un conto scelto conta come uscita
// se è la partenza, come entrata se è l'arrivo. Senza i due conti impostati non muove nulla: conta, come prima, solo in
// «Tutti i conti» (quota intera finché non è spuntato).
// «Conto le uscite»: devono uscire = quanto resta del tetto (tetto − speso, minimo 0); le uscite già registrate sono nel saldo.
// Con un conto scelto il resto non si può attribuire a un conto, quindi non conta; «usciti» è quanto speso da quel conto.

export type BudgetPerAvanzo = {
  budget_modo: 'sposto' | 'conto' | null; uscita: boolean; importo: string; mia_quota: string; mia_percentuale: number;
  conto_partenza_id: string | null; conto_arrivo_id: string | null;
  speso: string | null; speso_per_conto: Record<string, string> | null;
};

export type PesoBudget = { daUscire: number; inArrivo: number; uscito: number; daSpuntare: boolean };

export function pesoBudget(b: BudgetPerAvanzo, conto: string | null): PesoBudget {
  const zero: PesoBudget = { daUscire: 0, inArrivo: 0, uscito: 0, daSpuntare: false };
  if (b.budget_modo === 'conto') {
    const quota = b.mia_percentuale / 100;
    if (conto === null) {
      const speso = Number(b.speso ?? 0);
      return { ...zero, daUscire: Math.max(0, Number(b.importo) - speso) * quota, uscito: speso * quota };
    }
    return { ...zero, uscito: Number(b.speso_per_conto?.[conto] ?? 0) };
  }
  const quota = Number(b.mia_quota);
  if (b.conto_partenza_id && b.conto_arrivo_id) {
    const esce = conto === null || b.conto_partenza_id === conto, entra = conto === null || b.conto_arrivo_id === conto;
    return b.uscita
      ? { ...zero, uscito: esce ? quota : 0 }
      : { daUscire: esce ? quota : 0, inArrivo: entra ? quota : 0, uscito: 0, daSpuntare: esce || entra };
  }
  if (conto !== null) return zero;
  return b.uscita ? { ...zero, uscito: quota } : { ...zero, daUscire: quota, daSpuntare: true };
}
