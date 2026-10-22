import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante } from '../componenti/base.tsx';
import { Finestra } from '../componenti/composti.tsx';
import { d, Testo } from '../tema/tema.tsx';

// Finestra con modulo: errori in alto, Annulla e Salva in fondo, Elimina a sinistra.
export function FinestraModulo({ titolo, icona, aperta, onChiudi, onSalva, onElimina, etichettaSalva = 'Salva', etichettaElimina, children, larghezza }: {
  titolo: string; icona?: string; aperta: boolean; onChiudi: () => void; onSalva: () => Promise<void>; onElimina?: () => Promise<void>;
  etichettaSalva?: string; etichettaElimina?: string; children: ReactNode; larghezza?: number;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState(false);
  const esegui = (fn: () => Promise<void>) => async () => {
    setErrore(null); setLavoro(true);
    try { await fn(); onChiudi(); } catch (e) { setErrore((e as Error).message); } finally { setLavoro(false); }
  };
  const chiudi = () => { setErrore(null); onChiudi(); };
  return (
    <Finestra titolo={titolo} icona={icona} aperta={aperta} onChiudi={chiudi} larghezza={larghezza}
      onElimina={onElimina ? esegui(onElimina) : undefined} etichettaElimina={etichettaElimina}
      azioni={<><Pulsante etichetta="Annulla" onPress={chiudi} /><Pulsante tipo="primario" etichetta={etichettaSalva} onPress={esegui(onSalva)} disattivato={lavoro} /></>}>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <View style={{ gap: d['spazio-blocco'] }}>{children}</View>
    </Finestra>
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

export const Affiancati = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', gap: d['spazio-colonne'] }}>{children}</View>;
export const Meta = ({ children }: { children: ReactNode }) => <View style={{ flex: 1 }}>{children}</View>;

// Lancia un errore leggibile se il valore manca o non è valido.
export function serve<T>(valore: T | null | undefined, messaggio: string): T {
  if (valore === null || valore === undefined || valore === '') throw new Error(messaggio);
  return valore;
}
