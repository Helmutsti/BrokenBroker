import { useState } from 'react';
import { View } from 'react-native';
import { Pulsante } from '../componenti/base.tsx';
import { Intestazione, NumeroChiave, RigaNumeri, Scheda } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Obiettivo } from '../dati/tipi.ts';
import { euro } from '../formato.ts';
import { Caricamento, tuttiGliObiettivi } from './comuni.tsx';
import { Obiettivi } from './Obiettivi.tsx';

// Salvadanai: in alto quanto c'è e quanto entra ogni mese da Spese, poi un riquadro per
// ogni salvadanaio (le spese periodiche si gestiscono da Spese).
export function Salvadanai() {
  const rif = useRiferimenti();
  const [nuovo, setNuovo] = useState(0);
  const ob = useDati<Obiettivo[]>('/obiettivi');
  const sp = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  if (!ob.dati || !sp.dati) return <Caricamento errore={ob.errore ?? sp.errore} />;
  const tutti = tuttiGliObiettivi(ob.dati);
  const nei = ob.dati.reduce((t, o) => t + Number(o.saldo), 0);
  // Quanto entra ogni mese dalle voci "mettici da parte" in Spese (quelle annuali contano un dodicesimo).
  const alimentati = tutti.filter((o) => o.alimentato_da);
  const alMese = alimentati.reduce((t, o) => t + Number(o.alimentato_da!.importo) / (o.alimentato_da!.ogni_mesi ?? 1), 0);

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Quello che metti da parte: spese annuali, emergenze e progetti."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo salvadanaio" icona="plus" onPress={() => setNuovo((n) => n + 1)} />} />
      <RigaNumeri>
        <NumeroChiave etichetta="Nei salvadanai" valore={euro(nei)} icona="piggy-bank" nota={`In ${ob.dati.length} ${ob.dati.length === 1 ? 'salvadanaio' : 'salvadanai'}`} />
        <NumeroChiave etichetta="Ogni mese in Spese" valore={euro(alMese)} icona="calendar-check"
          nota={alimentati.length ? `Da ${alimentati.length} ${alimentati.length === 1 ? 'salvadanaio' : 'salvadanai'}` : 'Nessun salvadanaio è ancora una voce di Spese'} />
      </RigaNumeri>
      <Obiettivi nuovo={nuovo} />
    </>
  );
}

