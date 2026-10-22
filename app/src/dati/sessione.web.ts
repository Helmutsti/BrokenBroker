// Sul web il codice di accesso sta nella memoria del browser (decisione 22).
const CHIAVE = 'brokenbroker.sessione';

export async function leggiToken(): Promise<string | null> {
  try { return localStorage.getItem(CHIAVE); } catch { return null; }
}
export async function salvaToken(token: string): Promise<void> {
  try { localStorage.setItem(CHIAVE, token); } catch { /* memoria non disponibile: l'accesso dura finché la pagina resta aperta */ }
}
export async function cancellaToken(): Promise<void> {
  try { localStorage.removeItem(CHIAVE); } catch { /* niente da cancellare */ }
}
