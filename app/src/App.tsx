import { createNavigatorFactory, NavigationContainer, TabRouter, useNavigationBuilder } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { BarraLaterale, type VoceMenu } from './componenti/composti.tsx';
import { allaScadenza, crea, leggi } from './dati/api.ts';
import { FornitoreRiferimenti, useRiferimenti } from './dati/contesto.tsx';
import { cancellaToken, leggiToken } from './dati/sessione';
import type { Profilo } from './dati/tipi.ts';
import { FinestraMovimento } from './schermate/FinestraMovimento.tsx';
import { Accesso } from './schermate/Accesso.tsx';
import { Analisi } from './schermate/Analisi.tsx';
import { Categorie } from './schermate/Categorie.tsx';
import { Conti } from './schermate/Conti.tsx';
import { Impostazioni } from './schermate/Impostazioni.tsx';
import { Investimenti } from './schermate/Investimenti.tsx';
import { Movimenti } from './schermate/Movimenti.tsx';
import { Obiettivi } from './schermate/Obiettivi.tsx';
import { Panoramica } from './schermate/Panoramica.tsx';
import { SpesePreviste } from './schermate/SpesePreviste.tsx';
import { d, FornitoreTema, useTema } from './tema/tema.tsx';

// Sezioni della barra laterale (flussi.md): l'ordine è quello delle bozze approvate.
const SEZIONI: (VoceMenu & { percorso: string; schermata: () => React.JSX.Element })[] = [
  { chiave: 'panoramica', testo: 'Panoramica', icona: 'layout-dashboard', percorso: '', schermata: Panoramica },
  { chiave: 'spese', testo: 'Spese previste', icona: 'calendar-check', percorso: 'spese-previste', schermata: SpesePreviste },
  { chiave: 'obiettivi', testo: 'Obiettivi', icona: 'target', percorso: 'obiettivi', schermata: Obiettivi },
  { chiave: 'movimenti', testo: 'Movimenti', icona: 'arrow-left-right', percorso: 'movimenti', schermata: Movimenti },
  { chiave: 'conti', testo: 'Conti', icona: 'wallet', percorso: 'conti', schermata: Conti },
  { chiave: 'investimenti', testo: 'Investimenti', icona: 'chart-line', percorso: 'investimenti', schermata: Investimenti },
  { chiave: 'analisi', testo: 'Analisi', icona: 'chart-pie', percorso: 'analisi', schermata: Analisi },
  { chiave: 'categorie', testo: 'Categorie', icona: 'tags', percorso: 'categorie', schermata: Categorie },
];

// Navigatore con la barra laterale a sinistra e la schermata a destra.
function NavigatoreLaterale(props: { children: React.ReactNode; initialRouteName?: string; onEsci: () => void }) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, { children: props.children, initialRouteName: props.initialRouteName });
  const { c } = useTema();
  const rif = useRiferimenti();
  const attiva = state.routes[state.index];
  return (
    <NavigationContent>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c['sfondo-pagina'] }}>
        <BarraLaterale voci={SEZIONI} attiva={attiva.name} onNaviga={(k) => navigation.navigate(k)} onAggiungi={rif.nuovoMovimento}
          profilo={rif.profilo?.nome ?? ''} onProfilo={() => navigation.navigate('impostazioni')} onEsci={props.onEsci} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: d['margine-pagina'], gap: d['spazio-gruppo'], maxWidth: 1184, width: '100%' }}>
          {descriptors[attiva.key].render()}
        </ScrollView>
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
  const [movimento, setMovimento] = useState(false);
  const apri = useCallback(() => setMovimento(true), []);
  return (
    <FornitoreRiferimenti nuovoMovimento={apri}>
      <NavigationContainer linking={linking} documentTitle={{ formatter: (o, r) => `${o?.title ?? SEZIONI.find((s) => s.chiave === r?.name)?.testo ?? 'Impostazioni'} · BrokenBroker` }}>
        <Laterale.Navigator onEsci={onEsci}>
          {SEZIONI.map((s) => <Laterale.Screen key={s.chiave} name={s.chiave} component={s.schermata} options={{ title: s.testo }} />)}
          <Laterale.Screen name="impostazioni" component={Impostazioni} options={{ title: 'Impostazioni' }} />
        </Laterale.Navigator>
      </NavigationContainer>
      <FinestraMovimento aperta={movimento} onChiudi={() => setMovimento(false)} />
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
