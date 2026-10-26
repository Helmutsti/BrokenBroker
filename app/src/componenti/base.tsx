import type { ReactNode } from 'react';
import { Pressable, type PressableStateCallbackType, type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { type NomeColore, stiliTesto, tintaCategoria } from '../tema/token.ts';
import { Icona, type Misura } from './Icona.tsx';

// Componenti di base (CMP-02 … CMP-16). Sono contenuti: nessun margine, la
// posizione la decide il contenitore con padding e gap.

// Stato di un elemento premibile sul web: react-native-web aggiunge hovered e focused.
export type StatoPressione = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
// L'anello di focus si vede solo muovendosi con la tastiera, non cliccando col mouse
// (come :focus-visible): si ricorda se l'ultimo gesto è stato un tasto o un clic.
let daTastiera = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) daTastiera = true; }, true);
  document.addEventListener('pointerdown', () => { daTastiera = false; }, true);
}
export const anelloFocus = (c: Record<NomeColore, string>, attivo?: boolean): ViewStyle =>
  attivo && daTastiera ? ({ outlineColor: c['bordo-focus'], outlineWidth: d['misura-bordo-forte'], outlineStyle: 'solid', outlineOffset: 2 } as ViewStyle) : {};

// Pulsanti, campi, tendine e voci del menu hanno tutti la stessa altezza: una riga
// di testo più il margine verticale (37). Il contorno sta "dentro" come in Figma:
// i controlli hanno sempre un bordo (trasparente se non si vede) e il margine lo sottrae.
export const ALTEZZA_CONTROLLO = stiliTesto['corpo-normale'].lineHeight + 2 * d['margine-pulsante-v'];
export const dentroIlBordo = (margine: number) => margine - d['misura-bordo'];

// ---- CMP-02 Tessera icona ----
export type Tono = 'accento' | 'neutro' | 'ok' | 'attenzione' | 'errore';
const TESSERA = { piccola: [d['misura-tessera-piccola'], 16], media: [d['misura-tessera-media'], 20], grande: [d['misura-tessera-grande'], 24] } as const;
const fondoTono: Record<Tono, NomeColore> = { accento: 'sfondo-accento-tenue', neutro: 'sfondo-tenue', ok: 'sfondo-ok-tenue', attenzione: 'sfondo-attenzione-tenue', errore: 'sfondo-errore-tenue' };
const iconaTono: Record<Tono, NomeColore> = { accento: 'icona-accento', neutro: 'icona-predefinita', ok: 'icona-ok', attenzione: 'icona-attenzione', errore: 'icona-errore' };
const pienoTono: Record<Tono, NomeColore> = { accento: 'sfondo-accento', neutro: 'icona-predefinita', ok: 'icona-ok', attenzione: 'icona-attenzione', errore: 'icona-errore' };

export function Tessera({ icona, misura = 'media', tono = 'accento', suColore = false, coloreIcona, tinta }: { icona: string; misura?: keyof typeof TESSERA; tono?: Tono; suColore?: boolean; coloreIcona?: NomeColore; tinta?: string }) {
  const { c } = useTema();
  const [lato, im] = TESSERA[misura];
  return (
    <View style={{ width: lato, height: lato, flexShrink: 0, borderRadius: d['raggio-controllo'], alignItems: 'center', justifyContent: 'center', backgroundColor: tinta ? tintaCategoria(tinta) : c[suColore ? pienoTono[tono] : fondoTono[tono]] }}>
      <Icona nome={icona} misura={im as Misura} tinta={tinta} colore={coloreIcona ?? (suColore ? 'icona-su-accento' : iconaTono[tono])} />
    </View>
  );
}

// ---- CMP-03 Pulsante ----
export type TipoPulsante = 'primario' | 'secondario' | 'testo' | 'pericolo';
// compatto: stessa misura delle voci del menu (padding margine/voce), per la barra laterale.
export function Pulsante({ etichetta, icona, tipo = 'secondario', onPress, disattivato, larghezzaPiena, etichettaAccessibile, compatto }: {
  etichetta: string; icona?: string; tipo?: TipoPulsante; onPress?: () => void; disattivato?: boolean; larghezzaPiena?: boolean; etichettaAccessibile?: string; compatto?: boolean;
}) {
  const { c } = useTema();
  const compattoSchermo = useCompatto();
  const testo: NomeColore = tipo === 'primario' ? 'testo-su-accento' : tipo === 'pericolo' ? 'testo-errore' : tipo === 'testo' ? 'testo-accento' : 'testo-primario';
  const ic: NomeColore = tipo === 'primario' ? 'icona-su-accento' : tipo === 'pericolo' ? 'icona-errore' : tipo === 'testo' ? 'icona-accento' : 'icona-predefinita';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etichettaAccessibile} disabled={disattivato} onPress={onPress}
      style={(s: StatoPressione) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: d['spazio-icona'],
        paddingVertical: dentroIlBordo(d['margine-pulsante-v']),
        paddingHorizontal: dentroIlBordo(tipo === 'testo' ? d['margine-etichetta-h'] : compatto ? d['margine-voce-h'] : d['margine-pulsante-h']),
        minHeight: compattoSchermo ? 44 : undefined, borderRadius: d['raggio-controllo'], alignSelf: larghezzaPiena ? 'stretch' : 'flex-start', opacity: disattivato ? d['opacita-disattivato'] : 1,
        backgroundColor: tipo === 'primario' ? c[s.hovered ? 'sfondo-accento-hover' : 'sfondo-accento'] : s.hovered ? c['sfondo-hover'] : 'transparent',
        borderWidth: d['misura-bordo'], borderColor: tipo === 'secondario' ? c['bordo-controllo'] : 'transparent',
      }, anelloFocus(c, s.focused)]}>
      {icona ? <Icona nome={icona} misura={16} colore={ic} /> : null}
      <Testo stile="corpo-forte" colore={testo}>{etichetta}</Testo>
    </Pressable>
  );
}

// ---- CMP-04 Pulsante solo icona ----
// Quadrato alto come gli altri controlli; "lato" più piccolo quando sta dentro un altro contorno.
export function PulsanteIcona({ icona, etichetta, onPress, fantasma, disattivato, lato: latoBase = ALTEZZA_CONTROLLO, nascosto }: { icona: string; etichetta: string; onPress?: () => void; fantasma?: boolean; disattivato?: boolean; lato?: number; nascosto?: boolean }) {
  const { c } = useTema();
  const lato = useCompatto() ? Math.max(latoBase, 44) : latoBase;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etichetta} onPress={onPress} disabled={disattivato}
      style={(s: StatoPressione) => [{
        width: lato, height: lato, alignItems: 'center', justifyContent: 'center', borderRadius: d['raggio-controllo'],
        borderWidth: d['misura-bordo'], borderColor: fantasma ? 'transparent' : c['bordo-controllo'], opacity: nascosto && !s.focused ? 0 : disattivato ? d['opacita-disattivato'] : 1,
        backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent',
      }, anelloFocus(c, s.focused)]}>
      <Icona nome={icona} misura={16} />
    </Pressable>
  );
}

// ---- CMP-10 Etichetta ----
const etichettaColori: Record<Tono, [NomeColore, NomeColore, NomeColore]> = {
  neutro: ['sfondo-tenue', 'testo-secondario', 'icona-predefinita'], accento: ['sfondo-accento-tenue', 'testo-accento', 'icona-accento'],
  ok: ['sfondo-ok-tenue', 'testo-ok', 'icona-ok'], attenzione: ['sfondo-attenzione-tenue', 'testo-attenzione', 'icona-attenzione'], errore: ['sfondo-errore-tenue', 'testo-errore', 'icona-errore'],
};
export function Etichetta({ testo, icona, tono = 'neutro' }: { testo: string; icona?: string; tono?: Tono }) {
  const { c } = useTema();
  const [f, t, i] = etichettaColori[tono];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], paddingVertical: d['margine-etichetta-v'], paddingHorizontal: d['margine-etichetta-h'], borderRadius: d['raggio-pillola'], backgroundColor: c[f], alignSelf: 'flex-start' }}>
      {icona ? <Icona nome={icona} misura={16} colore={i} /> : null}
      <Testo stile="dettaglio-forte" colore={t}>{testo}</Testo>
    </View>
  );
}

// ---- CMP-11 Criterio ----
export function Criterio({ testo, scelto, onPress }: { testo: string; scelto: boolean; onPress: () => void }) {
  const { c } = useTema();
  const alto = useCompatto();
  return (
    <Pressable accessibilityRole="checkbox" aria-checked={scelto} onPress={onPress}
      style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: alto ? 44 : undefined, paddingVertical: d['margine-etichetta-v'], paddingHorizontal: d['margine-etichetta-h'] + 4,
        borderRadius: d['raggio-pillola'], borderWidth: d['misura-bordo'], borderColor: c[scelto ? 'bordo-focus' : 'bordo-controllo'],
        backgroundColor: scelto ? c['sfondo-accento-tenue'] : s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
      {scelto ? <Icona nome="circle-check" misura={16} colore="icona-accento" /> : null}
      <Testo stile="dettaglio-forte" colore={scelto ? 'testo-accento' : 'testo-secondario'}>{testo}</Testo>
    </Pressable>
  );
}

// ---- CMP-12 Barra di avanzamento ----
export type ToneAvanzamento = 'accento' | 'ok' | 'attenzione' | 'errore';
export function Barra({ valore, tono = 'accento', larghezza }: { valore: number; tono?: ToneAvanzamento; larghezza?: number }) {
  const { c } = useTema();
  const pct = Math.max(0, Math.min(100, valore));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height: d['misura-avanzamento'], borderRadius: d['raggio-pillola'], backgroundColor: c['avanzamento-traccia'], overflow: 'hidden', width: larghezza, flexGrow: larghezza ? 0 : 1 }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: d['raggio-pillola'], backgroundColor: c[`avanzamento-${tono}`] }} />
    </View>
  );
}

// ---- CMP-13 Anello di avanzamento ----
export function Anello({ valore, tono = 'accento', misura = 20 }: { valore: number; tono?: ToneAvanzamento; misura?: number }) {
  const { c } = useTema();
  const r = (misura - 4) / 2, giro = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, valore));
  return (
    <Svg width={misura} height={misura} aria-hidden>
      <Circle cx={misura / 2} cy={misura / 2} r={r} stroke={c['avanzamento-traccia']} strokeWidth={3} fill="none" />
      <Circle cx={misura / 2} cy={misura / 2} r={r} stroke={c[`avanzamento-${tono}`]} strokeWidth={3} fill="none"
        strokeDasharray={`${(giro * pct) / 100} ${giro}`} strokeLinecap="round" transform={`rotate(-90 ${misura / 2} ${misura / 2})`} />
    </Svg>
  );
}

// ---- CMP-14 Avatar ----
export function Avatar({ nome, grande }: { nome?: string; grande?: boolean }) {
  const { c } = useTema();
  const lato = grande ? d['misura-avatar-grande'] : d['misura-avatar-piccolo'];
  return (
    <View style={{ width: lato, height: lato, borderRadius: lato / 2, backgroundColor: c['sfondo-accento-tenue'], alignItems: 'center', justifyContent: 'center' }}>
      {nome ? <Testo stile={grande ? 'titolo-scheda' : 'corpo-forte'} colore="testo-accento">{nome.charAt(0).toUpperCase()}</Testo> : <Icona nome="user" misura={16} colore="icona-accento" />}
    </View>
  );
}

// ---- CMP-15 Esito ----
export type ToneEsito = 'ok' | 'attenzione' | 'errore' | 'informazione';
const esito: Record<ToneEsito, [NomeColore, NomeColore, NomeColore, string]> = {
  ok: ['sfondo-ok-tenue', 'testo-ok', 'icona-ok', 'circle-check'], attenzione: ['sfondo-attenzione-tenue', 'testo-attenzione', 'icona-attenzione', 'circle-alert'],
  errore: ['sfondo-errore-tenue', 'testo-errore', 'icona-errore', 'circle-x'], informazione: ['sfondo-accento-tenue', 'testo-accento', 'icona-accento', 'info'],
};
export function Esito({ testo, tono }: { testo: string; tono: ToneEsito }) {
  const { c } = useTema();
  const [f, t, i, ic] = esito[tono];
  return (
    <View accessibilityRole={tono === 'errore' ? 'alert' : undefined} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-icona'], paddingVertical: d['margine-riquadro-v'], paddingHorizontal: d['margine-riquadro-h'], borderRadius: d['raggio-controllo'], backgroundColor: c[f] }}>
      <Icona nome={ic} misura={16} colore={i} />
      <Testo stile="dettaglio-forte" colore={t} style={{ flex: 1 }}>{testo}</Testo>
    </View>
  );
}

// ---- CMP-16 Separatore ----
export function Separatore() {
  const { c } = useTema();
  return <View style={{ height: d['misura-bordo'], backgroundColor: c['bordo-separatore'], alignSelf: 'stretch' }} />;
}

// ---- CMP-09 Spunta ----
// `tenue`: la spunta fatta è grigia invece che azzurra (voci già uscite, che passano in secondo piano).
export function Spunta({ fatta, onPress, etichetta, disattivato, tenue }: { fatta: boolean; onPress?: () => void; etichetta: string; disattivato?: boolean; tenue?: boolean }) {
  const { c } = useTema();
  const bersaglio = useCompatto() ? 44 : d['misura-bersaglio'];
  return (
    <Pressable accessibilityRole="checkbox" aria-checked={fatta} aria-disabled={disattivato} accessibilityLabel={etichetta} onPress={onPress} disabled={disattivato}
      style={(s: StatoPressione) => [{ width: bersaglio, height: bersaglio, alignItems: 'center', justifyContent: 'center', opacity: disattivato ? d['opacita-disattivato'] : 1 }, anelloFocus(c, s.focused)]}>
      {(s: StatoPressione) => (
        <View style={{ width: d['misura-spunta'], height: d['misura-spunta'], borderRadius: d['raggio-controllo-interno'], alignItems: 'center', justifyContent: 'center',
          backgroundColor: fatta ? c[tenue ? 'sfondo-controllo-spento' : s.hovered ? 'sfondo-accento-hover' : 'sfondo-accento'] : s.hovered ? c['sfondo-hover'] : 'transparent',
          borderWidth: fatta ? 0 : d['misura-bordo-forte'], borderColor: c['bordo-controllo'] }}>
          {fatta ? <Icona nome="check" misura={d['misura-segno-spunta']} colore="icona-su-accento" /> : null}
        </View>
      )}
    </Pressable>
  );
}

// ---- CMP-08 Interruttore ----
export function Interruttore({ acceso, onCambia, etichetta, disattivato }: { acceso: boolean; onCambia: (v: boolean) => void; etichetta: string; disattivato?: boolean }) {
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="switch" aria-checked={acceso} hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }} accessibilityLabel={etichetta} disabled={disattivato} onPress={() => onCambia(!acceso)}
      style={(s: StatoPressione) => [{ opacity: disattivato ? d['opacita-disattivato'] : 1, width: d['misura-interruttore-larghezza'], height: d['misura-interruttore-altezza'], borderRadius: d['raggio-pillola'], padding: d['misura-pomello-margine'],
        backgroundColor: c[acceso ? 'sfondo-accento' : 'sfondo-controllo-spento'], alignItems: acceso ? 'flex-end' : 'flex-start' }, anelloFocus(c, s.focused)]}>
      <View style={{ width: d['misura-pomello'], height: d['misura-pomello'], borderRadius: d['raggio-pillola'], backgroundColor: c['sfondo-pomello'] }} />
    </Pressable>
  );
}

// ---- CMP-07 Scelta a segmenti ----
export function SceltaSegmenti<T extends string>({ opzioni, valore, onCambia, etichetta, larghezzaPiena }: {
  opzioni: { valore: T; testo: string }[]; valore: T; onCambia: (v: T) => void; etichetta: string; larghezzaPiena?: boolean;
}) {
  const { c } = useTema();
  const alto = useCompatto();
  return (
    // Alta come campi, tendine e pulsanti: le opzioni riempiono l'altezza e il testo sta al centro; se non stanno in una riga vanno a capo.
    <View accessibilityRole="radiogroup" accessibilityLabel={etichetta} style={{ flexDirection: 'row', flexWrap: 'wrap', minHeight: alto ? 44 : ALTEZZA_CONTROLLO, padding: d['margine-gruppo-controlli'], gap: d['margine-gruppo-controlli'], borderRadius: d['raggio-controllo'], backgroundColor: c['sfondo-tenue'], alignSelf: larghezzaPiena ? 'stretch' : 'flex-start' }}>
      {opzioni.map((o) => {
        const scelta = o.valore === valore;
        return (
          <Pressable key={o.valore} accessibilityRole="radio" aria-checked={scelta} onPress={() => onCambia(o.valore)}
            style={(s: StatoPressione) => [{ flexGrow: larghezzaPiena ? 1 : 0, minHeight: (alto ? 44 : ALTEZZA_CONTROLLO) - 2 * d['margine-gruppo-controlli'], alignItems: 'center', justifyContent: 'center', paddingHorizontal: dentroIlBordo(d['margine-voce-h']),
              borderRadius: d['raggio-controllo-interno'], backgroundColor: scelta ? c['sfondo-scheda'] : s.hovered ? c['sfondo-hover'] : 'transparent',
              borderWidth: d['misura-bordo'], borderColor: scelta ? c['bordo-controllo'] : 'transparent' }, anelloFocus(c, s.focused)]}>
            <Testo stile={scelta ? 'dettaglio-forte' : 'dettaglio-normale'} colore={scelta ? 'testo-accento' : 'testo-secondario'}>{o.testo}</Testo>
          </Pressable>
        );
      })}
    </View>
  );
}

// Due mattoni di disposizione (non componenti): pila verticale e riga orizzontale con gap da token.
type Gap = 'spazio-testo' | 'spazio-elenco' | 'spazio-icona' | 'spazio-pillole' | 'spazio-colonne' | 'spazio-blocco' | 'spazio-gruppo';
export function Pila({ gap, children, style }: { gap?: Gap; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: gap ? d[gap] : 0 }, style]}>{children}</View>;
}
export function Riga({ gap, children, style, centro = true }: { gap?: Gap; children: ReactNode; style?: StyleProp<ViewStyle>; centro?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: centro ? 'center' : 'flex-start', gap: gap ? d[gap] : 0 }, style]}>{children}</View>;
}
