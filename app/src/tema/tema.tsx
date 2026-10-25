import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Text, type TextProps, useColorScheme } from 'react-native';
import { leggiTema, salvaTema, type SceltaTema } from '../dati/preferenze';
import { carattere, colori, dimensioni, type NomeColore, type NomeStile, stiliTesto } from './token.ts';

// Tema chiaro o scuro: di base lo sceglie il telefono, ma nelle Impostazioni si può fissare.
// I componenti leggono i colori da qui.

export type { SceltaTema };
type Tema = { c: Record<NomeColore, string>; d: typeof dimensioni; scuro: boolean; scelta: SceltaTema; scegli: (s: SceltaTema) => void };

const ContestoTema = createContext<Tema>({ c: colori.chiaro, d: dimensioni, scuro: false, scelta: 'sistema', scegli: () => {} });

export function FornitoreTema({ children }: { children: ReactNode }) {
  const sistema = useColorScheme() === 'dark';
  const [scelta, setScelta] = useState<SceltaTema>('sistema');
  useEffect(() => { leggiTema().then(setScelta); }, []);
  const scegli = (s: SceltaTema) => { setScelta(s); salvaTema(s); };
  const scuro = scelta === 'sistema' ? sistema : scelta === 'scuro';
  // Sul web anche lo sfondo della pagina (sotto l'app, nello scorrimento elastico) segue la scelta.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = (scuro ? colori.scuro : colori.chiaro)['sfondo-pagina'];
    document.documentElement.style.colorScheme = scuro ? 'dark' : 'light';
  }, [scuro]);
  return <ContestoTema.Provider value={{ c: scuro ? colori.scuro : colori.chiaro, d: dimensioni, scuro, scelta, scegli }}>{children}</ContestoTema.Provider>;
}

export const useTema = () => useContext(ContestoTema);
export const d = dimensioni;

// Un testo con uno degli stili di testo della libreria. Nessun testo senza stile.
export function Testo({ stile = 'corpo-normale', colore = 'testo-primario', style, ...resto }: TextProps & { stile?: NomeStile; colore?: NomeColore }) {
  const { c } = useTema();
  return <Text {...resto} style={[{ fontFamily: carattere, color: c[colore] }, stiliTesto[stile], style]} />;
}
