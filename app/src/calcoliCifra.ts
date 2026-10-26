// Calcoli puri della finestra della cifra di un salvadanaio (decisione 46). Nessun import: li usano
// anche le prove dell'API (api/prove/prove-funzioni.mjs). Gli importi sono numeri in euro, arrotondati ai centesimi.

type Cifre = {
  saldo: string; versato: string; traguardo_effettivo: string | null;
  paga_spesa: { importo: string; ogni_mesi: number } | null;
};

export const arrotonda = (n: number) => Math.round(n * 100) / 100;

// «Riempi»: quanto manca al traguardo (anche zero o negativo se è già pieno). Senza traguardo: null, il pulsante non compare.
export const mancaAlTraguardo = (o: Pick<Cifre, 'saldo' | 'traguardo_effettivo'>): number | null =>
  o.traguardo_effettivo === null ? null : arrotonda(Number(o.traguardo_effettivo) - Number(o.saldo));

// «Metti 1/12»: la quota mensile della spesa periodica che il salvadanaio paga (importo / ogni_mesi, come in Salvadanai);
// altrimenti il traguardo diviso 12. Senza spesa e senza traguardo: null.
export const quotaMensileSalvadanaio = (o: Pick<Cifre, 'traguardo_effettivo' | 'paga_spesa'>): number | null =>
  o.paga_spesa ? arrotonda(Number(o.paga_spesa.importo) / o.paga_spesa.ogni_mesi)
    : o.traguardo_effettivo !== null ? arrotonda(Number(o.traguardo_effettivo) / 12) : null;

// I «liberi» di un salvadanaio: la parte messa direttamente in lui, non nei sotto-salvadanai (`versato`).
export const liberiDi = (o: Pick<Cifre, 'versato'>) => arrotonda(Number(o.versato));

export type PianoCifra = {
  differenza: number | null;        // quanto cambia la parte propria (positivo = entra, negativo = esce)
  sposta: boolean;                  // true se i soldi passano dai/ai liberi del salvadanaio superiore
  errore: { tipo: 'liberi' | 'propria'; massimo: number } | null; // il limite superato: l'app scrive il messaggio
  restanoLiberi: number | null;     // liberi del superiore dopo lo spostamento
};

// Cosa succede con la cifra scritta. `modo`: 'cifra' (scrivi la cifra di oggi), 'aggiungi' o 'togli'.
// `daLiberi`: solo per un sotto-salvadanaio (conosciamo i liberi del padre): in aggiunta i soldi arrivano dai liberi del superiore,
// in 'togli' tornano nei liberi del superiore.
export function pianoCifra(p: { modo: 'cifra' | 'aggiungi' | 'togli'; valore: number | null; saldo: number; propria: number; daLiberi: boolean; liberiPadre: number | null }): PianoCifra {
  const differenza = p.valore === null ? null : arrotonda(p.modo === 'cifra' ? p.valore - p.saldo : p.modo === 'aggiungi' ? p.valore : -p.valore);
  const sposta = p.daLiberi && p.liberiPadre !== null && differenza !== null && Math.abs(differenza) >= 0.005 && (p.modo === 'togli' ? differenza < 0 : differenza > 0);
  let errore: PianoCifra['errore'] = null;
  if (differenza !== null) {
    if (differenza > 0 && sposta && p.liberiPadre !== null && differenza > p.liberiPadre + 0.005) errore = { tipo: 'liberi', massimo: Math.max(0, p.liberiPadre) };
    else if (differenza < 0 && arrotonda(p.propria + differenza) < -0.005) errore = { tipo: 'propria', massimo: p.propria };
  }
  const restanoLiberi = sposta && p.liberiPadre !== null ? arrotonda(p.liberiPadre - differenza!) : null;
  return { differenza, sposta, errore, restanoLiberi };
}
