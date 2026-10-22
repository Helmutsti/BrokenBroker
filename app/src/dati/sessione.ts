// Sull'iPhone il codice di accesso sta nella memoria sicura (Keychain, decisione 22).
import * as Keychain from 'react-native-keychain';

const SERVIZIO = 'brokenbroker.sessione';

export async function leggiToken(): Promise<string | null> {
  const voce = await Keychain.getGenericPassword({ service: SERVIZIO });
  return voce ? voce.password : null;
}
export async function salvaToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('sessione', token, { service: SERVIZIO });
}
export async function cancellaToken(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVIZIO });
}
