import { View } from 'react-native';
import { Scheda } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Rata } from '../dati/tipi.ts';
import { euro } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { importoDelMese, rateDelMese, vociDelMese } from './comuni.tsx';

// Da girare ai conti: per ogni conto, quanto serve per le voci non ancora spuntate del mese
// e quanto pesa il mese intero (stesse voci di "Devono uscire" in Spese, annuali con la quota mensile).
export function DaGirareAiConti() {
  const rif = useRiferimenti();
  const { mese, profilo } = rif;
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`).dati;
  const rate = useDati<Rata[]>(`/rate?mese=${mese}`).dati ?? [];
  if (!spese || !profilo) return null;

  const { delConto } = vociDelMese(spese, profilo);
  const rateMese = rateDelMese(rate, spese.periodo.dal, spese.periodo.al);
  const perConto = new Map<string, { daUscire: number; inTutto: number }>();
  const aggiungi = (nome: string | null, importo: number, spuntata: boolean) => {
    const k = nome || 'Senza conto', v = perConto.get(k) ?? { daUscire: 0, inTutto: 0 };
    v.inTutto += importo;
    if (!spuntata) v.daUscire += importo;
    perConto.set(k, v);
  };
  for (const s of delConto) aggiungi(s.conto, importoDelMese(s), !!s.uscita);
  for (const x of rateMese) aggiungi(rif.conti.find((k) => k.id === x.r.conto_id)?.nome ?? null, Number(x.r.importo_rata), !!x.r.pagata);
  const girate = [...perConto.entries()].sort(([na, a], [nb, b]) => b.daUscire - a.daUscire || na.localeCompare(nb, 'it'));
  const daSpuntare = delConto.filter((s) => !s.uscita).length + rateMese.filter((x) => !x.r.pagata).length;
  const devonoUscire = delConto.filter((s) => !s.uscita).reduce((t, s) => t + importoDelMese(s), 0)
    + rateMese.filter((x) => !x.r.pagata).reduce((t, x) => t + Number(x.r.importo_rata), 0);

  return (
    <Scheda titolo="Quanto mettere su ogni conto" icona="landmark" nota="Quanto serve su ogni conto per le voci non ancora spuntate del mese">
      <View style={{ gap: d['spazio-elenco'] }}>
        {girate.map(([nome, v]) => (
          <View key={nome} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
            <Testo style={{ flex: 1 }}>{nome}</Testo>
            <View style={{ alignItems: 'flex-end' }}>
              <Testo stile="corpo-forte">{euro(v.daUscire)}</Testo>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{`su ${euro(v.inTutto)} in tutto`}</Testo>
            </View>
          </View>
        ))}
        {!daSpuntare ? <Testo colore="testo-secondario" style={{ paddingHorizontal: d['margine-voce-h'] }}>Tutto spuntato</Testo> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
          <Testo stile="corpo-forte" style={{ flex: 1 }}>Totale</Testo>
          <Testo stile="corpo-forte">{euro(devonoUscire)}</Testo>
        </View>
      </View>
    </Scheda>
  );
}
