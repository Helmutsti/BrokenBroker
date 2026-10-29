import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina, TendinaGiorni } from '../componenti/campi.tsx';
import { cancella, modifica, crea } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Spesa, TipoSpesa } from '../dati/tipi.ts';
import { dataInTesto, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { primaOccorrenzaPersonale } from '../mesePersonale.ts';
import { proxSpesa } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, Riquadro, SezioneDivisione, serve, useDivisione, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

type Frequenza = 'mese' | 'anno' | 'biennale' | 'n' | 'una';

const OPZIONI_MESE = [{ valore: '', testo: '—' }, ...Array.from({ length: 12 }, (_, i) => ({ valore: String(i + 1), testo: nomeMese(`2000-${String(i + 1).padStart(2, '0')}`, false) }))];

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi,
// contando per mesi personali (il mese personale in corso è ancora buono). Senza giorno vale tutto il mese personale: si salva il giorno 1.
export const primaOccorrenza = primaOccorrenzaPersonale;

// SC-03 Aggiungi o modifica una spesa prevista (finestra al centro, variante B).
export function FinestraSpesa({ spesa, aperta, onChiudi }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [meseScad, setMeseScad] = useState('');
  const [dataUna, setDataUna] = useState(''); // "una volta sola": la data intera, GG/MM/AAAA
  const div = useDivisione({ aperta, voce: 'spesa', rotta: '/spese-previste', origine: spesa ? { id: spesa.id, mia: spesa.mia, condiviso: spesa.condivisa, miaPercentuale: spesa.mia_percentuale } : null });
  const [frequenza, setFrequenza] = useState<Frequenza>('mese');
  const [ogniN, setOgniN] = useState('6');
  const [tipo, setTipo] = useState<TipoSpesa>('fissa');
  const [conto, setConto] = useState<string | null>(null);
  const [aConto, setAConto] = useState(''); // il conto di arrivo (decisione 61)
  // Decisione 71: una spesa è un'uscita (da un conto, con categoria) oppure un giroconto (da un conto a un altro, senza categoria).
  const [giro, setGiro] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [attiva, setAttiva] = useState(true);

  // Aprire una spesa ricevuta la segna come vista: sparisce l'etichetta «Nuova».
  useEffect(() => {
    if (aperta && spesa?.nuova) crea(`/spese-previste/${spesa.id}/vista`).catch(() => {});
  }, [aperta, spesa?.id]);

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setImporto(importoInTesto(s?.importo)); setGiornoMese(s?.ogni_mesi === 1 ? (s.giorno_mese ? String(s.giorno_mese) : '') : s?.prossima_scadenza && !s.senza_giorno ? String(Number(s.prossima_scadenza.slice(8, 10))) : '');
    // Il mese si chiede solo se la spesa non esce ogni mese; l'anno non si mostra mai.
    setMeseScad(s?.prossima_scadenza && s.ogni_mesi !== 1 ? String(Number((proxSpesa(s, oggiIso(), rif.profilo?.inizio_mese ?? 1) ?? s.prossima_scadenza).slice(5, 7))) : '');
    setDataUna(s && s.ogni_mesi === null ? dataInTesto(s.prossima_scadenza) : '');
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : s.ogni_mesi === 12 ? 'anno' : s.ogni_mesi === 24 ? 'biennale' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setTipo(s?.tipo ?? 'fissa'); setConto(s?.conto_id ?? null); setAConto(s?.a_conto_id ?? ''); setGiro(!!s?.a_conto_id); setCategoria(s?.categoria_id ?? null);
    setNote(s?.note ?? ''); setAttiva(s?.attiva ?? true);
  }, [aperta, spesa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un giroconto non è una spesa: niente categoria (non conterebbe).
  const spostamento = giro;
  const arrivo = giro ? aConto : '';

  const salva = async () => {
    if (!spesa || spesa.mia) div.controlla();
    if (giro && !aConto) throw new ErroreCampo('a_conto', 'Scegli il conto su cui arrivano i soldi');
    if (arrivo && arrivo === conto) throw new ErroreCampo('a_conto', 'Il conto di arrivo deve essere diverso da quello di partenza');
    if (!conto) throw new ErroreCampo('conto', 'Scegli il conto da cui parte la spesa: ogni spesa ne ha uno');
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80', 'importo');
    const ogni = frequenza === 'mese' ? 1 : frequenza === 'anno' ? 12 : frequenza === 'biennale' ? 24 : frequenza === 'una' ? null : Number(ogniN);
    // Ogni mese basta il giorno del mese (giorno_mese, nessuna data: decisione 44); altrimenti servono almeno il mese, e l'anno lo sceglie l'app.
    let prima: string | null = null;
    let senzaGiorno = false;
    const g = giornoMese ? Number(giornoMese) : null;
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) serve(null, 'Scrivi ogni quanti mesi, es. 6', 'ogniN');
    if (ogni === null) prima = serve(leggiData(dataUna), 'Scegli il giorno in cui esce', 'scadenza');
    else if (ogni === 1) prima = null;
    else if (meseScad) {
      prima = primaOccorrenza(g, Number(meseScad), oggiIso(), rif.profilo?.inizio_mese ?? 1);
      senzaGiorno = g === null;
    } else if (g !== null) serve(null, 'Scegli anche il mese: una spesa che non esce ogni mese ha bisogno almeno del mese', 'scadenza');
    else serve(null, 'Scegli almeno il mese in cui esce: da lì si ripete', 'scadenza');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, giorno_mese: ogni === 1 ? g : null, tipo, conto_id: conto, a_conto_id: arrivo || null, categoria_id: spostamento ? null : categoria,
      note: note.trim() || null, attiva };
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    await div.salva(salvata.id);
  };

  const compatto = useCompatto();
  const isoUna = frequenza === 'una' ? leggiData(dataUna) : null;
  const nomeM = isoUna ? `${nomeMeseMinuscolo(isoUna)} ${isoUna.slice(0, 4)}` : meseScad ? nomeMeseMinuscolo(`2000-${meseScad.padStart(2, '0')}`) : '';
  const poi = frequenza === 'anno' ? ', ogni anno' : frequenza === 'biennale' ? ', ogni due anni' : frequenza === 'n' ? `, poi ogni ${ogniN || 'N'} mesi` : '';
  const aiutoScadenza = frequenza === 'una'
    ? (isoUna ? `Esce il ${Number(isoUna.slice(8, 10))} ${nomeM}, una volta sola.` : 'Scegli il giorno in cui esce.')
    : frequenza === 'mese'
    ? (giornoMese ? `Esce il ${giornoMese} di ogni mese.` : 'Facoltativo: senza giorno vale per tutto il mese. Il giorno serve a metterla in ordine nella lista.')
    : nomeM && giornoMese ? `Esce il ${giornoMese} ${nomeM}${poi}.`
      : nomeM ? `Esce a ${nomeM}, senza un giorno preciso${poi}.`
        : giornoMese ? 'Scegli anche il mese.' : 'Scegli almeno il mese; il giorno è facoltativo. L’anno lo sceglie l’app.';
  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa prevista' : 'Nuova spesa prevista'} icona={spesa?.icona ?? 'calendar-check'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={spesa?.mia ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined}
      confermaElimina={spesa ? { nome: `«${spesa.nome}»`, dettaglio: spesa.condivisa ? 'Sparisce anche per l’altra persona.' : 'Sparisce dalla lista del mese.' } : undefined}
      intestazioneDestra={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore="testo-secondario">{attiva ? 'Attiva' : 'Non attiva'}</Testo>
          <Interruttore acceso={attiva} onCambia={setAttiva} etichetta="Attiva" />
        </View>
      )}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{attiva ? 'Attiva: compare nella lista da spuntare del mese.' : 'Non attiva: resta salvata ma non conta.'}</Testo>
      <Riquadro titolo="Che spesa è" nota="Come si chiama, di che tipo è e quanto costa.">
        <ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} /></ConErrore>
        <Voce etichetta="Che tipo di spesa" aiuto={giro ? 'Sposta i soldi da un tuo conto a un altro.' : 'I soldi escono da un conto, con una categoria.'}>
          <SceltaSegmenti etichetta="Che tipo di spesa" larghezzaPiena valore={giro ? 'giro' : 'uscita'} onCambia={(v) => setGiro(v === 'giro')} opzioni={[{ valore: 'uscita', testo: 'Uscita' }, { valore: 'giro', testo: 'Giroconto' }]} />
        </Voce>
        {spesa?.tipo === 'investimento' ? <Voce etichetta="Tipo" aiuto="Un importo che metti da parte per investire.">
          <SceltaSegmenti etichetta="Tipo di spesa" larghezzaPiena valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'investimento' as const, testo: 'Investimento' }]} />
        </Voce> : null}
        <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: compatto ? d['spazio-blocco'] : d['spazio-icona'] }}>
          <View style={{ flex: compatto ? undefined : 1, minWidth: 0 }}>
            <ConErrore campo="importo"><Campo etichetta="Importo totale" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" /></ConErrore>
          </View>
          <View style={{ flex: compatto ? undefined : 1.5, minWidth: 0, gap: d['spazio-testo'] }}>
            <Tendina etichetta="Categoria" valore={spostamento ? null : categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags"
              disattivato={spostamento} segnaposto={spostamento ? 'Nessuna: è un giroconto' : undefined} />
            {spostamento ? <Testo stile="dettaglio-normale" colore="testo-secondario">I soldi restano tuoi, su un altro conto: non è una spesa, quindi non ha categoria.</Testo>
            : spesa && !spesa.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è solo tua: ${spesa.creata_da ?? 'chi l’ha creata'} ha la sua.`}</Testo> : null}
          </View>
        </View>
      </Riquadro>
      <Riquadro titolo="Regole di uscita" nota="Ogni quanto si ripete, in quale giorno o mese esce e da quale conto.">
        {(
          <>
            <Voce etichetta="Ogni quanto esce">
              <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={frequenza} onCambia={setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'biennale', testo: 'Ogni 2 anni' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
            </Voce>
            <View style={{ gap: d['spazio-testo'] }}>
              <View style={{ gap: d['spazio-blocco'] }}>
                {frequenza === 'n' ? <ConErrore campo="ogniN"><Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" segnaposto="Es. 6" /></ConErrore> : null}
                <ConErrore campo="scadenza">
                {frequenza === 'una' ? <CampoData etichetta="Giorno in cui esce" valore={dataUna} onCambia={setDataUna} /> : (
                <View style={{ flexDirection: 'row', gap: compatto ? d['spazio-icona'] : d['spazio-colonne'] }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TendinaGiorni etichetta="Giorno (facoltativo)" valore={giornoMese} onCambia={setGiornoMese} />
                  </View>
                  {frequenza !== 'mese' ? (
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Tendina etichetta="Mese" valore={meseScad} opzioni={OPZIONI_MESE} onCambia={setMeseScad} />
                    </View>
                  ) : null}
                </View>
                )}
                </ConErrore>
              </View>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoScadenza}</Testo>
            </View>
          </>
        )}
        <Affiancati>
          <Meta><ConErrore campo="conto"><Tendina etichetta={giro ? 'Da quale conto parte' : 'Da quale conto esce'} valore={conto} opzioni={opzioniConti(rif.conti, { tenere: [conto] })} onCambia={setConto} iconaPrima="landmark" segnaposto="Scegli il conto" /></ConErrore></Meta>
          {giro ? (
            <Meta>
              <ConErrore campo="a_conto">
                <Tendina etichetta="Verso quale conto" valore={aConto || null} onCambia={setAConto} iconaPrima="landmark" segnaposto="Scegli il conto"
                  opzioni={opzioniConti(rif.conti, { tenere: [aConto], escludi: [conto] })} />
              </ConErrore>
            </Meta>
          ) : null}
        </Affiancati>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{spostamento
          ? 'Con la spunta la tua quota passa dal conto di partenza a quello di arrivo; togliendo la spunta torna indietro. Non è una spesa.'
          : 'Con la spunta la tua quota esce dal saldo del conto; togliendo la spunta il saldo torna com’era.'}</Testo>
      </Riquadro>
      {!spesa || spesa.mia ? <SezioneDivisione stato={div} cosa="spesa" cifra={leggiImporto(importo)} testoCondividi="Condividi questa spesa con un'altra persona" />
      : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
    </FinestraModulo>
  );
}
