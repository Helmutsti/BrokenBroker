import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Pulsante, type StatoPressione } from '../componenti/base.tsx';
import { Tendina } from '../componenti/campi.tsx';
import { CifraModificabile, Intestazione, NumeroChiave, Scheda, Vuoto } from '../componenti/composti.tsx';
import { crea, modifica, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Obiettivo, Spesa } from '../dati/tipi.ts';
import { euro, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import type { NomeColore } from '../tema/token.ts';
import { aggiungiMesi, Caricamento, eAnnuale, prossimaScadenza, tuttiGliObiettivi } from './comuni.tsx';
import { FinestraVersa, Obiettivi } from './Obiettivi.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';

// Mesi interi passati da `da` ad `a` (il giorno conta: dal 5 al 4 del mese dopo è 0).
const mesiPassati = (da: string, a: string) => {
  const [a1, m1, g1] = da.split('-').map(Number), [a2, m2, g2] = a.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (g2 < g1 ? 1 : 0);
};

type RigaAnnuale = { s: Spesa; quando: string; ogni: number; passati: number; costa: number; dovrebbe: number; ce: number; figlio: Obiettivo | null };

// Le spese annuali si riempiono di un dodicesimo al mese fino alla scadenza: per
// ognuna quanto dovrebbe esserci oggi. Una spesa con il suo sotto-obiettivo ha i
// soldi di quel sotto-obiettivo; per le altre i soldi liberi del salvadanaio vanno
// prima alle scadenze più vicine (decisione di Manuel, proposta v5).
function riempimento(spese: Spesa[], liberi: number, figli: Obiettivo[], oggi = oggiIso()) {
  const righe: RigaAnnuale[] = spese.filter(eAnnuale).map((s) => {
    const quando = prossimaScadenza(s.prossima_scadenza, s.ogni_mesi, oggi)!;
    const ogni = s.ogni_mesi!, costa = Number(s.mia_quota);
    const passati = Math.max(0, Math.min(ogni, mesiPassati(aggiungiMesi(quando, -ogni), oggi)));
    const figlio = figli.find((f) => f.paga_spesa?.id === s.id) ?? null;
    return { s, quando, ogni, passati, costa, dovrebbe: Math.round((costa * passati / ogni) * 100) / 100, ce: figlio ? Number(figlio.saldo) : 0, figlio };
  }).filter((x) => x.quando).sort((a, b) => a.quando.localeCompare(b.quando));
  let resto = liberi;
  for (const r of righe) if (!r.figlio) { r.ce = Math.max(0, Math.min(r.dovrebbe, resto)); resto -= r.ce; }
  const saldo = liberi + righe.reduce((t, r) => t + (r.figlio ? r.ce : 0), 0);
  const dovrebbe = righe.reduce((t, r) => t + r.dovrebbe, 0);
  return { righe, dovrebbe, indietro: Math.max(0, dovrebbe - saldo), inPiu: Math.max(0, saldo - dovrebbe), annuo: righe.reduce((t, r) => t + (r.costa * 12) / r.ogni, 0) };
}

// Salvadanai (proposta v5): il foglio Trade Republic dell'Excel. Spese annuali con
// costa / dovrebbe esserci / c'è, poi fondo emergenza e obiettivi.
export function Salvadanai() {
  const rif = useRiferimenti();
  const ob = useDati<Obiettivo[]>('/obiettivi');
  const sp = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const [spesa, setSpesa] = useState<Spesa | 'nuova' | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const profilo = rif.profilo;
  if (!ob.dati || !sp.dati || !profilo) return <Caricamento errore={ob.errore ?? sp.errore} />;
  const tutti = tuttiGliObiettivi(ob.dati);
  const attive = sp.dati.spese.filter((s) => s.attiva);
  const scelto = profilo.obiettivo_annuali ?? attive.find((s) => eAnnuale(s) && s.obiettivo_id)?.obiettivo_id ?? tutti.find((o) => /spese annuali/i.test(o.nome))?.id ?? null;
  const salvadanaio = tutti.find((o) => o.id === scelto) ?? null;
  const saldo = Number(salvadanaio?.saldo ?? 0);
  // I soldi liberi sono quelli del salvadanaio fuori dai sotto-obiettivi delle spese.
  const figliSpese = salvadanaio?.figli.filter((f) => f.paga_spesa) ?? [];
  const r = riempimento(attive, saldo - figliSpese.reduce((t, f) => t + Number(f.saldo), 0), figliSpese);
  const senzaSotto = r.righe.filter((x) => !x.figlio).length;
  const dividi = async () => {
    setErrore(null);
    try { await crea(`/obiettivi/${salvadanaio!.id}/annuali`); } catch (e) { setErrore((e as Error).message); }
  };
  const nei = ob.dati.reduce((t, o) => t + Number(o.saldo), 0);
  // Quanto entra ogni mese dalle voci "mettici da parte" in Spese (quelle annuali contano un dodicesimo).
  const alimentati = tutti.filter((o) => o.alimentato_da);
  const alMese = alimentati.reduce((t, o) => t + Number(o.alimentato_da!.importo) / (o.alimentato_da!.ogni_mesi ?? 1), 0);

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Quello che metti da parte: spese annuali, emergenze e obiettivi." />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Nei salvadanai" valore={euro(nei)} icona="piggy-bank" nota={`In ${ob.dati.length} ${ob.dati.length === 1 ? 'salvadanaio' : 'salvadanai'}`} />
        <NumeroChiave etichetta="Ogni mese in Spese" valore={euro(alMese)} icona="calendar-check"
          nota={alimentati.length ? `Da ${alimentati.length} ${alimentati.length === 1 ? 'salvadanaio' : 'salvadanai'}` : 'Nessun salvadanaio è ancora una voce di Spese'} />
        <NumeroChiave etichetta="Spese annuali" valore={r.indietro > 0.005 ? `Indietro di ${euro(r.indietro)}` : 'In pari'} icona="calendar-clock" tono={r.indietro > 0.005 ? 'attenzione' : 'normale'}
          nota={`Oggi dovrebbero esserci ${euro(r.dovrebbe)}, ce ne sono ${euro(saldo)}`} />
      </View>
      <Scheda titolo={salvadanaio?.nome ?? 'Spese annuali'} icona="calendar-clock"
        nota={salvadanaio?.alimentato_da ? `Ogni mese in Spese: ${euro(salvadanaio.alimentato_da.importo)}` : `Ogni mese ci vorrebbero ${euro(r.annuo / 12)}`}
        azione={salvadanaio ? <CifraModificabile cifra={euro(saldo)} etichetta={`Cambia la cifra del salvadanaio: ${euro(saldo)}`} onPress={() => setVersa(salvadanaio)} /> : undefined}>
        <View style={{ gap: d['spazio-blocco'] }}>
          {r.righe.length === 0 ? <Vuoto testo="Nessuna spesa annuale. Aggiungine una scegliendo «Ogni anno» o «Ogni N mesi»." />
            : <TabellaAnnuali righe={r.righe} onApri={setSpesa} onCifra={(f) => setVersa(f)} />}
          {errore ? <Esito tono="errore" testo={errore} /> : null}
          {salvadanaio && senzaSotto ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
              <View style={{ flex: 1 }}><Esito tono="informazione" testo={`${senzaSotto === 1 ? 'Una spesa non ha' : `${senzaSotto} spese non hanno`} ancora il suo sotto-obiettivo: dividendo il salvadanaio, ogni spesa ha i suoi soldi e la sua data, e nasce la voce mensile in Spese che lo riempie.`} /></View>
              <Pulsante etichetta="Dividi per spesa" icona="layers" onPress={dividi} />
            </View>
          ) : null}
          {r.righe.length ? (
            <Esito tono={r.indietro > 0.005 ? 'attenzione' : 'ok'} testo={r.indietro > 0.005
              ? `Ogni spesa si riempie di un dodicesimo al mese, così alla scadenza è pronta. Oggi dovrebbero esserci ${euro(r.dovrebbe)}, nel salvadanaio ce ne sono ${euro(saldo)}: sei indietro di ${euro(r.indietro)}. I soldi vanno prima alle scadenze più vicine.`
              : `Sei in pari: oggi dovrebbero esserci ${euro(r.dovrebbe)} e nel salvadanaio ce ne sono ${euro(saldo)}${r.inPiu > 0.005 ? `, ${euro(r.inPiu)} in più` : ''}.`} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
            <View style={{ width: 320 }}>
              <Tendina etichetta="Il salvadanaio delle spese annuali" valore={salvadanaio?.id ?? null} segnaposto="Scegli il salvadanaio"
                opzioni={tutti.map((o) => ({ valore: o.id, testo: o.nome }))} onCambia={(id) => modifica('/profilo', { obiettivo_annuali: id })} />
            </View>
            <View style={{ flex: 1 }} />
            <Pulsante tipo="testo" etichetta="Aggiungi una spesa annuale" icona="plus" onPress={() => setSpesa('nuova')} />
          </View>
        </View>
      </Scheda>
      <Obiettivi escludi={salvadanaio?.id ?? null} />
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraVersa obiettivo={versa} onChiudi={() => setVersa(null)} />
    </>
  );
}

// Tabella arrotondata come quella dei portafogli: prima la spesa, poi i numeri.
function TabellaAnnuali({ righe, onApri, onCifra }: { righe: RigaAnnuale[]; onApri: (s: Spesa) => void; onCifra: (o: Obiettivo) => void }) {
  const { c } = useTema();
  const col = (testo: string, w: number, stile: 'dettaglio-forte' | 'corpo-normale' | 'corpo-forte', colore: NomeColore, sinistra = false) => (
    <View style={{ width: w, alignItems: sinistra ? 'flex-start' : 'flex-end' }}><Testo stile={stile} colore={colore}>{testo}</Testo></View>
  );
  return (
    <View style={{ borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-controllo'], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], backgroundColor: c['sfondo-tenue'] }}>
        <View style={{ flex: 1 }}><Testo stile="dettaglio-forte" colore="testo-secondario">Spesa</Testo></View>
        {col('Quando', 220, 'dettaglio-forte', 'testo-secondario', true)}{col('Costa', 110, 'dettaglio-forte', 'testo-secondario')}
        {col('Dovrebbe esserci', 140, 'dettaglio-forte', 'testo-secondario')}{col("C'è", 110, 'dettaglio-forte', 'testo-secondario')}
      </View>
      {righe.map((r) => {
        const pari = r.ce >= r.dovrebbe - 0.005;
        const anno = r.quando.slice(0, 4) !== oggiIso().slice(0, 4) ? ` ${r.quando.slice(0, 4)}` : '';
        return (
          <Pressable key={r.s.id} accessibilityRole="button" accessibilityLabel={r.s.nome} onPress={() => onApri(r.s)}
            style={(s: StatoPressione) => ({ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'],
              borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] })}>
            <View style={{ flex: 1 }}><Testo stile="corpo-forte" numberOfLines={1}>{r.s.nome}</Testo></View>
            {col(`${nomeMeseMinuscolo(r.quando.slice(0, 7))}${anno} · ${r.passati} mesi su ${r.ogni}`, 220, 'corpo-normale', 'testo-secondario', true)}
            {col(euro(r.costa), 110, 'corpo-normale', 'testo-secondario')}
            {col(euro(r.dovrebbe), 140, 'corpo-normale', 'testo-secondario')}
            {r.figlio ? (
              // Con il suo sotto-obiettivo la cifra si cambia cliccandola, come negli altri salvadanai.
              <Pressable accessibilityRole="button" accessibilityLabel={`Cambia la cifra di ${r.s.nome}: ${euro(r.ce)}`} onPress={() => onCifra(r.figlio!)}
                style={(s: StatoPressione) => ({ width: 110, alignItems: 'flex-end', borderRadius: d['raggio-controllo-interno'], backgroundColor: s.hovered ? c['sfondo-tenue'] : 'transparent' })}>
                <Testo stile="corpo-forte" colore={pari ? 'testo-ok' : 'testo-attenzione'}>{euro(r.ce)}</Testo>
              </Pressable>
            ) : col(euro(r.ce), 110, 'corpo-forte', pari ? 'testo-ok' : 'testo-attenzione')}
          </Pressable>
        );
      })}
    </View>
  );
}
