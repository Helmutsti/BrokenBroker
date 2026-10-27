import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante } from '../componenti/base.tsx';
import { Campo, SceltaIcona } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import type { Condivisione, Conto, ElencoSpese, MovimentoConto, Rata } from '../dati/tipi.ts';
import { data, dataOra, euro, importoInTesto, leggiImporto } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { ConErrore, FinestraModulo, RiquadroCondivisione, salvaCondivisione, serve, Voce } from './moduli.tsx';

// SC-06 Conti: i conti da cui si paga, con nome, icona e saldo (decisione 47). Il saldo è uno per conto, uguale per chi lo vede:
// si scrive a mano il saldo di oggi e poi si muove da solo con le spunte e i salvadanai.
export function Conti() {
  const [archiviati, setArchiviati] = useState(false);
  const { dati, errore } = useDati<Conto[]>(`/conti?archiviati=${archiviati}`);
  const [aperto, setAperto] = useState<Conto | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.filter((c) => !c.archiviato);
  const vecchi = dati.filter((c) => c.archiviato);
  const elenco = (conti: Conto[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-blocco'] }}>
      {conti.map((c) => <SchedaConto key={c.id} nome={c.nome} condiviso={c.condiviso || !c.mio} icona={c.icona} onApri={() => setAperto(c)}
        saldo={c.saldo !== null ? euro(c.saldo) : undefined} saldoNegativo={c.saldo !== null && Number(c.saldo) < 0}
        nota={c.saldo !== null ? `aggiornato il ${dataOra(c.saldo_aggiornato_il)}` : 'Saldo da scrivere'} />)}
    </View>
  );

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="I conti da cui paghi, con il loro saldo. Scrivi il saldo di oggi, poi si muove da solo con le spunte e i salvadanai."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />} />
      {attivi.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungi il tuo conto corrente." /></Scheda> : elenco(attivi)}
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
  const miaCondivisione = useDati<Condivisione[]>(aperta && conto ? '/condivisioni' : null).dati?.find((x) => x.voce === 'conto' && x.voce_id === conto?.id && x.mia);
  // Quante spese e rate usano il conto: con il conto eliminato restano senza conto.
  const spese = useDati<ElencoSpese>(aperta && conto ? '/spese-previste' : null).dati;
  const rate = useDati<Rata[]>(aperta && conto ? '/rate' : null).dati;
  const nSpese = conto ? (spese?.spese.filter((s) => s.conto_id === conto.id).length ?? 0) : 0;
  const nRate = conto ? (rate?.filter((x) => x.conto_id === conto.id).length ?? 0) : 0;
  const collegate = [nSpese ? `${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}` : null, nRate ? `${nRate} ${nRate === 1 ? 'rata' : 'rate'}` : null].filter(Boolean).join(' e ');
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('landmark');
  const [archiviato, setArchiviato] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  // Saldo di oggi: riscrive il saldo di partenza (come lo vedi in banca). Vuoto = non si tocca.
  const [saldo, setSaldo] = useState('');
  const movimenti = useDati<MovimentoConto[]>(aperta && conto ? `/conti/${conto.id}/movimenti?limite=12` : null).dati;
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setIcona(conto?.icona ?? 'landmark'); setArchiviato(conto?.archiviato ?? false); setCondiviso(conto?.condiviso ?? false); setCon(null);
    setSaldo(importoInTesto(conto?.saldo));
  }, [aperta, conto]);
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona, ...(conto ? { archiviato } : {}) };
    const nuovoSaldo = saldo.trim() ? serve(leggiImporto(saldo), 'Scrivi il saldo, es. 450,79 (anche negativo, es. -20,00)', 'saldo') : null;
    const salvato = conto ? await modifica<Conto>(`/conti/${conto.id}`, corpo) : await crea<Conto>('/conti', corpo);
    if (nuovoSaldo !== null && (conto?.saldo == null || Math.abs(Number(nuovoSaldo) - Number(conto.saldo)) >= 0.005)) await sostituisci(`/conti/${salvato.id}/saldo`, { importo: nuovoSaldo });
    if (!salvato.mio) return;
    await salvaCondivisione('conto', salvato.id, condiviso, con ?? miaCondivisione?.condiviso_con_id ?? null);
  };
  return (
    <FinestraModulo titolo={conto ? conto.nome : 'Nuovo conto'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={conto?.mio ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina conto"
      confermaElimina={conto ? { nome: `«${conto.nome}»`, dettaglio: collegate ? `${collegate} restano senza conto.` : 'Nessuna spesa o rata usa questo conto.' } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. BPER" autoFocus={!conto} /></ConErrore></View>
      </View>
      <ConErrore campo="saldo">
        <Campo etichetta="Saldo di oggi" valore={saldo} onCambia={setSaldo} inputMode="decimal" segnaposto="0,00"
          aiuto={conto?.saldo != null
            ? `Scrivilo come lo vedi in banca per riallinearlo. Ora è ${euro(conto.saldo)}, aggiornato il ${dataOra(conto.saldo_aggiornato_il)}${conto.condiviso || !conto.mio ? ': è lo stesso saldo per tutti e due' : ''}.`
            : 'Scrivilo come lo vedi in banca. Da lì in poi si muove da solo con le spunte e i salvadanai.'} />
      </ConErrore>
      {!conto || conto.mio ? (
        <ConErrore campo="condivisione"><RiquadroCondivisione aperta={aperta} nome="questo conto" condiviso={condiviso} onCambia={setCondiviso} con={con ?? miaCondivisione?.condiviso_con_id ?? null} onCon={setCon}
          giaCondivisa={!!conto?.condiviso && conto.mio} testoAttivo="Lo vede e lo usa nelle spese." /></ConErrore>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">Conto condiviso con te: puoi modificarlo, solo chi l'ha creato può eliminarlo.</Testo>}
      {conto && movimenti?.length ? (
        <Voce etichetta="Ultimi movimenti">
          {movimenti.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
              <Testo stile="dettaglio-normale" colore={x.conta ? 'testo-secondario' : 'testo-terziario'} style={{ flex: 1 }}>{`${data(x.data, 'corta')} · ${x.descrizione}${x.conta ? '' : ' · già nel saldo'}`}</Testo>
              <Testo stile="dettaglio-forte" colore={x.conta ? (Number(x.importo) < 0 ? 'testo-errore' : 'testo-primario') : 'testo-terziario'}>{euro(x.importo, { segno: true })}</Testo>
            </View>
          ))}
        </Voce>
      ) : null}
      {conto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={archiviato} onCambia={setArchiviato} etichetta="Archiviato" />
          <Testo style={{ flex: 1 }}>Archiviato: non compare più tra i conti</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
