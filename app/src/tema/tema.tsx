import { createContext, type ReactNode, useContext } from 'react';
import { Text, type TextProps, useColorScheme } from 'react-native';
import { carattere, colori, dimensioni, type NomeColore, type NomeStile, stiliTesto } from './token.ts';

// Tema chiaro o scuro, scelto dal sistema. I componenti leggono i colori da qui.

type Tema = { c: Record<NomeColore, string>; d: typeof dimensioni; scuro: boolean };

const ContestoTema = createContext<Tema>({ c: colori.chiaro, d: dimensioni, scuro: false });

export function FornitoreTema({ children }: { children: ReactNode }) {
  const scuro = useColorScheme() === 'dark';
  return <ContestoTema.Provider value={{ c: scuro ? colori.scuro : colori.chiaro, d: dimensioni, scuro }}>{children}</ContestoTema.Provider>;
}

export const useTema = () => useContext(ContestoTema);
export const d = dimensioni;

// Un testo con uno degli stili di testo della libreria. Nessun testo senza stile.
export function Testo({ stile = 'corpo-normale', colore = 'testo-primario', style, ...resto }: TextProps & { stile?: NomeStile; colore?: NomeColore }) {
  const { c } = useTema();
  return <Text {...resto} style={[{ fontFamily: carattere, color: c[colore] }, stiliTesto[stile], style]} />;
}
