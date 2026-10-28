// Sull'iPhone le preferenze dell'app stanno nella stessa memoria sicura della sessione (Keychain).
import * as Keychain from 'react-native-keychain';

const SERVIZIO_TEMA = 'brokenbroker.tema';

// Come si sceglie il tema: segue il telefono, oppure è sempre scuro o sempre chiaro.
export type SceltaTema = 'sistema' | 'scuro' | 'chiaro';

export async function leggiTema(): Promise<SceltaTema> {
  try {
    const voce = await Keychain.getGenericPassword({ service: SERVIZIO_TEMA });
    return voce && (voce.password === 'scuro' || voce.password === 'chiaro') ? voce.password : 'sistema';
  } catch { return 'sistema'; }
}
export async function salvaTema(scelta: SceltaTema): Promise<void> {
  try { await Keychain.setGenericPassword('tema', scelta, { service: SERVIZIO_TEMA }); } catch { /* la scelta vale finché l'app resta aperta */ }
}

// L'ultima scelta fatta in una schermata (per esempio il conto guardato), per riaprirla uguale. null la dimentica.
export async function leggiScelta(chiave: string): Promise<string | null> {
  try {
    const voce = await Keychain.getGenericPassword({ service: `brokenbroker.scelta.${chiave}` });
    return voce ? voce.password : null;
  } catch { return null; }
}
export async function salvaScelta(chiave: string, valore: string | null): Promise<void> {
  try {
    if (valore === null) await Keychain.resetGenericPassword({ service: `brokenbroker.scelta.${chiave}` });
    else await Keychain.setGenericPassword('scelta', valore, { service: `brokenbroker.scelta.${chiave}` });
  } catch { /* la scelta vale finché l'app resta aperta */ }
}
