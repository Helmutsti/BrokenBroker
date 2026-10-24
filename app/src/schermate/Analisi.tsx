import { View } from 'react-native';
import { Intestazione, NumeroChiave, RigaNumeri, RigaAvanzamento, RigaRata, Scheda, Vuoto } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, Patrimonio, Proiezione, Rata, RiepilogoMese } from '../dati/tipi.ts';
import { euro, euroTondi, nomeMeseMinuscolo, numero } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';

// SC-07 Analisi: il tenore di vita nel tempo.
export function Analisi() {
  const rif = useRiferimenti();
  const mese = useDati<RiepilogoMese>(`/analisi/mese?mese=${rif.mese}`).dati;
  const patrimonio = useDati<Patrimonio>('/analisi/patrimonio').dati;
  const proiezione = useDati<Proiezione>('/analisi/proiezione').dati;
  const rate = useDati<Rata[]>('/rate').dati ?? [];
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  const spese = useDati<{ categoria_id: string; speso: string }[]>(`/categorie/spese?mese=${rif.mese}`).dati ?? [];
  if (!mese) return <Caricamento />;

  const pct = mese.risparmio_percentuale;
  const attive = rate.filter((r) => r.attiva);
  // Quando finisce la prossima rata: di quanto sale il risparmio da quel mese.
  const prossimaFine = attive.slice().sort((a, b) => a.ultima_scadenza.localeCompare(b.ultima_scadenza))[0];
  const conLaFine = prossimaFine ? attive.filter((r) => r.ultima_scadenza.slice(0, 7) === prossimaFine.ultima_scadenza.slice(0, 7)) : [];
  const sollievo = conLaFine.reduce((t, r) => t + Number(r.importo_rata), 0);
  const stip = Number(mese.stipendio);
  const pctDopo = stip > 0 ? Math.round(((Number(mese.risparmio) + sollievo) / stip) * 1000) / 10 : null;

  // Peso sullo stipendio: spese per categoria di primo livello (rami inclusi), dalla più alta.
  const stipendio = Number(rif.profilo?.stipendio_netto ?? 0);
  const spesoDiretto = new Map(spese.map((s) => [s.categoria_id, Number(s.speso)]));
  const spesoRamo = (id: string): number => (spesoDiretto.get(id) ?? 0) + rif.categorie.filter((c) => c.padre_id === id).reduce((t, c) => t + spesoRamo(c.id), 0);
  const pesi = rif.categorie.filter((c) => !c.padre_id && c.tipo === 'uscita').map((c) => ({ id: c.id, nome: c.nome, importo: spesoRamo(c.id) }))
    .filter((p) => p.importo > 0).sort((a, b) => b.importo - a.importo);
  const totaleSpese = pesi.reduce((t, p) => t + p.importo, 0);
  const sullaPaga = (importo: number) => `${numero((importo / stipendio) * 100, 1)}%`;

  return (
    <>
      <Intestazione titolo="Analisi" sottotitolo="Il tuo tenore di vita: quanto risparmi, dove va la paga e come va nel tempo." />
      <RigaNumeri>
        <NumeroChiave etichetta={`Risparmio di ${nomeMeseMinuscolo(rif.mese)}`} valore={pct === null ? '—' : `${pct > 0 ? '+' : ''}${numero(pct, Number.isInteger(pct) ? 0 : 1)}%`} icona="scale"
          tono={mese.semaforo === 'ok' ? 'ok' : mese.semaforo === 'attenzione' ? 'attenzione' : 'errore'}
          nota={Number(mese.risparmio) < 0 ? `Si spende più di quanto entra: ${euroTondi(mese.risparmio)} sul mese` : `${euroTondi(mese.risparmio)} messi da parte nel mese, investimenti compresi`} />
        {prossimaFine && pctDopo !== null ? (
          <NumeroChiave etichetta={`Da ${nomeMeseMinuscolo(prossimaFine.ultima_scadenza.slice(0, 7))}`} valore={`${pctDopo > 0 ? '+' : ''}${numero(pctDopo, 0)}%`} icona="trending-up" tono={pctDopo >= 20 ? 'ok' : 'attenzione'}
            nota={`Finisce ${conLaFine.map((r) => r.oggetto).join(' e ')}: +${euroTondi(sollievo)} al mese`} />
        ) : <NumeroChiave etichetta="Rate" valore={attive.length ? `${attive.length} aperte` : 'Nessuna'} icona="credit-card" />}
        <NumeroChiave etichetta="Patrimonio" valore={patrimonio ? euro(patrimonio.totale) : '—'} icona="landmark" nota="Investimenti − rate ancora da pagare" />
      </RigaNumeri>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <Scheda titolo="Se nulla cambia" icona="trending-up" style={{ flex: 1 }}>
          <Testo stile="dettaglio-normale" colore="testo-secondario">Patrimonio con l'avanzo di ogni mese, contando la fine delle rate</Testo>
          <View>{proiezione ? [1, 12, 60].map((m) => <RigaRata key={m} compatta icona="trending-up" nome={m === 1 ? 'Fra 1 mese' : m === 12 ? 'Fra 1 anno' : 'Fra 5 anni'} fine="" rata={euroTondi(proiezione.punti.find((x) => x.mesi === m)?.patrimonio ?? 0)} />) : null}</View>
        </Scheda>
      </View>
      <Scheda titolo="Peso sullo stipendio" nota="Quanto della paga se ne va in ogni categoria" icona="percent">
        {stipendio > 0 ? (
          <View>
            {pesi.map((p) => <RigaAvanzamento key={p.id} compatta nome={p.nome} icona={rif.iconaCategoria(p.id)} importo={euro(p.importo)} percentuale={sullaPaga(p.importo)} valore={(p.importo / stipendio) * 100} />)}
            <RigaAvanzamento compatta nome="Totale spese" icona="calculator" importo={euro(totaleSpese)} percentuale={sullaPaga(totaleSpese)} valore={(totaleSpese / stipendio) * 100} stato={totaleSpese > stipendio ? 'attenzione' : 'in-corso'} />
            <RigaAvanzamento compatta nome="Resta" icona="piggy-bank" importo={euro(stipendio - totaleSpese)} percentuale={sullaPaga(stipendio - totaleSpese)} valore={((stipendio - totaleSpese) / stipendio) * 100} stato={stipendio - totaleSpese < 0 ? 'attenzione' : 'completo'} />
          </View>
        ) : <Testo stile="dettaglio-normale" colore="testo-secondario">Scrivi lo stipendio in Impostazioni per vedere i pesi.</Testo>}
      </Scheda>
      <Scheda titolo="Rate" nota={controllo ? `${controllo.rate_attive} aperte · ${euro(controllo.rata_mensile)} al mese` : undefined} icona="credit-card">
        {attive.length === 0 ? <Vuoto testo="Nessuna rata aperta." /> : (
          <View>{attive.map((r) => <RigaRata key={r.id} nome={r.oggetto} fine={`finisce a ${nomeMeseMinuscolo(r.ultima_scadenza.slice(0, 7))} ${r.ultima_scadenza.slice(0, 4)} · ${r.rimanenti} rate`} rata={`${euro(r.importo_rata)} al mese`} />)}</View>
        )}
      </Scheda>
    </>
  );
}
