import { useCallback, useEffect, useRef, useState } from 'react';
import { INDIRIZZO_API } from './indirizzo';
import { leggiToken } from './sessione';

// Chiamate all'API con il codice di accesso. Dopo ogni modifica tutte le
// schermate aperte ricaricano i loro dati.

export class ErroreRichiesta extends Error {
  stato: number;
  constructor(stato: number, messaggio: string) { super(messaggio); this.stato = stato; }
}

let quandoScade: (() => void) | null = null;
export const allaScadenza = (fn: () => void) => { quandoScade = fn; };

const ascoltatori = new Set<() => void>();
export const notificaCambio = () => ascoltatori.forEach((fn) => fn());

export async function richiesta<T>(metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', percorso: string, corpo?: unknown): Promise<T> {
  const token = await leggiToken();
  let risposta: Response;
  try {
    risposta = await fetch(INDIRIZZO_API + percorso, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroreRichiesta(0, 'Non riesco a raggiungere il server. Controlla la connessione.');
  }
  const testo = await risposta.text();
  const json = testo ? JSON.parse(testo) : null;
  if (!risposta.ok) {
    if (risposta.status === 401 && token) quandoScade?.();
    throw new ErroreRichiesta(risposta.status, json?.errore ?? 'Qualcosa non ha funzionato');
  }
  if (metodo !== 'GET') notificaCambio();
  return json as T;
}

export const leggi = <T>(p: string) => richiesta<T>('GET', p);
export const crea = <T>(p: string, corpo: unknown = {}) => richiesta<T>('POST', p, corpo);
export const modifica = <T>(p: string, corpo: unknown) => richiesta<T>('PATCH', p, corpo);
export const sostituisci = <T>(p: string, corpo: unknown) => richiesta<T>('PUT', p, corpo);
export const cancella = (p: string) => richiesta<null>('DELETE', p);

// Dati di una schermata: si caricano all'apertura e dopo ogni modifica.
export function useDati<T>(percorso: string | null) {
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const ultimo = useRef(0);
  const carica = useCallback(async () => {
    if (!percorso) return;
    const giro = ++ultimo.current;
    try {
      const r = await leggi<T>(percorso);
      if (giro === ultimo.current) { setDati(r); setErrore(null); }
    } catch (e) {
      if (giro === ultimo.current) setErrore((e as Error).message);
    }
  }, [percorso]);
  useEffect(() => { carica(); ascoltatori.add(carica); return () => { ascoltatori.delete(carica); }; }, [carica]);
  return { dati, errore, ricarica: carica };
}
