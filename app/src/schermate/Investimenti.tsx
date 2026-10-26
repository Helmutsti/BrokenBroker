import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Etichetta, Pulsante, PulsanteIcona, SceltaSegmenti } from '../componenti/base.tsx';
import { MenuScelta } from '../componenti/campi.tsx';
import { BarraComposizione, GraficoLinea, Intestazione, Scheda, TabellaPortafoglio, type RigaTabellaPortafoglio, Vuoto } from '../componenti/composti.tsx';
import { Icona } from '../componenti/Icona.tsx';
import { useDati } from '../dati/api.ts';
import type { Bene, Esposizione, Lotto, Portafoglio, PortafoglioDettaglio, PortafoglioGenerale, Posizione, PuntoAndamento } from '../dati/tipi.ts';
import { data, euro, meseCorto, numero, oggiIso, prezzoInTesto } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, mesiFino } from './comuni.tsx';
import {
  FinestraAggiungi, FinestraBene, FinestraPortafoglio, FinestraPosizione, giornoMese, guadagnoTesto, nomeTipo,
  type PartenzaAggiunta, prezzoDi, quantitaTesto,
} from './FinestreInvestimenti.tsx';

type Periodo = '1' | '6' | '12' | 'tutto';
const VOCI_SENZA_PREZZO = (p: { titoli_senza_prezzo: number; beni_senza_prezzo: number }) => p.titoli_senza_prezzo + p.beni_senza_prezzo;
const VOCI_VECCHIE = (p: { titoli_prezzo_vecchio: number; beni_prezzo_vecchio: number }) => p.titoli_prezzo_vecchio + p.beni_prezzo_vecchio;

// SC-11 Investimenti: in alto i totali (solo i portafogli che contano nel patrimonio, o uno solo anche di prova),
// con andamento e composizione; sotto un riquadro per ogni portafoglio con titoli e beni.
export function Investimenti() {
  const compatto = useCompatto();
  const portafogli = useDati<Portafoglio[]>('/investimenti/portafogli');
  const [vista, setVista] = useState<string>('tutti');
  const [periodo, setPeriodo] = useState<Periodo>('12');
  const [composizioneDi, setComposizioneDi] = useState<'classe' | 'area' | 'settore'>('classe');
  const [aggiungi, setAggiungi] = useState<PartenzaAggiunta | null>(null);
  const [modifica, setModifica] = useState<Portafoglio | 'nuovo' | null>(null);
  const filtro = vista === 'tutti' ? '' : `portafoglio_id=${vista}`;
  const gen = useDati<PortafoglioGenerale>(`/investimenti/portafoglio${filtro ? `?${filtro}` : ''}`);
  const lotti = useDati<Lotto[]>(periodo === 'tutto' ? '/investimenti/lotti' : null).dati ?? [];
  const elenco = portafogli.dati ?? [];
  // Se il portafoglio scelto è stato eliminato si torna a «tutti».
  useEffect(() => { if (portafogli.dati && vista !== 'tutti' && !portafogli.dati.some((p) => p.id === vista)) setVista('tutti'); }, [portafogli.dati, vista]);
  const contano = new Set(elenco.filter((p) => p.conta_nel_patrimonio).map((p) => p.id));
  const lottiVista = lotti.filter((l) => (vista === 'tutti' ? contano.has(l.portafoglio_id) : l.portafoglio_id === vista));
  const p = gen.dati;
  const primo = [...lottiVista.map((l) => l.data), ...(p?.beni ?? []).map((b) => b.data_acquisto ?? b.valore_al ?? '').filter(Boolean)].sort()[0];
  // Un mese: un punto a settimana. Altrimenti un punto al mese, "da sempre" dal primo investimento.
  const mesi = periodo === 'tutto' ? Math.min(600, Math.max(2, primo ? mesiFino(oggiIso(), primo) : 12)) : Number(periodo) + 1;
  const andamento = useDati<PuntoAndamento[]>(`/investimenti/andamento?${periodo === '1' ? 'settimane=5' : `mesi=${mesi}`}${filtro ? `&${filtro}` : ''}`).dati ?? [];
  const etichetta = (x: PuntoAndamento) => (periodo === '1' ? data(x.al, 'corta') : mesi > 12 ? `${meseCorto(x.mese)} ${x.mese.slice(2, 4)}` : meseCorto(x.mese));
  const esposizione = useDati<Esposizione>(`/investimenti/esposizione${filtro ? `?${filtro}` : ''}`).dati;

  if (!portafogli.dati || !p) return <Caricamento errore={portafogli.errore ?? gen.errore} />;
  const scelto = elenco.find((x) => x.id === vista);
  const guadagno = Number(p.guadagno);
  const totale = Number(p.valore);
  const ordinati = [...elenco].sort((a, b) => Number(b.conta_nel_patrimonio) - Number(a.conta_nel_patrimonio));
  const voceComposizione = (esposizione?.[composizioneDi] ?? []).map((x) => ({ nome: x.voce, icona: composizioneDi === 'classe' ? 'layers' : composizioneDi === 'area' ? 'globe' : 'factory', peso: x.peso }));
  const senza = VOCI_SENZA_PREZZO(p);

  return (
    <>
      <Intestazione titolo="Investimenti" sottotitolo="Un riquadro per ogni portafoglio, con titoli, beni non quotati e metalli. In alto i totali di quelli che contano nel patrimonio."
        azioni={<>
          <Pulsante tipo="primario" etichetta="Nuovo portafoglio" icona="plus" onPress={() => setModifica('nuovo')} />
          {elenco.length ? <Pulsante etichetta="Aggiungi investimento" icona="plus" onPress={() => setAggiungi({})} /> : null}
        </>} />
      <Scheda titolo={scelto ? scelto.nome : 'Tutti i portafogli'} nota={scelto ? undefined : 'Solo quelli che contano nel patrimonio'} icona="chart-line"
        titoloScelta={
          <MenuScelta valore={vista} onCambia={setVista} larghezzaMinima={260}
            opzioni={[{ valore: 'tutti', testo: 'Tutti (contano nel patrimonio)', icona: 'briefcase' }, ...ordinati.map((x) => ({ valore: x.id, testo: x.conta_nel_patrimonio ? x.nome : `${x.nome} (prova)`, icona: x.icona }))]}>
            {({ ref, apri, aperto }) => (
              <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il portafoglio: ${scelto ? scelto.nome : 'Tutti i portafogli'}`} aria-expanded={aperto} onPress={apri}
                style={{ alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                <Testo stile="titolo-scheda" style={{ flexShrink: 1, minWidth: 0 }}>{scelto ? scelto.nome : 'Tutti i portafogli'}</Testo>
                <Icona nome="chevron-down" misura={16} />
              </Pressable>
            )}
          </MenuScelta>}>
        <View style={{ flexDirection: compatto ? 'column' : 'row', gap: d['spazio-gruppo'] }}>
          <View style={{ flex: compatto ? undefined : 1, minWidth: 0, gap: d['spazio-blocco'] }}>
            <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-end', gap: d['spazio-colonne'] }}>
              <View style={{ flex: compatto ? undefined : 1, gap: d['spazio-testo'] }}>
                <Testo stile="etichetta-gruppo" colore="testo-secondario">{scelto ? 'VALORE OGGI' : 'VALORE DI TUTTI I PORTAFOGLI OGGI'}</Testo>
                <Testo stile="numero-grande">{euro(p.valore)}</Testo>
                <Testo stile="corpo-forte" colore={guadagno >= 0 ? 'testo-ok' : 'testo-errore'}>{`${guadagnoTesto(guadagno, p.guadagno_percentuale)} da sempre`}</Testo>
                <Testo colore="testo-secondario">{`Investiti ${euro(p.messo_dentro)}`}</Testo>
                {scelto && !scelto.conta_nel_patrimonio ? <Testo stile="dettaglio-normale" colore="testo-secondario">Portafoglio di prova: non conta nei totali generali né nel patrimonio.</Testo> : null}
                {p.incompleto ? <Esito tono="attenzione" testo={`Alcuni prezzi mancano (${senza}): il valore è parziale e quegli asset non contano nel guadagno.`} /> : null}
              </View>
              <SceltaSegmenti etichetta="Periodo del grafico" larghezzaPiena={compatto} valore={periodo} onCambia={setPeriodo}
                opzioni={[{ valore: '1', testo: '1 mese' }, { valore: '6', testo: '6 mesi' }, { valore: '12', testo: '1 anno' }, { valore: 'tutto', testo: 'Da sempre' }]} />
            </View>
            {andamento.length > 1 && (totale > 0 || Number(p.costo) > 0)
              ? <GraficoLinea punti={andamento.map((x) => ({ etichetta: etichetta(x), valore: Number(x.valore), messo: Number(x.messo_dentro) }))} />
              : <Vuoto testo="Il grafico compare quando c'è almeno un investimento." />}
          </View>
          <View style={{ width: compatto ? undefined : 300, gap: d['spazio-elenco'] }}>
            <SceltaSegmenti etichetta="Composizione" larghezzaPiena valore={composizioneDi} onCambia={setComposizioneDi}
              opzioni={[{ valore: 'classe', testo: 'Per tipo' }, { valore: 'area', testo: 'Per paese' }, { valore: 'settore', testo: 'Per settore' }]} />
            {voceComposizione.length === 0 ? <Testo colore="testo-secondario">{composizioneDi === 'classe' ? 'Ancora niente.' : 'Nessun titolo quotato con la composizione inserita.'}</Testo> : null}
            <BarraComposizione voci={(esposizione?.[composizioneDi] ?? [])} />
            {composizioneDi !== 'classe' ? <Testo stile="dettaglio-normale" colore="testo-secondario">Per paese e per settore si guardano solo i titoli quotati; i beni contano solo nel tipo.</Testo> : null}
          </View>
        </View>
      </Scheda>
      {ordinati.length === 0 ? <Scheda><Vuoto testo="Nessun portafoglio. Creane uno, poi aggiungi titoli, fondi pensione o metalli preziosi." /></Scheda> : null}
      {ordinati.map((x) => <SchedaPortafoglio key={x.id} p={x} portafogli={ordinati} onModifica={() => setModifica(x)} onAggiungi={setAggiungi} />)}
      <FinestraPortafoglio portafoglio={modifica === 'nuovo' ? null : modifica} aperta={!!modifica} onChiudi={() => setModifica(null)} />
      <FinestraAggiungi aperta={!!aggiungi} partenza={aggiungi ?? {}} onChiudi={() => setAggiungi(null)} />
    </>
  );
}

// Un portafoglio: testata (nome, valore, guadagno), avviso se mancano prezzi, poi titoli e beni.
function SchedaPortafoglio({ p, portafogli, onModifica, onAggiungi }: { p: Portafoglio; portafogli: Portafoglio[]; onModifica: () => void; onAggiungi: (x: PartenzaAggiunta) => void }) {
  const compatto = useCompatto();
  const dett = useDati<PortafoglioDettaglio>(p.vuoto ? null : `/investimenti/portafogli/${p.id}`).dati;
  const [sopra, setSopra] = useState(false);
  const [posId, setPosId] = useState<string | null>(null);
  const [beneId, setBeneId] = useState<string | null>(null);
  const posizioni = p.vuoto ? [] : dett?.posizioni ?? [];
  const beni = p.vuoto ? [] : dett?.beni ?? [];
  const posizione = posizioni.find((x) => x.titolo_id === posId) ?? null;
  const bene = beni.find((b) => b.id === beneId) ?? null;
  // Una posizione o un bene eliminati: la finestra si chiude.
  useEffect(() => { if (posId && dett && !posizione) setPosId(null); }, [posId, dett, posizione]);
  useEffect(() => { if (beneId && dett && !bene) setBeneId(null); }, [beneId, dett, bene]);

  const g = Number(p.guadagno);
  const costo = Number(p.costo);
  const senza = VOCI_SENZA_PREZZO(p), vecchi = VOCI_VECCHIE(p);

  const avviso = (stato: string, al: string | null, cosa: string): RigaTabellaPortafoglio['avviso'] =>
    stato === 'mancante' ? { testo: `${cosa} mancante`, tono: 'errore' } : stato === 'vecchio' ? { testo: `${cosa} del ${giornoMese(al)}`, tono: 'attenzione' } : undefined;
  const pesoTesto = (x: number | null) => (x === null ? '—' : `${numero(x, 1)}%`);
  const righePosizioni = posizioni.map((x): { riga: RigaTabellaPortafoglio; valore: number | null } => ({
    valore: x.valore === null ? null : Number(x.valore),
    riga: {
      chiave: `t-${x.titolo_id}`, nome: x.nome,
      dettaglio: `${quantitaTesto(x.quantita)} quote · PCM ${prezzoInTesto(x.prezzo_medio)} €`,
      prezzo: prezzoDi(x.prezzo), valore: x.valore === null ? '—' : euro(x.valore), peso: pesoTesto(x.peso),
      guadagno: x.guadagno === null ? '—' : guadagnoTesto(Number(x.guadagno), x.guadagno_percentuale), positivo: x.guadagno === null ? null : Number(x.guadagno) >= 0,
      avviso: avviso(x.stato, x.prezzo_al, 'prezzo'), onApri: () => setPosId(x.titolo_id),
    },
  }));
  const righeBeni = beni.map((b): { riga: RigaTabellaPortafoglio; valore: number | null } => {
    const mercato = !!b.catalogo;
    const dettaglio = mercato
      ? [`${b.quantita ? quantitaTesto(b.quantita) : '—'} ${b.catalogo!.unita === 'pezzi' ? 'pezzi' : 'g'}`, b.catalogo!.unita === 'grammi' && b.purezza ? `${numero(b.purezza, Number.isInteger(Number(b.purezza)) ? 0 : 1)} ‰` : null,
        b.grammi_fini ? `${numero(b.grammi_fini, 3)} g fini` : null, b.dove].filter(Boolean).join(' · ')
      : [nomeTipo(b.tipo), b.dove, `valore del ${giornoMese(b.valore_al)}`].filter(Boolean).join(' · ');
    return {
      valore: b.valore === null ? null : Number(b.valore),
      riga: {
        chiave: `b-${b.id}`, nome: b.nome, dettaglio, prezzo: mercato ? (b.euro_grammo ? `${euro(b.euro_grammo)}/g` : '—') : '—',
        valore: b.valore === null ? '—' : euro(b.valore), peso: pesoTesto(b.peso ?? null), guadagno: b.guadagno === null ? '—' : guadagnoTesto(Number(b.guadagno), b.guadagno_percentuale),
        positivo: b.guadagno === null ? null : Number(b.guadagno) >= 0, avviso: mercato ? avviso(b.stato, b.valore_al, 'quotazione') : undefined, onApri: () => setBeneId(b.id),
      },
    };
  });
  // Un'unica lista, dal valore più alto; le voci senza valore in fondo.
  const righe = [...righePosizioni, ...righeBeni].sort((a, b) => (b.valore ?? -Infinity) - (a.valore ?? -Infinity)).map((x) => x.riga);
  const matita = <PulsanteIcona icona="pencil" etichetta={`Modifica ${p.nome}`} fantasma nascosto={!compatto && !sopra} onPress={onModifica} />;
  const cifre = [['Valore', euro(p.valore), 'testo-primario'], ['Investiti', euro(costo), 'testo-primario'],
    ['Guadagno', p.vuoto ? '—' : guadagnoTesto(g, p.guadagno_percentuale), p.vuoto ? 'testo-secondario' : g >= 0 ? 'testo-ok' : 'testo-errore']] as const;

  return (
    <View {...{ onMouseEnter: () => setSopra(true), onMouseLeave: () => setSopra(false) }} style={{ width: '100%' }}>
      <Scheda titolo={p.nome} icona={p.icona}
        dopoTitolo={<>{p.conta_nel_patrimonio ? null : <Etichetta testo="Prova" tono="attenzione" />}{matita}</>}
        azione={<>
          <Pulsante tipo="testo" etichetta="Aggiungi" icona="plus" onPress={() => onAggiungi({ portafoglioId: p.id })} />
        </>}>
        <View style={{ gap: d['spazio-blocco'] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: d['spazio-gruppo'] * (compatto ? 1 : 2), rowGap: d['spazio-blocco'], paddingHorizontal: d['margine-voce-h'] }}>
            {cifre.map(([l, v, col], i) => (
              <View key={l} style={{ gap: d['spazio-testo'] }}><Testo stile="dettaglio-normale" colore="testo-secondario">{l}</Testo><Testo stile={i === 0 ? 'titolo-scheda' : 'corpo-forte'} colore={col}>{v}</Testo></View>
            ))}
          </View>
          {p.incompleto ? <Esito tono="attenzione" testo={`Mancano ${senza} ${senza === 1 ? 'prezzo' : 'prezzi'}: il valore è parziale e ${senza === 1 ? "quell'asset non conta" : 'quegli asset non contano'} nel guadagno.`} /> : null}
          {vecchi > 0 ? <Testo stile="dettaglio-normale" colore="testo-attenzione">{`${vecchi} ${vecchi === 1 ? 'prezzo non aggiornato' : 'prezzi non aggiornati'} da qualche giorno.`}</Testo> : null}
          {p.vuoto ? <Vuoto testo="Portafoglio vuoto. Aggiungi un titolo, un bene non quotato o un metallo." /> : null}
          {!p.vuoto && !dett ? <Caricamento /> : null}
          {righe.length ? <TabellaPortafoglio righe={righe} /> : null}
        </View>
      </Scheda>
      <FinestraPosizione posizione={posizione} aperta={!!posizione} portafogli={portafogli} onChiudi={() => setPosId(null)}
        onAggiungiAcquisto={() => { const x = posizione!; setPosId(null); onAggiungi({ scelta: 'quotato', portafoglioId: p.id, titoloId: x.titolo_id }); }} />
      <FinestraBene bene={bene} aperta={!!bene} onChiudi={() => setBeneId(null)} />
    </View>
  );
}
