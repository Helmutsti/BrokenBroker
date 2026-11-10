import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pulsante } from '../componenti/base.tsx';
import { Campo, SceltaIcona } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import type { Gruppo } from '../dati/tipi.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { ConErrore, FinestraModulo, serve } from './moduli.tsx';

// Gruppi: cartelle con nome e icona per raccogliere le spese. Solo etichette: si mettono su una spesa dalla sua finestra, non si annidano e non cambiano nessun numero.
export function Gruppi() {
  const compatto = useCompatto();
  const { dati, errore } = useDati<Gruppo[]>('/gruppi');
  const [aperto, setAperto] = useState<Gruppo | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const elenco = (gruppi: Gruppo[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
      {gruppi.map((c) => <View key={c.id} style={{ width: compatto ? '100%' : 352 }}><SchedaConto nome={c.nome} icona={c.icona} onApri={() => setAperto(c)} /></View>)}
    </View>
  );

  return (
    <>
      <Intestazione titolo="Gruppi" sottotitolo="Cartelle per raccogliere le spese. Solo etichette: non cambiano nessun numero."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo gruppo" icona="plus" onPress={() => setAperto('nuovo')} />} />
      {dati.length === 0 ? <Scheda><Vuoto testo="Nessun gruppo. Aggiungine uno, per esempio Casa o Vacanze." /></Scheda> : elenco(dati)}
      <FinestraGruppo gruppo={typeof aperto === 'object' ? aperto : null} aperta={!!aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}

function FinestraGruppo({ gruppo, aperta, onChiudi }: { gruppo: Gruppo | null; aperta: boolean; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('folder');
  useEffect(() => {
    if (!aperta) return;
    setNome(gruppo?.nome ?? ''); setIcona(gruppo?.icona ?? 'folder');
  }, [aperta, gruppo]);
  const salva = async () => {
    const corpo: Record<string, unknown> = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona };
    if (gruppo) await modifica<Gruppo>(`/gruppi/${gruppo.id}`, corpo); else await crea<Gruppo>('/gruppi', corpo);
  };
  return (
    <FinestraModulo titolo={gruppo ? 'Modifica gruppo' : 'Nuovo gruppo'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva} testaTelefono
      onElimina={gruppo ? () => cancella(`/gruppi/${gruppo.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina gruppo"
      confermaElimina={gruppo ? { nome: `«${gruppo.nome}»`, dettaglio: 'Le spese che lo usano escono dal gruppo: i numeri non cambiano.' } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Casa" autoFocus={!gruppo} /></ConErrore></View>
      </View>
    </FinestraModulo>
  );
}
