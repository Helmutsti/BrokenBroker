import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante } from '../componenti/base.tsx';
import { Campo, SceltaIcona } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, useDati } from '../dati/api.ts';
import type { Condivisione, Conto, Persona } from '../dati/tipi.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { FinestraModulo, serve } from './moduli.tsx';

// SC-06 Conti: l'elenco dei conti da cui si paga, con nome e icona. Niente saldi né movimenti.
export function Conti() {
  const [archiviati, setArchiviati] = useState(false);
  const { dati, errore } = useDati<Conto[]>(`/conti?archiviati=${archiviati}`);
  const [aperto, setAperto] = useState<Conto | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.filter((c) => !c.archiviato);
  const vecchi = dati.filter((c) => c.archiviato);
  const elenco = (conti: Conto[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-blocco'] }}>
      {conti.map((c) => <SchedaConto key={c.id} nome={c.nome} condiviso={c.condiviso || !c.mio} icona={c.icona} onApri={() => setAperto(c)} />)}
    </View>
  );

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="I conti da cui paghi le spese. Servono a dire da dove esce ogni cifra: non tengono saldi."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />} />
      {attivi.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungi il tuo conto corrente." azione={<Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />} /></Scheda> : elenco(attivi)}
      {archiviati && vecchi.length ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <Testo stile="titolo-scheda">Archiviati</Testo>
          {elenco(vecchi)}
        </View>
      ) : null}
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="archive" etichetta={archiviati ? 'Nascondi i conti archiviati' : 'Mostra i conti archiviati'} onPress={() => setArchiviati(!archiviati)} /></View>
      <FinestraConto conto={aperto === 'nuovo' ? null : aperto} aperta={!!aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}

function FinestraConto({ conto, aperta, onChiudi }: { conto: Conto | null; aperta: boolean; onChiudi: () => void }) {
  const persone = useDati<Persona[]>(aperta ? '/persone' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('landmark');
  const [archiviato, setArchiviato] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setIcona(conto?.icona ?? 'landmark'); setArchiviato(conto?.archiviato ?? false); setCondiviso(conto?.condiviso ?? false); setEmail('');
  }, [aperta, conto]);
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), icona, ...(conto ? { archiviato } : {}) };
    const salvato = conto ? await modifica<Conto>(`/conti/${conto.id}`, corpo) : await crea<Conto>('/conti', corpo);
    if (!salvato.mio) return;
    const esistente = (await leggi<Condivisione[]>('/condivisioni')).find((c) => c.voce === 'conto' && c.voce_id === salvato.id && c.mia);
    if (condiviso && !esistente) await crea('/condivisioni', { voce: 'conto', id: salvato.id, email: altra?.email ?? serve(email.trim(), 'Scrivi l’email della persona con cui condividerlo') });
    if (!condiviso && esistente) await cancella(`/condivisioni/${esistente.id}`);
  };
  return (
    <FinestraModulo titolo={conto ? conto.nome : 'Nuovo conto'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={conto?.mio ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina conto">
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. BPER" autoFocus={!conto} />
      <SceltaIcona valore={icona} onCambia={setIcona} />
      {!conto || conto.mio ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Interruttore acceso={condiviso} onCambia={setCondiviso} etichetta="Condiviso" />
            <Testo style={{ flex: 1 }}>{condiviso ? `Condiviso${altra ? ` con ${altra.nome}` : ''}: lo vede e lo usa nelle spese` : 'Privato'}</Testo>
          </View>
          {condiviso && !altra && !conto?.condiviso ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
        </>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">Conto condiviso con te: puoi modificarlo, solo chi l'ha creato può eliminarlo.</Testo>}
      {conto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={archiviato} onCambia={setArchiviato} etichetta="Archiviato" />
          <Testo style={{ flex: 1 }}>Archiviato: non compare più tra i conti</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
