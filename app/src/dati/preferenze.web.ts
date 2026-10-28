// Sul web le preferenze stanno nella memoria del browser, come la sessione.
const CHIAVE_TEMA = 'brokenbroker.tema';

export type SceltaTema = 'sistema' | 'scuro' | 'chiaro';

export async function leggiTema(): Promise<SceltaTema> {
  try {
    const v = localStorage.getItem(CHIAVE_TEMA);
    return v === 'scuro' || v === 'chiaro' ? v : 'sistema';
  } catch { return 'sistema'; }
}
export async function salvaTema(scelta: SceltaTema): Promise<void> {
  try { localStorage.setItem(CHIAVE_TEMA, scelta); } catch { /* la scelta vale finché la pagina resta aperta */ }
}

// L'ultima scelta fatta in una pagina (per esempio il conto guardato), per riaprirla uguale. null la dimentica.
export async function leggiScelta(chiave: string): Promise<string | null> {
  try { return localStorage.getItem(`brokenbroker.scelta.${chiave}`); } catch { return null; }
}
export async function salvaScelta(chiave: string, valore: string | null): Promise<void> {
  try {
    if (valore === null) localStorage.removeItem(`brokenbroker.scelta.${chiave}`);
    else localStorage.setItem(`brokenbroker.scelta.${chiave}`, valore);
  } catch { /* la scelta vale finché la pagina resta aperta */ }
}
