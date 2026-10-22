import { useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante } from '../componenti/base.tsx';
import { Campo } from '../componenti/campi.tsx';
import { crea } from '../dati/api.ts';
import { salvaToken } from '../dati/sessione';
import { d, Testo, useTema } from '../tema/tema.tsx';

// SC-10 Accesso: solo email e password (decisione 15). Gli account si creano
// con il comando descritto in INSTALLAZIONE.md, non da qui.
export function Accesso({ onEntrato }: { onEntrato: () => void }) {
  const { c } = useTema();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vedi, setVedi] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const invia = async () => {
    setErrore(null); setInvio(true);
    try {
      const r = await crea<{ token: string }>('/accesso/accesso', { email, password });
      await salvaToken(r.token);
      onEntrato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c['sfondo-barra-laterale'], padding: d['margine-pagina'] }}>
      <View accessibilityRole="form" style={{ width: d['larghezza-accesso'], maxWidth: '100%', padding: d['margine-finestra'], gap: d['spazio-blocco'], backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }}>
        <View style={{ gap: d['spazio-testo'] }}>
          <Testo stile="logo" accessibilityRole="header">BrokenBroker</Testo>
          <Testo colore="testo-secondario">Accedi per vedere quanto resta davvero questo mese.</Testo>
        </View>
        {errore ? <Esito tono="errore" testo={errore} /> : null}
        <Campo etichetta="Email" valore={email} onCambia={setEmail} iconaPrima="mail" autoComplete="email" inputMode="email" />
        <Campo etichetta="Password" valore={password} onCambia={setPassword} iconaPrima="lock" secureTextEntry={!vedi}
          iconaDopo={vedi ? 'eye-off' : 'eye'} etichettaIconaDopo={vedi ? 'Nascondi password' : 'Mostra password'} onIconaDopo={() => setVedi(!vedi)}
          autoComplete="current-password" onSubmitEditing={invia} />
        <Pulsante tipo="primario" etichetta="Accedi" onPress={invia} disattivato={invio} larghezzaPiena />
      </View>
    </View>
  );
}
