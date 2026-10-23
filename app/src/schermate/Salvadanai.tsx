import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Pulsante, type StatoPressione } from '../componenti/base.tsx';
import { Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, Scheda, Vuoto } from '../componenti/composti.tsx';
import { modifica, useDati } from '../dati/api.ts';
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

type RigaAnnuale = { s: Spesa; quando: string; ogni: number; passati: number; costa: number; dovrebbe: number; ce: number };

// Le spese annuali si riempiono di un dodicesimo al mese fino alla scadenza: per
// ognuna quanto dovrebbe esserci oggi, e i soldi del salvadanaio vanno prima alle
// scadenze più vicine (decisione di Manuel, proposta v5).
function riempimento(spese: Spesa[], saldo: number, oggi = oggiIso()) {
  const righe: RigaAnnuale[] = spese.filter(eAnnuale).map((s) => {
    const quando = prossimaScadenza(s.prossima_scadenza, s.ogni_mesi, oggi)!;
    const ogni = s.ogni_mesi!, costa = Number(s.mia_quota);
    const passati = Math.max(0, Math.min(ogni, mesiPassati(aggiungiMesi(quando, -ogni), oggi)));
    return { s, quando, ogni, passati, costa, dovrebbe: Math.round((costa * passati / ogni) * 100) / 100, ce: 0 };
  }).filter((x) => x.quando).sort((a, b) => a.quando.localeCompare(b.quando));
  let resto = saldo;
  for (const r of righe) { r.ce = Math.max(0, Math.min(r.dovrebbe, resto)); resto -= r.ce; }
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
  const profilo = rif.profilo;
  if (!ob.dati || !sp.dati || !profilo) return <Caricamento errore={ob.errore ?? sp.errore} />;
  const tutti = tuttiGliObiettivi(ob.dati);
  const attive = sp.dati.spese.filter((s) => s.attiva);
  const scelto = profilo.obiettivo_annuali ?? attive.find((s) => eAnnuale(s) && s.obiettivo_id)?.obiettivo_id ?? tutti.find((o) => /spese annuali/i.test(o.nome))?.id ?? null;
  const salvadanaio = tutti.find((o) => o.id === scelto) ?? null;
  const saldo = Number(salvadanaio?.saldo ?? 0);
  const r = riempimento(attive, saldo);
  const altri = ob.dati.filter((o) => o.id !== salvadanaio?.id);
  const fondi = altri.filter((o) => o.traguardi.length), obiettivi = altri.filter((o) => !o.traguardi.length);
  const somma = (xs: Obiettivo[]) => xs.reduce((t, o) => t + Number(o.saldo), 0);
  const coperti = fondi.flatMap((o) => o.traguardi), copertiOk = coperti.filter((t) => t.percentuale >= 100).length;

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Quello che metti da parte: spese annuali, emergenze e obiettivi." />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Per le spese annuali" valore={euro(saldo)} icona="calendar-clock" tono={r.indietro > 0.005 ? 'attenzione' : 'normale'}
          nota={r.indietro > 0.005 ? `Oggi dovrebbero essere ${euro(r.dovrebbe)} · indietro di ${euro(r.indietro)}` : `In pari: oggi ne servono ${euro(r.dovrebbe)}`} />
        <NumeroChiave etichetta="Fondo emergenza" valore={euro(somma(fondi))} icona="shield-check" nota={coperti.length ? `Copre ${copertiOk} emergenze su ${coperti.length}` : 'Nessun traguardo di copertura'} />
        <NumeroChiave etichetta="Obiettivi" valore={euro(somma(obiettivi))} icona="target" nota={`In ${obiettivi.length} ${obiettivi.length === 1 ? 'obiettivo' : 'obiettivi'}`} />
      </View>
      <Scheda titolo="Spese annuali" icona="calendar-clock" nota={`Ogni mese ci metti ${euro(r.annuo / 12)}`}
        azione={salvadanaio ? <Pulsante tipo="testo" etichetta="Versa" icona="plus" onPress={() => setVersa(salvadanaio)} /> : undefined}>
        <View style={{ gap: d['spazio-blocco'] }}>
          {r.righe.length === 0 ? <Vuoto testo="Nessuna spesa annuale. Aggiungine una scegliendo «Ogni anno» o «Ogni N mesi»." /> : <TabellaAnnuali righe={r.righe} onApri={setSpesa} />}
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
function TabellaAnnuali({ righe, onApri }: { righe: RigaAnnuale[]; onApri: (s: Spesa) => void }) {
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
            {col(euro(r.ce), 110, 'corpo-forte', pari ? 'testo-ok' : 'testo-attenzione')}
          </Pressable>
        );
      })}
    </View>
  );
}
