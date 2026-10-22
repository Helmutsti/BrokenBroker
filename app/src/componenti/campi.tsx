import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, type TextInputProps, View } from 'react-native';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { carattere, ombre, stiliTesto } from '../tema/token.ts';
import { anelloFocus, dentroIlBordo, type StatoPressione } from './base.tsx';
import { Icona } from './Icona.tsx';

// CMP-05 Campo di testo e CMP-06 Tendina.

type CampoProps = {
  etichetta?: string; valore: string; onCambia: (v: string) => void; segnaposto?: string; aiuto?: string; errore?: string;
  iconaPrima?: string; iconaDopo?: string; onIconaDopo?: () => void; etichettaIconaDopo?: string; disattivato?: boolean; onUscita?: () => void;
} & Pick<TextInputProps, 'secureTextEntry' | 'keyboardType' | 'autoComplete' | 'onSubmitEditing' | 'autoFocus' | 'inputMode' | 'multiline'>;

export function Campo({ etichetta, valore, onCambia, segnaposto, aiuto, errore, iconaPrima, iconaDopo, onIconaDopo, etichettaIconaDopo, disattivato, onUscita, ...resto }: CampoProps) {
  const { c } = useTema();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: d['spazio-testo'], alignSelf: 'stretch', opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']),
        borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[errore ? 'bordo-errore' : focus ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: c['sfondo-scheda'] }, anelloFocus(c, focus)]}>
        {iconaPrima ? <Icona nome={iconaPrima} misura={16} /> : null}
        <TextInput {...resto} value={valore} onChangeText={onCambia} placeholder={segnaposto} editable={!disattivato} accessibilityLabel={etichetta ?? segnaposto}
          onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); onUscita?.(); }} placeholderTextColor={c['testo-terziario']}
          style={[{ flex: 1, fontFamily: carattere, color: c['testo-primario'], padding: 0, outlineStyle: 'none' } as object, stiliTesto['corpo-normale']]} />
        {iconaDopo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={etichettaIconaDopo} onPress={onIconaDopo}><Icona nome={iconaDopo} misura={16} /></Pressable>
        ) : null}
      </View>
      {errore ? (
        <View style={{ flexDirection: 'row', gap: d['spazio-testo'], alignItems: 'center' }}>
          <Icona nome="circle-alert" misura={16} colore="icona-errore" /><Testo stile="dettaglio-normale" colore="testo-errore">{errore}</Testo>
        </View>
      ) : aiuto ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiuto}</Testo> : null}
    </View>
  );
}

export type Opzione<T extends string> = { valore: T; testo: string; icona?: string; rientro?: number };

export function Tendina<T extends string>({ etichetta, valore, opzioni, onCambia, segnaposto = 'Scegli…', iconaPrima, disattivato, larghezza }: {
  etichetta?: string; valore: T | null; opzioni: Opzione<T>[]; onCambia: (v: T) => void; segnaposto?: string; iconaPrima?: string; disattivato?: boolean; larghezza?: number;
}) {
  const { c } = useTema();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [aperta, setAperta] = useState<null | { x: number; y: number; w: number }>(null);
  const scelta = opzioni.find((o) => o.valore === valore);
  const apri = () => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAperta({ x, y: y + h + 4, w }));
  return (
    <View style={{ gap: d['spazio-testo'], alignSelf: larghezza ? 'flex-start' : 'stretch', width: larghezza, opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${etichetta ?? ''} ${scelta?.testo ?? segnaposto}`} aria-expanded={!!aperta} disabled={disattivato} onPress={apri}
        style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']),
          borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[aperta ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
        {iconaPrima || scelta?.icona ? <Icona nome={(scelta?.icona ?? iconaPrima)!} misura={16} /> : null}
        <Testo numberOfLines={1} colore={scelta ? 'testo-primario' : 'testo-terziario'} style={{ flex: 1 }}>{scelta?.testo ?? segnaposto}</Testo>
        <Icona nome="chevron-down" misura={16} />
      </Pressable>
      <Modal transparent visible={!!aperta} onRequestClose={() => setAperta(null)}>
        <Pressable accessibilityLabel="Chiudi" style={{ flex: 1 }} onPress={() => setAperta(null)}>
          {aperta ? (
            <View style={{ position: 'absolute', left: aperta.x, top: aperta.y, width: Math.max(aperta.w, 200), maxHeight: 320, backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-controllo'],
              borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as object}>
              <ScrollView contentContainerStyle={{ padding: d['margine-gruppo-controlli'], gap: d['spazio-elenco'] }}>
                {opzioni.map((o) => (
                  <Pressable key={o.valore} accessibilityRole="menuitem" onPress={() => { onCambia(o.valore); setAperta(null); }}
                    style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'],
                      paddingLeft: d['margine-voce-h'] + (o.rientro ?? 0) * 16, borderRadius: d['raggio-controllo-interno'],
                      backgroundColor: o.valore === valore ? c['sfondo-accento-tenue'] : s.hovered || s.focused ? c['sfondo-hover'] : 'transparent' }]}>
                    {o.icona ? <Icona nome={o.icona} misura={16} /> : null}
                    <Testo colore={o.valore === valore ? 'testo-accento' : 'testo-primario'}>{o.testo}</Testo>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
