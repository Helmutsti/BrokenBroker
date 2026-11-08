import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ALTEZZA_CONTROLLO, anelloFocus, Barra, Pulsante, type StatoPressione, Tessera } from '../componenti/base.tsx';
import { Intestazione, NumeroChiave, RigaAvanzamento, RigaNumeri, Scheda, Vuoto } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import type { Salvadanaio, Traguardo } from '../dati/tipi.ts';
import { euro, nomeMeseMinuscolo, percento } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { euroCorto, FinestraSalvadanaio, FinestraTraguardo, FinestraVersa, piatti } from './FinestreSalvadanai.tsx';

// Salvadanai (decisione 72): dove metti quello che avanza. Liberi (non stanno in un conto), annidabili, con traguardo e data facoltativi. Versi e prelevi tu,
// a mano; non abbassano l'avanzo. Un riquadro per ogni salvadanaio principale, con i sotto-salvadanai come righe di avanzamento. Sono obiettivi: le spese non mensili
// hanno la loro cesta dentro la spesa (decisione 73), non qui.

const entro = (iso: string) => `entro ${nomeMeseMinuscolo(iso.slice(0, 7))} ${iso.slice(0, 4)}`;

// «900 € su 2.000 € · entro maggio 2027 · metti 157 € al mese» (o «senza data»).
function nota(k: Salvadanaio): string {
  const parti = [k.traguardo ? `${euroCorto(k.dentro)} su ${euroCorto(k.traguardo)}` : `${euroCorto(k.dentro)} dentro`, k.scadenza ? entro(k.scadenza) : 'senza data'];
  if (k.metti_al_mese) parti.push(`metti ${euroCorto(k.metti_al_mese)} al mese`);
  return parti.join(' · ');
}

// Quanto mettere al mese in tutto: dove un salvadanaio ha la sua data conta lui, altrimenti si scende nei suoi sotto-salvadanai.
const mettiAlMese = (xs: Salvadanaio[]): number => xs.reduce((t, k) => t + (k.metti_al_mese ? Number(k.metti_al_mese) : mettiAlMese(k.figli)), 0);

export function Salvadanai() {
  const compatto = useCompatto();
  const { c } = useTema();
  const albero = useDati<Salvadanaio[]>('/salvadanai');
  const [aperto, setAperto] = useState<{ nodo: Salvadanaio | null; padre?: Salvadanaio } | null>(null);
  const [traguardo, setTraguardo] = useState<{ salvadanaio: Salvadanaio; traguardo: Traguardo | null } | null>(null);
  const [versa, setVersa] = useState<Salvadanaio | null>(null);
  if (!albero.dati) return <Caricamento errore={albero.errore} />;

  const radici = albero.dati;
  const tutti = piatti(radici);
  const totale = radici.reduce((t, k) => t + Number(k.dentro), 0);
  const mancano = radici.reduce((t, k) => t + (k.mancano !== null ? Math.max(0, Number(k.mancano)) : 0), 0);
  const alMese = mettiAlMese(radici);

  const righe = (figli: Salvadanaio[], livello: number): ReactNode => figli.map((f) => (
    <View key={f.id}>
      <View style={{ paddingLeft: livello * d['misura-rientro-albero'] }}>
        <RigaAvanzamento icona={f.icona} nome={`${f.nome}${f.scadenza ? ` · ${entro(f.scadenza)}` : ''}`} importo={f.traguardo ? `${euroCorto(f.dentro)} / ${euroCorto(f.traguardo)}` : euroCorto(f.dentro)}
          percentuale={f.percentuale !== null ? percento(f.percentuale) : undefined} valore={f.percentuale ?? 0} stato={(f.percentuale ?? 0) >= 100 ? 'completo' : 'in-corso'} onApri={() => setAperto({ nodo: f })} onCifra={() => setVersa(f)} />
      </View>
      {righe(f.figli, livello + 1)}
    </View>
  ));

  const scheda = (k: Salvadanaio) => {
    return (
      <Scheda key={k.id}>
        <View style={{ gap: d['spazio-blocco'] }}>
          <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'center', gap: d['spazio-colonne'] }}>
            <Pressable accessibilityRole="button" accessibilityLabel={k.nome} onPress={() => setAperto({ nodo: k })}
              style={{ flex: compatto ? undefined : 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
              <Tessera icona={k.icona} misura="grande" />
              <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
                <Testo stile="titolo-scheda" numberOfLines={1}>{k.nome}</Testo>
                <Testo stile="dettaglio-normale" colore="testo-secondario">{nota(k)}</Testo>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Versa o preleva da ${k.nome}`} onPress={() => setVersa(k)}
              style={(s: StatoPressione) => [{ flexShrink: 0, minHeight: compatto ? 44 : ALTEZZA_CONTROLLO, justifyContent: 'center', alignItems: compatto ? 'flex-start' : 'flex-end', paddingHorizontal: d['margine-etichetta-h'], borderRadius: d['raggio-controllo'],
                backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent', cursor: 'pointer' } as object, anelloFocus(c, s.focused)]}>
              <Testo stile={compatto ? 'titolo-scheda' : 'numero-grande'}>{euro(k.dentro)}</Testo>
            </Pressable>
          </View>
          {k.percentuale !== null ? <Barra valore={k.percentuale} tono={k.percentuale >= 100 ? 'ok' : 'accento'} /> : null}
          {k.figli.length ? <View>{righe(k.figli, 0)}</View> : null}
          {k.traguardi.length ? (
            <View>
              {[...k.traguardi].sort((a, b) => Number(a.importo) - Number(b.importo)).map((t) => (
                <RigaAvanzamento key={t.id} icona="shield" nome={t.nome} importo={euro(t.importo)} percentuale={percento(t.percentuale)} valore={t.percentuale}
                  stato={t.percentuale >= 100 ? 'completo' : 'attenzione'} onApri={() => setTraguardo({ salvadanaio: k, traguardo: t })} />
              ))}
            </View>
          ) : null}
          <View style={{ alignItems: 'flex-start' }}>
            <Pulsante tipo="secondario" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ salvadanaio: k, traguardo: null })} />
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <Pulsante tipo="testo" icona="plus" etichetta={k.figli.length ? 'Aggiungi sotto-salvadanaio' : 'Dividi in sotto-salvadanai'} onPress={() => setAperto({ nodo: null, padre: k })} />
          </View>
        </View>
      </Scheda>
    );
  };

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Dove metti quello che avanza. Versi e prelevi tu, quando vuoi."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo salvadanaio" icona="plus" onPress={() => setAperto({ nodo: null })} />} />
      <RigaNumeri>
        <NumeroChiave etichetta="Nei salvadanai" valore={euro(totale)} icona="piggy-bank" nota={`In ${tutti.length} ${tutti.length === 1 ? 'salvadanaio' : 'salvadanai'}`} />
        <NumeroChiave etichetta="Mancano ai traguardi" valore={euro(mancano)} icona="target" nota={`Con le date: ${euro(alMese)} al mese`} />
      </RigaNumeri>
      {radici.length ? radici.map(scheda) : <Scheda><Vuoto testo="Nessun salvadanaio. Creane uno con «Nuovo salvadanaio»." /></Scheda>}
      <FinestraSalvadanaio stato={aperto} albero={radici} onChiudi={() => setAperto(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
      <FinestraVersa stato={versa} onChiudi={() => setVersa(null)} />
    </>
  );
}
