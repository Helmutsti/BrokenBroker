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
