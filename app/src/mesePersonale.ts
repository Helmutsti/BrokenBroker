// Il mese personale è l'unico "mese" dell'app (decisione 41): parte dal giorno `inizio` delle Impostazioni
// e finisce il giorno prima dello stesso giorno del mese dopo. Stesso comportamento di api/src/periodo.ts.
// Una voce con giorno cade nel mese personale che contiene la data; una voce senza giorno ("marzo") vale
// per tutto il mese personale di marzo. Il ciclo si conta sempre per mesi personali interi.

const pad = (n: number) => String(n).padStart(2, '0');
const giorniNelMese = (anno: number, mese0: number) => new Date(Date.UTC(anno, mese0 + 1, 0)).getUTCDate();

export const aggiungiMesi = (iso: string, n: number) => {
  const [a, m, g] = iso.split('-').map(Number);
  const t = a * 12 + (m - 1) + n, aa = Math.floor(t / 12), mm = t % 12;
  return `${aa}-${pad(mm + 1)}-${pad(Math.min(g, giorniNelMese(aa, mm)))}`;
};

// "AAAA-MM" spostato di n mesi.
export function spostaChiave(mese: string, n: number): string {
  const [a, m] = mese.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

// Mesi tra due chiavi "AAAA-MM" (b - a).
export const mesiTraChiavi = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

// Il mese personale "AAAA-MM" che contiene una data.
export function meseDi(data: string, inizio: number): string {
  const mese = data.slice(0, 7);
  return Number(data.slice(8, 10)) >= inizio ? mese : spostaChiave(mese, -1);
}

// Primo e ultimo giorno del mese personale "AAAA-MM".
export function periodoDi(mese: string, inizio: number): { dal: string; al: string } {
  const dal = `${mese}-${pad(inizio)}`;
  const fine = new Date(`${aggiungiMesi(dal, 1)}T00:00:00Z`);
  fine.setUTCDate(fine.getUTCDate() - 1);
  return { dal, al: fine.toISOString().slice(0, 10) };
}
export const fineMese = (mese: string, inizio: number) => periodoDi(mese, inizio).al;

// Il mese personale di una data salvata di una spesa: senza giorno è il mese scritto.
export const meseDiVoce = (data: string, senzaGiorno: boolean, inizio: number) => (senzaGiorno ? data.slice(0, 7) : meseDi(data, inizio));

// La data del giorno `giorno` dentro il mese personale `mese` (all'ultimo giorno se il mese è più corto).
export function dataNelMese(mese: string, giorno: number, inizio: number): string {
  const base = giorno >= inizio ? mese : spostaChiave(mese, 1);
  const [a, m] = base.split('-').map(Number);
  return `${base}-${pad(Math.min(giorno, giorniNelMese(a, m - 1)))}`;
}

type VoceDatata = { prossima_scadenza: string | null; ogni_mesi: number | null; senza_giorno: boolean };

// Prossima occorrenza da `da` (il mese personale di `da` conta ancora, anche se il giorno è già passato).
// Con giorno: la data di quel giorno nel mese; senza giorno: l'inizio del mese personale (vale tutto il mese).
// Passa alla successiva solo a mese personale finito. Una volta sola e già passata: null.
export function proxOccorrenza(s: VoceDatata, da: string, inizio: number): string | null {
  if (!s.prossima_scadenza) return null;
  const primo = meseDiVoce(s.prossima_scadenza, s.senza_giorno, inizio), ora = meseDi(da, inizio);
  const arretrati = mesiTraChiavi(primo, ora);
  let mese = primo;
  if (arretrati > 0) {
    if (!s.ogni_mesi) return null;
    mese = spostaChiave(primo, Math.ceil(arretrati / s.ogni_mesi) * s.ogni_mesi);
  }
  return s.senza_giorno ? periodoDi(mese, inizio).dal : dataNelMese(mese, Number(s.prossima_scadenza.slice(8, 10)), inizio);
}

// Mesi personali da `da` alla scadenza, almeno 1: il mese della scadenza conta.
export const mesiFinoScadenza = (scadenza: string, da: string, inizio: number) =>
  Math.max(1, mesiTraChiavi(meseDi(da, inizio), meseDi(scadenza, inizio)) + 1);

// Mesi personali interi passati dal mese della data `da` al mese della data `a`.
export const mesiPersonaliPassati = (da: string, a: string, inizio: number) => mesiTraChiavi(meseDi(da, inizio), meseDi(a, inizio));

// Primo mese personale in cui cade «giorno/mese» da oggi in poi (senza giorno: il mese intero); l'anno lo sceglie l'app.
// Con giorno la data è quella del giorno nel mese personale scelto; senza giorno si salva il giorno 1 (il mese è la chiave).
export function primaOccorrenzaPersonale(giorno: number | null, mese: number, oggi: string, inizio: number): string {
  const chiave = meseDi(oggi, inizio);
  const [a, m] = chiave.split('-').map(Number);
  if (giorno === null) return `${mese >= m ? a : a + 1}-${pad(mese)}-01`;
  // Il giorno scelto appartiene al mese personale che lo contiene: il mese «aprile» con inizio 10 e giorno 5 cade
  // nel mese personale di marzo. Si cerca la prima data di quel giorno e mese che non è già in un mese passato.
  for (const anno of [a - 1, a, a + 1, a + 2]) {
    const g = Math.min(giorno, giorniNelMese(anno, mese - 1));
    const data = `${anno}-${pad(mese)}-${pad(g)}`;
    if (meseDi(data, inizio) >= chiave) return data;
  }
  return `${a + 1}-${pad(mese)}-${pad(giorno)}`;
}
