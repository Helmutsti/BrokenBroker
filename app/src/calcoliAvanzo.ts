// Calcoli puri dell'Avanzo (decisioni 51, 54 e 57), senza import: li provano anche le prove dell'API (api/prove/prove-funzioni.mjs).
// Gli importi sono numeri in euro.
//
// AVANZO = soldi liberi di oggi − quello che deve ancora uscire + correzione dei giroconti.
//
// Regola di Manuel (decisione 57): «dovrei monitorare sempre e solo un conto, l'avanzo dovrebbe scendere solo se i soldi escono altrove».
// Un GIROCONTO (soldi spostati da un conto a un altro, qualsiasi, anche scritto a mano in Movimenti) NON cambia mai l'Avanzo, né con «Tutti
// i conti» né con un conto scelto: il saldo reale si muove (il conto di partenza scende, quello di arrivo sale: «Sul conto oggi» e i
// Liberi restano quelli reali), ma per l'Avanzo i soldi spostati restano del conto di partenza. Perciò, per i giroconti DEL MESE:
//  - per il conto di partenza si RISOMMANO (+importo);
//  - per il conto di arrivo si SOTTRAGGONO (−importo);
//  - con «Tutti i conti» partenza e arrivo sono dentro tutti e due e le due correzioni si annullano.
// Le uscite (spese, rate, uscite a mano) contano sul conto da cui escono: l'Avanzo scende solo quando i soldi escono davvero.
// I budget (decisioni 57 e 58) sono solo una lente sui movimenti di una categoria: non pesano su nessun totale (né «Usciti», né «Devono uscire», né l'Avanzo).

export type GirocontiConto = { usciti: string; entrati: string };

// La correzione da sommare all'Avanzo per i giroconti del mese dei conti considerati (`conti`: gli id dei conti da cui parte il saldo; con
// «Tutti i conti» sono tutti quelli con un saldo, con un conto scelto è lui solo) e quanto si sono mossi (`mossi`: usciti + entrati, solo per
// dirlo sotto l'Avanzo quando si guarda un conto). `perConto` arriva da `giroconti_per_conto` di /analisi/mese.
export function correzioneGiroconti(conti: string[], perConto: Record<string, GirocontiConto | undefined> | undefined): { correzione: number; mossi: number } {
  let correzione = 0, mossi = 0;
  for (const id of conti) {
    const g = perConto?.[id];
    if (!g) continue;
    const usciti = Number(g.usciti), entrati = Number(g.entrati);
    correzione += usciti - entrati;
    mossi += usciti + entrati;
  }
  return { correzione, mossi };
}

// Quanto è uscito a mano nel mese, per il riquadro «Usciti» (decisione 58): le uscite scritte in Movimenti (verso «Niente»), non quelle delle
// spunte (già contate dalle spunte). `perConto` arriva da `uscite_a_mano_per_conto` di /analisi/mese: con «Tutti i conti» (`conto` nullo) si
// somma tutto, anche le uscite senza conto; con un conto scelto, solo quelle partite da lui. Non entra mai in «Devono uscire» né nell'Avanzo.
export function usciteAMano(perConto: Record<string, { totale: string; quante: number }> | undefined, conto: string | null): { totale: number; quante: number } {
  const voci = Object.entries(perConto ?? {}).filter(([k]) => conto === null || k === conto).map(([, x]) => x);
  return { totale: voci.reduce((t, x) => t + Number(x.totale), 0), quante: voci.reduce((t, x) => t + x.quante, 0) };
}
