import { useState } from 'react';
import { View } from 'react-native';
import { Criterio, Esito, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, Tendina } from '../componenti/campi.tsx';
import { GraficoMesi, Intestazione, NumeroChiave, RigaControllo, RigaRata, Scheda, Vuoto } from '../componenti/composti.tsx';
import { crea, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, EsitoAcquisto, MeseStorico, Patrimonio, Proiezione, Rata, RiepilogoMese } from '../dati/tipi.ts';
import { euro, euroTondi, leggiImporto, meseCorto, nomeMeseMinuscolo, numero } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Voce } from './moduli.tsx';

// I 7 criteri della spesa utile (dal foglio Excel).
const CRITERI = ['Ti fa risparmiare tempo', 'Ti fa guadagnare di più', 'Riduce stress reale', 'Dura a lungo', 'Lo userai spesso', 'Sostituisce costi peggiori', 'Coerente con il patrimonio'];

// SC-07 Analisi: il tenore di vita nel tempo e la prova di un acquisto.
export function Analisi() {
  const rif = useRiferimenti();
  const [mesi, setMesi] = useState('6');
  const mese = useDati<RiepilogoMese>(`/analisi/mese?mese=${rif.mese}`).dati;
  const storico = useDati<MeseStorico[]>(`/analisi/storico?mesi=${mesi}&mese=${rif.mese}`);
  const patrimonio = useDati<Patrimonio>('/analisi/patrimonio').dati;
  const proiezione = useDati<Proiezione>('/analisi/proiezione').dati;
  const rate = useDati<Rata[]>('/rate').dati ?? [];
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  if (!mese || !storico.dati) return <Caricamento errore={storico.errore} />;

  const pct = mese.risparmio_percentuale;
  const attive = rate.filter((r) => r.attiva);
  // Quando finisce la prossima rata: di quanto sale il risparmio da quel mese.
  const prossimaFine = attive.slice().sort((a, b) => a.ultima_scadenza.localeCompare(b.ultima_scadenza))[0];
  const conLaFine = prossimaFine ? attive.filter((r) => r.ultima_scadenza.slice(0, 7) === prossimaFine.ultima_scadenza.slice(0, 7)) : [];
  const sollievo = conLaFine.reduce((t, r) => t + Number(r.importo_rata), 0);
  const stip = Number(mese.stipendio);
  const pctDopo = stip > 0 ? Math.round(((Number(mese.risparmio) + sollievo) / stip) * 1000) / 10 : null;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: 1 }}><Intestazione titolo="Analisi" sottotitolo="Il tuo tenore di vita: quanto risparmi davvero, come va nel tempo e se un acquisto è sostenibile." /></View>
        <Tendina larghezza={180} valore={mesi} onCambia={setMesi} opzioni={[{ valore: '6', testo: 'Ultimi 6 mesi' }, { valore: '12', testo: 'Ultimi 12 mesi' }, { valore: '24', testo: 'Ultimi 24 mesi' }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta={`Risparmio di ${nomeMeseMinuscolo(rif.mese)}`} valore={pct === null ? '—' : `${pct > 0 ? '+' : ''}${numero(pct, Number.isInteger(pct) ? 0 : 1)}%`} icona="scale"
          tono={mese.semaforo === 'ok' ? 'ok' : mese.semaforo === 'attenzione' ? 'attenzione' : 'errore'}
          nota={Number(mese.risparmio) < 0 ? `Si spende più di quanto entra: ${euroTondi(mese.risparmio)} sul mese` : `${euroTondi(mese.risparmio)} messi da parte nel mese, investimenti compresi`} />
        {prossimaFine && pctDopo !== null ? (
          <NumeroChiave etichetta={`Da ${nomeMeseMinuscolo(prossimaFine.ultima_scadenza.slice(0, 7))}`} valore={`${pctDopo > 0 ? '+' : ''}${numero(pctDopo, 0)}%`} icona="trending-up" tono={pctDopo >= 20 ? 'ok' : 'attenzione'}
            nota={`Finisce ${conLaFine.map((r) => r.oggetto).join(' e ')}: +${euroTondi(sollievo)} al mese`} />
        ) : <NumeroChiave etichetta="Rate" valore={attive.length ? `${attive.length} aperte` : 'Nessuna'} icona="credit-card" />}
        <NumeroChiave etichetta="Patrimonio" valore={patrimonio ? euro(patrimonio.totale) : '—'} icona="landmark" nota="Conti + investimenti − rate ancora da pagare" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <Scheda titolo="Mese per mese" nota="Entrate e uscite" icona="chart-column" style={{ flex: 1 }}>
          <GraficoMesi mesi={storico.dati.map((m) => ({ etichetta: meseCorto(m.mese).replace(/^./, (c) => c.toUpperCase()), entrate: Number(m.entrate), uscite: Number(m.uscite),
            sotto: euro(m.risparmio, { segno: true, decimali: 0 }), sottoColore: Number(m.risparmio) < 0 ? 'testo-errore' : 'testo-ok' }))} />
          <Testo stile="dettaglio-normale" colore="testo-secondario">Barra delle uscite in rosso quando superano le entrate. Il mese in corso è ancora aperto.</Testo>
        </Scheda>
        <Scheda titolo="Se nulla cambia" icona="trending-up" style={{ width: 400 }}>
          <Testo stile="dettaglio-normale" colore="testo-secondario">Patrimonio con l'avanzo di ogni mese, contando la fine delle rate</Testo>
          <View>{proiezione ? [1, 12, 60].map((m) => <RigaRata key={m} compatta icona="trending-up" nome={m === 1 ? 'Fra 1 mese' : m === 12 ? 'Fra 1 anno' : 'Fra 5 anni'} fine="" rata={euroTondi(proiezione.punti.find((x) => x.mesi === m)?.patrimonio ?? 0)} />) : null}</View>
        </Scheda>
      </View>
      <PossoPermettermelo />
      <Scheda titolo="Rate e regole" nota={controllo ? `${controllo.rate_attive} aperte · ${euro(controllo.rata_mensile)} al mese` : undefined} icona="credit-card">
        {attive.length === 0 ? <Vuoto testo="Nessuna rata aperta." /> : (
          <View>{attive.map((r) => <RigaRata key={r.id} nome={r.oggetto} fine={`finisce a ${nomeMeseMinuscolo(r.ultima_scadenza.slice(0, 7))} ${r.ultima_scadenza.slice(0, 4)} · ${r.rimanenti} rate`} rata={`${euro(r.importo_rata)} al mese`} />)}</View>
        )}
        {controllo?.controlli.length ? (
          <View style={{ gap: d['spazio-elenco'] }}>{controllo.controlli.map((c) => <RigaControllo key={c.regola} testo={c.testo} rispettata={c.rispettata} />)}</View>
        ) : <Testo stile="dettaglio-normale" colore="testo-secondario">Le tue regole sulle rate si impostano nelle impostazioni.</Testo>}
      </Scheda>
    </>
  );
}

function PossoPermettermelo() {
  const [cosa, setCosa] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [modo, setModo] = useState<'subito' | 'rate'>('subito');
  const [numeroRate, setNumeroRate] = useState('6');
  const [vita, setVita] = useState('48');
  const [criteri, setCriteri] = useState<string[]>([]);
  const [esito, setEsito] = useState<EsitoAcquisto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const prova = async () => {
    setErrore(null);
    const p = leggiImporto(prezzo);
    if (!p || Number(p) <= 0) { setErrore('Scrivi il prezzo, es. 1.200,00'); return; }
    try { setEsito(await crea<EsitoAcquisto>('/analisi/posso-permettermelo', { prezzo: p, a_rate: modo === 'rate', numero_rate: modo === 'rate' ? Number(numeroRate) : undefined, vita_utile_mesi: Number(vita) })); }
    catch (e) { setErrore((e as Error).message); }
  };
  const rate = Number(numeroRate);
  return (
    <Scheda titolo="Posso permettermelo?" nota="Prova un acquisto prima di farlo" icona="calculator">
      <View style={{ flexDirection: 'row', gap: d['spazio-gruppo'], alignItems: 'flex-start' }}>
        <View style={{ width: 320, gap: d['spazio-blocco'] }}>
          <Campo etichetta="Cosa" valore={cosa} onCambia={setCosa} segnaposto="Es. Fotocamera Nikon" />
          <Campo etichetta="Prezzo" valore={prezzo} onCambia={setPrezzo} segnaposto="0,00" inputMode="decimal" onSubmitEditing={prova} />
          <Voce etichetta="Come paghi"><SceltaSegmenti etichetta="Come paghi" larghezzaPiena valore={modo} onCambia={setModo} opzioni={[{ valore: 'subito', testo: 'Tutto subito' }, { valore: 'rate', testo: 'A rate' }]} /></Voce>
          {modo === 'rate' ? <Tendina etichetta="Numero di rate" valore={numeroRate} onCambia={setNumeroRate}
            opzioni={[3, 6, 10, 12, 18, 24, 36].map((n) => ({ valore: String(n), testo: `${n} rate${leggiImporto(prezzo) ? ` da ${euro(Number(leggiImporto(prezzo)) / n)}` : ''}` }))} /> : null}
          <Tendina etichetta="Ogni quanto la ricompreresti" valore={vita} onCambia={setVita}
            opzioni={[12, 24, 36, 48, 60, 84, 120].map((n) => ({ valore: String(n), testo: n % 12 === 0 ? `Ogni ${n / 12 === 1 ? 'anno' : `${n / 12} anni`}` : `Ogni ${n} mesi` }))} />
          <Pulsante tipo="primario" etichetta="Prova" icona="calculator" onPress={prova} />
        </View>
        <View style={{ flex: 1, gap: d['spazio-blocco'] }}>
          {errore ? <Esito tono="errore" testo={errore} /> : null}
          {esito ? (
            <>
              <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
                <NumeroChiave etichetta="Costo reale al mese" valore={euro(Number(prezzo ? leggiImporto(prezzo) : 0) / Number(vita))} icona="calculator" nota={`${euro(leggiImporto(prezzo) ?? 0)} diviso ${vita} mesi`} />
                {esito.rata ? <NumeroChiave etichetta={`Rata per ${rate} mesi`} valore={euro(esito.rata)} icona="credit-card" nota="Si somma alle rate già aperte" />
                  : <NumeroChiave etichetta="Peso sul margine" valore={esito.peso_sul_margine === null ? '—' : `${numero(esito.peso_sul_margine, 0)}%`} icona="scale" nota={`Margine del mese ${euro(esito.margine)}`} />}
                <NumeroChiave etichetta="Mesi per risparmiarla" valore={esito.mesi_di_risparmio === null ? '—' : `${numero(esito.mesi_di_risparmio, 1).replace(',0', '')} mesi`} icona="calendar" nota="Con il risparmio di questo mese" />
              </View>
              {esito.regole.length ? (
                <Voce etichetta="Le tue regole"><View style={{ gap: d['spazio-elenco'] }}>{esito.regole.map((r) => <RigaControllo key={r.regola} testo={r.testo} rispettata={r.rispettata} />)}</View></Voce>
              ) : null}
            </>
          ) : <Testo colore="testo-secondario">Scrivi cosa vuoi comprare e il prezzo, poi premi Prova.</Testo>}
          <Voce etichetta={`È una spesa utile? (${criteri.length} su ${CRITERI.length} criteri)`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-pillole'] }}>
              {CRITERI.map((c) => <Criterio key={c} testo={c} scelto={criteri.includes(c)} onPress={() => setCriteri(criteri.includes(c) ? criteri.filter((x) => x !== c) : [...criteri, c])} />)}
            </View>
          </Voce>
          {esito ? <Esito tono={esito.esito === 'si' ? 'ok' : esito.esito === 'attenzione' ? 'attenzione' : 'errore'} testo={
            esito.esito === 'si' ? `Puoi permettertela${cosa ? `: ${cosa}` : ''}. Pesa poco sul margine del mese.`
              : esito.esito === 'attenzione' ? 'Si può fare, ma pesa più della metà del margine del mese.'
                : esito.regole.some((r) => !r.rispettata) ? 'Aspetta: oggi rompe le tue regole sulle rate.' : 'Aspetta: il margine del mese non basta.'} /> : null}
        </View>
      </View>
    </Scheda>
  );
}
