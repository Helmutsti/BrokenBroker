import { useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante } from '../componenti/base.tsx';
import { Intestazione, NumeroChiave } from '../componenti/composti.tsx';
import { crea, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Obiettivo, Spesa } from '../dati/tipi.ts';
import { euro, oggiIso } from '../formato.ts';
import { d } from '../tema/tema.tsx';
import { aggiungiMesi, Caricamento, eAnnuale, prossimaScadenza, tuttiGliObiettivi } from './comuni.tsx';
import { Obiettivi } from './Obiettivi.tsx';

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

// Salvadanai: in alto quanto c'è e quanto entra ogni mese da Spese, poi un riquadro per
// ogni salvadanaio, spese annuali comprese (le loro spese si gestiscono da Spese).
export function Salvadanai() {
  const rif = useRiferimenti();
  const ob = useDati<Obiettivo[]>('/obiettivi');
  const sp = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const [errore, setErrore] = useState<string | null>(null);
  const profilo = rif.profilo;
  if (!ob.dati || !sp.dati || !profilo) return <Caricamento errore={ob.errore ?? sp.errore} />;
  const tutti = tuttiGliObiettivi(ob.dati);
  const attive = sp.dati.spese.filter((s) => s.attiva);
  const scelto = profilo.obiettivo_annuali ?? attive.find((s) => eAnnuale(s) && s.obiettivo_id)?.obiettivo_id ?? tutti.find((o) => /spese annuali/i.test(o.nome))?.id ?? null;
  const salvadanaio = tutti.find((o) => o.id === scelto) ?? null;
  // Contano solo le annuali pagate da questo salvadanaio: una spesa annuale può anche stare da sola in Spese.
  const dentro = new Set(salvadanaio ? tuttiGliObiettivi([salvadanaio]).map((o) => o.id) : []);
  const pagate = attive.filter((s) => s.obiettivo_id && dentro.has(s.obiettivo_id));
  const saldo = Number(salvadanaio?.saldo ?? 0);
  // I soldi liberi sono quelli del salvadanaio fuori dai sotto-obiettivi delle spese.
  const figliSpese = salvadanaio?.figli.filter((f) => f.paga_spesa) ?? [];
  const r = riempimento(pagate, saldo - figliSpese.reduce((t, f) => t + Number(f.saldo), 0), figliSpese);
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
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      {salvadanaio && senzaSotto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
          <View style={{ flex: 1 }}><Esito tono="informazione" testo={`In ${salvadanaio.nome} ${senzaSotto === 1 ? 'una spesa annuale non ha' : `${senzaSotto} spese annuali non hanno`} ancora il suo sotto-obiettivo: dividendo il salvadanaio, ogni spesa ha i suoi soldi e la sua data.`} /></View>
          <Pulsante etichetta="Dividi per spesa" icona="layers" onPress={dividi} />
        </View>
      ) : null}
      {/* Anche le spese annuali sono un salvadanaio come gli altri (richiesta di Manuel): si gestiscono da Spese. */}
      <Obiettivi />
    </>
  );
}

