import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, useDati } from '../dati/api.ts';
import { ICONA_CONTO, NOME_TIPO_CONTO, useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, Conto, Movimento, Persona, RiepilogoMese, TipoConto } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, periodoDi } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve } from './moduli.tsx';

const TUTTI_I_GIORNI: TipoConto[] = ['corrente', 'carta', 'digitale', 'contanti'];

// SC-06 Conti: saldo calcolato dal saldo di partenza e dai movimenti.
export function Conti() {
  const rif = useRiferimenti();
  const [archiviati, setArchiviati] = useState(false);
  const { dati, errore } = useDati<Conto[]>(`/conti?archiviati=${archiviati}`);
  const p = periodoDi(rif.mese, rif.profilo?.inizio_mese ?? 1);
  const movimenti = useDati<Movimento[]>(`/movimenti?dal=${p.dal}&al=${p.al}&limite=500`).dati ?? [];
  const mese = useDati<RiepilogoMese>(`/analisi/mese?mese=${rif.mese}`).dati;
  const [aperto, setAperto] = useState<Conto | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.filter((c) => !c.archiviato);
  const nota = (c: Conto) => {
    const suoi = movimenti.filter((m) => m.conto_id === c.id);
    const somma = suoi.reduce((t, m) => t + Number(m.importo), 0);
    const ultimo = suoi.map((m) => m.data).sort().at(-1);
    return suoi.length ? `Questo mese ${euro(somma, { segno: true })} · ultimo movimento ${ultimo === oggiIso() ? 'oggi' : data(ultimo, 'corta')}` : 'Nessun movimento questo mese';
  };
  const gruppo = (titolo: string, conti: Conto[]) => conti.length ? (
    <View key={titolo} style={{ gap: d['spazio-blocco'] }}>
      <Testo stile="titolo-scheda">{titolo}</Testo>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-blocco'] }}>
        {conti.map((c) => <SchedaConto key={c.id} nome={c.nome} tipo={NOME_TIPO_CONTO[c.tipo]} saldo={euro(c.saldo)} nota={nota(c)} condiviso={c.condiviso || !c.mio} icona={ICONA_CONTO[c.tipo]} onApri={() => setAperto(c)} />)}
      </View>
    </View>
  ) : null;

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="Dove stanno i tuoi soldi. Il saldo si calcola dal saldo di partenza e dai movimenti."
        azioni={<><Pulsante etichetta="Sposta tra conti" icona="arrow-left-right" onPress={rif.nuovoMovimento} /><Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} /></>} />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Sui conti in tutto" valore={euro(attivi.reduce((t, c) => t + Number(c.saldo), 0))} icona="wallet" nota={`${attivi.length} conti, compresi quelli condivisi`} />
        <NumeroChiave etichetta="Entrate del mese" valore={euro(mese?.reali.entrate ?? 0, { segno: true })} icona="arrow-down" tono="ok" />
        <NumeroChiave etichetta="Uscite del mese" valore={euro(-(Number(mese?.reali.uscite ?? 0)))} icona="arrow-up" />
      </View>
      {attivi.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungi il tuo conto corrente con il saldo di oggi." azione={<Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />} /></Scheda> : null}
      {gruppo('Conti di tutti i giorni', attivi.filter((c) => TUTTI_I_GIORNI.includes(c.tipo)))}
      {gruppo('Risparmi e investimenti', attivi.filter((c) => !TUTTI_I_GIORNI.includes(c.tipo)))}
      {archiviati ? gruppo('Archiviati', dati.filter((c) => c.archiviato)) : null}
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="archive" etichetta={archiviati ? 'Nascondi i conti archiviati' : 'Mostra i conti archiviati'} onPress={() => setArchiviati(!archiviati)} /></View>
      <FinestraConto conto={aperto === 'nuovo' ? null : aperto} aperta={!!aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}

function FinestraConto({ conto, aperta, onChiudi }: { conto: Conto | null; aperta: boolean; onChiudi: () => void }) {
  const persone = useDati<Persona[]>(aperta ? '/persone' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoConto>('corrente');
  const [saldo, setSaldo] = useState('');
  const [dal, setDal] = useState('');
  const [archiviato, setArchiviato] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setTipo(conto?.tipo ?? 'corrente'); setSaldo(importoInTesto(conto?.saldo_iniziale ?? '0'));
    setDal(dataInTesto(conto?.data_saldo_iniziale ?? oggiIso())); setArchiviato(conto?.archiviato ?? false); setCondiviso(conto?.condiviso ?? false); setEmail('');
  }, [aperta, conto]);
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), tipo, saldo_iniziale: serve(leggiImporto(saldo || '0'), 'Scrivi il saldo, es. 1.250,00'), data_saldo_iniziale: serve(leggiData(dal), 'Scrivi la data come GG/MM/AAAA'), ...(conto ? { archiviato } : {}) };
    const salvato = conto ? await modifica<Conto>(`/conti/${conto.id}`, corpo) : await crea<Conto>('/conti', corpo);
    if (!salvato.mio) return;
    const esistente = (await leggi<Condivisione[]>('/condivisioni')).find((c) => c.voce === 'conto' && c.voce_id === salvato.id && c.mia);
    if (condiviso && !esistente) await crea('/condivisioni', { voce: 'conto', id: salvato.id, email: altra?.email ?? serve(email.trim(), 'Scrivi l’email della persona con cui condividerlo') });
    if (!condiviso && esistente) await cancella(`/condivisioni/${esistente.id}`);
  };
  return (
    <FinestraModulo titolo={conto ? conto.nome : 'Nuovo conto'} icona={ICONA_CONTO[tipo]} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={conto?.mio ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina con i suoi movimenti">
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. BPER" autoFocus={!conto} />
      <Tendina etichetta="Tipo" valore={tipo} onCambia={setTipo} opzioni={(Object.keys(NOME_TIPO_CONTO) as TipoConto[]).map((k) => ({ valore: k, testo: NOME_TIPO_CONTO[k], icona: ICONA_CONTO[k] }))} />
      <Affiancati>
        <Meta><Campo etichetta="Saldo di partenza" valore={saldo} onCambia={setSaldo} inputMode="decimal" /></Meta>
        <Meta><CampoData etichetta="Alla data" valore={dal} onCambia={setDal} aiuto="Contano i movimenti da questo giorno in poi" /></Meta>
      </Affiancati>
      {conto ? <Testo colore="testo-secondario">{`Saldo di oggi: ${euro(conto.saldo)}`}</Testo> : null}
      {!conto || conto.mio ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Interruttore acceso={condiviso} onCambia={setCondiviso} etichetta="Condiviso" />
            <Testo style={{ flex: 1 }}>{condiviso ? `Condiviso${altra ? ` con ${altra.nome}` : ''}: vede e aggiunge movimenti` : 'Privato'}</Testo>
          </View>
          {condiviso && !altra && !conto?.condiviso ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
        </>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">Conto condiviso con te: puoi modificarlo, solo chi l'ha creato può eliminarlo.</Testo>}
      {conto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={archiviato} onCambia={setArchiviato} etichetta="Archiviato" />
          <Testo style={{ flex: 1 }}>Archiviato: non compare più tra i conti, i movimenti restano</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
