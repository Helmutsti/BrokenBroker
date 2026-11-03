import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina, TendinaGiorni } from '../componenti/campi.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Salvadanaio, Spesa } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { primaOccorrenzaPersonale } from '../mesePersonale.ts';
import { d, Testo } from '../tema/tema.tsx';
import { poiDate, proxSpesaDaPagare } from './comuni.tsx';
import { Affiancati, ConErrore, FinestraModulo, Meta, serve, useDivisione, Voce } from './moduli.tsx';

type Frequenza = 'mese' | 'n' | 'una';

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi,
// contando per mesi personali (il mese personale in corso è ancora buono). Senza giorno vale tutto il mese personale: si salva il giorno 1.
export const primaOccorrenza = primaOccorrenzaPersonale;

// Il salvadanaio collegato a una spesa e quello che lo contiene, se ci sono.
function collegato(albero: Salvadanaio[] | null, spesaId: string | undefined): { nodo: Salvadanaio; padre: Salvadanaio | null } | null {
  if (!albero || !spesaId) return null;
  const visita = (xs: Salvadanaio[], padre: Salvadanaio | null): { nodo: Salvadanaio; padre: Salvadanaio | null } | null => {
    for (const x of xs) {
      if (x.spesa_id === spesaId) return { nodo: x, padre };
      const dentro = visita(x.figli, x);
      if (dentro) return dentro;
    }
    return null;
  };
  return visita(albero, null);
}

// Aggiungi o modifica una spesa (decisione 72): nome e categoria, quando si ripete, importo e conto (solo etichetta), divisione e, per le non mensili, «Metti da parte ogni mese».
export function FinestraSpesa({ spesa, aperta, onChiudi }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const navigation = useNavigation<{ navigate: (k: string) => void }>();
  const inizio = rif.profilo?.inizio_mese ?? 1;
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [frequenza, setFrequenza] = useState<Frequenza>('mese');
  const [ogniN, setOgniN] = useState('6');
  const [dataScad, setDataScad] = useState(''); // GG/MM/AAAA: la prossima scadenza (o l'unica)
  const [dataIniziale, setDataIniziale] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [importo, setImporto] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  const [mettiDaParte, setMettiDaParte] = useState(false);
  const div = useDivisione({ aperta, voce: 'spesa', rotta: '/spese-previste', origine: spesa ? { id: spesa.id, mia: spesa.mia, condiviso: spesa.condivisa, miaPercentuale: spesa.mia_percentuale } : null });
  const albero = useDati<Salvadanaio[]>(aperta && spesa ? '/salvadanai' : null).dati;
  const legato = collegato(albero, spesa?.id);

  // Aprire una spesa ricevuta la segna come vista: sparisce l'etichetta «Nuova».
  useEffect(() => {
    if (aperta && spesa?.nuova) crea(`/spese-previste/${spesa.id}/vista`).catch(() => {});
  }, [aperta, spesa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setCategoria(s?.categoria_id ?? null); setImporto(importoInTesto(s?.importo)); setConto(s?.conto_id ?? null);
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setGiornoMese(s?.ogni_mesi === 1 && s.giorno_mese ? String(s.giorno_mese) : '');
    const prossima = s && s.ogni_mesi !== 1 ? (s.ogni_mesi === null ? s.prossima_scadenza : proxSpesaDaPagare(s, oggiIso(), inizio) ?? s.prossima_scadenza) : null;
    setDataScad(dataInTesto(prossima)); setDataIniziale(dataInTesto(prossima));
    setMettiDaParte(s?.metti_da_parte ?? false);
  }, [aperta, spesa]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = async () => {
    if (!spesa || spesa.mia) div.controlla();
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80', 'importo');
    const ogni = frequenza === 'mese' ? 1 : frequenza === 'una' ? null : Number(ogniN);
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) serve(null, 'Scrivi ogni quanti mesi, es. 6', 'ogniN');
    let prima: string | null = null;
    let senzaGiorno = false;
    if (ogni !== 1) {
      const iso = serve(leggiData(dataScad), ogni === null ? 'Scegli il giorno in cui esce' : 'Scegli la prossima scadenza', 'scadenza');
      // Se la data non è stata toccata resta quella salvata (anche «senza giorno»).
      if (spesa && dataScad === dataIniziale && spesa.prossima_scadenza && spesa.ogni_mesi !== 1) { prima = spesa.prossima_scadenza; senzaGiorno = spesa.senza_giorno; } else prima = iso;
    }
    const g = giornoMese ? Number(giornoMese) : null;
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, giorno_mese: ogni === 1 ? g : null,
      conto_id: conto, categoria_id: categoria, ...(ogni !== 1 && (!spesa || spesa.mia) ? { metti_da_parte: mettiDaParte } : {}) };
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    await div.salva(salvata.id);
  };

  const apriSalvadanaio = () => { if (!legato) return; onChiudi(); rif.chiedi({ salvadanaio: legato.nodo.id }); navigation.navigate('salvadanai'); };

  const percentuale = div.divisione === 'no' ? 100 : div.divisione === 'meta' ? 50 : Number(div.miaQuota.replace(',', '.')) || 0;
  const cifra = leggiImporto(importo);
  const aiutoImporto = cifra ? `La tua quota: ${euro((Number(cifra) * percentuale) / 100)}` : undefined;
  const isoScad = leggiData(dataScad);
  const nN = Number(ogniN);
  const aiutoScadenza = frequenza === 'n' && isoScad && Number.isInteger(nN) && nN >= 1 ? `Poi ${poiDate(isoScad, nN)}` : undefined;
  const altro = div.nomeAltro ?? 'l’altra persona';
  const nessuno = !!div.persone && div.persone.length === 0;
  const mostraQuota = div.condiviso || div.divisione !== 'no';
  const possoMettereDaParte = !spesa || spesa.mia;

  // Come l'API: ognuno ha la sua quota calcolata da sola e arrotondata al centesimo (api/src/spese.ts).
  let avvisoCentesimi: string | null = null;
  if (div.condiviso && div.divisione !== 'no' && cifra && percentuale > 0 && percentuale < 100) {
    const tondo = (n: number) => Math.round(n * 100) / 100;
    const importoNum = Number(cifra);
    const esatta = (importoNum * percentuale) / 100;
    const mia = tondo(esatta);
    const sua = tondo((importoNum * (100 - percentuale)) / 100);
    const differenza = Math.round((importoNum - mia - sua) * 100);
    if (Math.abs(esatta * 100 - Math.round(esatta * 100)) > 1e-6 || differenza !== 0) {
      const dettaglio = differenza > 0 ? `manca ${euro(differenza / 100)}` : differenza < 0 ? `avanza ${euro(-differenza / 100)}` : 'la somma torna';
      avvisoCentesimi = `${euro(importoNum)} non si divide ${div.divisione === 'meta' ? 'a metà ' : ''}al centesimo: la tua quota sarà ${euro(mia)} e quella di ${altro} ${euro(sua)} (${dettaglio}). Se vuoi che torni, scegli «Altra quota» e scrivi le cifre.`;
    }
  }

  let aiutoDaParte: string;
  if (mettiDaParte && legato) {
    const n = legato.nodo;
    const stato = [n.traguardo ? `${euro(n.dentro)} su ${euro(n.traguardo)}` : euro(n.dentro), n.scadenza ? `entro il ${data(n.scadenza)}` : null].filter(Boolean).join(' ');
    aiutoDaParte = `Legata al sotto-salvadanaio ${legato.padre?.nome ?? 'Spese annuali'} › ${n.nome}: ${stato}${n.metti_al_mese ? `, metti ${euro(n.metti_al_mese)} al mese` : ''}. Nome, traguardo e data vengono da questa spesa e si cambiano solo qui. Quando spunti la spesa, la cifra esce da lì.`;
  } else {
    aiutoDaParte = 'Accendilo e crea un sotto-salvadanaio dentro «Spese annuali» con la cifra della prossima scadenza e la sua data: ti dice quanto mettere da parte ogni mese.';
  }

  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa' : 'Nuova spesa'} aperta={aperta} onChiudi={onChiudi} onSalva={salva} testaTelefono senzaTessera
      onElimina={spesa?.mia ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina spesa"
      confermaElimina={spesa ? { nome: `«${spesa.nome}»`, dettaglio: spesa.condivisa ? 'Sparisce anche per l’altra persona.' : spesa.metti_da_parte ? 'Sparisce anche il suo sotto-salvadanaio: i soldi tornano in «Spese annuali».' : 'Sparisce dalla lista.' } : undefined}>
      <Affiancati>
        <Meta><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} /></ConErrore></Meta>
        <Meta>
          <View style={{ gap: d['spazio-testo'] }}>
            <Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" segnaposto="Scegli la categoria" />
            {spesa && !spesa.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è solo tua: ${spesa.creata_da ?? 'chi l’ha creata'} ha la sua.`}</Testo> : null}
          </View>
        </Meta>
      </Affiancati>
      <Voce etichetta="Quando si ripete">
        <SceltaSegmenti etichetta="Quando si ripete" larghezzaPiena valore={frequenza} onCambia={setFrequenza}
          opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta' }]} />
      </Voce>
      {frequenza === 'n' ? (
        <Affiancati>
          <Meta><ConErrore campo="ogniN"><Campo etichetta="Si ripete ogni (mesi)" valore={ogniN} onCambia={(t) => setOgniN(t.replace(/\D/g, ''))} inputMode="numeric" segnaposto="Es. 6" aiuto="12 mesi = una volta l’anno" /></ConErrore></Meta>
          <Meta><ConErrore campo="scadenza"><CampoData etichetta="Prossima scadenza" valore={dataScad} onCambia={setDataScad} aiuto={aiutoScadenza} /></ConErrore></Meta>
        </Affiancati>
      ) : frequenza === 'una' ? (
        <ConErrore campo="scadenza"><CampoData etichetta="Scadenza" valore={dataScad} onCambia={setDataScad} /></ConErrore>
      ) : (
        <TendinaGiorni etichetta="Giorno del mese (facoltativo)" valore={giornoMese} onCambia={setGiornoMese} />
      )}
      <Affiancati>
        <Meta><ConErrore campo="importo"><Campo etichetta="Importo a ogni scadenza" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" aiuto={aiutoImporto} /></ConErrore></Meta>
        <Meta><Tendina etichetta="Conto (solo etichetta)" valore={conto ?? ''} opzioni={[{ valore: '', testo: 'Nessun conto' }, ...opzioniConti(rif.conti, { tenere: [conto] })]} onCambia={(v) => setConto(v || null)} iconaPrima="wallet" /></Meta>
      </Affiancati>
      {!spesa || spesa.mia ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
              <Testo stile="dettaglio-forte">{`Divisa con ${altro}`}</Testo>
              {nessuno ? <Testo stile="dettaglio-normale" colore="testo-secondario">Non c’è ancora nessun altro utente nel sistema.</Testo> : null}
            </View>
            <Interruttore acceso={div.condiviso} onCambia={(v) => { div.setCondiviso(v); if (!v) div.setDivisione('no'); else if (div.divisione === 'no') div.setDivisione('meta'); }} etichetta={`Divisa con ${altro}`} disattivato={nessuno && !div.condiviso} />
          </View>
          {div.persone && div.persone.length > 1 && div.condiviso ? (
            <ConErrore campo="condivisione">
              <Tendina etichetta="Con chi" valore={div.conEff} iconaPrima="user" disattivato={div.bloccata} onCambia={div.setCon} segnaposto="Scegli una persona" opzioni={div.persone.map((p) => ({ valore: p.id, testo: p.nome }))} />
            </ConErrore>
          ) : null}
          {mostraQuota ? (
            <>
              <SceltaSegmenti etichetta="Come la dividete" larghezzaPiena valore={div.divisione} onCambia={div.setDivisione}
                opzioni={[{ valore: 'no', testo: 'Solo io' }, { valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
              {div.divisione === 'altra' ? <ConErrore campo="quota"><Campo etichetta="La tua quota in %" valore={div.miaQuota} onCambia={div.setMiaQuota} inputMode="decimal" /></ConErrore> : null}
              {avvisoCentesimi ? <Esito tono="attenzione" testo={avvisoCentesimi} /> : null}
            </>
          ) : null}
        </View>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      {frequenza !== 'mese' && possoMettereDaParte ? (
        <View style={{ gap: d['spazio-icona'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <Testo stile="dettaglio-forte" style={{ flex: 1 }}>Metti da parte ogni mese</Testo>
            <Interruttore acceso={mettiDaParte} onCambia={setMettiDaParte} etichetta="Metti da parte ogni mese" />
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoDaParte}</Testo>
          {mettiDaParte && legato ? <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Apri il salvadanaio" icona="piggy-bank" onPress={apriSalvadanaio} /></View> : null}
        </View>
      ) : null}
    </FinestraModulo>
  );
}
