import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Pulsante } from '../componenti/base.tsx';
import { MenuScelta } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaNumeri, Scheda } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Obiettivo } from '../dati/tipi.ts';
import { euro } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { useCompatto } from '../tema/compatto.ts';
import { Caricamento, sommaSuConto, suQuelConto, tuttiGliObiettivi } from './comuni.tsx';
import { Obiettivi } from './Obiettivi.tsx';

// Il conto scelto in alto resta finché non si ricarica la pagina, come in Panoramica ('tutti', 'senza' o l'id di un conto).
let ultimoFiltro = 'tutti';

// Salvadanai: in alto quanto c'è e quanto entra ogni mese da Spese, poi un riquadro per
// ogni salvadanaio (le spese periodiche si gestiscono da Spese).
export function Salvadanai() {
  const rif = useRiferimenti();
  const [nuovo, setNuovo] = useState(0);
  const ob = useDati<Obiettivo[]>('/obiettivi');
  const sp = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const compatto = useCompatto();
  const [filtroScelto, setFiltroScelto] = useState(ultimoFiltro);
  const scegliFiltro = (v: string) => { ultimoFiltro = v; setFiltroScelto(v); };
  if (!ob.dati || !sp.dati) return <Caricamento errore={ob.errore ?? sp.errore} />;
  const tutti = tuttiGliObiettivi(ob.dati);
  // Conti da proporre: quelli non archiviati e quelli su cui sta ancora un salvadanaio.
  const usati = new Set(tutti.map((o) => o.conto_id));
  const conti = rif.conti.filter((x) => !x.archiviato || usati.has(x.id));
  const senzaConto = tutti.some((o) => !o.conto_id);
  const filtro = filtroScelto === 'senza' ? (senzaConto ? 'senza' : 'tutti') : conti.some((x) => x.id === filtroScelto) ? filtroScelto : 'tutti';
  const conto = conti.find((x) => x.id === filtro) ?? null;
  const titoloNei = filtro === 'senza' ? 'Senza conto' : conto ? `Su ${conto.nome}` : 'Nei salvadanai';
  // Con un conto scelto: la somma dei soldi che stanno su quel conto (ogni salvadanaio conta una volta, col suo conto).
  const nei = filtro === 'tutti' ? ob.dati.reduce((t, o) => t + Number(o.saldo), 0) : sommaSuConto(ob.dati, filtro);
  const quanti = filtro === 'tutti' ? ob.dati.length : ob.dati.filter((r) => tuttiGliObiettivi([r]).some((o) => suQuelConto(o, filtro))).length;
  // Quanto entra ogni mese dai promemoria «Ricordamelo» in Spese (quelli annuali contano un dodicesimo).
  const alimentati = tutti.filter((o) => o.alimentato_da);
  const alMese = alimentati.reduce((t, o) => t + Number(o.alimentato_da!.importo) / (o.alimentato_da!.ogni_mesi ?? 1), 0);

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Quello che metti da parte: emergenze e progetti."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo salvadanaio" icona="plus" onPress={() => setNuovo((n) => n + 1)} />} />
      <RigaNumeri>
        <NumeroChiave etichetta={titoloNei} valore={euro(nei)} icona="piggy-bank" nota={`In ${quanti} ${quanti === 1 ? 'salvadanaio' : 'salvadanai'}`}
          titolo={conti.length ? (
            <MenuScelta valore={filtro} onCambia={scegliFiltro} larghezzaMinima={240}
              opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona })),
                ...(senzaConto ? [{ valore: 'senza', testo: 'Senza conto', icona: 'circle-x' }] : [])]}>
              {({ ref, apri, aperto }) => (
                <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${filtro === 'senza' ? 'Senza conto' : conto ? conto.nome : 'Tutti i conti'}`} aria-expanded={aperto} onPress={apri}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                  <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{titoloNei}</Testo>
                  <Icona nome="chevron-down" misura={16} />
                </Pressable>
              )}
            </MenuScelta>
          ) : undefined} />
        <NumeroChiave etichetta="Ogni mese in Spese" valore={euro(alMese)} icona="calendar-check"
          nota={alimentati.length ? `Da ${alimentati.length} ${alimentati.length === 1 ? 'salvadanaio' : 'salvadanai'}` : 'Nessun salvadanaio è ancora una voce di Spese'} />
      </RigaNumeri>
      <Obiettivi nuovo={nuovo} filtro={filtro} />
    </>
  );
}

