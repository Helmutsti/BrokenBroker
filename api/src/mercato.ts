// Ricerca di un titolo sui mercati, per ISIN, ticker o nome.
// - Yahoo Finance (ricerca pubblica, senza chiave, non ufficiale): trova per ISIN,
//   ticker o nome e dà il simbolo di borsa (es. SWDA.MI).
// - OpenFIGI (gratuito, senza chiave): dato un ISIN dà nome e ticker; serve se
//   Yahoo non risponde.
// Nessun dato dell'utente esce: si invia solo il testo cercato.

export type TitoloMercato = { isin: string | null; ticker: string | null; simbolo: string | null; nome: string; tipo: string; borsa: string | null };

const pareIsin = (q: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(q.toUpperCase());
const tipoDa = (t: string | undefined) => {
  const x = (t ?? '').toUpperCase();
  if (x === 'ETF' || x === 'ETP' || x === 'MUTUALFUND' || x.includes('FUND')) return 'etf';
  if (x === 'EQUITY' || x.includes('COMMON STOCK')) return 'azione';
  if (x === 'CRYPTOCURRENCY') return 'crypto';
  if (x.includes('BOND')) return 'obbligazione';
  return 'altro';
};
// Borse di OpenFIGI → suffisso Yahoo e nome.
const BORSE: Record<string, [string, string]> = { IM: ['.MI', 'Milano'], LN: ['.L', 'Londra'], GY: ['.DE', 'Xetra'], GR: ['.F', 'Francoforte'], NA: ['.AS', 'Amsterdam'], FP: ['.PA', 'Parigi'], SW: ['.SW', 'Zurigo'], US: ['', 'Stati Uniti'] };
const NOMI_BORSE: Record<string, string> = { Milan: 'Milano', London: 'Londra', XETRA: 'Xetra', Frankfurt: 'Francoforte', Amsterdam: 'Amsterdam', Paris: 'Parigi', 'Swiss Exchange': 'Zurigo', Swiss: 'Zurigo' };
// Prima le borse dove compra di solito chi vive in Italia.
const ordineBorsa = (b: string | null) => ['Milano', 'Xetra', 'Amsterdam', 'Parigi', 'Londra'].indexOf(b ?? '') + 1 || 99;

async function json(url: string, opzioni: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...opzioni, signal: AbortSignal.timeout(6000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function daYahoo(q: string): Promise<TitoloMercato[]> {
  const j = await json(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const quotes: Record<string, string>[] = Array.isArray(j?.quotes) ? j.quotes : [];
  // Le sedi di negoziazione secondarie (sigle come CXE, AQS, DXE) confondono: si tengono le borse.
  return quotes.filter((x) => x.symbol && x.isYahooFinance !== 'false' && ['ETF', 'EQUITY', 'MUTUALFUND', 'CRYPTOCURRENCY'].includes(x.quoteType) && !/^[A-Z]{3}$/.test(x.exchDisp ?? '')).map((x) => ({
    isin: pareIsin(q) ? q.toUpperCase() : null, ticker: x.symbol.split('.')[0], simbolo: x.symbol, nome: x.longname || x.shortname || x.symbol,
    tipo: tipoDa(x.quoteType), borsa: NOMI_BORSE[x.exchDisp] ?? x.exchDisp ?? null,
  }));
}

async function daOpenFigi(isin: string): Promise<TitoloMercato[]> {
  const j = await json('https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]) });
  const dati: Record<string, string>[] = Array.isArray(j?.[0]?.data) ? j[0].data : [];
  return dati.filter((x) => BORSE[x.exchCode]).map((x) => ({
    isin, ticker: x.ticker, simbolo: x.ticker + BORSE[x.exchCode][0], borsa: BORSE[x.exchCode][1], tipo: tipoDa(x.securityType),
    nome: x.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMsci\b/g, 'MSCI').replace(/\bEtf\b/g, 'ETF').replace(/\bIshares\b/g, 'iShares'),
  }));
}

export async function cercaSulMercato(q: string): Promise<TitoloMercato[]> {
  // Per un ISIN Yahoo dà spesso una sola borsa: si aggiungono quelle di OpenFIGI.
  const [yahoo, figi] = await Promise.all([daYahoo(q), pareIsin(q) ? daOpenFigi(q.toUpperCase()) : Promise.resolve([])]);
  const trovati = [...yahoo, ...figi];
  const visti = new Set<string>();
  return trovati.filter((x) => { const k = x.simbolo ?? x.nome; if (visti.has(k)) return false; visti.add(k); return true; })
    .sort((a, b) => ordineBorsa(a.borsa) - ordineBorsa(b.borsa)).slice(0, 8);
}
