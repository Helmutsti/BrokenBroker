import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante } from '../componenti/base.tsx';
import { ConfermaFinestra, Finestra } from '../componenti/composti.tsx';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';

// Cosa chiede la conferma di Elimina: il nome («Eliminare <nome>?»), cosa succede alle voci collegate
// e, se serve, un controllo che blocca la richiesta con un messaggio (es. manca dove spostare le voci).
export type ConfermaElimina = { nome: string; dettaglio?: string; controlla?: () => string | null };

// Finestra con modulo: errori in alto, Annulla e Salva in fondo, Elimina a sinistra (sempre con conferma).
export function FinestraModulo({ titolo, icona, aperta, onChiudi, onSalva, onElimina, etichettaSalva = 'Salva', etichettaElimina, confermaElimina, children, larghezza, intestazioneDestra }: {
  titolo: string; icona?: string; aperta: boolean; onChiudi: () => void; onSalva: () => Promise<void>; onElimina?: () => Promise<void>;
  etichettaSalva?: string; etichettaElimina?: string; confermaElimina?: ConfermaElimina; children: ReactNode; larghezza?: number; intestazioneDestra?: ReactNode;
}) {
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const esegui = (fn: () => Promise<void>) => async () => {
    setErrore(null); setLavoro(true);
    try { await fn(); onChiudi(); } catch (e) { setErrore((e as Error).message); } finally { setLavoro(false); }
  };
  const chiudi = () => { setErrore(null); onChiudi(); };
  // Elimina non agisce subito: prima il controllo (se c'è), poi la finestra di conferma.
  const chiediElimina = () => {
    const problema = confermaElimina?.controlla?.() ?? null;
    if (problema) { setErrore(problema); return; }
    setErrore(null); setChiede(true);
  };
  return (
    <>
      <Finestra titolo={titolo} icona={icona} aperta={aperta} onChiudi={chiudi} larghezza={larghezza} intestazioneDestra={intestazioneDestra}
        onElimina={onElimina ? chiediElimina : undefined} etichettaElimina={etichettaElimina}
        azioni={<><Pulsante etichetta="Annulla" onPress={chiudi} /><Pulsante tipo="primario" etichetta={etichettaSalva} onPress={esegui(onSalva)} disattivato={lavoro} /></>}>
        {errore ? <Esito tono="errore" testo={errore} /> : null}
        <View style={{ gap: d['spazio-blocco'] }}>{children}</View>
      </Finestra>
      <ConfermaFinestra aperta={chiede} titolo={`Eliminare ${confermaElimina?.nome ?? titolo}?`} testo={confermaElimina?.dettaglio ?? 'Non si può annullare.'} tono="pericolo" etichettaConferma={etichettaElimina ?? 'Elimina'} lavoro={lavoro}
        onAnnulla={() => setChiede(false)} onConferma={() => { setChiede(false); if (onElimina) esegui(onElimina)(); }} />
    </>
  );
}

// Etichetta sopra un controllo che non ne ha una propria (scelta a segmenti, interruttore).
export function Voce({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: ReactNode }) {
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo>
      {children}
      {aiuto ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiuto}</Testo> : null}
    </View>
  );
}

// Su telefono i campi affiancati si mettono uno sotto l'altro, a tutta larghezza.
export const Affiancati = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: useCompatto() ? 'column' : 'row', gap: useCompatto() ? d['spazio-blocco'] : d['spazio-colonne'] }}>{children}</View>;
export const Meta = ({ children }: { children: ReactNode }) => <View style={{ flex: useCompatto() ? undefined : 1, minWidth: 0 }}>{children}</View>;

// Lancia un errore leggibile se il valore manca o non è valido.
export function serve<T>(valore: T | null | undefined, messaggio: string): T {
  if (valore === null || valore === undefined || valore === '') throw new Error(messaggio);
  return valore;
}

// Un argomento del modulo: titolo, una riga che dice a cosa serve e, a destra, l'interruttore se c'è.
export function Riquadro({ titolo, nota, interruttore, children }: { titolo: string; nota: string; interruttore?: ReactNode; children?: ReactNode }) {
  const { c } = useTema();
  return (
    <View style={{ gap: d['spazio-blocco'], padding: d['spazio-blocco'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-scheda'], backgroundColor: c['sfondo-scheda'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <Testo stile="corpo-forte" accessibilityRole="header">{titolo}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo>
        </View>
        {interruttore}
      </View>
      {children}
    </View>
  );
}
