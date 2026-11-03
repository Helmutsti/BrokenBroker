import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pulsante } from '../componenti/base.tsx';
import { Campo, SceltaIcona } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import type { Conto } from '../dati/tipi.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { ConErrore, FinestraModulo, serve } from './moduli.tsx';

// Conti (decisione 72): solo etichette, con nome e icona. Si mettono su una spesa o una rata per ricordare da dove escono i soldi: non hanno saldo,
// non si annidano, non si archiviano e non cambiano nessun numero (i vecchi archiviati si vedono come gli altri).
export function Conti() {
  const compatto = useCompatto();
  const { dati, errore } = useDati<Conto[]>('/conti?archiviati=true');
  const [aperto, setAperto] = useState<Conto | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const elenco = (conti: Conto[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
      {conti.map((c) => <View key={c.id} style={{ width: compatto ? '100%' : 352 }}><SchedaConto nome={c.nome} icona={c.icona} onApri={() => setAperto(c)} /></View>)}
    </View>
  );

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="Etichette per ricordare da dove escono i soldi. Le metti sulle spese e sulle rate: non hanno saldo e non cambiano nessun numero."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />} />
      {dati.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungine uno, per esempio il tuo conto corrente o la carta." /></Scheda> : elenco(dati)}
      <FinestraConto conto={typeof aperto === 'object' ? aperto : null} aperta={!!aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}

function FinestraConto({ conto, aperta, onChiudi }: { conto: Conto | null; aperta: boolean; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('landmark');
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setIcona(conto?.icona ?? 'landmark');
  }, [aperta, conto]);
  const salva = async () => {
    const corpo: Record<string, unknown> = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona };
    if (conto) await modifica<Conto>(`/conti/${conto.id}`, corpo); else await crea<Conto>('/conti', corpo);
  };
  return (
    <FinestraModulo titolo={conto ? 'Modifica conto' : 'Nuovo conto'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva} testaTelefono
      onElimina={conto ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina conto"
      confermaElimina={conto ? { nome: `«${conto.nome}»`, dettaglio: 'Le spese e le rate che lo usano perdono l’etichetta: i numeri non cambiano.' } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. BPER" autoFocus={!conto} /></ConErrore></View>
      </View>
    </FinestraModulo>
  );
}
