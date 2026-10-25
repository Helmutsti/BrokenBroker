import { createNavigatorFactory, NavigationContainer, TabRouter, useNavigationBuilder } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { BarraInferiore, BarraLaterale, ConfermaFinestra, TestataCompatta, type VoceMenu } from './componenti/composti.tsx';
import { allaScadenza, crea, leggi } from './dati/api.ts';
import { FornitoreRiferimenti, useRiferimenti } from './dati/contesto.tsx';
import { cancellaToken, leggiToken } from './dati/sessione';
import type { Profilo } from './dati/tipi.ts';
import { Accesso } from './schermate/Accesso.tsx';
import { Analisi } from './schermate/Analisi.tsx';
import { Categorie } from './schermate/Categorie.tsx';
import { Conti } from './schermate/Conti.tsx';
import { Impostazioni } from './schermate/Impostazioni.tsx';
import { Investimenti } from './schermate/Investimenti.tsx';
import { Panoramica } from './schermate/Panoramica.tsx';
import { Salvadanai } from './schermate/Salvadanai.tsx';
import { useCompatto } from './tema/compatto.ts';
import { d, FornitoreTema, useTema } from './tema/tema.tsx';

// Sezioni della barra laterale (flussi.md): l'ordine è quello delle bozze approvate.
// Le sezioni dei 3 fogli dell'Excel (Spese, Salvadanai, Investimenti) più Categorie, Conti
// e Analisi. I movimenti non esistono più (decisione del 2026-10-24).
// La sezione delle spese del mese si chiama "Spese" (richiesta di Manuel, prima "Mese").
const SEZIONI: (VoceMenu & { percorso: string; schermata: () => React.JSX.Element })[] = [
  { chiave: 'mese', testo: 'Spese', icona: 'calendar-check', percorso: '', schermata: Panoramica },
  { chiave: 'salvadanai', testo: 'Salvadanai', breve: 'Salvad.', icona: 'piggy-bank', percorso: 'salvadanai', schermata: Salvadanai },
  { chiave: 'investimenti', testo: 'Investimenti', breve: 'Invest.', icona: 'chart-line', percorso: 'investimenti', schermata: Investimenti },
  { chiave: 'categorie', testo: 'Categorie', icona: 'tags', percorso: 'categorie', schermata: Categorie },
  { chiave: 'conti', testo: 'Conti', icona: 'wallet', percorso: 'conti', schermata: Conti },
  { chiave: 'analisi', testo: 'Analisi', icona: 'chart-pie', percorso: 'analisi', schermata: Analisi },
];

// Barra in basso del telefono (richiesta di Manuel): 4 sezioni e «Altro», che apre le altre.
const IN_BARRA = ['mese', 'salvadanai', 'investimenti', 'conti'];
const ALTRE: VoceMenu[] = [
  ...SEZIONI.filter((s) => !IN_BARRA.includes(s.chiave)),
  { chiave: 'impostazioni', testo: 'Impostazioni', icona: 'sliders-horizontal' },
];

// Navigatore con la barra laterale a sinistra e la schermata a destra.
function NavigatoreLaterale(props: { children: React.ReactNode; initialRouteName?: string; onEsci: () => void }) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, { children: props.children, initialRouteName: props.initialRouteName });
  const { c } = useTema();
  const rif = useRiferimenti();
  const attiva = state.routes[state.index];
  const compatto = useCompatto();
  // Esci chiede sempre conferma, dalla testata del telefono come dalla barra laterale.
  const [chiediEsci, setChiediEsci] = useState(false);
  const conferma = <ConfermaFinestra aperta={chiediEsci} titolo="Vuoi uscire?" testo="Per rientrare dovrai accedere di nuovo." etichettaConferma="Esci" onAnnulla={() => setChiediEsci(false)} onConferma={() => { setChiediEsci(false); props.onEsci(); }} />;
  if (compatto) return (
    <NavigationContent>
      <View style={{ flex: 1, minWidth: 0, backgroundColor: c['sfondo-pagina'] }}>
        <TestataCompatta profilo={rif.profilo?.nome ?? ''} impostazioniAttive={attiva.name === 'impostazioni'} onProfilo={() => navigation.navigate('impostazioni')} onEsci={() => setChiediEsci(true)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: d['spazio-blocco'], width: '100%' }}>
          {descriptors[attiva.key].render()}
        </ScrollView>
        <BarraInferiore voci={SEZIONI.filter((s) => IN_BARRA.includes(s.chiave))} altre={ALTRE} attiva={attiva.name} onNaviga={(k) => navigation.navigate(k)} />
        {conferma}
      </View>
    </NavigationContent>
  );
  return (
    <NavigationContent>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c['sfondo-pagina'] }}>
        <BarraLaterale voci={SEZIONI} attiva={attiva.name} onNaviga={(k) => navigation.navigate(k)}
          profilo={rif.profilo?.nome ?? ''} onProfilo={() => navigation.navigate('impostazioni')} onEsci={() => setChiediEsci(true)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: d['margine-pagina'], gap: d['spazio-gruppo'], width: '100%' }}>
          {descriptors[attiva.key].render()}
        </ScrollView>
        {conferma}
      </View>
    </NavigationContent>
  );
}
const Laterale = createNavigatorFactory(NavigatoreLaterale as never)() as unknown as {
  Navigator: (p: { children: React.ReactNode; initialRouteName?: string; onEsci: () => void }) => React.JSX.Element;
  Screen: (p: { name: string; component: () => React.JSX.Element | null; options?: { title?: string } }) => null;
};

const linking = {
  prefixes: [],
  config: { screens: { ...Object.fromEntries(SEZIONI.map((s) => [s.chiave, s.percorso])), impostazioni: 'impostazioni' } },
} as never;

function Dentro({ onEsci }: { onEsci: () => void }) {
  return (
    <FornitoreRiferimenti>
      <NavigationContainer linking={linking} documentTitle={{ formatter: (o, r) => `${o?.title ?? SEZIONI.find((s) => s.chiave === r?.name)?.testo ?? 'Impostazioni'} · BrokenBroker` }}>
        <Laterale.Navigator onEsci={onEsci}>
          {SEZIONI.map((s) => <Laterale.Screen key={s.chiave} name={s.chiave} component={s.schermata} options={{ title: s.testo }} />)}
          <Laterale.Screen name="impostazioni" component={Impostazioni} options={{ title: 'Impostazioni' }} />
        </Laterale.Navigator>
      </NavigationContainer>
    </FornitoreRiferimenti>
  );
}

function Radice() {
  const { c } = useTema();
  const [stato, setStato] = useState<'carico' | 'fuori' | 'dentro'>('carico');
  const esci = useCallback(async () => {
    try { await crea('/accesso/uscita'); } catch { /* la sessione può essere già scaduta */ }
    await cancellaToken(); setStato('fuori');
  }, []);
  useEffect(() => {
    allaScadenza(() => { cancellaToken(); setStato('fuori'); });
    (async () => {
      if (!(await leggiToken())) return setStato('fuori');
      try { await leggi<Profilo>('/profilo'); setStato('dentro'); } catch { setStato('fuori'); }
    })();
  }, []);
  if (stato === 'carico') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c['sfondo-pagina'] }}><ActivityIndicator color={c['sfondo-accento']} /></View>;
  if (stato === 'fuori') return <Accesso onEntrato={() => setStato('dentro')} />;
  return <Dentro onEsci={esci} />;
}

export default function App() {
  return <FornitoreTema><Radice /></FornitoreTema>;
}
