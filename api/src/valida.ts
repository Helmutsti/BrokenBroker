import { ErroreApi } from './errori.ts';

// Controlli sui dati in ingresso. Ogni funzione restituisce il valore pulito,
// undefined se il campo manca (e non è obbligatorio), oppure lancia un 400.

type Corpo = Record<string, unknown>;

const errore = (campo: string, cosa: string) => new ErroreApi(400, `Il campo "${campo}" ${cosa}`);

function manca(corpo: Corpo, campo: string, obbligatorio: boolean): boolean {
  const v = corpo[campo];
  if (v === undefined || v === null || v === '') {
    if (obbligatorio) throw errore(campo, 'è obbligatorio');
    return true;
  }
  return false;
}

export function corpo(valore: unknown): Corpo {
  if (typeof valore !== 'object' || valore === null || Array.isArray(valore)) {
    throw new ErroreApi(400, 'Serve un oggetto JSON');
  }
  return valore as Corpo;
}

export function testo(c: Corpo, campo: string, obbligatorio = false, max = 200): string | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = c[campo];
  if (typeof v !== 'string') throw errore(campo, 'deve essere un testo');
  const pulito = v.trim();
  if (pulito.length > max) throw errore(campo, `supera ${max} caratteri`);
  if (obbligatorio && pulito === '') throw errore(campo, 'è obbligatorio');
  return pulito;
}

// Importi come stringa decimale con al massimo due decimali ("12.50", "-3").
export function importo(c: Corpo, campo: string, obbligatorio = false): string | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = String(c[campo]).trim();
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(v)) throw errore(campo, 'deve essere un importo, es. 12.50');
  return v;
}

export function data(c: Corpo, campo: string, obbligatorio = false): string | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = c[campo];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw errore(campo, 'deve essere una data AAAA-MM-GG');
  }
  return v;
}

const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(c: Corpo, campo: string, obbligatorio = false): string | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = c[campo];
  if (typeof v !== 'string' || !formatoUuid.test(v)) throw errore(campo, 'non è un identificativo valido');
  return v;
}

export function idPercorso(v: string): string {
  if (!formatoUuid.test(v)) throw new ErroreApi(404, 'Voce non trovata');
  return v;
}

export function intero(c: Corpo, campo: string, min: number, max: number, obbligatorio = false): number | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = Number(c[campo]);
  if (!Number.isInteger(v) || v < min || v > max) throw errore(campo, `deve essere un intero tra ${min} e ${max}`);
  return v;
}

export function booleano(c: Corpo, campo: string): boolean | undefined {
  if (c[campo] === undefined) return undefined;
  if (typeof c[campo] !== 'boolean') throw errore(campo, 'deve essere vero o falso');
  return c[campo];
}

export function scelta<T extends string>(c: Corpo, campo: string, ammessi: readonly T[], obbligatorio = false): T | undefined {
  if (manca(c, campo, obbligatorio)) return undefined;
  const v = c[campo];
  if (typeof v !== 'string' || !ammessi.includes(v as T)) throw errore(campo, `deve essere uno tra: ${ammessi.join(', ')}`);
  return v as T;
}

// Accetta null esplicito per svuotare un campo facoltativo in modifica.
export function annullabile<T>(c: Corpo, campo: string, lettore: () => T | undefined): T | null | undefined {
  if (c[campo] === null) return null;
  return lettore();
}

// Costruisce "set a = $1, b = $2" con i soli campi presenti.
export function setParziale(campi: Record<string, unknown>, primoIndice = 1): { sql: string; valori: unknown[] } {
  const voci = Object.entries(campi).filter(([, v]) => v !== undefined);
  if (voci.length === 0) throw new ErroreApi(400, 'Nessun campo da modificare');
  return {
    sql: voci.map(([k], i) => `${k} = $${i + primoIndice}`).join(', '),
    valori: voci.map(([, v]) => v),
  };
}
