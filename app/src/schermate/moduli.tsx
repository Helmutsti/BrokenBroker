import { type ComponentRef, createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante } from '../componenti/base.tsx';
import { MessaggioErrore, Tendina } from '../componenti/campi.tsx';
import { Icona } from '../componenti/Icona.tsx';
import { ConfermaFinestra, Finestra } from '../componenti/composti.tsx';
import { cancella, crea, leggi, useDati } from '../dati/api.ts';
import type { Condivisione, PersonaSistema } from '../dati/tipi.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';

// Cosa chiede la conferma di Elimina: il nome («Eliminare <nome>?»), cosa succede alle voci collegate
// e, se serve, un controllo che blocca la richiesta con un messaggio (es. manca dove spostare le voci).
export type ConfermaElimina = { nome: string; dettaglio?: string; controlla?: () => string | null };

// Errore legato a un campo: compare sotto quel campo (vedi ConErrore) invece che in cima al modulo.
export class ErroreCampo extends Error {
  campo: string;
  constructor(campo: string, messaggio: string) { super(messaggio); this.campo = campo; }
}

type ErroreModulo = { campo?: string; messaggio: string } | null;
const ContestoErrore = createContext<ErroreModulo>(null);
// I campi avvolti da ConErrore presenti ora nel modulo: un errore per un campo che non c'è va sopra i pulsanti.
const ContestoCampi = createContext<Set<string> | null>(null);

// Porta in vista un elemento (solo web).
const portaInVista = (el: unknown) => (el as { scrollIntoView?: (o: object) => void } | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });

// Avvolge un campo: se l'errore del modulo è per questo campo lo mostra subito sotto e ci porta lo sguardo.
export function ConErrore({ campo, children }: { campo: string; children: ReactNode }) {
  const errore = useContext(ContestoErrore);
  const qui = errore?.campo === campo ? errore : null;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const campi = useContext(ContestoCampi);
  useEffect(() => { campi?.add(campo); return () => { campi?.delete(campo); }; }, [campi, campo]);
  useEffect(() => { if (qui) portaInVista(ref.current); }, [qui]);
  return (
    <View ref={ref} style={{ gap: d['spazio-testo'] }}>
      {children}
      {qui ? <MessaggioErrore testo={qui.messaggio} /> : null}
    </View>
  );
}

// Finestra con modulo: errori vicino al campo (o sopra i pulsanti), Annulla e Salva in fondo, Elimina a sinistra (sempre con conferma).
export function FinestraModulo({ titolo, icona, aperta, onChiudi, onSalva, onElimina, etichettaSalva = 'Salva', etichettaElimina, confermaElimina, children, larghezza, intestazioneDestra }: {
  titolo: string; icona?: string; aperta: boolean; onChiudi: () => void; onSalva: () => Promise<void>; onElimina?: () => Promise<void>;
  etichettaSalva?: string; etichettaElimina?: string; confermaElimina?: ConfermaElimina; children: ReactNode; larghezza?: number; intestazioneDestra?: ReactNode;
}) {
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<ErroreModulo>(null);
  const [lavoro, setLavoro] = useState(false);
  const campi = useRef(new Set<string>()).current;
  const esegui = (fn: () => Promise<void>) => async () => {
    setErrore(null); setLavoro(true);
    try { await fn(); onChiudi(); } catch (e) { setErrore({ campo: e instanceof ErroreCampo && campi.has(e.campo) ? e.campo : undefined, messaggio: (e as Error).message }); } finally { setLavoro(false); }
  };
  const chiudi = () => { setErrore(null); onChiudi(); };
  // Elimina non agisce subito: prima il controllo (se c'è), poi la finestra di conferma.
  const chiediElimina = () => {
    const problema = confermaElimina?.controlla?.() ?? null;
    if (problema) { setErrore({ messaggio: problema }); return; }
    setErrore(null); setChiede(true);
  };
  const erroreSenzaCampo = errore && !errore.campo ? errore : null;
  const refErrore = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => { if (erroreSenzaCampo) portaInVista(refErrore.current); }, [erroreSenzaCampo]);
  return (
    <ContestoCampi.Provider value={campi}><ContestoErrore.Provider value={errore}>
      <Finestra titolo={titolo} icona={icona} aperta={aperta} onChiudi={chiudi} larghezza={larghezza} intestazioneDestra={intestazioneDestra}
        onElimina={onElimina ? chiediElimina : undefined} etichettaElimina={etichettaElimina}
        azioni={<><Pulsante etichetta="Annulla" onPress={chiudi} /><Pulsante tipo="primario" etichetta={etichettaSalva} onPress={esegui(onSalva)} disattivato={lavoro} /></>}>
        <View style={{ gap: d['spazio-blocco'] }}>{children}</View>
        {erroreSenzaCampo ? <View ref={refErrore}><Esito tono="errore" testo={erroreSenzaCampo.messaggio} /></View> : null}
      </Finestra>
      <ConfermaFinestra aperta={chiede} titolo={`Eliminare ${confermaElimina?.nome ?? titolo}?`} testo={confermaElimina?.dettaglio ?? 'Non si può annullare.'} tono="pericolo" etichettaConferma={etichettaElimina ?? 'Elimina'} lavoro={lavoro}
        onAnnulla={() => setChiede(false)} onConferma={() => { setChiede(false); if (onElimina) esegui(onElimina)(); }} />
    </ContestoErrore.Provider></ContestoCampi.Provider>
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
// Con `campo` l'errore compare sotto quel campo (ConErrore).
export function serve<T>(valore: T | null | undefined, messaggio: string, campo?: string): T {
  if (valore === null || valore === undefined || valore === '') throw campo ? new ErroreCampo(campo, messaggio) : new Error(messaggio);
  return valore;
}

// Un argomento del modulo: titolo, una riga che dice a cosa serve e, a destra, l'interruttore se c'è.
export function Riquadro({ titolo, nota, icona, interruttore, children }: { titolo: string; nota: string; icona?: string; interruttore?: ReactNode; children?: ReactNode }) {
  const { c } = useTema();
  return (
    <View style={{ gap: d['spazio-blocco'], padding: d['spazio-blocco'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-scheda'], backgroundColor: c['sfondo-scheda'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            {icona ? <Icona nome={icona} misura={20} colore="icona-accento" /> : null}
            <Testo stile="corpo-forte" accessibilityRole="header">{titolo}</Testo>
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo>
        </View>
        {interruttore}
      </View>
      {children}
    </View>
  );
}

// Il riquadro «Condividi», uguale in tutti i moduli: l'interruttore acceso vuol dire «condividi», poi si sceglie con chi
// tra le altre persone del sistema (solo nomi).
export function RiquadroCondivisione({ aperta, nome, condiviso, onCambia, con, onCon, giaCondivisa, testoAttivo, testoPrivato }: {
  aperta: boolean; nome: string; condiviso: boolean; onCambia: (v: boolean) => void; con: string | null; onCon: (id: string | null) => void;
  giaCondivisa: boolean; testoAttivo: string; testoPrivato?: string;
}) {
  const persone = useDati<PersonaSistema[]>(aperta ? '/persone/tutte' : null).dati;
  useEffect(() => { if (condiviso && !con && persone?.length === 1) onCon(persone[0].id); }, [condiviso, con, persone]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Riquadro titolo="Condividi" icona="users" nota={condiviso ? testoAttivo : `Accendi per condividere ${nome} con un'altra persona.${testoPrivato ? ` ${testoPrivato}` : ''}`}
      interruttore={<Interruttore acceso={condiviso} onCambia={onCambia} etichetta="Condividi" />}>
      {condiviso ? (
        persone && persone.length === 0 ? <Esito tono="attenzione" testo="Non c'è ancora nessun altro utente nel sistema." />
          : <Tendina etichetta="Condividi con" valore={con} iconaPrima="user" disattivato={giaCondivisa} onCambia={onCon} segnaposto="Scegli una persona"
              opzioni={(persone ?? []).map((p) => ({ valore: p.id, testo: p.nome }))} />
      ) : null}
    </Riquadro>
  );
}

// Crea o toglie la condivisione di una voce secondo l'interruttore; restituisce l'id dell'altra persona (o null).
export async function salvaCondivisione(voce: 'conto' | 'spesa' | 'obiettivo', id: string, condiviso: boolean, con: string | null): Promise<string | null> {
  const esistente = (await leggi<Condivisione[]>('/condivisioni')).find((x) => x.voce === voce && x.voce_id === id && x.mia);
  if (condiviso && esistente && con && esistente.condiviso_con_id !== con) await cancella(`/condivisioni/${esistente.id}`);
  else if (condiviso && esistente) return esistente.condiviso_con_id;
  if (condiviso && (!esistente || (con && esistente.condiviso_con_id !== con))) {
    const nuova = await crea<{ condiviso_con_id: string }>('/condivisioni', { voce, id, utente_id: serve(con, 'Scegli con chi condividere', 'condivisione') });
    return nuova.condiviso_con_id;
  }
  if (!condiviso && esistente) { await cancella(`/condivisioni/${esistente.id}`); return null; }
  return esistente?.condiviso_con_id ?? null;
}
