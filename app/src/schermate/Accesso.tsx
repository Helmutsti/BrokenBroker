import { useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo } from '../componenti/campi.tsx';
import { crea } from '../dati/api.ts';
import { salvaToken } from '../dati/sessione';
import { d, Testo, useTema } from '../tema/tema.tsx';

// SC-10 Accesso: email e password (decisione 15), oppure registrazione.
export function Accesso({ onEntrato }: { onEntrato: () => void }) {
  const { c } = useTema();
  const [modo, setModo] = useState<'accedi' | 'registrati'>('accedi');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vedi, setVedi] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const invia = async () => {
    setErrore(null); setInvio(true);
    try {
      const r = modo === 'accedi'
        ? await crea<{ token: string }>('/accesso/accesso', { email, password })
        : await crea<{ token: string }>('/accesso/registrazione', { email, password, nome });
      await salvaToken(r.token);
      onEntrato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c['sfondo-barra-laterale'], padding: d['margine-pagina'] }}>
      <View accessibilityRole="form" style={{ width: d['larghezza-accesso'], maxWidth: '100%', padding: d['margine-finestra'], gap: d['spazio-blocco'], backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }}>
        <View style={{ gap: d['spazio-testo'] }}>
          <Testo stile="logo" accessibilityRole="header">BrokenBroker</Testo>
          <Testo colore="testo-secondario">{modo === 'accedi' ? 'Accedi per vedere quanto resta davvero questo mese.' : 'Crea il tuo account: le categorie di base sono già pronte.'}</Testo>
        </View>
        <SceltaSegmenti etichetta="Accedi o registrati" larghezzaPiena valore={modo} onCambia={(m) => { setModo(m); setErrore(null); }}
          opzioni={[{ valore: 'accedi', testo: 'Accedi' }, { valore: 'registrati', testo: 'Registrati' }]} />
        {errore ? <Esito tono="errore" testo={errore} /> : null}
        {modo === 'registrati' ? <Campo etichetta="Nome" valore={nome} onCambia={setNome} autoComplete="name" /> : null}
        <Campo etichetta="Email" valore={email} onCambia={setEmail} iconaPrima="mail" autoComplete="email" inputMode="email" />
        <Campo etichetta="Password" valore={password} onCambia={setPassword} iconaPrima="lock" secureTextEntry={!vedi}
          iconaDopo={vedi ? 'eye-off' : 'eye'} etichettaIconaDopo={vedi ? 'Nascondi password' : 'Mostra password'} onIconaDopo={() => setVedi(!vedi)}
          autoComplete={modo === 'accedi' ? 'current-password' : 'new-password'} onSubmitEditing={invia}
          aiuto={modo === 'registrati' ? 'Almeno 10 caratteri' : undefined} />
        <Pulsante tipo="primario" etichetta={modo === 'accedi' ? 'Accedi' : 'Crea account'} onPress={invia} disattivato={invio} larghezzaPiena />
      </View>
    </View>
  );
}
