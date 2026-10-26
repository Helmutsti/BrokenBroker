import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { euro, nomeMese, numero, percento, spostaMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { coloriCategorie, ombre, tintaCategoria, type NomeColore } from '../tema/token.ts';
import { ALTEZZA_CONTROLLO, Anello, anelloFocus, Barra, Etichetta, Pulsante, PulsanteIcona, Spunta, type StatoPressione, Tessera, type Tono, type ToneAvanzamento } from './base.tsx';
import { Icona } from './Icona.tsx';

// Componenti composti (CMP-20 … CMP-40). I contenitori hanno padding e gap
// dal ruolo; i contenuti no.

// ---- CMP-20 Barra laterale ----
export type VoceMenu = { chiave: string; testo: string; breve?: string; icona: string };
export function BarraLaterale({ voci, attiva, onNaviga, profilo, onProfilo, onEsci }: {
  voci: VoceMenu[]; attiva: string; onNaviga: (k: string) => void; profilo: string; onProfilo: () => void; onEsci: () => void;
}) {
  const { c } = useTema();
  const voce = (v: VoceMenu | { chiave: string; testo: string; icona: string }, onPress: () => void) => {
    const sel = v.chiave === attiva;
    return (
      <Pressable key={v.chiave} accessibilityRole="link" aria-current={sel ? 'page' : undefined} onPress={onPress}
        style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], borderRadius: d['raggio-controllo'],
          backgroundColor: sel ? c['sfondo-accento-tenue'] : s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
        <Icona nome={v.icona} misura={16} colore={sel ? 'icona-accento' : 'icona-predefinita'} />
        <Testo stile={sel ? 'corpo-forte' : 'corpo-normale'} colore={sel ? 'testo-accento' : 'testo-primario'}>{v.testo}</Testo>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="navigation" style={{ width: d['larghezza-barra-laterale'], padding: d['margine-barra-laterale'], gap: d['spazio-gruppo'], backgroundColor: c['sfondo-barra-laterale'], alignSelf: 'stretch' }}>
      <Testo stile="logo">BrokenBroker</Testo>
      <View style={{ gap: d['spazio-elenco'] }}>{voci.map((v) => voce(v, () => onNaviga(v.chiave)))}</View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: d['spazio-elenco'] }}>
        {voce({ chiave: 'impostazioni', testo: 'Impostazioni', icona: 'sliders-horizontal' }, onProfilo)}
        {voce({ chiave: 'esci', testo: 'Esci', icona: 'log-out' }, onEsci)}
      </View>
    </View>
  );
}

// Telefono: barra di navigazione in basso (le sezioni principali, più «Altro» con le altre) e testata in alto
// (logo, impostazioni, esci). Rispetta l'area sicura di iPhone (barra Home) e i bersagli sono alti almeno 44.
export function BarraInferiore({ voci, altre, attiva, onNaviga }: { voci: VoceMenu[]; altre: VoceMenu[]; attiva: string; onNaviga: (k: string) => void }) {
  const { c } = useTema();
  const [altro, setAltro] = useState(false);
  // «Altro» risulta attivo quando è aperta una delle sezioni che contiene.
  const altroAttivo = altre.some((v) => v.chiave === attiva);
  const voce = (chiave: string, testo: string, icona: string, sel: boolean, onPress: () => void) => (
    <Pressable key={chiave} accessibilityRole={chiave === 'altro' ? 'button' : 'link'} accessibilityLabel={testo} aria-current={sel ? 'page' : undefined} aria-expanded={chiave === 'altro' ? altro : undefined} onPress={onPress}
      style={{ flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4, borderRadius: d['raggio-controllo'], backgroundColor: sel ? c['sfondo-accento-tenue'] : 'transparent' }}>
      <Icona nome={icona} misura={20} colore={sel ? 'icona-accento' : 'icona-predefinita'} />
      <Testo stile="dettaglio-forte" colore={sel ? 'testo-accento' : 'testo-secondario'} numberOfLines={1} style={{ fontSize: 13, lineHeight: 16 }}>{testo}</Testo>
    </Pressable>
  );
  return (
    <>
      <View accessibilityRole="navigation" style={{ flexDirection: 'row', backgroundColor: c['sfondo-barra-laterale'], borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'],
        paddingHorizontal: 4, paddingTop: 4, paddingBottom: 'env(safe-area-inset-bottom)' } as object}>
        {voci.map((v) => voce(v.chiave, v.breve ?? v.testo, v.icona, v.chiave === attiva, () => onNaviga(v.chiave)))}
        {voce('altro', 'Altro', 'ellipsis', altroAttivo, () => setAltro(true))}
      </View>
      <Foglio aperto={altro} titolo="Altro" onChiudi={() => setAltro(false)}>
        {altre.map((v) => {
          const sel = v.chiave === attiva;
          return (
            <Pressable key={v.chiave} accessibilityRole="link" aria-current={sel ? 'page' : undefined} onPress={() => { setAltro(false); onNaviga(v.chiave); }}
              style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], minHeight: 48, paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], borderRadius: d['raggio-controllo'],
                backgroundColor: sel ? c['sfondo-accento-tenue'] : s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
              <Icona nome={v.icona} misura={20} colore={sel ? 'icona-accento' : 'icona-predefinita'} />
              <Testo colore={sel ? 'testo-accento' : 'testo-primario'} stile={sel ? 'corpo-forte' : 'corpo-normale'}>{v.testo}</Testo>
            </Pressable>
          );
        })}
      </Foglio>
    </>
  );
}

// Foglio che sale dal basso (telefono): per menu e scelte brevi. Si chiude toccando fuori o con «Chiudi».
export function Foglio({ aperto, titolo, onChiudi, children }: { aperto: boolean; titolo: string; onChiudi: () => void; children: ReactNode }) {
  const { c } = useTema();
  return (
    <Modal transparent visible={aperto} onRequestClose={onChiudi} animationType="fade">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c['sfondo-velo'] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" onPress={onChiudi} style={{ flex: 1 }} />
        <View accessibilityRole="dialog" aria-modal aria-label={titolo}
          style={{ padding: d['spazio-blocco'], paddingBottom: 'max(16px, env(safe-area-inset-bottom))', gap: d['spazio-colonne'], backgroundColor: c['sfondo-scheda'], borderTopLeftRadius: d['raggio-finestra'], borderTopRightRadius: d['raggio-finestra'],
            borderTopWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] } as object}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>{titolo}</Testo>
            <PulsanteIcona icona="x" etichetta="Chiudi" fantasma onPress={onChiudi} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// Finestra piccola di conferma («Vuoi uscire?», «Eliminare …?»): titolo, una riga che spiega, Annulla e il pulsante di conferma.
export function ConfermaFinestra({ aperta, titolo, testo, etichettaConferma, tono = 'primario', onConferma, onAnnulla, lavoro }: {
  aperta: boolean; titolo: string; testo?: string; etichettaConferma: string; tono?: 'primario' | 'pericolo'; onConferma: () => void; onAnnulla: () => void; lavoro?: boolean;
}) {
  const { c } = useTema();
  return (
    <Modal transparent visible={aperta} onRequestClose={onAnnulla} animationType="fade">
      <View style={{ flex: 1, backgroundColor: c['sfondo-velo'], alignItems: 'center', justifyContent: 'center', padding: d['spazio-blocco'] }}>
        <View accessibilityRole="alert" aria-modal aria-label={titolo}
          style={{ width: 400, maxWidth: '100%', padding: d['margine-scheda'], gap: d['spazio-blocco'], backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-finestra'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'],
            boxShadow: `0 ${ombre.finestra.offsetY}px ${ombre.finestra.blur}px ${ombre.finestra.colore}` } as object}>
          <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2}>{titolo}</Testo>
          {testo ? <Testo colore="testo-secondario">{testo}</Testo> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
            <Pulsante etichetta="Annulla" onPress={onAnnulla} />
            <Pulsante tipo={tono} etichetta={etichettaConferma} onPress={onConferma} disattivato={lavoro} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function TestataCompatta({ profilo, impostazioniAttive, onProfilo, onEsci }: { profilo: string; impostazioniAttive: boolean; onProfilo: () => void; onEsci: () => void }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingHorizontal: 16, paddingVertical: 6, paddingTop: 'max(6px, env(safe-area-inset-top))',
      backgroundColor: c['sfondo-barra-laterale'], borderBottomWidth: d['misura-bordo'], borderBottomColor: c['bordo-separatore'] } as object}>
      <Testo stile="logo" style={{ flex: 1, fontSize: 18 }} numberOfLines={1}>BrokenBroker</Testo>
      <View style={{ borderRadius: d['raggio-controllo'], backgroundColor: impostazioniAttive ? c['sfondo-accento-tenue'] : 'transparent' }}>
        <PulsanteIcona icona="sliders-horizontal" etichetta="Impostazioni" fantasma onPress={onProfilo} />
      </View>
      <PulsanteIcona icona="log-out" etichetta="Esci" fantasma onPress={onEsci} />
    </View>
  );
}

// ---- CMP-21 Intestazione di pagina ----
export function Intestazione({ titolo, sottotitolo, azioni }: { titolo: string; sottotitolo?: string; azioni?: ReactNode }) {
  const compatto = useCompatto();
  return (
    <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
      <View style={{ flex: compatto ? undefined : 1, minWidth: 0, gap: d['spazio-testo'] }}>
        <Testo stile="titolo-pagina" accessibilityRole="header" aria-level={1} style={compatto ? { fontSize: 24, lineHeight: 30 } : undefined}>{titolo}</Testo>
        {sottotitolo ? <Testo colore="testo-secondario">{sottotitolo}</Testo> : null}
      </View>
      {azioni ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>{azioni}</View> : null}
    </View>
  );
}

// ---- CMP-22 Scheda ----
export function Scheda({ titolo, nota, icona, children, azione, dopoTitolo, titoloScelta, style }: { titolo?: string; titoloScelta?: ReactNode; /* al posto del testo del titolo (es. titolo che è anche un selettore) */ nota?: string; icona?: string; children: ReactNode; azione?: ReactNode; dopoTitolo?: ReactNode; style?: object }) {
  const { c } = useTema();
  const compatto = useCompatto();
  return (
    <View role={titolo ? 'region' : undefined} aria-label={titolo} style={[{ minWidth: 0, padding: compatto ? 12 : d['margine-scheda'], gap: d['spazio-blocco'], backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }, style]}>
      {titolo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: compatto ? 'wrap' : 'nowrap', gap: d['spazio-icona'] }}>
          {icona ? <Tessera icona={icona} misura="piccola" /> : null}
          {titoloScelta ? <View style={{ flex: 1, minWidth: 0 }}>{titoloScelta}</View> : <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2} style={dopoTitolo ? { flexShrink: 1 } : { flex: 1, minWidth: compatto ? 120 : undefined }}>{titolo}</Testo>}
          {dopoTitolo ? <>{dopoTitolo}<View style={{ flex: 1 }} /></> : null}
          {nota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo> : null}
          {azione}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ---- CMP-32 Finestra ----
// Su telefono occupa tutto lo schermo: titolo in alto, campi che scorrono, Annulla/Salva sempre in fondo.
export function Finestra({ titolo, icona, aperta, onChiudi, children, azioni, onElimina, etichettaElimina = 'Elimina', larghezza, intestazioneDestra }: {
  titolo: string; icona?: string; aperta: boolean; onChiudi: () => void; children: ReactNode; azioni?: ReactNode; onElimina?: () => void; etichettaElimina?: string; larghezza?: number;
  intestazioneDestra?: ReactNode; // facoltativo: accanto al titolo, prima del pulsante Chiudi
}) {
  const { c } = useTema();
  const compatto = useCompatto();
  const intestazione = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
      {icona ? <Tessera icona={icona} misura="media" /> : null}
      <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2} style={{ flex: 1, fontSize: 20, lineHeight: 26 }}>{titolo}</Testo>
      {intestazioneDestra}
      <PulsanteIcona icona="x" etichetta="Chiudi" fantasma onPress={onChiudi} />
    </View>
  );
  const piede = azioni || onElimina ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], paddingTop: d['spazio-blocco'] }}>
      {onElimina ? <Pulsante tipo="pericolo" etichetta={etichettaElimina} onPress={onElimina} /> : null}
      <View style={{ flex: 1 }} />
      {azioni}
    </View>
  ) : null;
  if (compatto) return (
    <Modal transparent visible={aperta} onRequestClose={onChiudi} animationType="fade">
      <View accessibilityRole="dialog" aria-modal aria-label={titolo} style={{ flex: 1, backgroundColor: c['sfondo-scheda'] }}>
        <View style={{ padding: 16, paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottomWidth: d['misura-bordo'], borderBottomColor: c['bordo-separatore'] } as object}>{intestazione}</View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: d['spazio-gruppo'] }}>{children}</ScrollView>
        {piede ? <View style={{ padding: 16, paddingTop: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom))', backgroundColor: c['sfondo-scheda'] } as object}>{piede}</View> : null}
      </View>
    </Modal>
  );
  return (
    <Modal transparent visible={aperta} onRequestClose={onChiudi} animationType="fade">
      <View style={{ flex: 1, backgroundColor: c['sfondo-velo'], alignItems: 'center', justifyContent: 'center', padding: d['margine-pagina'] }}>
        <View accessibilityRole="dialog" aria-modal aria-label={titolo}
          style={{ width: larghezza ?? d['larghezza-finestra'], maxWidth: '100%', maxHeight: '100%', backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-finestra'],
            boxShadow: `0 ${ombre.finestra.offsetY}px ${ombre.finestra.blur}px ${ombre.finestra.colore}` } as object}>
          <ScrollView contentContainerStyle={{ padding: d['margine-finestra'], gap: d['spazio-gruppo'] }}>
            {intestazione}
            {children}
            {piede}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- CMP-23 Numero chiave ----
export type ToneNumero = 'normale' | 'ok' | 'attenzione' | 'errore';
// `titolo` sostituisce l'etichetta con un nodo (es. un selettore); `onPress` rende premibile cifra e nota (non il titolo).
export function NumeroChiave({ etichetta, valore, nota, icona, tono = 'normale', titolo, onPress, etichettaPressione }: { etichetta: string; valore: string; nota?: string; icona: string; tono?: ToneNumero; titolo?: ReactNode; onPress?: () => void; etichettaPressione?: string }) {
  const { c } = useTema();
  const compatto = useCompatto();
  const t: Tono = tono === 'normale' ? 'accento' : tono;
  const coloreValore: NomeColore = tono === 'normale' ? 'testo-primario' : `testo-${tono}`;
  return (
    <View style={{ flex: 1, minWidth: 0, ...(compatto ? { flexBasis: '45%', flexGrow: 1, padding: 12 } : { padding: d['margine-scheda'] }), gap: d['spazio-icona'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'],
      borderColor: c[tono === 'errore' ? 'bordo-errore' : 'bordo-scheda'], backgroundColor: c[tono === 'errore' ? 'sfondo-errore-tenue' : 'sfondo-scheda'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Tessera icona={icona} misura="piccola" tono={t} suColore={tono === 'errore'} />
        {titolo ?? <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore={tono === 'normale' ? 'testo-secondario' : coloreValore} style={{ flex: 1, minWidth: 0 }}>{etichetta}</Testo>}
      </View>
      <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? etichettaPressione : undefined} onPress={onPress} style={{ gap: d['spazio-testo'] }}>
        <Testo stile="numero-grande" colore={coloreValore} style={compatto ? { fontSize: 20, lineHeight: 26 } : undefined}>{valore}</Testo>
        {nota ? <Testo stile="dettaglio-normale" colore={tono === 'normale' ? 'testo-secondario' : coloreValore}>{nota}</Testo> : null}
      </Pressable>
    </View>
  );
}

// Fila di numeri chiave: in riga sul computer, a due a due (a capo) sul telefono.
export function RigaNumeri({ children }: { children: ReactNode }) {
  const compatto = useCompatto();
  return <View style={{ flexDirection: 'row', flexWrap: compatto ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: compatto ? d['spazio-colonne'] : d['spazio-blocco'] }}>{children}</View>;
}

// ---- Gruppo di righe (titolo e totale) ----
export function TitoloGruppo({ testo, destra }: { testo: string; destra?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: d['spazio-colonne'], rowGap: d['spazio-testo'], paddingTop: d['margine-riga-v'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
      <Testo stile="etichetta-gruppo" colore="testo-secondario" style={{ flexShrink: 1 }}>{testo}</Testo>
      {destra ? <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ flexShrink: 1 }}>{destra}</Testo> : null}
    </View>
  );
}

// Gruppo che si apre e si chiude: tutto il titolo è il pulsante, la freccia gira
// (senza animazione se il sistema chiede di ridurre il movimento).
export function TitoloGruppoApribile({ testo, destra, aperto, onCambia }: { testo: string; destra?: string; aperto: boolean; onCambia: (v: boolean) => void }) {
  const { c } = useTema();
  const compatto = useCompatto();
  const giro = useRef(new Animated.Value(aperto ? 1 : 0)).current;
  const [ridotto, setRidotto] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setRidotto).catch(() => undefined); }, []);
  useEffect(() => {
    if (ridotto) giro.setValue(aperto ? 1 : 0);
    else Animated.timing(giro, { toValue: aperto ? 1 : 0, duration: d['durata-rapida'], useNativeDriver: false }).start();
  }, [aperto, ridotto, giro]);
  const rotazione = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Pressable accessibilityRole="button" aria-expanded={aperto} accessibilityLabel={`${testo}: ${aperto ? 'chiudi' : 'apri'}`} onPress={() => onCambia(!aperto)}
      style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: d['spazio-icona'], minHeight: compatto ? 44 : undefined, paddingTop: d['margine-riga-v'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'],
        borderRadius: d['raggio-controllo-interno'], backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
      <Testo stile="etichetta-gruppo" colore="testo-secondario">{testo}</Testo>
      <Animated.View style={{ transform: [{ rotate: rotazione }] }}><Icona nome="chevron-down" misura={16} colore="icona-tenue" /></Animated.View>
      <View style={{ flex: 1 }} />
      {destra ? <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ flexShrink: 1 }}>{destra}</Testo> : null}
    </Pressable>
  );
}

// Gruppo di una categoria: l'icona passa dalle righe al gruppo, in una tessera nel
// colore della categoria (fondo tenue, icona piena); senza colore la tessera è neutra.
export function TitoloCategoria({ nome, icona, colore, destra }: { nome: string; icona: string; colore: string | null; destra?: string }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingTop: d['margine-riga-v'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ width: d['misura-bersaglio'], height: d['misura-bersaglio'], borderRadius: d['raggio-controllo-interno'], alignItems: 'center', justifyContent: 'center',
        backgroundColor: colore ? tintaCategoria(colore) : c['sfondo-tenue'] }}>
        <Icona nome={icona} misura={16} tinta={colore ?? undefined} />
      </View>
      <Testo stile="corpo-forte" style={{ flex: 1 }} numberOfLines={1}>{nome}</Testo>
      {destra ? <Testo stile="corpo-forte" style={{ flexShrink: 1, textAlign: 'right' }}>{destra}</Testo> : null}
    </View>
  );
}

// Riga premibile con evidenza al passaggio del mouse.
function RigaPremibile({ onPress, children, linea, etichetta, padding = 'margine-riga-v' }: { onPress?: () => void; children: ReactNode; linea?: boolean; etichetta?: string; padding?: 'margine-riga-v' | 'margine-voce-v' }) {
  const { c } = useTema();
  const compatto = useCompatto();
  const stile = (h?: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: compatto ? d['spazio-icona'] : d['spazio-colonne'], minWidth: 0, minHeight: compatto ? 44 : undefined, paddingVertical: d[padding], paddingHorizontal: d['margine-voce-h'],
    borderBottomWidth: linea ? d['misura-bordo'] : 0, borderBottomColor: c['bordo-separatore'], backgroundColor: h ? c['sfondo-hover'] : 'transparent' });
  if (!onPress) return <View style={stile()}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={etichetta} onPress={onPress} style={(s: StatoPressione) => [stile(s.hovered), anelloFocus(c, s.focused)]}>{children}</Pressable>;
}

const Col = ({ w, children, destra }: { w: number; children: ReactNode; destra?: boolean }) => <View style={{ width: w, alignItems: destra ? 'flex-end' : 'flex-start' }}>{children}</View>;

// ---- CMP-24 Voce da spuntare ----
// Senza `icona` la riga sta in un gruppo di categoria, che ha l'icona. Con `dettaglio`
// la riga si apre (parte chiusa) e mostra sotto le sue parti, che non si spuntano.
export function VoceDaSpuntare({ nome, conto, importo, sottoImporto, icona, salvadanaio, fatta, onSpunta, onApri, dettaglio }: {
  nome: string; conto: string; importo: string; sottoImporto?: string; icona?: string | null; salvadanaio?: boolean; fatta: boolean; onSpunta?: () => void; onApri?: () => void;
  dettaglio?: { etichetta: string; righe: { nome: string; importo: string }[]; nota?: string };
}) {
  const { c } = useTema();
  const compatto = useCompatto();
  const [aperta, setAperta] = useState(false);
  // Le voci già uscite passano in secondo piano (testo più scuro, importo non in grassetto): risaltano quelle da pagare.
  const col: NomeColore = fatta ? 'testo-terziario' : 'testo-primario';
  const colSotto: NomeColore = fatta ? 'testo-terziario' : 'testo-secondario';
  const stileImporto = fatta ? 'corpo-normale' : 'corpo-forte';
  // Segno delle spese che hanno un salvadanaio o nascono da uno.
  const segno = salvadanaio ? <Icona nome="piggy-bank" misura={16} colore="icona-tenue" /> : null;
  const apri = dettaglio ? (
    <Pressable accessibilityRole="button" aria-expanded={aperta} accessibilityLabel={`${aperta ? 'Chiudi' : 'Apri'} ${dettaglio.etichetta}`} onPress={() => setAperta(!aperta)}
      style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: d['spazio-testo'], minHeight: compatto ? 32 : undefined, paddingHorizontal: d['margine-etichetta-h'], paddingVertical: d['margine-etichetta-v'],
        borderRadius: d['raggio-controllo-interno'], backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{dettaglio.etichetta}</Testo>
      <Icona nome={aperta ? 'chevron-up' : 'chevron-down'} misura={16} colore="icona-tenue" />
    </Pressable>
  ) : null;
  return (
    <View style={{ gap: d['spazio-elenco'] }}>
      {compatto ? (
        // Telefono: spunta, nome e importo sulla prima riga; conto e dettaglio sotto il nome.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] / 2 }}>
          <Spunta fatta={fatta} tenue onPress={onSpunta} etichetta={`${nome}: ${fatta ? 'uscita' : 'da pagare'}`} disattivato={!onSpunta} />
          <Pressable onPress={onApri} disabled={!onApri} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
              {icona ? <Icona nome={icona} misura={16} colore={fatta ? 'icona-tenue' : 'icona-predefinita'} /> : null}
              <Testo colore={col} numberOfLines={1} style={{ flexShrink: 1 }}>{nome}</Testo>
              {segno}
            </View>
            <Testo stile="dettaglio-normale" colore={colSotto} numberOfLines={1}>{conto}</Testo>
          </Pressable>
          <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '45%' }}>
            <Testo stile={stileImporto} colore={col}>{importo}</Testo>
            {sottoImporto ? <Testo stile="dettaglio-normale" colore={colSotto} style={{ textAlign: 'right' }}>{sottoImporto}</Testo> : null}
          </View>
        </View>
      ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Spunta fatta={fatta} tenue onPress={onSpunta} etichetta={`${nome}: ${fatta ? 'uscita' : 'da pagare'}`} disattivato={!onSpunta} />
          {icona ? <Icona nome={icona} misura={16} colore={fatta ? 'icona-tenue' : 'icona-predefinita'} /> : null}
          <Pressable onPress={onApri} disabled={!onApri} style={{ flexShrink: 1 }}><Testo colore={col} numberOfLines={1}>{nome}</Testo></Pressable>
          {segno}
          {apri}
        </View>
        <Col w={140}><Testo stile="dettaglio-normale" colore={colSotto} numberOfLines={1}>{conto}</Testo></Col>
        <Col w={110} destra><Testo stile={stileImporto} colore={col}>{importo}</Testo>{sottoImporto ? <Testo stile="dettaglio-normale" colore={colSotto}>{sottoImporto}</Testo> : null}</Col>
      </View>
      )}
      {compatto && apri ? <View style={{ paddingHorizontal: d['margine-voce-h'] }}>{apri}</View> : null}
      {dettaglio && aperta ? (
        <View style={{ gap: d['spazio-elenco'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], borderRadius: d['raggio-controllo'], backgroundColor: c['sfondo-tenue'] }}>
          {dettaglio.righe.map((r) => (
            <View key={r.nome} style={{ flexDirection: 'row', gap: d['spazio-colonne'] }}>
              <Testo colore="testo-secondario" style={{ flex: 1 }} numberOfLines={1}>{r.nome}</Testo>
              <Testo colore="testo-secondario">{r.importo}</Testo>
            </View>
          ))}
          {dettaglio.nota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{dettaglio.nota}</Testo> : null}
        </View>
      ) : null}
    </View>
  );
}

// ---- CMP-25 Voce budget ----
export type StatoBudget = 'normale' | 'attenzione' | 'superato';
export function VoceBudget({ nome, nota, conto, importo, icona, valore, stato, onApri }: { nome: string; nota: string; conto: string; importo: string; icona?: string | null; valore: number; stato: StatoBudget; onApri?: () => void }) {
  const tono: ToneAvanzamento = stato === 'normale' ? 'accento' : stato === 'attenzione' ? 'attenzione' : 'errore';
  const colNota: NomeColore = stato === 'normale' ? 'testo-secondario' : stato === 'attenzione' ? 'testo-attenzione' : 'testo-errore';
  const compatto = useCompatto();
  if (compatto) return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: 44, paddingVertical: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
      <Anello valore={valore} tono={tono} />
      <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
        <Testo numberOfLines={1}>{nome}</Testo>
        <Barra valore={valore} tono={tono} />
        <Testo stile="dettaglio-normale" colore={colNota}>{nota}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{conto}</Testo>
      </View>
      <Testo stile="corpo-forte" colore={stato === 'normale' ? 'testo-primario' : colNota}>{importo}</Testo>
    </Pressable>
  );
  return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <View style={{ width: d['misura-bersaglio'], alignItems: 'center' }}><Anello valore={valore} tono={tono} /></View>
        {icona ? <Icona nome={icona} misura={16} /> : null}
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <Testo>{nome}</Testo>
          <Barra valore={valore} tono={tono} />
          <Testo stile="dettaglio-normale" colore={colNota}>{nota}</Testo>
        </View>
      </View>
      <Col w={140}><Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{conto}</Testo></Col>
      <Col w={110} destra><Testo stile="corpo-forte" colore={stato === 'normale' ? 'testo-primario' : colNota}>{importo}</Testo></Col>
    </Pressable>
  );
}

// ---- CMP-26 Riga spesa prevista ----
export function RigaSpesa({ tipo = 'voce', nome, categoria, conto, quando, totale, quota, icona, onApri }: {
  tipo?: 'voce' | 'intestazione' | 'riassunto'; nome: string; categoria?: string; conto?: string; quando?: string; totale: string; quota: string; icona?: string; onApri?: () => void;
}) {
  const st = tipo === 'intestazione' ? 'dettaglio-forte' : 'corpo-normale';
  const col: NomeColore = tipo === 'voce' ? 'testo-primario' : 'testo-secondario';
  if (useCompatto()) {
    // Telefono: niente intestazione di colonne; nome con categoria, conto e quando sotto, importi a destra.
    if (tipo === 'intestazione') return null;
    const sotto = [categoria, conto, quando].filter(Boolean).join(' · ');
    return (
      <RigaPremibile onPress={onApri} linea etichetta={nome}>
        {tipo === 'voce' && icona ? <Tessera icona={icona} misura="piccola" /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile={tipo === 'voce' ? 'corpo-forte' : st} colore={col} numberOfLines={1}>{nome}</Testo>
          {sotto ? <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={2}>{sotto}</Testo> : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
          <Testo stile={tipo === 'voce' ? 'corpo-forte' : st} colore={col}>{quota}</Testo>
          {totale && totale !== quota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{totale}</Testo> : null}
        </View>
      </RigaPremibile>
    );
  }
  return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        {tipo === 'voce' && icona ? <Tessera icona={icona} misura="piccola" /> : null}
        <Testo stile={tipo === 'voce' ? 'corpo-forte' : st} colore={col} numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo>
      </View>
      <Col w={210}><Testo stile={tipo === 'intestazione' ? st : 'dettaglio-normale'} colore="testo-secondario" numberOfLines={2}>{categoria ?? ''}</Testo></Col>
      <Col w={140}><Testo stile={tipo === 'intestazione' ? st : 'dettaglio-normale'} colore="testo-secondario" numberOfLines={1}>{conto ?? ''}</Testo></Col>
      <Col w={170}><Testo stile={tipo === 'intestazione' ? st : 'dettaglio-normale'} colore="testo-secondario" numberOfLines={1}>{quando ?? ''}</Testo></Col>
      <Col w={100} destra><Testo stile={st} colore="testo-secondario">{totale}</Testo></Col>
      <Col w={110} destra><Testo stile={tipo === 'voce' ? 'corpo-forte' : st} colore={col}>{quota}</Testo></Col>
    </RigaPremibile>
  );
}

// ---- CMP-28 Scheda conto ----
export function SchedaConto({ nome, nota, condiviso, icona, onApri }: { nome: string; nota?: string; condiviso: boolean; icona: string; onApri: () => void }) {
  const { c } = useTema();
  const compatto = useCompatto();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={nome} onPress={onApri}
      style={(s: StatoPressione) => [{ width: compatto ? '100%' : 352, minHeight: 44, padding: compatto ? 12 : d['margine-scheda'], gap: d['spazio-blocco'], backgroundColor: c[s.hovered ? 'sfondo-hover' : 'sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }, anelloFocus(c, s.focused)]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={icona} misura="grande" />
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <Testo stile="titolo-scheda">{nome}</Testo>
          {nota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo> : null}
        </View>
        {condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
        <Icona nome="chevron-right" misura={16} colore="icona-tenue" />
      </View>
    </Pressable>
  );
}

// ---- CMP-29 Riga di avanzamento ----
export type StatoAvanzamento = 'in-corso' | 'completo' | 'attenzione';
export function RigaAvanzamento({ nome, importo, percentuale, valore, stato = 'in-corso', icona, compatta, onApri }: {
  nome: string; importo: string; percentuale?: string; valore: number; stato?: StatoAvanzamento; icona: string; compatta?: boolean; onApri?: () => void;
}) {
  const tono: ToneAvanzamento = stato === 'completo' ? 'ok' : stato === 'attenzione' ? 'attenzione' : 'accento';
  const stretto = useCompatto();
  const colPct: NomeColore = stato === 'completo' ? 'testo-ok' : stato === 'attenzione' ? 'testo-attenzione' : 'testo-secondario';
  const testa = (
    <View style={{ flex: compatta || stretto ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
      <Icona nome={icona} misura={20} /><Testo numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo>
    </View>
  );
  if (compatta || stretto) return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ gap: d['spazio-testo'], minHeight: stretto ? 44 : undefined, paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flex: 1, minWidth: 0 }}>{testa}</View>
        <Testo stile="corpo-forte">{importo}</Testo>
        {percentuale ? <Testo stile="corpo-forte" colore={colPct}>{percentuale}</Testo> : null}
      </View>
      <Barra valore={valore} tono={tono} />
    </Pressable>
  );
  return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'] }}>
      {testa}
      <Col w={150} destra><Testo colore="testo-secondario">{importo}</Testo></Col>
      <Barra valore={valore} tono={tono} larghezza={260} />
      <Col w={72} destra><Testo stile="corpo-forte" colore={colPct}>{percentuale ?? ''}</Testo></Col>
    </Pressable>
  );
}

// ---- CMP-30 Testata obiettivo ----
export function TestataObiettivo({ nome, descrizione, valore, percentuale, avanzamento, condiviso, icona, tono = 'ok', azioni }: {
  nome: string; descrizione: string; valore: string; percentuale: string; avanzamento: number; condiviso: boolean; icona: string; tono?: Tono; azioni: ReactNode;
}) {
  return (
    <View style={{ gap: d['spazio-blocco'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={icona} misura="grande" tono={tono} />
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2}>{nome}</Testo>
            {condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{descrizione}</Testo>
        </View>
        <View style={{ alignItems: 'flex-end', gap: d['spazio-testo'] }}>
          <Testo stile="titolo-scheda">{valore}</Testo><Testo stile="dettaglio-forte" colore="testo-secondario">{percentuale}</Testo>
        </View>
      </View>
      <Barra valore={avanzamento} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-icona'] }}>{azioni}</View>
    </View>
  );
}

// ---- CMP-31 Riga categoria ----
export function RigaCategoria({ livello, ramo, nome, sottocategorie, speso, percentuale, icona, ereditata, colore, onApriChiudi, onModifica, onNuovo, onElimina }: {
  livello: number; ramo: 'aperto' | 'chiuso' | 'foglia'; nome: string; sottocategorie?: string; speso: string; percentuale?: string; icona: string; ereditata: boolean; colore: string | null; onApriChiudi?: () => void; onModifica: () => void; onNuovo?: () => void; onElimina?: () => void;
}) {
  const { c } = useTema();
  const compatto = useCompatto();
  const pulsanti = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], flexShrink: 0 }}>
      {onNuovo ? <PulsanteIcona icona="plus" etichetta={`Nuova sottocategoria di ${nome}`} onPress={onNuovo} /> : null}
      <PulsanteIcona icona="pencil" etichetta={`Modifica ${nome}`} onPress={onModifica} />
      {onElimina ? <PulsanteIcona icona="trash-2" etichetta={`Elimina ${nome}`} onPress={onElimina} /> : null}
    </View>
  );
  return (
    <View accessibilityRole={'treeitem' as never} aria-level={livello + 1} aria-expanded={ramo === 'foglia' ? undefined : ramo === 'aperto'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: compatto ? d['spazio-icona'] : d['spazio-colonne'], minWidth: 0, paddingVertical: d['margine-voce-v'], paddingHorizontal: compatto ? 0 : d['margine-voce-h'], borderRadius: d['raggio-controllo'] }}>
      {livello > 0 ? <View style={{ width: (livello === 1 ? d['misura-rientro-albero'] : d['misura-rientro-albero-doppio']) / (compatto ? 2 : 1) }} /> : null}
      <View style={{ width: compatto ? 28 : d['misura-icona-media'], alignItems: 'center' }}>
        {ramo !== 'foglia' ? <Pressable accessibilityRole="button" accessibilityLabel={ramo === 'aperto' ? `Chiudi ${nome}` : `Apri ${nome}`} onPress={onApriChiudi} hitSlop={compatto ? 10 : 0}><Icona nome={ramo === 'aperto' ? 'chevron-down' : 'chevron-right'} misura={16} /></Pressable> : null}
      </View>
      <Tessera icona={icona} misura="media" tono={ereditata ? 'neutro' : 'accento'} coloreIcona={ereditata ? 'icona-tenue' : undefined} tinta={colore ?? undefined} />
      <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
        <Testo stile={livello === 0 ? 'corpo-forte' : 'corpo-normale'}>{nome}</Testo>
        {sottocategorie ? <Testo stile="dettaglio-normale" colore="testo-secondario">{sottocategorie}</Testo> : null}
        {compatto && percentuale !== undefined ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`${percentuale} dello stipendio`}</Testo> : null}
        {compatto ? <View style={{ alignSelf: 'flex-start' }}>{pulsanti}</View> : null}
      </View>
      {compatto ? <View style={{ alignItems: 'flex-end', flexShrink: 0 }}><Testo stile="corpo-forte">{speso}</Testo></View> : <Col w={120} destra><Testo stile="corpo-forte">{speso}</Testo></Col>}
      {!compatto && percentuale !== undefined ? <Col w={80} destra><Testo stile="corpo-normale" colore="testo-secondario">{percentuale}</Testo></Col> : null}
      {compatto ? null : pulsanti}
    </View>
  );
}

// ---- CMP-35 Riga rata ----
export function RigaRata({ nome, fine, rata, compatta, onApri, icona = 'credit-card' }: { nome: string; fine: string; rata: string; compatta?: boolean; onApri?: () => void; icona?: string }) {
  if (useCompatto()) return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <Icona nome={icona} misura={20} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Testo stile="corpo-forte" numberOfLines={1}>{nome}</Testo>
        {fine ? <Testo stile="dettaglio-normale" colore="testo-secondario">{fine}</Testo> : null}
      </View>
      <Testo stile="corpo-forte" style={{ flexShrink: 0 }}>{rata}</Testo>
    </RigaPremibile>
  );
  return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}><Icona nome={icona} misura={20} /><Testo stile="corpo-forte" numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo></View>
      {compatta ? <Testo colore="testo-secondario">{fine}</Testo> : <Col w={220}><Testo colore="testo-secondario">{fine}</Testo></Col>}
      {compatta ? <Testo stile="corpo-forte">{rata}</Testo> : <Col w={140} destra><Testo stile="corpo-forte">{rata}</Testo></Col>}
    </RigaPremibile>
  );
}

// ---- Selettore periodo (parte interna) ----
// "Oggi" riporta al mese in corso; è spento quando lo si sta già guardando.
export function SelettorePeriodo({ mese, meseOggi, onCambia }: { mese: string; meseOggi: string; onCambia: (m: string) => void }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], alignSelf: 'flex-start' }}>
      <Pulsante etichetta="Oggi" compatto onPress={() => onCambia(meseOggi)} disattivato={mese === meseOggi} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], borderWidth: d['misura-bordo'], borderColor: c['bordo-controllo'], borderRadius: d['raggio-controllo'] }}>
        <PulsanteIcona icona="chevron-left" etichetta="Mese precedente" fantasma lato={ALTEZZA_CONTROLLO - 2 * d['misura-bordo']} onPress={() => onCambia(spostaMese(mese, -1))} />
        <Testo stile="corpo-forte" style={{ minWidth: 110, textAlign: 'center' }} numberOfLines={1}>{nomeMese(mese)}</Testo>
        <PulsanteIcona icona="chevron-right" etichetta="Mese successivo" fantasma lato={ALTEZZA_CONTROLLO - 2 * d['misura-bordo']} onPress={() => onCambia(spostaMese(mese, 1))} />
      </View>
    </View>
  );
}

// ---- Legenda dei grafici ----
function VoceLegenda({ testo, colore, tratteggio }: { testo: string; colore: NomeColore; tratteggio?: boolean }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
      <View style={{ width: d['misura-icona-piccola'], height: d['misura-avanzamento'], borderRadius: d['raggio-controllo-interno'], backgroundColor: tratteggio ? 'transparent' : c[colore], borderWidth: tratteggio ? d['misura-bordo-forte'] : 0, borderColor: c[colore], borderStyle: 'dashed' }} />
      <Testo stile="dettaglio-normale" colore="testo-secondario">{testo}</Testo>
    </View>
  );
}

// ---- CMP-34 Grafico mese per mese ----
export function GraficoMesi({ mesi, altezza = 160 }: { mesi: { etichetta: string; entrate: number; uscite: number; futuro?: boolean; sotto?: string; sottoColore?: NomeColore }[]; altezza?: number }) {
  const { c } = useTema();
  const massimo = Math.max(1, ...mesi.flatMap((m) => [m.entrate, m.uscite]));
  return (
    <View style={{ gap: d['spazio-blocco'] }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}><VoceLegenda testo="Entrate" colore="avanzamento-ok" /><VoceLegenda testo="Uscite" colore="avanzamento-accento" /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: d['misura-bordo'], borderBottomColor: c['bordo-separatore'] }}>
        {mesi.map((m) => (
          <View key={m.etichetta} accessibilityLabel={`${m.etichetta}: entrate ${euro(m.entrate)}, uscite ${euro(m.uscite)}`} style={{ alignItems: 'center', gap: d['spazio-icona'] }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-testo'], height: altezza }}>
              {[['avanzamento-ok', m.entrate], [m.uscite > m.entrate ? 'avanzamento-errore' : 'avanzamento-accento', m.uscite]].map(([col, v], i) => (
                <View key={i} style={{ width: d['misura-avanzamento'] + 4, height: Math.max(2, (Number(v) / massimo) * altezza), borderTopLeftRadius: d['raggio-controllo-interno'], borderTopRightRadius: d['raggio-controllo-interno'],
                  backgroundColor: m.futuro ? c['avanzamento-traccia'] : c[col as NomeColore] }} />
              ))}
            </View>
            <Testo stile="dettaglio-normale" colore="testo-secondario">{m.etichetta}</Testo>
            {m.sotto ? <Testo stile="dettaglio-forte" colore={m.sottoColore ?? 'testo-secondario'}>{m.sotto}</Testo> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// Etichette compatte dell'asse: "800 €", "12k €", "1,5M €".
function euroAsse(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${numero(v / 1_000_000, a % 1_000_000 ? 1 : 0)}M €`;
  if (a >= 1000) return `${numero(v / 1000, a % 1000 ? 1 : 0)}k €`;
  return `${numero(v, 0)} €`;
}
// Tacche "tonde" (1, 2, 5 × 10^n) tra min e max, da 3 a 5 valori.
function tacche(lo: number, hi: number): { min: number; max: number; valori: number[] } {
  const base = lo < hi * 0.4 ? Math.min(0, lo) : lo; // linee: la base può non essere zero se i valori ne sono lontani
  const grezzo = (hi - base || 1) / 4;
  const pot = 10 ** Math.floor(Math.log10(grezzo));
  const passo = ([1, 2, 5, 10].map((m) => m * pot).find((p) => p >= grezzo) ?? 10 * pot);
  const min = Math.floor(base / passo) * passo;
  const max = Math.ceil(hi / passo) * passo;
  const valori: number[] = [];
  for (let v = min; v <= max + passo / 2; v += passo) valori.push(Math.round(v * 1e6) / 1e6);
  return { min, max: Math.max(max, min + passo), valori };
}

// ---- CMP-37 Grafico a linea ----
export function GraficoLinea({ punti, altezza = 200 }: { punti: { etichetta: string; valore: number; messo: number }[]; altezza?: number }) {
  const { c } = useTema();
  const compatto = useCompatto();
  const larghezza = 1000;
  const valori = punti.flatMap((p) => [p.valore, p.messo]).filter(Number.isFinite);
  const { min, max, valori: ticks } = tacche(valori.length ? Math.min(...valori) : 0, Math.max(1, ...valori));
  const etichetteY = ticks.map(euroAsse);
  const largAsse = Math.max(...etichetteY.map((t) => t.length)) * (compatto ? 6.5 : 7.5) + 8;
  const x = (i: number) => (punti.length < 2 ? 0 : (i / (punti.length - 1)) * larghezza);
  const y = (v: number) => altezza - ((v - min) / (max - min || 1)) * (altezza - 8) - 4;
  const linea = (k: 'valore' | 'messo') => punti.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  // Al massimo 12 etichette (6 su telefono), distribuite in modo uniforme dal primo all'ultimo punto.
  const quante = Math.min(punti.length, compatto ? 6 : 12);
  const etichette = quante < 2 ? punti.map((_, i) => i) : [...new Set(Array.from({ length: quante }, (_, k) => Math.round((k * (punti.length - 1)) / (quante - 1))))];
  return (
    <View style={{ gap: d['spazio-blocco'] }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}><VoceLegenda testo="Valore" colore="avanzamento-accento" /><VoceLegenda testo="Investiti" colore="testo-terziario" tratteggio /></View>
      <View style={{ flexDirection: 'row', gap: d['spazio-testo'] }}>
        <View style={{ width: largAsse, height: altezza }} aria-hidden>
          {ticks.map((t, i) => <Testo key={i} stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}
            style={{ position: 'absolute', right: 0, top: Math.min(Math.max(y(t) - 9, 0), altezza - 18), textAlign: 'right' }}>{etichetteY[i]}</Testo>)}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: d['spazio-blocco'] }}>
          <Svg width="100%" height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} preserveAspectRatio="none" aria-hidden>
            {ticks.map((t, i) => <Line key={i} x1={0} x2={larghezza} y1={y(t)} y2={y(t)} stroke={c['bordo-separatore']} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            <Polyline points={linea('messo')} fill="none" stroke={c['testo-terziario']} strokeWidth={d['misura-bordo-forte']} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            <Polyline points={linea('valore')} fill="none" stroke={c['avanzamento-accento']} strokeWidth={d['misura-bordo-forte']} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{etichette.map((i) => <Testo key={i} stile="dettaglio-normale" colore="testo-secondario">{punti[i].etichetta}</Testo>)}</View>
        </View>
      </View>
    </View>
  );
}

// ---- CMP-38 Riga posizione ----
export function RigaPosizione({ titolo, codice, quote, prezzoMedio, prezzoOggi, valore, guadagno, positivo, peso, onApri }: {
  titolo: string; codice: string; quote: string; prezzoMedio: string; prezzoOggi: string; valore: string; guadagno: string; positivo: boolean; peso: string; onApri?: () => void;
}) {
  if (useCompatto()) return (
    <RigaPremibile onPress={onApri} linea etichetta={titolo}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Testo stile="corpo-forte" numberOfLines={2}>{titolo}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{`${codice} · ${quote} × ${prezzoOggi} · peso ${peso}`}</Testo>
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
        <Testo stile="corpo-forte">{valore}</Testo>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
          <Icona nome={positivo ? 'arrow-up-right' : 'arrow-down-left'} misura={16} colore={positivo ? 'icona-ok' : 'icona-errore'} />
          <Testo stile="dettaglio-forte" colore={positivo ? 'testo-ok' : 'testo-errore'}>{guadagno}</Testo>
        </View>
      </View>
    </RigaPremibile>
  );
  return (
    <RigaPremibile onPress={onApri} linea etichetta={titolo}>
      <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{titolo}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{codice}</Testo></View>
      <Col w={90} destra><Testo colore="testo-secondario">{quote}</Testo></Col>
      <Col w={90} destra><Testo colore="testo-secondario">{prezzoMedio}</Testo></Col>
      <Col w={90} destra><Testo>{prezzoOggi}</Testo></Col>
      <Col w={110} destra><Testo stile="corpo-forte">{valore}</Testo></Col>
      <View style={{ width: 170, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: d['spazio-testo'] }}>
        <Icona nome={positivo ? 'arrow-up-right' : 'arrow-down-left'} misura={16} colore={positivo ? 'icona-ok' : 'icona-errore'} />
        <Testo stile="corpo-forte" colore={positivo ? 'testo-ok' : 'testo-errore'}>{guadagno}</Testo>
      </View>
      <Col w={56} destra><Testo colore="testo-secondario">{peso}</Testo></Col>
    </RigaPremibile>
  );
}

// Intestazione delle colonne della riga posizione.
export function IntestazionePosizioni() {
  if (useCompatto()) return null;
  const t = (s: string, w?: number) => (w ? <Col w={w} destra><Testo stile="dettaglio-forte" colore="testo-secondario">{s}</Testo></Col> : <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1 }}>{s}</Testo>);
  return <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>{t('Investimento')}{t('Quantità', 90)}{t('Prezzo medio', 90)}{t('Prezzo oggi', 90)}{t('Valore', 110)}{t('Guadagno', 170)}{t('Peso', 56)}</View>;
}

// ---- Riga scadenza annuale (proposta v2) ----
// Una spesa annuale o periodica in arrivo: quando esce e se il salvadanaio la copre.
export function RigaScadenzaAnnuale({ nome, quando, importo, dodicesimo, icona, copertura, onApri }: {
  nome: string; quando: string; importo: string; dodicesimo?: string; icona: string; copertura?: { testo: string; tono: Tono }; onApri?: () => void;
}) {
  if (useCompatto()) return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <Tessera icona={icona} misura="piccola" />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Testo stile="corpo-forte" numberOfLines={1}>{nome}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{quando}</Testo>
        {copertura ? <Etichetta testo={copertura.testo} tono={copertura.tono} /> : null}
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
        <Testo stile="corpo-forte">{importo}</Testo>
        {dodicesimo ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`1/12: ${dodicesimo}`}</Testo> : null}
      </View>
    </RigaPremibile>
  );
  return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <Tessera icona={icona} misura="piccola" />
      <Testo stile="corpo-forte" numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{quando}</Testo>
      <View style={{ alignItems: 'flex-end', gap: d['spazio-testo'] }}>
        <Testo stile="corpo-forte">{importo}</Testo>
        {dodicesimo ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`1/12: ${dodicesimo}`}</Testo> : null}
      </View>
      {copertura ? <Etichetta testo={copertura.testo} tono={copertura.tono} /> : null}
    </RigaPremibile>
  );
}

// ---- Calendario delle annuali (proposta v2) ----
// Quanto esce in ognuno dei prossimi 12 mesi: barre alte come l'importo.
export function CalendarioAnnuali({ mesi, altezza = 80 }: { mesi: { etichetta: string; importo: number; attuale?: boolean; attenzione?: boolean }[]; altezza?: number }) {
  const { c } = useTema();
  const massimo = Math.max(1, ...mesi.map((m) => m.importo));
  const compatto = useCompatto();
  const contenuto = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-testo'] }}>
      {mesi.map((m) => (
        <View key={m.etichetta} style={{ flex: 1, minWidth: compatto ? 48 : undefined, alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore={m.importo ? 'testo-primario' : 'testo-terziario'}>{m.importo ? euro(m.importo, { decimali: 0 }) : '–'}</Testo>
          <View style={{ width: 32, height: Math.max(4, Math.round((m.importo / massimo) * altezza)), borderTopLeftRadius: d['raggio-controllo-interno'], borderTopRightRadius: d['raggio-controllo-interno'],
            backgroundColor: c[!m.importo ? 'avanzamento-traccia' : m.attenzione ? 'avanzamento-attenzione' : 'avanzamento-accento'] }} />
          <Testo stile={m.attuale ? 'dettaglio-forte' : 'dettaglio-normale'} colore={m.attuale ? 'testo-accento' : 'testo-secondario'}>{m.etichetta}</Testo>
        </View>
      ))}
    </View>
  );
  // Telefono: i 12 mesi scorrono in orizzontale dentro la scheda (la pagina non si sposta).
  return compatto ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{contenuto}</ScrollView> : contenuto;
}

// La cifra di un salvadanaio, grande e premibile: apre la finestra per cambiarla.
export function CifraModificabile({ cifra, etichetta, onPress }: { cifra: string; etichetta: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etichetta} onPress={onPress}
      style={(s: StatoPressione) => [{ paddingVertical: d['spazio-testo'], paddingHorizontal: d['margine-etichetta-h'], minHeight: 44, justifyContent: 'center', borderRadius: d['raggio-controllo'],
        backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent' }, anelloFocus(c, s.focused)]}>
      <Testo stile="numero-grande">{cifra}</Testo>
    </Pressable>
  );
}

// ---- Riga salvadanaio ----
// Schizzo di Manuel: icona, nome, barra, «X su Y» (si preme per cambiare la cifra) e la matita.
// Variante «testata»: titolo del riquadro (testo più forte, matita dopo il nome, visibile in hover).
// Variante «sotto»: riga di un sotto-salvadanaio (matita in fondo alla riga).
export function RigaSalvadanaio({ nome, icona, valore, tono = 'accento', cifra, percentuale, nota, scadenza, variante = 'sotto', matitaNascosta, propria, onCifra, onModifica }: {
  scadenza?: { testo: string; tono: 'secondario' | 'attenzione' | 'errore' }; nome: string; icona: string; valore: number; tono?: ToneAvanzamento; cifra: string; percentuale?: string; nota?: string; variante?: 'testata' | 'sotto'; matitaNascosta?: boolean; propria?: boolean; onCifra: () => void; onModifica: () => void;
}) {
  const { c } = useTema();
  const stretto = useCompatto();
  const testata = variante === 'testata';
  const matita = <PulsanteIcona icona="pencil" etichetta={`Modifica ${nome}`} fantasma nascosto={matitaNascosta || propria} onPress={onModifica} />;
  const titolo = <Testo stile={testata ? 'titolo-scheda' : 'corpo-normale'} accessibilityRole={testata ? 'header' : undefined} aria-level={testata ? 2 : undefined} numberOfLines={stretto ? 2 : 1} style={{ flexShrink: 1 }}>{nome}</Testo>;
  const cifraPremibile = (
    <Pressable accessibilityRole="button" accessibilityLabel={`Cambia la cifra di ${nome}: ${cifra.replace('/', ' di ')}${percentuale ? `, ${percentuale}` : ''}${scadenza ? `, ${scadenza.testo}` : ''}`} onPress={onCifra}
      style={(s: StatoPressione) => [{ flexShrink: 0, minHeight: stretto ? 44 : ALTEZZA_CONTROLLO, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: d['margine-etichetta-h'], borderRadius: d['raggio-controllo'],
        backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent', cursor: 'pointer' } as object, anelloFocus(c, s.focused)]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: d['spazio-icona'] }}>
        <Testo stile="corpo-forte" numberOfLines={1}>{cifra}</Testo>
        {percentuale ? <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{percentuale}</Testo> : null}
      </View>
    </Pressable>
  );
  const dettaglio = nota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo> : null;
  const dataScad = scadenza ? (
    <Testo stile="dettaglio-normale" colore={scadenza.tono === 'secondario' ? 'testo-secondario' : `testo-${scadenza.tono}`} numberOfLines={1} style={{ textAlign: 'right', flexShrink: 0 }}>{scadenza.testo}</Testo>
  ) : null;
  // Barra con la scadenza a destra (le date delle righe formano una colonna).
  const barraConData = <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}><View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><Barra valore={valore} tono={tono} /></View>{dataScad}</View>;
  // Cifra con la scadenza in piccolo sotto (testata).
  const cifraConData = <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>{cifraPremibile}{dataScad ? <View style={{ paddingHorizontal: d['margine-etichetta-h'] }}>{dataScad}</View> : null}</View>;
  if (stretto && testata) return (
    <View style={{ gap: d['spazio-testo'], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-icona'] }}>
        <Tessera icona={icona} misura="piccola" />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>{titolo}</View>
        {cifraConData}
        {propria ? null : matita}
      </View>
      {propria ? null : <View style={{ flexDirection: 'row' }}><Barra valore={valore} tono={tono} /></View>}
      {dettaglio}
    </View>
  );
  if (stretto) return (
    // Telefono: in colonna, nome e cifra sopra, barra sotto.
    <View style={{ gap: d['spazio-testo'], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Tessera icona={icona} misura="piccola" />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>{titolo}</View>
        {cifraPremibile}
        {propria ? null : matita}
      </View>
      {propria ? null : barraConData}
      {dettaglio}
    </View>
  );
  if (!testata) return (
    // «sotto»: icona, nome, cifra e matita sulla riga; barra sotto a tutta larghezza (come sul telefono).
    <View style={{ gap: d['spazio-testo'], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Tessera icona={icona} misura="piccola" />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>{titolo}</View>
        {cifraPremibile}
        {propria ? null : matita}
      </View>
      {propria ? null : barraConData}
      {dettaglio}
    </View>
  );
  return (
    // «testata»: nome con matita, barra in mezzo, cifra.
    <View style={{ gap: d['spazio-testo'], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flexGrow: 0, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Tessera icona={icona} misura="piccola" />
          {titolo}
          {propria ? null : matita}
        </View>
        {propria ? null : <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><Barra valore={valore} tono={tono} /></View>}
        {cifraConData}
      </View>
      {dettaglio}
    </View>
  );
}

// ---- Riga obiettivo (proposta v2) ----
// Un obiettivo nell'elenco per scadenza: quanto c'è, quanto manca, quanto versare al mese.
// La cifra messa da parte è in grande e si cambia cliccandola (al posto di "Versa").
export function RigaObiettivo({ nome, scadenza, messo, cifra, avanzamento, tonoBarra = 'accento', mancano, alMese, stato, icona, condiviso, onCifra, onApri }: {
  nome: string; scadenza: string; messo: string; cifra: string; avanzamento: number; tonoBarra?: ToneAvanzamento; mancano: string; alMese: string;
  stato: { testo: string; tono: Tono }; icona: string; condiviso?: boolean; onCifra: () => void; onApri: () => void;
}) {
  const numero = (etichetta: string, valore: string) => (
    <View style={{ width: 120, alignItems: 'flex-end', gap: d['spazio-testo'] }}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{etichetta}</Testo><Testo stile="corpo-forte">{valore}</Testo>
    </View>
  );
  if (useCompatto()) return (
    // Telefono: nome e stato sopra, barra al centro, i numeri in fila sotto, la cifra da cambiare in fondo.
    <Pressable accessibilityRole="button" accessibilityLabel={nome} onPress={onApri} style={{ gap: d['spazio-icona'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Tessera icona={icona} misura="media" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Testo stile="corpo-forte" style={{ flexShrink: 1 }}>{nome}</Testo>
            {condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{scadenza}</Testo>
        </View>
        <CifraModificabile cifra={cifra} etichetta={`Cambia la cifra di ${nome}: ${cifra}`} onPress={onCifra} />
      </View>
      <Barra valore={avanzamento} tono={tonoBarra} />
      <Testo stile="dettaglio-normale" colore="testo-secondario">{messo}</Testo>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: d['spazio-icona'] }}>
        <View style={{ gap: 2 }}><Testo stile="dettaglio-normale" colore="testo-secondario">Mancano</Testo><Testo stile="corpo-forte">{mancano}</Testo></View>
        <View style={{ gap: 2 }}><Testo stile="dettaglio-normale" colore="testo-secondario">Da versare al mese</Testo><Testo stile="corpo-forte">{alMese}</Testo></View>
        <Etichetta testo={stato.testo} tono={stato.tono} />
      </View>
    </Pressable>
  );
  return (
    <RigaPremibile onPress={onApri} etichetta={nome}>
      <Tessera icona={icona} misura="media" />
      <View style={{ flex: 1, gap: d['spazio-testo'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Testo stile="corpo-forte" numberOfLines={1}>{nome}</Testo>
          {condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
        </View>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{scadenza}</Testo>
      </View>
      <View style={{ width: 200, gap: d['spazio-testo'] }}>
        <Barra valore={avanzamento} tono={tonoBarra} />
        <Testo stile="dettaglio-normale" colore="testo-secondario">{messo}</Testo>
      </View>
      {numero('Mancano', mancano)}
      {numero('Da versare al mese', alMese)}
      <View style={{ width: 170, alignItems: 'flex-end' }}><Etichetta testo={stato.testo} tono={stato.tono} /></View>
      <View style={{ width: 150, alignItems: 'flex-end' }}><CifraModificabile cifra={cifra} etichetta={`Cambia la cifra di ${nome}: ${cifra}`} onPress={onCifra} /></View>
    </RigaPremibile>
  );
}

// ---- Tabella di un portafoglio (proposta v4) ----
// Tabella arrotondata: prima la voce (nome in evidenza, dettaglio piccolo sotto),
// poi i numeri allineati a destra.
// `avviso`: riga piccola sotto il nome (prezzo vecchio o mancante); `azione`: testo premibile accanto (es. «Scrivi il prezzo»).
export type RigaTabellaPortafoglio = { chiave: string; nome: string; dettaglio: string; prezzo: string; valore: string; guadagno: string; peso: string; positivo: boolean | null; onApri?: () => void;
  avviso?: { testo: string; tono: 'attenzione' | 'errore' }; azione?: { etichetta: string; onPress: () => void } };
export function TabellaPortafoglio({ righe, titoloColonna = 'Asset', titoloPrezzo = 'Prezzo' }: { righe: RigaTabellaPortafoglio[]; titoloColonna?: string; titoloPrezzo?: string }) {
  const { c } = useTema();
  const coloreGuadagno = (r: RigaTabellaPortafoglio): NomeColore => (r.positivo === null ? 'testo-secondario' : r.positivo ? 'testo-ok' : 'testo-errore');
  const sotto = (r: RigaTabellaPortafoglio) => (r.avviso || r.azione ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: d['spazio-icona'] }}>
      {r.avviso ? <Testo stile="dettaglio-forte" colore={`testo-${r.avviso.tono}`}>{r.avviso.testo}</Testo> : null}
      {r.azione ? <Pulsante tipo="testo" compatto etichetta={r.azione.etichetta} onPress={r.azione.onPress} /> : null}
    </View>
  ) : null);
  const num = (testo: string, w: number, stile: 'dettaglio-forte' | 'corpo-normale' | 'corpo-forte', colore: NomeColore) => (
    <View style={{ width: w, alignItems: 'flex-end' }}><Testo stile={stile} colore={colore}>{testo}</Testo></View>
  );
  if (useCompatto()) return (
    <View style={{ borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-controllo'], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], backgroundColor: c['sfondo-tenue'] }}>
        <Testo stile="dettaglio-forte" colore="testo-secondario">{titoloColonna}</Testo>
        <Testo stile="dettaglio-forte" colore="testo-secondario">Valore e guadagno</Testo>
      </View>
      {righe.map((r) => (
        <Pressable key={r.chiave} accessibilityRole="button" accessibilityLabel={r.nome} onPress={r.onApri} disabled={!r.onApri}
          style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: 44, paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'],
            borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], backgroundColor: c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Testo stile="corpo-forte" numberOfLines={2}>{r.nome}</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={2}>{[r.dettaglio, r.prezzo !== '—' ? r.prezzo : null, r.peso !== '—' ? `peso ${r.peso}` : null].filter(Boolean).join(' · ')}</Testo>
            {sotto(r)}
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
            <Testo stile="corpo-forte">{r.valore}</Testo>
            <Testo stile="dettaglio-forte" colore={coloreGuadagno(r)}>{r.guadagno}</Testo>
          </View>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={{ borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-controllo'], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], backgroundColor: c['sfondo-tenue'] }}>
        <View style={{ flex: 1 }}><Testo stile="dettaglio-forte" colore="testo-secondario">{titoloColonna}</Testo></View>
        {num(titoloPrezzo, 120, 'dettaglio-forte', 'testo-secondario')}{num('Valore', 130, 'dettaglio-forte', 'testo-secondario')}{num('Guadagno', 170, 'dettaglio-forte', 'testo-secondario')}{num('Peso', 60, 'dettaglio-forte', 'testo-secondario')}
      </View>
      {righe.map((r, i) => (
        <Pressable key={r.chiave} accessibilityRole="button" accessibilityLabel={r.nome} onPress={r.onApri} disabled={!r.onApri}
          style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'],
            borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
          <View style={{ flex: 1, gap: d['spazio-testo'] }}>
            <Testo stile="corpo-forte" numberOfLines={1}>{r.nome}</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{r.dettaglio}</Testo>
            {sotto(r)}
          </View>
          {num(r.prezzo, 120, 'corpo-normale', 'testo-secondario')}
          {num(r.valore, 130, 'corpo-forte', 'testo-primario')}
          {num(r.guadagno, 170, 'corpo-forte', coloreGuadagno(r))}
          {num(r.peso, 60, 'corpo-normale', 'testo-secondario')}
        </Pressable>
      ))}
    </View>
  );
}

// ---- Composizione: una barra segmentata + legenda ----
const ORDINE_TINTE = ['Blu', 'Arancio', 'Verde', 'Viola', 'Turchese', 'Rosa', 'Lime', 'Indaco', 'Ambra', 'Rosso'];
const tinteComposizione = ORDINE_TINTE.map((n) => coloriCategorie.find((x) => x.nome === n)!.codice as string);
export function BarraComposizione({ voci }: { voci: { voce: string; peso: number }[] }) {
  const { c } = useTema();
  const nonInd = (v: string) => v.trim().toLowerCase() === 'non indicato';
  const ordinate = [...voci].filter((v) => v.peso > 0).sort((a, b) => Number(nonInd(a.voce)) - Number(nonInd(b.voce)) || b.peso - a.peso);
  let k = 0;
  const righe = ordinate.map((v) => {
    const piccola = v.peso < 1 && !nonInd(v.voce);
    const colore = nonInd(v.voce) ? c['testo-terziario'] : piccola ? c['bordo-controllo'] : tinteComposizione[k++ % tinteComposizione.length];
    return { ...v, colore, piccola };
  });
  if (righe.length === 0) return null;
  const grandi = righe.filter((r) => !r.piccola);
  const pesoAltro = righe.filter((r) => r.piccola).reduce((t, r) => t + r.peso, 0);
  const segmenti = pesoAltro > 0 ? [...grandi, { voce: 'Altro', peso: pesoAltro, colore: c['bordo-controllo'], piccola: true }] : grandi;
  const totale = segmenti.reduce((t, s) => t + s.peso, 0) || 1;
  const etichetta = `Composizione: ${righe.map((r) => `${r.voce} ${percento(r.peso)}`).join(', ')}`;
  return (
    <View style={{ gap: d['spazio-blocco'] }}>
      <View accessible accessibilityRole="image" accessibilityLabel={etichetta} style={{ flexDirection: 'row', height: d['misura-avanzamento'], gap: d['misura-bordo-forte'], borderRadius: d['raggio-pillola'], overflow: 'hidden', backgroundColor: c['sfondo-scheda'] }}>
        {segmenti.map((s) => <View key={s.voce} style={{ flexGrow: s.peso / totale, flexShrink: 1, flexBasis: 0, height: '100%', backgroundColor: s.colore }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: d['spazio-gruppo'], rowGap: d['spazio-elenco'] }}>
        {righe.map((r) => (
          <View key={r.voce} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], width: '100%' }}>
            <View style={{ width: 10, height: 10, borderRadius: d['raggio-pillola'], backgroundColor: r.colore }} />
            <Testo style={{ flex: 1 }} numberOfLines={1}>{r.voce}</Testo>
            <Testo stile="corpo-forte" colore="testo-secondario">{percento(r.peso)}</Testo>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- CMP-39 Scheda esposizione ----
export function SchedaEsposizione({ titolo, voci }: { titolo: string; voci: { voce: string; peso: number }[] }) {
  const compatto = useCompatto();
  return (
    <Scheda titolo={titolo} style={{ flex: 1 }}>
      <View style={{ gap: d['spazio-elenco'] }}>
        {voci.length === 0 ? <Testo stile="dettaglio-normale" colore="testo-secondario">Composizione non ancora inserita</Testo> : null}
        {voci.map((v) => (
          <View key={v.voce} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <Testo style={{ flex: 1 }} numberOfLines={1}>{v.voce}</Testo>
            <Barra valore={v.peso} larghezza={compatto ? 72 : 140} />
            <Col w={48} destra><Testo stile="corpo-forte">{`${String(v.peso).replace('.', ',')}%`}</Testo></Col>
          </View>
        ))}
      </View>
    </Scheda>
  );
}

// ---- CMP-40 Riga operazione ----
export function RigaOperazione({ acquisto, titolo, dettaglio, quote, totale, onApri }: { acquisto: boolean; titolo: string; dettaglio: string; quote: string; totale: string; onApri?: () => void }) {
  if (useCompatto()) return (
    <RigaPremibile onPress={onApri} linea etichetta={titolo}>
      <Tessera icona={acquisto ? 'arrow-down-left' : 'arrow-up-right'} misura="media" tono={acquisto ? 'accento' : 'neutro'} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Testo stile="corpo-forte" numberOfLines={2}>{titolo}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{`${dettaglio} · ${quote}`}</Testo></View>
      <Testo stile="corpo-forte" style={{ flexShrink: 0 }}>{totale}</Testo>
    </RigaPremibile>
  );
  return (
    <RigaPremibile onPress={onApri} linea etichetta={titolo}>
      <Tessera icona={acquisto ? 'arrow-down-left' : 'arrow-up-right'} misura="media" tono={acquisto ? 'accento' : 'neutro'} />
      <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{titolo}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{dettaglio}</Testo></View>
      <Col w={140} destra><Testo colore="testo-secondario">{quote}</Testo></Col>
      <Col w={120} destra><Testo stile="corpo-forte">{totale}</Testo></Col>
    </RigaPremibile>
  );
}

// Stato vuoto o di caricamento dentro una scheda.
export function Vuoto({ testo, azione }: { testo: string; azione?: ReactNode }) {
  return <View style={{ alignItems: 'flex-start', gap: d['spazio-blocco'], paddingVertical: d['spazio-blocco'] }}><Testo colore="testo-secondario">{testo}</Testo>{azione}</View>;
}
