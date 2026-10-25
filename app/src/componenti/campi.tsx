import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, type TextInputProps, useWindowDimensions, View } from 'react-native';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { carattere, ombre, stiliTesto } from '../tema/token.ts';
import { anelloFocus, dentroIlBordo, type StatoPressione } from './base.tsx';
import { Icona } from './Icona.tsx';

// CMP-05 Campo di testo e CMP-06 Tendina.

// Tiene un menu a comparsa dentro lo schermo (su telefono i campi sono larghi quanto lo schermo).
const dentroLoSchermo = (x: number, larghezza: number, schermo: number) => Math.max(8, Math.min(x, schermo - larghezza - 8));

type CampoProps = {
  etichetta?: string; valore: string; onCambia: (v: string) => void; segnaposto?: string; aiuto?: string; errore?: string;
  iconaPrima?: string; iconaDopo?: string; onIconaDopo?: () => void; etichettaIconaDopo?: string; disattivato?: boolean; onUscita?: () => void;
} & Pick<TextInputProps, 'secureTextEntry' | 'keyboardType' | 'autoComplete' | 'onSubmitEditing' | 'autoFocus' | 'inputMode' | 'multiline'>;

export function Campo({ etichetta, valore, onCambia, segnaposto, aiuto, errore, iconaPrima, iconaDopo, onIconaDopo, etichettaIconaDopo, disattivato, onUscita, ...resto }: CampoProps) {
  const { c } = useTema();
  const [focus, setFocus] = useState(false);
  const compatto = useCompatto();
  return (
    <View style={{ gap: d['spazio-testo'], alignSelf: 'stretch', opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']),
        borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[errore ? 'bordo-errore' : focus ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: c['sfondo-scheda'] }, anelloFocus(c, focus)]}>
        {iconaPrima ? <Icona nome={iconaPrima} misura={16} /> : null}
        <TextInput {...resto} value={valore} onChangeText={onCambia} placeholder={segnaposto} editable={!disattivato} accessibilityLabel={etichetta ?? segnaposto}
          onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); onUscita?.(); }} placeholderTextColor={c['testo-terziario']}
          style={[{ flex: 1, minWidth: 0, fontFamily: carattere, color: c['testo-primario'], padding: 0, outlineStyle: 'none' } as object, stiliTesto['corpo-normale'], compatto ? { fontSize: 16, lineHeight: 22 } : null]} />
        {iconaDopo ? (
          <Pressable accessibilityRole="button" accessibilityLabel={etichettaIconaDopo} onPress={onIconaDopo} hitSlop={12}><Icona nome={iconaDopo} misura={16} /></Pressable>
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
  const compatto = useCompatto();
  const schermo = useWindowDimensions().width;
  return (
    <View style={{ gap: d['spazio-testo'], alignSelf: larghezza ? 'flex-start' : 'stretch', width: larghezza, opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${etichetta ?? ''} ${scelta?.testo ?? segnaposto}`} aria-expanded={!!aperta} disabled={disattivato} onPress={apri}
        style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']),
          borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[aperta ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
        {iconaPrima || scelta?.icona ? <Icona nome={(scelta?.icona ?? iconaPrima)!} misura={16} /> : null}
        <Testo numberOfLines={1} colore={scelta ? 'testo-primario' : 'testo-terziario'} style={{ flex: 1 }}>{scelta?.testo ?? segnaposto}</Testo>
        <Icona nome="chevron-down" misura={16} />
      </Pressable>
      <Modal transparent visible={!!aperta} onRequestClose={() => setAperta(null)}>
        <Pressable accessibilityLabel="Chiudi" style={{ flex: 1 }} onPress={() => setAperta(null)}>
          {aperta ? (
            <View style={{ position: 'absolute', left: dentroLoSchermo(aperta.x, Math.min(Math.max(aperta.w, 200), schermo - 16), schermo), top: aperta.y, width: Math.min(Math.max(aperta.w, 200), schermo - 16), maxHeight: 320, backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-controllo'],
              borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as object}>
              <ScrollView contentContainerStyle={{ padding: d['margine-gruppo-controlli'], gap: d['spazio-elenco'] }}>
                {opzioni.map((o) => (
                  <Pressable key={o.valore} accessibilityRole="menuitem" onPress={() => { onCambia(o.valore); setAperta(null); }}
                    style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'],
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

// ---- Tendina a griglia ----
// Come la Tendina, ma il menu è una griglia di riquadri con l'icona (e il nome, a meno
// che sia `soloIcone`): per categorie e icone, dove si riconosce più in fretta il disegno
// di una riga di testo in una lista. Le voci con `rientro` (sottocategorie) hanno una
// linea d'accento a sinistra.
export function TendinaGriglia<T extends string>({ etichetta, valore, opzioni, onCambia, segnaposto = 'Scegli…', iconaPrima, disattivato, larghezza, soloIcone }: {
  etichetta?: string; valore: T | null; opzioni: Opzione<T>[]; onCambia: (v: T) => void; segnaposto?: string; iconaPrima?: string; disattivato?: boolean; larghezza?: number; soloIcone?: boolean;
}) {
  const { c } = useTema();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [aperta, setAperta] = useState<null | { x: number; y: number; w: number }>(null);
  const scelta = opzioni.find((o) => o.valore === valore);
  const apri = () => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAperta({ x, y: y + h + 4, w }));
  const compatto = useCompatto();
  const schermo = useWindowDimensions().width;
  const larghezzaMenu = Math.min(soloIcone ? 8 * 56 + 16 : Math.max(aperta?.w ?? 0, 4 * 96 + 16), schermo - 16);
  const lato = soloIcone ? 52 : compatto ? Math.floor((larghezzaMenu - 16) / 3) - 4 : 92;
  return (
    <View style={{ gap: d['spazio-testo'], alignSelf: larghezza || soloIcone ? 'flex-start' : 'stretch', width: larghezza, opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${etichetta ?? ''} ${scelta?.testo ?? segnaposto}`} aria-expanded={!!aperta} disabled={disattivato} onPress={apri}
        style={(s: StatoPressione) => [soloIcone
          ? { width: compatto ? 44 : 40, height: compatto ? 44 : 40, alignItems: 'center', justifyContent: 'center' }
          : { flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']) },
          { borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[aperta ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
        {iconaPrima || scelta?.icona ? <Icona nome={(scelta?.icona ?? iconaPrima)!} misura={soloIcone ? 24 : 16} /> : null}
        {soloIcone ? null : <Testo numberOfLines={1} colore={scelta ? 'testo-primario' : 'testo-terziario'} style={{ flex: 1 }}>{scelta?.testo ?? segnaposto}</Testo>}
        {soloIcone ? null : <Icona nome="chevron-down" misura={16} />}
      </Pressable>
      <Modal transparent visible={!!aperta} onRequestClose={() => setAperta(null)}>
        <Pressable accessibilityLabel="Chiudi" style={{ flex: 1 }} onPress={() => setAperta(null)}>
          {aperta ? (
            <View style={{ position: 'absolute', left: dentroLoSchermo(aperta.x, larghezzaMenu, schermo), top: aperta.y, width: larghezzaMenu, maxHeight: 360, backgroundColor: c['sfondo-scheda'],
              borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as object}>
              <ScrollView contentContainerStyle={{ padding: d['margine-gruppo-controlli'], flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {opzioni.map((o) => {
                  const sel = o.valore === valore;
                  return (
                    <Pressable key={o.valore} accessibilityRole="menuitem" accessibilityLabel={o.testo} accessibilityState={{ selected: sel }} onPress={() => { onCambia(o.valore); setAperta(null); }}
                      style={(s: StatoPressione) => [{ width: lato, height: soloIcone ? lato : 68, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4, borderRadius: d['raggio-controllo-interno'],
                        borderLeftWidth: o.rientro ? 3 : 0, borderLeftColor: c['sfondo-accento'], backgroundColor: sel ? c['sfondo-accento-tenue'] : s.hovered || s.focused ? c['sfondo-hover'] : 'transparent' }]}>
                      <Icona nome={o.icona ?? 'ellipsis'} misura={soloIcone ? 24 : 20} colore={sel ? 'icona-accento' : 'icona-predefinita'} />
                      {soloIcone ? null : <Testo stile="dettaglio-normale" numberOfLines={2} colore={sel ? 'testo-accento' : 'testo-primario'} style={{ textAlign: 'center' }}>{o.testo}</Testo>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

// Le icone tra cui scegliere per conti e salvadanai: un sottoinsieme di quelle già nel pacchetto.
export const ICONE_SCELTA = ['landmark', 'wallet', 'credit-card', 'banknote', 'piggy-bank', 'smartphone', 'house', 'car', 'plane', 'tree-palm', 'heart', 'gift', 'shield', 'shield-check',
  'briefcase', 'laptop', 'camera', 'gamepad-2', 'music', 'shirt', 'stethoscope', 'pill', 'bed', 'sofa', 'wrench', 'utensils', 'shopping-cart', 'coffee', 'cat', 'package', 'target', 'trending-up'];

const NOME_ICONA: Record<string, string> = { landmark: 'Banca', wallet: 'Portafoglio', 'credit-card': 'Carta', banknote: 'Contanti', 'piggy-bank': 'Salvadanaio', smartphone: 'Telefono',
  house: 'Casa', car: 'Auto', plane: 'Viaggio', 'tree-palm': 'Vacanza', heart: 'Cuore', gift: 'Regalo', shield: 'Scudo', 'shield-check': 'Sicurezza', briefcase: 'Lavoro', laptop: 'Computer',
  camera: 'Foto', 'gamepad-2': 'Svago', music: 'Musica', shirt: 'Vestiti', stethoscope: 'Salute', pill: 'Medicine', bed: 'Letto', sofa: 'Arredo', wrench: 'Lavori', utensils: 'Cibo',
  'shopping-cart': 'Spesa', coffee: 'Caffè', cat: 'Animali', package: 'Pacco', target: 'Obiettivo', 'trending-up': 'Crescita' };

// Scelta dell'icona di un conto o di un salvadanaio: tendina a griglia di sole icone.
export function SceltaIcona({ etichetta = 'Icona', valore, onCambia }: { etichetta?: string; valore: string; onCambia: (v: string) => void }) {
  return <TendinaGriglia soloIcone etichetta={etichetta} valore={valore} onCambia={onCambia} opzioni={ICONE_SCELTA.map((n) => ({ valore: n, testo: NOME_ICONA[n] ?? n, icona: n }))} />;
}

// ---- Campo data con calendario (proposta v4) ----
// Si sceglie il giorno da un calendario del mese invece di scriverlo. Riceve e
// restituisce la data come testo GG/MM/AAAA, come il campo di testo.
const MESI_CAL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI_CAL = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const isoDa = (testo: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(testo.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const testoDa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const oggiCal = () => { const o = new Date(); return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}-${String(o.getDate()).padStart(2, '0')}`; };

export function CampoData({ etichetta, valore, onCambia, segnaposto = 'Scegli il giorno', aiuto, facoltativa, disattivato }: {
  etichetta?: string; valore: string; onCambia: (v: string) => void; segnaposto?: string; aiuto?: string; facoltativa?: boolean; disattivato?: boolean;
}) {
  const { c } = useTema();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [aperta, setAperta] = useState<null | { x: number; y: number }>(null);
  const scelto = isoDa(valore);
  const [mese, setMese] = useState(() => (scelto ?? oggiCal()).slice(0, 7));
  const compatto = useCompatto();
  const schermo = useWindowDimensions().width;
  const apri = () => {
    setMese((scelto ?? oggiCal()).slice(0, 7));
    ref.current?.measureInWindow((x: number, y: number, _w: number, h: number) => {
      // Se sotto non c'è posto il calendario si apre sopra il campo.
      const alto = compatto ? 420 : 340, sotto = y + h + 4;
      setAperta({ x, y: typeof window !== 'undefined' && sotto + alto > window.innerHeight ? Math.max(8, y - alto - 4) : sotto });
    });
  };
  const scegli = (iso: string | null) => { onCambia(iso ? testoDa(iso) : ''); setAperta(null); };
  const [a, m] = mese.split('-').map(Number);
  const primo = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const giorni = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const celle: (string | null)[] = [...Array(primo).fill(null), ...Array.from({ length: giorni }, (_, i) => `${mese}-${String(i + 1).padStart(2, '0')}`)];
  while (celle.length % 7) celle.push(null);
  const sposta = (n: number) => { const t = a * 12 + (m - 1) + n; setMese(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`); };
  const oggi = oggiCal();
  const leggibile = scelto ? `${Number(scelto.slice(8, 10))} ${MESI_CAL[Number(scelto.slice(5, 7)) - 1]} ${scelto.slice(0, 4)}` : null;
  return (
    <View style={{ gap: d['spazio-testo'], opacity: disattivato ? d['opacita-disattivato'] : 1 }}>
      {etichetta ? <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo> : null}
      <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${etichetta ?? ''} ${leggibile ?? segnaposto}`} aria-expanded={!!aperta} disabled={disattivato} onPress={apri}
        style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingVertical: dentroIlBordo(d['margine-controllo-v']), paddingHorizontal: dentroIlBordo(d['margine-controllo-h']),
          borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c[aperta ? 'bordo-focus' : 'bordo-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
        <Icona nome="calendar" misura={16} />
        <Testo numberOfLines={1} colore={leggibile ? 'testo-primario' : 'testo-terziario'} style={{ flex: 1 }}>{leggibile ?? segnaposto}</Testo>
        <Icona nome="chevron-down" misura={16} />
      </Pressable>
      {aiuto ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiuto}</Testo> : null}
      <Modal transparent visible={!!aperta} onRequestClose={() => setAperta(null)}>
        <Pressable accessibilityLabel="Chiudi il calendario" style={{ flex: 1 }} onPress={() => setAperta(null)}>
          {aperta ? (
            <Pressable onPress={() => {}} accessibilityRole="dialog" aria-label={`Calendario ${MESI_CAL[m - 1]} ${a}`}
              style={{ position: 'absolute', left: dentroLoSchermo(aperta.x, 292, schermo), top: aperta.y, width: 292, padding: d['margine-gruppo-controlli'] * 3, gap: d['spazio-testo'], backgroundColor: c['sfondo-scheda'],
                borderRadius: d['raggio-controllo'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as object}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Mese prima" onPress={() => sposta(-1)} style={{ padding: d['spazio-testo'] * 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icona nome="chevron-left" misura={16} /></Pressable>
                <Testo stile="corpo-forte" style={{ flex: 1, textAlign: 'center' }}>{`${MESI_CAL[m - 1].charAt(0).toUpperCase()}${MESI_CAL[m - 1].slice(1)} ${a}`}</Testo>
                <Pressable accessibilityRole="button" accessibilityLabel="Mese dopo" onPress={() => sposta(1)} style={{ padding: d['spazio-testo'] * 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icona nome="chevron-right" misura={16} /></Pressable>
              </View>
              <View style={{ flexDirection: 'row' }}>{GIORNI_CAL.map((g, i) => <Testo key={i} stile="dettaglio-forte" colore="testo-terziario" style={{ width: 38, textAlign: 'center' }}>{g}</Testo>)}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {celle.map((iso, i) => iso ? (
                  <Pressable key={iso} accessibilityRole="button" accessibilityLabel={`${Number(iso.slice(8, 10))} ${MESI_CAL[m - 1]} ${a}`} aria-selected={iso === scelto} onPress={() => scegli(iso)}
                    style={(s: StatoPressione) => ({ width: 38, height: compatto ? 44 : 34, alignItems: 'center', justifyContent: 'center', borderRadius: d['raggio-controllo-interno'],
                      backgroundColor: iso === scelto ? c['sfondo-accento'] : s.hovered ? c['sfondo-hover'] : 'transparent',
                      borderWidth: iso === oggi && iso !== scelto ? d['misura-bordo'] : 0, borderColor: c['bordo-focus'] })}>
                    <Testo stile={iso === oggi || iso === scelto ? 'corpo-forte' : 'corpo-normale'} colore={iso === scelto ? 'testo-su-accento' : 'testo-primario'}>{String(Number(iso.slice(8, 10)))}</Testo>
                  </Pressable>
                ) : <View key={`v${i}`} style={{ width: 38, height: compatto ? 44 : 34 }} />)}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: d['spazio-testo'] }}>
                <Pressable accessibilityRole="button" onPress={() => scegli(oggi)} style={{ padding: d['spazio-testo'] * 2, minHeight: compatto ? 44 : undefined, justifyContent: 'center' }}><Testo stile="corpo-forte" colore="testo-accento">Oggi</Testo></Pressable>
                {facoltativa && scelto ? <Pressable accessibilityRole="button" onPress={() => scegli(null)} style={{ padding: d['spazio-testo'] * 2 }}><Testo colore="testo-secondario">Togli la data</Testo></Pressable> : null}
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
