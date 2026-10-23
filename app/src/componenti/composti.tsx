import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { euro, nomeMese, spostaMese } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { nomeColoreCategoria, ombre, type NomeColore } from '../tema/token.ts';
import { ALTEZZA_CONTROLLO, Anello, anelloFocus, Barra, Etichetta, Pulsante, PulsanteIcona, Spunta, type StatoPressione, Tessera, type Tono, type ToneAvanzamento } from './base.tsx';
import { Icona } from './Icona.tsx';

// Componenti composti (CMP-20 … CMP-40). I contenitori hanno padding e gap
// dal ruolo; i contenuti no.

// ---- CMP-20 Barra laterale ----
export type VoceMenu = { chiave: string; testo: string; icona: string };
export function BarraLaterale({ voci, attiva, onNaviga, onAggiungi, profilo, onProfilo, onEsci }: {
  voci: VoceMenu[]; attiva: string; onNaviga: (k: string) => void; onAggiungi: () => void; profilo: string; onProfilo: () => void; onEsci: () => void;
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
      <Pulsante tipo="primario" etichetta="Aggiungi spesa" icona="plus" onPress={onAggiungi} larghezzaPiena compatto />
      <View style={{ gap: d['spazio-elenco'] }}>{voci.map((v) => voce(v, () => onNaviga(v.chiave)))}</View>
      <View style={{ flex: 1 }} />
      <View style={{ gap: d['spazio-elenco'] }}>
        {voce({ chiave: 'impostazioni', testo: 'Impostazioni', icona: 'sliders-horizontal' }, onProfilo)}
        {voce({ chiave: 'esci', testo: 'Esci', icona: 'log-out' }, onEsci)}
      </View>
    </View>
  );
}

// ---- CMP-21 Intestazione di pagina ----
export function Intestazione({ titolo, sottotitolo, azioni }: { titolo: string; sottotitolo?: string; azioni?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
      <View style={{ flex: 1, gap: d['spazio-testo'] }}>
        <Testo stile="titolo-pagina" accessibilityRole="header" aria-level={1}>{titolo}</Testo>
        {sottotitolo ? <Testo colore="testo-secondario">{sottotitolo}</Testo> : null}
      </View>
      {azioni ? <View style={{ flexDirection: 'row', gap: d['spazio-colonne'] }}>{azioni}</View> : null}
    </View>
  );
}

// ---- CMP-22 Scheda ----
export function Scheda({ titolo, nota, icona, children, azione, style }: { titolo?: string; nota?: string; icona?: string; children: ReactNode; azione?: ReactNode; style?: object }) {
  const { c } = useTema();
  return (
    <View role={titolo ? 'region' : undefined} aria-label={titolo} style={[{ padding: d['margine-scheda'], gap: d['spazio-blocco'], backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }, style]}>
      {titolo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          {icona ? <Tessera icona={icona} misura="piccola" /> : null}
          <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>{titolo}</Testo>
          {nota ? <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo> : null}
          {azione}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// ---- CMP-32 Finestra ----
export function Finestra({ titolo, icona, aperta, onChiudi, children, azioni, onElimina, etichettaElimina = 'Elimina', larghezza }: {
  titolo: string; icona?: string; aperta: boolean; onChiudi: () => void; children: ReactNode; azioni?: ReactNode; onElimina?: () => void; etichettaElimina?: string; larghezza?: number;
}) {
  const { c } = useTema();
  return (
    <Modal transparent visible={aperta} onRequestClose={onChiudi} animationType="fade">
      <View style={{ flex: 1, backgroundColor: c['sfondo-velo'], alignItems: 'center', justifyContent: 'center', padding: d['margine-pagina'] }}>
        <View accessibilityRole="dialog" aria-modal aria-label={titolo}
          style={{ width: larghezza ?? d['larghezza-finestra'], maxWidth: '100%', maxHeight: '100%', backgroundColor: c['sfondo-scheda'], borderRadius: d['raggio-finestra'],
            boxShadow: `0 ${ombre.finestra.offsetY}px ${ombre.finestra.blur}px ${ombre.finestra.colore}` } as object}>
          <ScrollView contentContainerStyle={{ padding: d['margine-finestra'], gap: d['spazio-gruppo'] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
              {icona ? <Tessera icona={icona} misura="media" /> : null}
              <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2} style={{ flex: 1, fontSize: 20, lineHeight: 26 }}>{titolo}</Testo>
              <PulsanteIcona icona="x" etichetta="Chiudi" fantasma onPress={onChiudi} />
            </View>
            {children}
            {azioni || onElimina ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], paddingTop: d['spazio-blocco'] }}>
                {onElimina ? <Pulsante tipo="pericolo" etichetta={etichettaElimina} onPress={onElimina} /> : null}
                <View style={{ flex: 1 }} />
                {azioni}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- CMP-23 Numero chiave ----
export type ToneNumero = 'normale' | 'ok' | 'attenzione' | 'errore';
export function NumeroChiave({ etichetta, valore, nota, icona, tono = 'normale' }: { etichetta: string; valore: string; nota?: string; icona: string; tono?: ToneNumero }) {
  const { c } = useTema();
  const t: Tono = tono === 'normale' ? 'accento' : tono;
  const coloreValore: NomeColore = tono === 'normale' ? 'testo-primario' : `testo-${tono}`;
  return (
    <View style={{ flex: 1, padding: d['margine-scheda'], gap: d['spazio-icona'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'],
      borderColor: c[tono === 'errore' ? 'bordo-errore' : 'bordo-scheda'], backgroundColor: c[tono === 'errore' ? 'sfondo-errore-tenue' : 'sfondo-scheda'] }}>
      <Tessera icona={icona} misura="piccola" tono={t} suColore={tono === 'errore'} />
      <View style={{ gap: d['spazio-testo'] }}>
        <Testo stile="dettaglio-forte" colore="testo-secondario">{etichetta}</Testo>
        <Testo stile="numero-grande" colore={coloreValore}>{valore}</Testo>
        {nota ? <Testo stile="dettaglio-normale" colore={tono === 'normale' ? 'testo-secondario' : coloreValore}>{nota}</Testo> : null}
      </View>
    </View>
  );
}

// ---- Gruppo di righe (titolo e totale) ----
export function TitoloGruppo({ testo, destra }: { testo: string; destra?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: d['margine-riga-v'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
      <Testo stile="etichetta-gruppo" colore="testo-secondario">{testo}</Testo>
      {destra ? <Testo stile="dettaglio-normale" colore="testo-secondario">{destra}</Testo> : null}
    </View>
  );
}

// Riga premibile con evidenza al passaggio del mouse.
function RigaPremibile({ onPress, children, linea, etichetta, padding = 'margine-riga-v' }: { onPress?: () => void; children: ReactNode; linea?: boolean; etichetta?: string; padding?: 'margine-riga-v' | 'margine-voce-v' }) {
  const { c } = useTema();
  const stile = (h?: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: d['spazio-colonne'], paddingVertical: d[padding], paddingHorizontal: d['margine-voce-h'],
    borderBottomWidth: linea ? d['misura-bordo'] : 0, borderBottomColor: c['bordo-separatore'], backgroundColor: h ? c['sfondo-hover'] : 'transparent' });
  if (!onPress) return <View style={stile()}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={etichetta} onPress={onPress} style={(s: StatoPressione) => [stile(s.hovered), anelloFocus(c, s.focused)]}>{children}</Pressable>;
}

const Col = ({ w, children, destra }: { w: number; children: ReactNode; destra?: boolean }) => <View style={{ width: w, alignItems: destra ? 'flex-end' : 'flex-start' }}>{children}</View>;

// ---- CMP-24 Voce da spuntare ----
export function VoceDaSpuntare({ nome, conto, importo, sottoImporto, icona, fatta, onSpunta, onApri }: { nome: string; conto: string; importo: string; sottoImporto?: string; icona: string; fatta: boolean; onSpunta?: () => void; onApri?: () => void }) {
  const col: NomeColore = fatta ? 'testo-secondario' : 'testo-primario';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Spunta fatta={fatta} onPress={onSpunta} etichetta={`${nome}: ${fatta ? 'uscita' : 'da pagare'}`} disattivato={!onSpunta} />
        <Icona nome={icona} misura={16} colore={fatta ? 'icona-tenue' : 'icona-predefinita'} />
        <Pressable onPress={onApri} disabled={!onApri} style={{ flex: 1 }}><Testo colore={col} numberOfLines={1}>{nome}</Testo></Pressable>
      </View>
      <Col w={140}><Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{conto}</Testo></Col>
      <Col w={110} destra><Testo stile="corpo-forte" colore={col}>{importo}</Testo>{sottoImporto ? <Testo stile="dettaglio-normale" colore="testo-secondario">{sottoImporto}</Testo> : null}</Col>
    </View>
  );
}

// ---- CMP-25 Voce budget ----
export type StatoBudget = 'normale' | 'attenzione' | 'superato';
export function VoceBudget({ nome, nota, conto, importo, icona, valore, stato, onApri }: { nome: string; nota: string; conto: string; importo: string; icona: string; valore: number; stato: StatoBudget; onApri?: () => void }) {
  const tono: ToneAvanzamento = stato === 'normale' ? 'accento' : stato === 'attenzione' ? 'attenzione' : 'errore';
  const colNota: NomeColore = stato === 'normale' ? 'testo-secondario' : stato === 'attenzione' ? 'testo-attenzione' : 'testo-errore';
  return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <View style={{ width: d['misura-bersaglio'], alignItems: 'center' }}><Anello valore={valore} tono={tono} /></View>
        <Icona nome={icona} misura={16} />
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

// ---- CMP-27 Riga movimento ----
export function RigaMovimento({ tipo, esercente, categoria, conto, importo, icona, etichetta, onApri }: {
  tipo: 'uscita' | 'entrata' | 'trasferimento'; esercente: string; categoria: string; conto: string; importo: string; icona: string; etichetta?: { testo: string; icona: string }; onApri?: () => void;
}) {
  return (
    <RigaPremibile onPress={onApri} linea etichetta={esercente}>
      <Tessera icona={tipo === 'trasferimento' ? 'arrow-left-right' : icona} misura="media" tono={tipo === 'trasferimento' ? 'neutro' : tipo === 'entrata' ? 'ok' : 'accento'} />
      <View style={{ flex: 1, gap: d['spazio-testo'] }}>
        <Testo stile="corpo-forte" numberOfLines={1}>{esercente}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{categoria}</Testo>
      </View>
      <Col w={170}>{etichetta ? <Etichetta testo={etichetta.testo} icona={etichetta.icona} /> : null}</Col>
      <Col w={170}><Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{conto}</Testo></Col>
      <Col w={110} destra><Testo stile="corpo-forte" colore={tipo === 'entrata' ? 'testo-ok' : 'testo-primario'}>{importo}</Testo></Col>
    </RigaPremibile>
  );
}

// ---- CMP-28 Scheda conto ----
export function SchedaConto({ nome, tipo, saldo, nota, condiviso, icona, onApri }: { nome: string; tipo: string; saldo: string; nota: string; condiviso: boolean; icona: string; onApri: () => void }) {
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${nome}, saldo ${saldo}`} onPress={onApri}
      style={(s: StatoPressione) => [{ width: 352, padding: d['margine-scheda'], gap: d['spazio-blocco'], backgroundColor: c[s.hovered ? 'sfondo-hover' : 'sfondo-scheda'], borderRadius: d['raggio-scheda'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'] }, anelloFocus(c, s.focused)]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={icona} misura="grande" />
        <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="titolo-scheda">{nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{tipo}</Testo></View>
        {condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
      </View>
      <Testo stile="numero-grande">{saldo}</Testo>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ flex: 1 }}>{nota}</Testo>
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
  const colPct: NomeColore = stato === 'completo' ? 'testo-ok' : stato === 'attenzione' ? 'testo-attenzione' : 'testo-secondario';
  const testa = (
    <View style={{ flex: compatta ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
      <Icona nome={icona} misura={20} /><Testo numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo>
    </View>
  );
  if (compatta) return (
    <Pressable onPress={onApri} disabled={!onApri} style={{ gap: d['spazio-testo'], paddingVertical: d['margine-voce-v'] / 2, paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flex: 1 }}>{testa}</View>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
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
      <View style={{ flexDirection: 'row', gap: d['spazio-icona'] }}>{azioni}</View>
    </View>
  );
}

// ---- CMP-31 Riga categoria ----
export function RigaCategoria({ livello, ramo, nome, sottocategorie, speso, icona, ereditata, colore, onApriChiudi, onModifica }: {
  livello: number; ramo: 'aperto' | 'chiuso' | 'foglia'; nome: string; sottocategorie?: string; speso: string; icona: string; ereditata: boolean; colore: string | null; onApriChiudi?: () => void; onModifica: () => void;
}) {
  const { c } = useTema();
  return (
    <View accessibilityRole={'treeitem' as never} aria-level={livello + 1} aria-expanded={ramo === 'foglia' ? undefined : ramo === 'aperto'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], borderRadius: d['raggio-controllo'] }}>
      {livello > 0 ? <View style={{ width: livello === 1 ? d['misura-rientro-albero'] : d['misura-rientro-albero-doppio'] }} /> : null}
      <View style={{ width: d['misura-icona-media'], alignItems: 'center' }}>
        {ramo !== 'foglia' ? <Pressable accessibilityRole="button" accessibilityLabel={ramo === 'aperto' ? `Chiudi ${nome}` : `Apri ${nome}`} onPress={onApriChiudi}><Icona nome={ramo === 'aperto' ? 'chevron-down' : 'chevron-right'} misura={16} /></Pressable> : null}
      </View>
      <Tessera icona={icona} misura="media" tono={ereditata ? 'neutro' : 'accento'} coloreIcona={ereditata ? 'icona-tenue' : undefined} />
      <View style={{ flex: 1, gap: d['spazio-testo'] }}>
        <Testo stile={livello === 0 ? 'corpo-forte' : 'corpo-normale'}>{nome}</Testo>
        {sottocategorie ? <Testo stile="dettaglio-normale" colore="testo-secondario">{sottocategorie}</Testo> : null}
      </View>
      <View style={{ width: 120, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colore ?? c['bordo-scheda'] }} />
        <Testo stile="dettaglio-normale" colore={colore ? 'testo-secondario' : 'testo-terziario'}>{nomeColoreCategoria(colore) ?? 'nessuno'}</Testo>
      </View>
      <Col w={120} destra><Testo stile="corpo-forte">{speso}</Testo></Col>
      <PulsanteIcona icona="pencil" etichetta={`Modifica ${nome}`} onPress={onModifica} />
    </View>
  );
}

// ---- CMP-35 Riga rata ----
export function RigaRata({ nome, fine, rata, compatta, onApri, icona = 'credit-card' }: { nome: string; fine: string; rata: string; compatta?: boolean; onApri?: () => void; icona?: string }) {
  return (
    <RigaPremibile onPress={onApri} linea etichetta={nome}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}><Icona nome={icona} misura={20} /><Testo stile="corpo-forte" numberOfLines={1} style={{ flex: 1 }}>{nome}</Testo></View>
      {compatta ? <Testo colore="testo-secondario">{fine}</Testo> : <Col w={220}><Testo colore="testo-secondario">{fine}</Testo></Col>}
      {compatta ? <Testo stile="corpo-forte">{rata}</Testo> : <Col w={140} destra><Testo stile="corpo-forte">{rata}</Testo></Col>}
    </RigaPremibile>
  );
}

// ---- CMP-36 Riga controllo ----
export function RigaControllo({ testo, rispettata }: { testo: string; rispettata: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
      <Icona nome={rispettata ? 'circle-check' : 'circle-x'} misura={16} colore={rispettata ? 'icona-ok' : 'icona-errore'} />
      <Testo style={{ flex: 1 }}>{testo}</Testo>
    </View>
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
        <Testo stile="corpo-forte" style={{ minWidth: 110, textAlign: 'center' }}>{nomeMese(mese)}</Testo>
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

// ---- CMP-37 Grafico a linea ----
export function GraficoLinea({ punti, altezza = 200 }: { punti: { etichetta: string; valore: number; messo: number }[]; altezza?: number }) {
  const { c } = useTema();
  const larghezza = 1000;
  const valori = punti.flatMap((p) => [p.valore, p.messo]);
  const max = Math.max(1, ...valori), min = Math.min(0, ...valori);
  const x = (i: number) => (punti.length < 2 ? 0 : (i / (punti.length - 1)) * larghezza);
  const y = (v: number) => altezza - ((v - min) / (max - min || 1)) * (altezza - 8) - 4;
  const linea = (k: 'valore' | 'messo') => punti.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  // Al massimo 12 etichette, distribuite in modo uniforme dal primo all'ultimo punto.
  const quante = Math.min(punti.length, 12);
  const etichette = quante < 2 ? punti.map((_, i) => i) : [...new Set(Array.from({ length: quante }, (_, k) => Math.round((k * (punti.length - 1)) / (quante - 1))))];
  return (
    <View style={{ gap: d['spazio-blocco'] }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}><VoceLegenda testo="Valore" colore="avanzamento-accento" /><VoceLegenda testo="Investiti" colore="testo-terziario" tratteggio /></View>
      <Svg width="100%" height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} preserveAspectRatio="none" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <Line key={i} x1={0} x2={larghezza} y1={(i * altezza) / 4} y2={(i * altezza) / 4} stroke={c['bordo-separatore']} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
        <Polyline points={linea('messo')} fill="none" stroke={c['testo-terziario']} strokeWidth={d['misura-bordo-forte']} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <Polyline points={linea('valore')} fill="none" stroke={c['avanzamento-accento']} strokeWidth={d['misura-bordo-forte']} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{etichette.map((i) => <Testo key={i} stile="dettaglio-normale" colore="testo-secondario">{punti[i].etichetta}</Testo>)}</View>
    </View>
  );
}

// ---- CMP-38 Riga posizione ----
export function RigaPosizione({ titolo, codice, quote, prezzoMedio, prezzoOggi, valore, guadagno, positivo, peso, onApri }: {
  titolo: string; codice: string; quote: string; prezzoMedio: string; prezzoOggi: string; valore: string; guadagno: string; positivo: boolean; peso: string; onApri?: () => void;
}) {
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
  const t = (s: string, w?: number) => (w ? <Col w={w} destra><Testo stile="dettaglio-forte" colore="testo-secondario">{s}</Testo></Col> : <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1 }}>{s}</Testo>);
  return <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingBottom: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>{t('Investimento')}{t('Quantità', 90)}{t('Prezzo medio', 90)}{t('Prezzo oggi', 90)}{t('Valore', 110)}{t('Guadagno', 170)}{t('Peso', 56)}</View>;
}

// ---- Riga scadenza annuale (proposta v2) ----
// Una spesa annuale o periodica in arrivo: quando esce e se il salvadanaio la copre.
export function RigaScadenzaAnnuale({ nome, quando, importo, dodicesimo, icona, copertura, onApri }: {
  nome: string; quando: string; importo: string; dodicesimo?: string; icona: string; copertura?: { testo: string; tono: Tono }; onApri?: () => void;
}) {
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-testo'] }}>
      {mesi.map((m) => (
        <View key={m.etichetta} style={{ flex: 1, alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore={m.importo ? 'testo-primario' : 'testo-terziario'}>{m.importo ? euro(m.importo, { decimali: 0 }) : '–'}</Testo>
          <View style={{ width: 32, height: Math.max(4, Math.round((m.importo / massimo) * altezza)), borderTopLeftRadius: d['raggio-controllo-interno'], borderTopRightRadius: d['raggio-controllo-interno'],
            backgroundColor: c[!m.importo ? 'avanzamento-traccia' : m.attenzione ? 'avanzamento-attenzione' : 'avanzamento-accento'] }} />
          <Testo stile={m.attuale ? 'dettaglio-forte' : 'dettaglio-normale'} colore={m.attuale ? 'testo-accento' : 'testo-secondario'}>{m.etichetta}</Testo>
        </View>
      ))}
    </View>
  );
}

// ---- Riga obiettivo (proposta v2) ----
// Un obiettivo nell'elenco per scadenza: quanto c'è, quanto manca, quanto versare al mese.
export function RigaObiettivo({ nome, scadenza, messo, avanzamento, tonoBarra = 'accento', mancano, alMese, stato, icona, condiviso, onVersa, onApri }: {
  nome: string; scadenza: string; messo: string; avanzamento: number; tonoBarra?: ToneAvanzamento; mancano: string; alMese: string;
  stato: { testo: string; tono: Tono }; icona: string; condiviso?: boolean; onVersa: () => void; onApri: () => void;
}) {
  const numero = (etichetta: string, valore: string) => (
    <View style={{ width: 120, alignItems: 'flex-end', gap: d['spazio-testo'] }}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{etichetta}</Testo><Testo stile="corpo-forte">{valore}</Testo>
    </View>
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
      <Pulsante etichetta="Versa" icona="plus" onPress={onVersa} />
    </RigaPremibile>
  );
}

// ---- Tabella di un portafoglio (proposta v4) ----
// Tabella arrotondata: prima la voce (nome in evidenza, dettaglio piccolo sotto),
// poi i numeri allineati a destra.
export type RigaTabellaPortafoglio = { chiave: string; nome: string; dettaglio: string; prezzo: string; valore: string; guadagno: string; positivo: boolean; onApri?: () => void };
export function TabellaPortafoglio({ righe, titoloColonna = 'Titolo' }: { righe: RigaTabellaPortafoglio[]; titoloColonna?: string }) {
  const { c } = useTema();
  const num = (testo: string, w: number, stile: 'dettaglio-forte' | 'corpo-normale' | 'corpo-forte', colore: NomeColore) => (
    <View style={{ width: w, alignItems: 'flex-end' }}><Testo stile={stile} colore={colore}>{testo}</Testo></View>
  );
  return (
    <View style={{ borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-controllo'], overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'], backgroundColor: c['sfondo-tenue'] }}>
        <View style={{ flex: 1 }}><Testo stile="dettaglio-forte" colore="testo-secondario">{titoloColonna}</Testo></View>
        {num('Prezzo oggi', 120, 'dettaglio-forte', 'testo-secondario')}{num('Valore', 130, 'dettaglio-forte', 'testo-secondario')}{num('Guadagno', 170, 'dettaglio-forte', 'testo-secondario')}
      </View>
      {righe.map((r, i) => (
        <Pressable key={r.chiave} accessibilityRole="button" accessibilityLabel={r.nome} onPress={r.onApri} disabled={!r.onApri}
          style={(s: StatoPressione) => [{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'],
            borderTopWidth: d['misura-bordo'], borderTopColor: c['bordo-separatore'], backgroundColor: s.hovered ? c['sfondo-hover'] : c['sfondo-scheda'] }, anelloFocus(c, s.focused)]}>
          <View style={{ flex: 1, gap: d['spazio-testo'] }}>
            <Testo stile="corpo-forte" numberOfLines={1}>{r.nome}</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{r.dettaglio}</Testo>
          </View>
          {num(r.prezzo, 120, 'corpo-normale', 'testo-secondario')}
          {num(r.valore, 130, 'corpo-forte', 'testo-primario')}
          {num(r.guadagno, 170, 'corpo-forte', r.positivo ? 'testo-ok' : 'testo-errore')}
        </Pressable>
      ))}
    </View>
  );
}

// ---- CMP-39 Scheda esposizione ----
export function SchedaEsposizione({ titolo, voci }: { titolo: string; voci: { voce: string; peso: number }[] }) {
  return (
    <Scheda titolo={titolo} style={{ flex: 1 }}>
      <View style={{ gap: d['spazio-elenco'] }}>
        {voci.length === 0 ? <Testo stile="dettaglio-normale" colore="testo-secondario">Composizione non ancora inserita</Testo> : null}
        {voci.map((v) => (
          <View key={v.voce} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <Testo style={{ flex: 1 }} numberOfLines={1}>{v.voce}</Testo>
            <Barra valore={v.peso} larghezza={140} />
            <Col w={48} destra><Testo stile="corpo-forte">{`${String(v.peso).replace('.', ',')}%`}</Testo></Col>
          </View>
        ))}
      </View>
    </Scheda>
  );
}

// ---- CMP-40 Riga operazione ----
export function RigaOperazione({ acquisto, titolo, dettaglio, quote, totale, onApri }: { acquisto: boolean; titolo: string; dettaglio: string; quote: string; totale: string; onApri?: () => void }) {
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
