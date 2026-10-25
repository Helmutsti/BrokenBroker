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
