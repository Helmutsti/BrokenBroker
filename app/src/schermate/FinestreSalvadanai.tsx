import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pulsante } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { Icona } from '../componenti/Icona.tsx';
import { cancella, crea, modifica } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Salvadanaio, Traguardo } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto, percento } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, serve } from './moduli.tsx';

// Le finestre dei salvadanai (decisione 72): Versa e Preleva, e il salvadanaio (nuovo, da modificare, oppure legato a una spesa annuale e quindi bloccato).

export const piatti = (xs: Salvadanaio[]): Salvadanaio[] => xs.flatMap((k) => [k, ...piatti(k.figli)]);

// Euro senza decimali quando sono tondi: «900 €», «157,50 €».
export const euroCorto = (v: number | string | null | undefined) => (v === null || v === undefined ? '—' : euro(v, { decimali: Number.isInteger(Number(v)) ? 0 : 2 }));
const pct = (dentro: number, traguardo: number | null) => (traguardo && traguardo > 0 ? `${percento(Math.round((dentro / traguardo) * 100))}` : null);

// La scatola grigia con tre numeri.
function Numeri({ voci }: { voci: { etichetta: string; valore: string }[] }) {
  const { c } = useTema();
  return (
    <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], padding: d['spazio-blocco'], borderRadius: d['raggio-controllo'], backgroundColor: c['sfondo-tenue'] }}>
      {voci.map((v) => (
        <View key={v.etichetta} style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{v.etichetta}</Testo>
          <Testo stile="corpo-forte">{v.valore}</Testo>
        </View>
      ))}
    </View>
  );
}

// ---- Versa e Preleva ----
export function FinestraVersa({ stato, onChiudi }: { stato: Salvadanaio | null; onChiudi: () => void }) {
  const [dove, setDove] = useState('');
  const [importo, setImporto] = useState('');
  useEffect(() => { if (stato) { setDove(stato.id); setImporto(''); } }, [stato]);
  // Il salvadanaio e quelli che ha dentro, con il percorso a partire da lui: «Alloggio › Hotel Lisbona».
  const opzioni: { valore: string; testo: string; icona: string; rientro: number; nodo: Salvadanaio }[] = [];
  const visita = (k: Salvadanaio, percorso: string, livello: number) => {
    opzioni.push({ valore: k.id, testo: percorso, icona: k.icona, rientro: 0, nodo: k });
    k.figli.forEach((f) => visita(f, `${percorso} › ${f.nome}`, livello + 1));
  };
  if (stato) visita(stato, stato.nome, 0);
  const scelto = opzioni.find((o) => o.valore === dove)?.nodo ?? stato;
  const quanto = Number(leggiImporto(importo) ?? 0);
  const dentro = Number(scelto?.dentro ?? 0), traguardo = scelto?.traguardo ? Number(scelto.traguardo) : null;
  const dopo = (x: number) => `${euroCorto(x)}${traguardo ? ` · ${pct(x, traguardo)}` : ''}`;
  const sposta = (verso: 'versa' | 'preleva') => async () => {
    const x = serve(leggiImporto(importo), 'Scrivi quanto, es. 50', 'importo');
    if (Number(x) <= 0) throw new ErroreCampo('importo', 'L’importo deve essere maggiore di zero');
    if (verso === 'preleva' && scelto && Number(x) > Number(scelto.versato) + 0.005) {
      throw new ErroreCampo('importo', `Qui puoi prendere al massimo ${euro(Math.max(0, Number(scelto.versato)))}${scelto.figli.length ? ': il resto è nei suoi sotto-salvadanai' : ''}`);
    }
    await crea('/salvadanai/sposta', verso === 'versa' ? { da: null, a: dove, importo: x } : { da: dove, a: null, importo: x });
  };
  return (
    <FinestraModulo titolo={stato?.nome ?? 'Versa e preleva'} aperta={!!stato} onChiudi={onChiudi} onSalva={async () => {}} senzaTessera
      azioni={({ esegui, chiudi, lavoro }) => (
        <>
          <Pulsante etichetta="Annulla" onPress={chiudi} />
          <Pulsante etichetta="Preleva" icona="arrow-up-right" onPress={esegui(sposta('preleva'))} disattivato={lavoro} />
          <Pulsante tipo="primario" etichetta="Versa" icona="arrow-down-left" onPress={esegui(sposta('versa'))} disattivato={lavoro} />
        </>
      )}>
      <Affiancati>
        <Meta><Tendina etichetta="Dove" valore={dove} opzioni={opzioni} onCambia={setDove} iconaPrima="piggy-bank" /></Meta>
        <Meta><ConErrore campo="importo"><Campo etichetta="Quanto" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus /></ConErrore></Meta>
      </Affiancati>
      <Numeri voci={[
        { etichetta: 'Adesso', valore: traguardo ? `${euroCorto(dentro)} su ${euroCorto(traguardo)}` : euroCorto(dentro) },
        { etichetta: 'Se versi', valore: dopo(dentro + quanto) },
        { etichetta: 'Se prelevi', valore: dopo(Math.max(0, dentro - quanto)) },
      ]} />
    </FinestraModulo>
  );
}

// ---- Il salvadanaio ----
export function FinestraSalvadanaio({ stato, albero, onChiudi, onSposta }: {
  stato: { nodo: Salvadanaio | null; padre?: Salvadanaio } | null; albero: Salvadanaio[]; onChiudi: () => void; onSposta: (k: Salvadanaio) => void;
}) {
  const k = stato?.nodo ?? null;
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const { c } = useTema();
  const navigation = useNavigation<{ navigate: (k: string) => void }>();
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('piggy-bank');
  const [padre, setPadre] = useState('');
  const [traguardo, setTraguardo] = useState('');
  const [scadenza, setScadenza] = useState('');
  useEffect(() => {
    if (!stato) return;
    setNome(k?.nome ?? ''); setIcona(k?.icona ?? 'piggy-bank'); setPadre(k?.padre_id ?? stato.padre?.id ?? '');
    setTraguardo(importoInTesto(k?.traguardo_scritto)); setScadenza(dataInTesto(k?.scadenza));
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const bloccato = !!k?.collegato;
  // Dove può stare: in nessuno o in un altro salvadanaio (non lui né quelli che ha dentro).
  const esclusi = new Set(k ? piatti([k]).map((x) => x.id) : []);
  const opzioniPadre: { valore: string; testo: string; icona?: string; rientro: number }[] = [{ valore: '', testo: 'Nessuno: è un salvadanaio principale', rientro: 0 }];
  const visita = (xs: Salvadanaio[], livello: number) => xs.forEach((x) => { if (esclusi.has(x.id)) return; opzioniPadre.push({ valore: x.id, testo: x.nome, icona: x.icona, rientro: livello }); visita(x.figli, livello + 1); });
  visita(albero, 0);

  const salva = async () => {
    const corpo = {
      nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona,
      traguardo: traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000', 'traguardo') : null,
      scadenza: scadenza.trim() ? serve(leggiData(scadenza), 'Scegli il giorno', 'scadenza') : null,
      padre_id: padre || null,
    };
    if (k) await modifica(`/salvadanai/${k.id}`, corpo); else await crea('/salvadanai', corpo);
  };
  const apriSpesa = () => { if (!k?.spesa_id) return; onChiudi(); rif.chiedi({ spesa: k.spesa_id }); navigation.navigate('uscite'); };

  const dentro = k ? Number(k.dentro) : 0;
  const numeri = (
    <Numeri voci={[
      { etichetta: 'Dentro adesso', valore: euroCorto(dentro) },
      { etichetta: 'Mancano', valore: k?.mancano != null ? euroCorto(Math.max(0, Number(k.mancano))) : '—' },
      { etichetta: 'Metti al mese', valore: k?.metti_al_mese ? euroCorto(k.metti_al_mese) : '—' },
    ]} />
  );
  const campi = (
    <>
      <Affiancati>
        <Meta><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo emergenza" autoFocus={!k} disattivato={bloccato} /></ConErrore></Meta>
        <Meta><View style={{ opacity: bloccato ? d['opacita-disattivato'] : 1 }} pointerEvents={bloccato ? 'none' : 'auto'}><SceltaIcona valore={icona} onCambia={setIcona} /></View></Meta>
      </Affiancati>
      <Tendina etichetta="Dentro a" valore={padre} opzioni={opzioniPadre} onCambia={setPadre} iconaPrima="piggy-bank" disattivato={bloccato} />
      <Affiancati>
        <Meta><ConErrore campo="traguardo"><Campo etichetta="Traguardo (facoltativo)" valore={bloccato && k?.traguardo ? importoInTesto(k.traguardo) : traguardo} onCambia={setTraguardo} inputMode="decimal" segnaposto="0,00" disattivato={bloccato} /></ConErrore></Meta>
        <Meta><ConErrore campo="scadenza"><CampoData etichetta="Entro il (facoltativo)" valore={scadenza} onCambia={setScadenza} facoltativa segnaposto="Nessuna data" disattivato={bloccato} /></ConErrore></Meta>
      </Affiancati>
      {numeri}
      <Testo stile="dettaglio-normale" colore="testo-secondario">La cifra dentro si cambia con Versa e Preleva.</Testo>
    </>
  );

  if (bloccato && k) return (
    <FinestraModulo titolo="Modifica salvadanaio" aperta={!!stato} onChiudi={onChiudi} onSalva={async () => {}} senzaTessera
      azioniSinistra={({ chiudi }) => (
        <>
          <Pulsante etichetta="Preleva" icona="arrow-up-right" onPress={() => { chiudi(); onSposta(k); }} />
          <Pulsante etichetta="Versa" icona="arrow-down-left" onPress={() => { chiudi(); onSposta(k); }} />
        </>
      )}
      azioni={({ chiudi }) => <Pulsante tipo="primario" etichetta="Chiudi" onPress={chiudi} />}>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'flex-start' : 'center', gap: d['spazio-colonne'], padding: d['spazio-blocco'], borderRadius: d['raggio-controllo'], backgroundColor: c['sfondo-accento-tenue'] }}>
        <View style={{ flex: compatto ? undefined : 1, flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-icona'] }}>
          <Icona nome="info" misura={20} colore="icona-accento" />
          <Testo colore="testo-accento" style={{ flex: 1 }}>{`Legato alla spesa annuale ${k.spesa?.nome ?? k.nome}. Nome, traguardo e data vengono dalla spesa e si cambiano solo lì.`}</Testo>
        </View>
        <Pulsante tipo="testo" etichetta="Apri la spesa" onPress={apriSpesa} />
      </View>
      {campi}
    </FinestraModulo>
  );

  return (
    <FinestraModulo titolo={k ? 'Modifica salvadanaio' : 'Nuovo salvadanaio'} aperta={!!stato} onChiudi={onChiudi} onSalva={salva} testaTelefono senzaTessera
      onElimina={k ? () => cancella(`/salvadanai/${k.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina"
      confermaElimina={k ? { nome: `«${k.nome}»`, dettaglio: `I soldi tornano ${k.padre_id ? 'nel salvadanaio che lo contiene' : 'liberi, fuori da ogni salvadanaio'}${k.figli.length ? '; i sotto-salvadanai salgono di un livello' : ''}. Non si può annullare.` } : undefined}>
      {campi}
    </FinestraModulo>
  );
}

// Traguardo di copertura: un importo senza soldi propri, mostra se il salvadanaio basta a coprirlo per intero.
export function FinestraTraguardo({ stato, onChiudi }: { stato: { salvadanaio: Salvadanaio; traguardo: Traguardo | null } | null; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const t = stato?.traguardo ?? null;
  useEffect(() => { if (stato) { setNome(t?.nome ?? ''); setImporto(importoInTesto(t?.importo)); } }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), importo: serve(leggiImporto(importo), 'Scrivi l’importo') };
    if (t) await modifica(`/salvadanai/traguardi/${t.id}`, corpo); else await crea(`/salvadanai/${stato!.salvadanaio.id}/traguardi`, corpo);
  };
  return (
    <FinestraModulo titolo={t ? 'Modifica traguardo di copertura' : 'Nuovo traguardo di copertura'} icona="shield" aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={t ? () => cancella(`/salvadanai/traguardi/${t.id}`).then(() => undefined) : undefined}
      confermaElimina={t ? { nome: `il traguardo «${t.nome}»`, dettaglio: 'I soldi del salvadanaio non cambiano.' } : undefined}>
      <Testo colore="testo-secondario">{`Un importo senza soldi propri: mostra se «${stato?.salvadanaio.nome ?? ''}» basta a coprirlo per intero.`}</Testo>
      <Campo etichetta="Cosa deve coprire" valore={nome} onCambia={setNome} segnaposto="Es. Riparazione auto" autoFocus />
      <Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" />
    </FinestraModulo>
  );
}
