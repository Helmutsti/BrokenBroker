import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante, SceltaSegmenti, type Tono } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina, TendinaGiorni } from '../componenti/campi.tsx';
import { CalendarioAnnuali, Intestazione, NumeroChiave, RigaNumeri, RigaSpesa, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, modifica, crea, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Spesa, TipoSpesa } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { primaOccorrenzaPersonale } from '../mesePersonale.ts';
import { Caricamento, calendarioAnnuali, eAnnuale, proxSpesa, quando, segnoQuota } from './comuni.tsx';
import { ConErrore, FinestraModulo, Riquadro, SezioneDivisione, serve, useDivisione, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

type Filtro = 'tutte' | 'mese' | 'periodiche' | 'spente';
type Frequenza = 'mese' | 'anno' | 'biennale' | 'n' | 'una';

// SC-02 Spese previste (proposta v2): le spese di ogni mese e le annuali in due
// schede separate; le annuali con il calendario dei prossimi 12 mesi. Sono promemoria:
// escono per intero nel mese giusto (decisione 50).
export function SpesePreviste() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const { dati, errore } = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const [filtro, setFiltro] = useState<Filtro>('tutte');
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Spesa | 'nuova' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const inizio = rif.profilo?.inizio_mese ?? 1;
  // I promemoria dei salvadanai (decisione 51) non sono spese: stanno in una scheda a parte, fuori dai totali.
  const attive = dati.spese.filter((s) => s.attiva && !s.alimenta_obiettivo_id);
  const mensili = attive.filter((s) => s.ogni_mesi === 1);
  const somma = (xs: Spesa[]) => xs.reduce((t, s) => t + Number(s.mia_quota), 0);
  const annuo = attive.filter(eAnnuale).reduce((t, s) => t + (Number(s.mia_quota) * 12) / s.ogni_mesi!, 0);
  const perTipo = (t: TipoSpesa) => somma(mensili.filter((s) => s.tipo === t));

  const testo = cerca.trim().toLowerCase();
  const cercata = (s: Spesa) => !testo || s.nome.toLowerCase().includes(testo) || (s.categoria ?? '').toLowerCase().includes(testo);
  const visibili = dati.spese.filter((s) => !s.alimenta_obiettivo_id && (filtro === 'spente' ? !s.attiva : s.attiva) && cercata(s));
  const promemoriaSalvadanai = filtro === 'periodiche' ? [] : dati.spese.filter((s) => s.alimenta_obiettivo_id && (filtro === 'spente' ? !s.attiva : s.attiva) && cercata(s));
  // In ordine di uscita: il giorno del mese in cui esce, poi il nome.
  const giorno = (s: Spesa) => (s.ogni_mesi === 1 ? s.giorno_mese ?? 99 : s.prossima_scadenza && !s.senza_giorno ? Number(s.prossima_scadenza.slice(8, 10)) : 99);
  const ogniMese = visibili.filter((s) => s.ogni_mesi === 1).sort((a, b) => giorno(a) - giorno(b) || a.nome.localeCompare(b.nome));
  const periodiche = visibili.filter((s) => s.ogni_mesi !== 1);
  const gruppiMese: [string, Spesa[]][] = [
    ['Fisse · ogni mese', ogniMese.filter((s) => s.tipo === 'fissa')],
    ['Investimenti · ogni mese', ogniMese.filter((s) => s.tipo === 'investimento')],
  ];
  // Annuali in ordine di prossima uscita; le "una volta sola" in fondo.
  const prossima = (s: Spesa) => proxSpesa(s, oggiIso(), inizio) ?? '9999';
  const annuali = periodiche.filter((s) => s.ogni_mesi !== null).sort((x, y) => prossima(x).localeCompare(prossima(y)));
  const unaVolta = periodiche.filter((s) => s.ogni_mesi === null);
  const calendario = calendarioAnnuali(attive, oggiIso(), inizio);
  const vediMese = filtro !== 'periodiche', vediAnnuali = filtro !== 'mese';
  const riga = (s: Spesa, alMese?: string) => (
    <RigaSpesa key={s.id} nome={s.nome} categoria={s.categoria_padre ? `${s.categoria_padre} › ${s.categoria}` : s.categoria ?? '—'} conto={s.conto ?? '—'}
      quando={quando(s, inizio)} totale={euro(s.importo)} quota={alMese ?? euro(s.mia_quota) + segnoQuota(s)} icona={s.icona ?? 'ellipsis'} avviso={avvisoSpesa(s)} onApri={() => setAperta(s)} />
  );
  const nuova = <Pulsante tipo="primario" etichetta="Nuova spesa prevista" icona="plus" onPress={() => setAperta('nuova')} />;

  return (
    <>
      <Intestazione titolo="Spese previste" sottotitolo="Le spese di ogni mese finiscono nella lista da spuntare; le annuali compaiono nel mese in cui escono, per intero." azioni={nuova} />
      <RigaNumeri>
        <NumeroChiave etichetta="Ogni mese, la tua quota" valore={euro(somma(mensili))} icona="repeat" nota={`Fisse ${euro(perTipo('fissa'))} · investimenti ${euro(perTipo('investimento'))}`} />
        <NumeroChiave etichetta="Annuali, la tua quota" valore={`${euro(annuo)} l'anno`} icona="calendar" nota="Escono per intero nel loro mese" />
      </RigaNumeri>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'center', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
        <SceltaSegmenti etichetta="Quali spese" valore={filtro} onCambia={setFiltro}
          opzioni={[{ valore: 'tutte', testo: 'Tutte' }, { valore: 'mese', testo: 'Ogni mese' }, { valore: 'periodiche', testo: 'Annuali' }, { valore: 'spente', testo: 'Non attive' }]} />
        <View style={{ width: compatto ? undefined : 300 }}><Campo valore={cerca} onCambia={setCerca} segnaposto="Cerca una spesa…" iconaPrima="search" /></View>
      </View>
      {dati.spese.length === 0 ? (
        <Scheda><Vuoto testo="Ancora nessuna spesa prevista: aggiungi affitto, bollette e abbonamenti." /></Scheda>
      ) : null}
      {dati.spese.length && vediMese ? (
        <Scheda titolo="Ogni mese" nota="Fisse e investimenti" icona="repeat">
          {ogniMese.length === 0 ? <Vuoto testo="Nessuna spesa di ogni mese con questi filtri." /> : (
            <View>
              <RigaSpesa tipo="intestazione" nome="Spesa" categoria="Categoria" conto="Conto" quando="Giorno" totale="Totale" quota="Tua quota" />
              {gruppiMese.filter(([, xs]) => xs.length).map(([titolo, xs]) => (
                <View key={titolo}><TitoloGruppo testo={titolo} destra={euro(somma(xs))} />{xs.map((s) => riga(s))}</View>
              ))}
            </View>
          )}
        </Scheda>
      ) : null}
      {dati.spese.length && vediAnnuali ? (
        <Scheda titolo="Annuali e periodiche" nota="Escono poche volte l'anno · per intero nel loro mese" icona="calendar-clock">
          {annuali.length === 0 && unaVolta.length === 0 ? <Vuoto testo="Nessuna spesa annuale con questi filtri." /> : (
            <View style={{ gap: d['spazio-blocco'] }}>
              {filtro !== 'spente' && annuali.length ? (
                <View style={{ gap: d['spazio-elenco'] }}>
                  <TitoloGruppo testo="Quando escono · prossimi 12 mesi" />
                  <CalendarioAnnuali mesi={calendario.map((m, i) => ({ etichetta: meseCorto(m.mese), importo: m.importo, attuale: i === 0 }))} />
                </View>
              ) : null}
              <View>
                <RigaSpesa tipo="intestazione" nome="Spesa" categoria="Categoria" conto="Conto" quando="Prossima uscita" totale="Totale" quota="Tua quota" />
                {annuali.map((s) => riga(s))}
                {unaVolta.length ? <TitoloGruppo testo="Una volta sola" destra={euro(somma(unaVolta))} /> : null}
                {unaVolta.map((s) => riga(s, '—'))}
              </View>
            </View>
          )}
        </Scheda>
      ) : null}
      {promemoriaSalvadanai.length ? (
        <Scheda titolo="Promemoria dei salvadanai" nota="Non sono spese: non entrano nei totali. La quota del mese si versa spuntandola in Panoramica." icona="piggy-bank">
          <View>
            <RigaSpesa tipo="intestazione" nome="Salvadanaio" categoria="Categoria" conto="Dal conto" quando="Quando" totale="Quota del mese" quota="Tua quota" />
            {promemoriaSalvadanai.map((s) => <RigaSpesa key={s.id} nome={s.nome} categoria="Salvadanaio" conto={s.conto ?? 'Soldi nuovi'} quando="Tutto il mese" totale={euro(s.importo)} quota={euro(s.mia_quota)} icona="piggy-bank" onApri={() => setAperta(s)} />)}
          </View>
        </Scheda>
      ) : null}
      <FinestraSpesa spesa={aperta === 'nuova' ? null : aperta} aperta={!!aperta} onChiudi={() => setAperta(null)} />
    </>
  );
}

const OPZIONI_MESE = [{ valore: '', testo: '—' }, ...Array.from({ length: 12 }, (_, i) => ({ valore: String(i + 1), testo: nomeMese(`2000-${String(i + 1).padStart(2, '0')}`, false) }))];

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi,
// contando per mesi personali (il mese personale in corso è ancora buono). Senza giorno vale tutto il mese personale: si salva il giorno 1.
export const primaOccorrenza = primaOccorrenzaPersonale;

// Etichetta di una riga: «Nuova · da {nome}» per una spesa ricevuta non ancora aperta; «Da categorizzare» se la categoria (la tua) manca.
const avvisoSpesa = (s: Spesa): { testo: string; tono: Tono } | undefined =>
  s.nuova ? { testo: `Nuova · da ${s.creata_da ?? 'un’altra persona'}`, tono: 'accento' }
  : !s.categoria_id && s.attiva ? { testo: 'Da categorizzare', tono: 'attenzione' } : undefined;

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
    setTipo(s?.tipo ?? 'fissa'); setConto(s?.conto_id ?? null); setCategoria(s?.categoria_id ?? null);
    setNote(s?.note ?? ''); setAttiva(s?.attiva ?? true);
  }, [aperta, spesa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decisione 37: una spesa nata da un salvadanaio (promemoria o creata al traguardo) si cambia da lì; restano libere categoria, note, attiva e divisione.
  const bloc = spesa?.bloccato_da ?? null;
  const fisso = (campo: string) => !!bloc?.campi.includes(campo);

  const salva = async () => {
    if (spesa && bloc) {
      const libero = { ...(fisso('conto_id') ? {} : { conto_id: conto }), categoria_id: categoria, note: note.trim() || null, attiva };
      await modifica<Spesa>(`/spese-previste/${spesa.id}`, libero);
      if (!spesa.mia) return;
      await div.salva(spesa.id);
      return;
    }
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
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, giorno_mese: ogni === 1 ? g : null, tipo, conto_id: conto, categoria_id: categoria,
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
  const bloccoScadenza = fisso('prossima_scadenza');
  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa prevista' : 'Nuova spesa prevista'} icona={spesa?.icona ?? 'calendar-check'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={spesa?.mia && !bloc ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined}
      confermaElimina={spesa ? { nome: `«${spesa.nome}»`, dettaglio: spesa.condivisa ? 'Sparisce anche per l’altra persona.' : 'Sparisce dalla lista del mese.' } : undefined}
      intestazioneDestra={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore="testo-secondario">{attiva ? 'Attiva' : 'Non attiva'}</Testo>
          <Interruttore acceso={attiva} onCambia={setAttiva} etichetta="Attiva" />
        </View>
      )}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{attiva ? 'Attiva: compare nella lista da spuntare del mese.' : 'Non attiva: resta salvata ma non conta.'}</Testo>
      {bloc ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`Nasce dal salvadanaio «${bloc.nome}»: per cambiarla apri il salvadanaio, in Salvadanai.`}</Testo>
      ) : null}
      <Riquadro titolo="Che spesa è" nota="Come si chiama, di che tipo è e quanto costa.">
        <ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} disattivato={fisso('nome')} /></ConErrore>
        {spesa?.tipo === 'investimento' ? <Voce etichetta="Tipo" aiuto="Un importo che metti da parte per investire.">
          <SceltaSegmenti etichetta="Tipo di spesa" larghezzaPiena valore={tipo} onCambia={fisso('tipo') ? () => {} : setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'investimento' as const, testo: 'Investimento' }]} />
        </Voce> : null}
        <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: compatto ? d['spazio-blocco'] : d['spazio-icona'] }}>
          <View style={{ flex: compatto ? undefined : 1, minWidth: 0 }}>
            <ConErrore campo="importo"><Campo etichetta="Importo totale" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" disattivato={fisso('importo')} /></ConErrore>
          </View>
          <View style={{ flex: compatto ? undefined : 1.5, minWidth: 0 }}>
            <Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" />
            {spesa && !spesa.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è solo tua: ${spesa.creata_da ?? 'chi l’ha creata'} ha la sua.`}</Testo> : null}
          </View>
        </View>
      </Riquadro>
      <Riquadro titolo="Regole di uscita" nota="Ogni quanto si ripete, in quale giorno o mese esce e da quale conto.">
        {(
          <>
            <Voce etichetta="Ogni quanto esce">
              <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={frequenza} onCambia={fisso('ogni_mesi') ? () => {} : setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'biennale', testo: 'Ogni 2 anni' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
            </Voce>
            <View style={{ gap: d['spazio-testo'] }}>
              <View style={{ gap: d['spazio-blocco'] }}>
                {frequenza === 'n' ? <ConErrore campo="ogniN"><Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" segnaposto="Es. 6" disattivato={fisso('ogni_mesi')} /></ConErrore> : null}
                <ConErrore campo="scadenza">
                {frequenza === 'una' ? <CampoData etichetta="Giorno in cui esce" valore={dataUna} onCambia={setDataUna} disattivato={bloccoScadenza} /> : (
                <View style={{ flexDirection: 'row', gap: compatto ? d['spazio-icona'] : d['spazio-colonne'] }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TendinaGiorni etichetta="Giorno (facoltativo)" valore={giornoMese} onCambia={setGiornoMese} disattivato={bloccoScadenza} />
                  </View>
                  {frequenza !== 'mese' ? (
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Tendina etichetta="Mese" valore={meseScad} opzioni={OPZIONI_MESE} onCambia={setMeseScad} disattivato={bloccoScadenza} />
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
        <Tendina etichetta="Da quale conto esce" disattivato={fisso('conto_id')} valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} />
      </Riquadro>
      {!spesa || spesa.mia ? <SezioneDivisione stato={div} cosa="spesa" cifra={leggiImporto(importo)} testoCondividi="Condividi questa spesa con un'altra persona" />
      : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
    </FinestraModulo>
  );
}
