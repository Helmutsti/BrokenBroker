import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Pulsante } from '../componenti/base.tsx';
import { Campo, MenuScelta, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaNumeri, RigaSalvadanaio, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import { leggiScelta, salvaScelta } from '../dati/preferenze';
import type { Cesta, CestaSpesa, Conto, ElencoSpese, Traguardo } from '../dati/tipi.ts';
import { dataSpesa, euro, importoInTesto, leggiImporto, oggiIso, percento } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Caricamento, quando } from './comuni.tsx';
import { ConErrore, ErroreCampo, FinestraModulo, serve } from './moduli.tsx';

// SC-04 Salvadanai (decisione 71): le ceste dentro i conti. In alto si sceglie un conto e se ne vedono saldo, quanto c'è nelle ceste e i liberi
// (saldo - ceste); sotto le ceste di quel conto, con le sotto-ceste, i traguardi e, se c'è, la spesa collegata (cifra e data vengono da lei:
// si vede quanto manca e quanto mettere al mese). I soldi si spostano a mano; la spunta della spesa collegata fa scendere la cesta.

// Il conto scelto in alto: si ricorda anche chiudendo l'app.
let ultimoConto = '';

const piatte = (xs: Cesta[]): Cesta[] => xs.flatMap((k) => [k, ...piatte(k.figli)]);
const tonoDi = (pct: number | null) => (pct !== null && pct >= 100 ? 'ok' as const : 'accento' as const);
const cifraDi = (k: Cesta) => (k.traguardo_effettivo ? `${euro(k.saldo)}/${euro(k.traguardo_effettivo)}` : euro(k.saldo));
const pctDi = (k: Cesta) => (k.traguardo_effettivo && k.percentuale !== null ? percento(k.percentuale) : undefined);
const mesi = (n: number) => `${n} ${n === 1 ? 'mese' : 'mesi'}`;

// Quando cade la spesa collegata: «entro 1 dicembre · ogni 12 mesi» (l'anno solo se non è quello di oggi).
function quandoCade(s: CestaSpesa): { testo: string; tono: 'secondario' | 'attenzione' | 'errore' } | undefined {
  const ogni = s.ogni_mesi === null || s.ogni_mesi === 1 ? null : s.ogni_mesi === 12 ? 'ogni anno' : `ogni ${s.ogni_mesi} mesi`;
  if (!s.scadenza) return { testo: s.pagata ? 'pagata' : 'senza data', tono: 'secondario' };
  const anno = s.scadenza.slice(0, 4) === oggiIso().slice(0, 4) ? '' : ` ${s.scadenza.slice(0, 4)}`;
  return { testo: [`entro ${dataSpesa(s.scadenza, s.senza_giorno)}${anno}`, ogni].filter(Boolean).join(' · '), tono: 'secondario' };
}
// La riga sotto la cesta collegata: quanto manca e quanto mettere al mese.
function notaSpesa(k: Cesta): string | undefined {
  if (!k.spesa) return undefined;
  if (k.spesa.pagata) return `Spesa «${k.spesa.nome}» già pagata`;
  if (Number(k.manca) < 0.005) return `Spesa «${k.spesa.nome}»: la cifra c'è tutta`;
  return `Spesa «${k.spesa.nome}»: mancano ${euro(k.manca)}, mettine ${euro(k.al_mese)} al mese per ${mesi(k.mesi ?? 1)}`;
}

export function Salvadanai() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const { c } = useTema();
  const ceste = useDati<Cesta[]>('/ceste');
  const [conto, setConto] = useState(ultimoConto);
  const [nuova, setNuova] = useState<{ padre?: Cesta } | null>(null);
  const [apri, setApri] = useState<Cesta | null>(null);
  const [sposta, setSposta] = useState<{ da?: string; a?: string } | null>(null);
  const [traguardo, setTraguardo] = useState<{ cesta: Cesta; traguardo: Traguardo | null } | null>(null);
  const [sopra, setSopra] = useState<string | null>(null);
  useEffect(() => { leggiScelta('salvadanai.conto').then((v) => { if (v && !ultimoConto) { ultimoConto = v; setConto(v); } }); }, []);
  const scegli = (v: string) => { ultimoConto = v; setConto(v); salvaScelta('salvadanai.conto', v); };
  if (!ceste.dati) return <Caricamento errore={ceste.errore} />;

  const conti = rif.conti.filter((k) => !k.archiviato).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  // Di base il primo conto che ha delle ceste, altrimenti il primo.
  const scelto: Conto | undefined = conti.find((k) => k.id === conto) ?? conti.find((k) => ceste.dati!.some((x) => x.conto_id === k.id)) ?? conti[0];
  const radici = scelto ? ceste.dati.filter((k) => k.conto_id === scelto.id) : [];
  const quante = piatte(radici).length;
  const liberiNegativi = scelto?.liberi != null && Number(scelto.liberi) < -0.005;

  const albero = (figli: Cesta[]): ReactNode => (
    <View style={{ gap: d['spazio-pillole'] }}>
      {figli.map((f) => (
        <View key={f.id} style={{ gap: d['spazio-pillole'] }}>
          <RigaSalvadanaio variante="sotto" nome={f.nome} icona={f.icona} valore={f.percentuale ?? 0} tono={tonoDi(f.percentuale)} cifra={cifraDi(f)} percentuale={pctDi(f)}
            scadenza={f.spesa ? quandoCade(f.spesa) : undefined} nota={notaSpesa(f)} onCifra={() => setSposta({ a: f.id })} onModifica={() => setApri(f)} />
          {f.figli.length ? (
            <View style={{ gap: d['spazio-pillole'], paddingLeft: d['margine-voce-h'], borderLeftWidth: d['misura-bordo-forte'], borderLeftColor: c['bordo-separatore'] }}>
              <RigaSalvadanaio variante="sotto" propria nome="Liberi nella cesta" icona="wallet" valore={0} cifra={euro(f.versato)} onCifra={() => setSposta({ a: f.id })} onModifica={() => setApri(f)} />
              {albero(f.figli)}
              <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta={`Aggiungi dentro ${f.nome}`} icona="plus" onPress={() => setNuova({ padre: f })} /></View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );

  const scheda = (k: Cesta) => {
    const ordinati = [...k.traguardi].sort((a, b) => Number(a.importo) - Number(b.importo));
    return (
      <View key={k.id} {...{ onMouseEnter: () => setSopra(k.id), onMouseLeave: () => setSopra(null) }} style={{ width: '100%' }}>
        <Scheda style={{ width: '100%' }}>
          <View style={{ gap: d['spazio-blocco'] }}>
            <RigaSalvadanaio variante="testata" nome={k.nome} icona={k.icona} valore={k.percentuale ?? 0} tono={tonoDi(k.percentuale)} cifra={cifraDi(k)} percentuale={pctDi(k)}
              scadenza={k.spesa ? quandoCade(k.spesa) : undefined} nota={notaSpesa(k)} matitaNascosta={!compatto && sopra !== k.id}
              onCifra={() => setSposta({ a: k.id })} onModifica={() => setApri(k)} />
            {k.figli.length ? (
              <View style={{ gap: d['spazio-pillole'] }}>
                <RigaSalvadanaio variante="sotto" propria nome="Liberi nella cesta" icona="wallet" valore={0} cifra={euro(k.versato)} onCifra={() => setSposta({ a: k.id })} onModifica={() => setApri(k)} />
                {albero(k.figli)}
              </View>
            ) : null}
            {ordinati.length ? (
              <View style={{ gap: d['spazio-pillole'] }}>
                {ordinati.map((t) => (
                  <RigaSalvadanaio key={t.id} variante="sotto" nome={t.nome} valore={t.percentuale} tono={t.percentuale >= 100 ? 'ok' : 'attenzione'} cifra={euro(t.importo)} percentuale={percento(t.percentuale)}
                    onCifra={() => setTraguardo({ cesta: k, traguardo: t })} onModifica={() => setTraguardo({ cesta: k, traguardo: t })} />
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
              {k.spesa ? null : <Pulsante tipo="secondario" etichetta="Aggiungi sotto-cesta" icona="plus" onPress={() => setNuova({ padre: k })} />}
              <Pulsante tipo="secondario" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ cesta: k, traguardo: null })} />
            </View>
          </View>
        </Scheda>
      </View>
    );
  };

  // Due colonne indipendenti sul computer: ogni riquadro va nella colonna meno carica (stima dal numero di righe).
  const peso = (k: Cesta): number => 2 + k.traguardi.length + piatte(k.figli).length;
  const colonne: Cesta[][] = compatto ? [radici] : [[], []];
  if (!compatto) {
    const pesi = [0, 0];
    for (const k of radici) { const i = pesi[1] < pesi[0] ? 1 : 0; colonne[i].push(k); pesi[i] += peso(k); }
  }

  return (
    <>
      <Intestazione titolo="Salvadanai" sottotitolo="Le parti dei tuoi conti messe da parte. I soldi li sposti tu: niente si muove da solo."
        azioni={scelto ? (
          <>
            <Pulsante tipo="secondario" etichetta="Sposta soldi" icona="arrow-left-right" onPress={() => setSposta({})} />
            <Pulsante tipo="primario" etichetta="Nuova cesta" icona="plus" onPress={() => setNuova({})} />
          </>
        ) : undefined} />
      {!scelto ? <Scheda><Testo colore="testo-secondario">Non hai ancora nessun conto. Aggiungilo dalla pagina Conti: le ceste stanno dentro i conti.</Testo></Scheda> : (
        <>
          <RigaNumeri>
            <NumeroChiave etichetta={`Saldo di ${scelto.nome}`} valore={scelto.saldo !== null ? euro(scelto.saldo) : '—'} icona={scelto.icona}
              nota={scelto.saldo === null ? 'Scrivi il saldo dalla pagina Conti' : undefined}
              titolo={(
                <MenuScelta valore={scelto.id} onCambia={scegli} larghezzaMinima={240} opzioni={conti.map((k) => ({ valore: k.id, testo: k.nome, icona: k.icona }))}>
                  {({ ref, apri: apriMenu, aperto }) => (
                    <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${scelto.nome}`} aria-expanded={aperto} onPress={apriMenu}
                      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                      <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{`Saldo di ${scelto.nome}`}</Testo>
                      <Icona nome="chevron-down" misura={16} />
                    </Pressable>
                  )}
                </MenuScelta>
              )} />
            <NumeroChiave etichetta="Nelle ceste" valore={euro(scelto.nelle_ceste)} icona="piggy-bank" nota={`In ${quante} ${quante === 1 ? 'cesta' : 'ceste'}`} />
            <NumeroChiave etichetta="Liberi" valore={scelto.liberi !== null ? euro(scelto.liberi) : '—'} icona="wallet" tono={liberiNegativi ? 'errore' : 'normale'}
              nota={liberiNegativi ? 'Nelle ceste c’è più di quello che c’è sul conto' : 'Quello che non è in nessuna cesta'} />
          </RigaNumeri>
          {!radici.length ? <Testo colore="testo-secondario">{`Nessuna cesta in ${scelto.nome}. Creane una con «Nuova cesta».`}</Testo> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
            {colonne.map((col, i) => <View key={i} style={{ flex: 1, minWidth: 0, gap: d['spazio-blocco'] }}>{col.map(scheda)}</View>)}
          </View>
        </>
      )}
      <FinestraCesta stato={nuova ? { cesta: null, padre: nuova.padre } : apri ? { cesta: apri } : null} conto={scelto ?? null} ceste={ceste.dati}
        onChiudi={() => { setNuova(null); setApri(null); }} onSotto={(k) => { setApri(null); setNuova({ padre: k }); }} />
      <FinestraSposta stato={sposta} conto={scelto ?? null} ceste={radici} onChiudi={() => setSposta(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
    </>
  );
}

// Nuova cesta o modifica: nome, icona, traguardo (o la spesa collegata, che dà cifra e data) e dove sta.
function FinestraCesta({ stato, conto, ceste, onChiudi, onSotto }: {
  stato: { cesta: Cesta | null; padre?: Cesta } | null; conto: Conto | null; ceste: Cesta[]; onChiudi: () => void; onSotto: (k: Cesta) => void;
}) {
  const k = stato?.cesta ?? null;
  const rif = useRiferimenti();
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('piggy-bank');
  const [traguardo, setTraguardo] = useState('');
  const [spesa, setSpesa] = useState('');
  const elencoSpese = useDati<ElencoSpese>(stato ? '/spese-previste' : null).dati;
  useEffect(() => {
    if (!stato) return;
    setNome(k?.nome ?? ''); setIcona(k?.icona ?? 'piggy-bank'); setTraguardo(importoInTesto(k?.traguardo)); setSpesa(k?.spesa_id ?? '');
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  // Le spese tra cui scegliere: attive, che escono (non spostamenti) e non già collegate a un'altra cesta.
  const inUso = useMemo(() => new Set(piatte(ceste).filter((x) => x.spesa_id && x.id !== k?.id).map((x) => x.spesa_id)), [ceste, k]);
  const inizio = rif.profilo?.inizio_mese ?? 1;
  const opzioniSpesa = [{ valore: '', testo: 'Nessuna: scrivo io il traguardo' },
    ...(elencoSpese?.spese ?? []).filter((s) => s.attiva && !s.a_conto_id && !inUso.has(s.id) && s.mia_quota)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
      .map((s) => ({ valore: s.id, testo: `${s.nome} · ${euro(s.mia_quota)} · ${quando(s, inizio)}`, icona: s.icona ?? 'ellipsis' }))];
  const padre = stato?.padre ?? null;
  const contenitore = k ? (k.padre_id ? 'dentro un’altra cesta' : `in ${k.conto}`) : padre ? `dentro «${padre.nome}»` : `in ${conto?.nome ?? 'un conto'}`;
  const coFigli = !!k?.figli.length;
  const salva = async () => {
    const nomeScritto = serve(nome.trim(), 'Scrivi il nome', 'nome');
    const t = !spesa && traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000', 'traguardo') : null;
    const corpo = { nome: nomeScritto, icona, traguardo: t, spesa_id: spesa || null };
    if (k) await modifica<Cesta>(`/ceste/${k.id}`, corpo);
    else await crea<Cesta>('/ceste', { ...corpo, ...(padre ? { padre_id: padre.id } : { conto_id: serve(conto?.id, 'Scegli un conto', 'nome') }) });
  };
  return (
    <FinestraModulo titolo={k ? 'Modifica cesta' : padre ? 'Nuova sotto-cesta' : 'Nuova cesta'} icona={icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={k?.mio ? () => cancella(`/ceste/${k.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina"
      confermaElimina={k ? { nome: `«${k.nome}»`, dettaglio: 'I soldi devono essere già tornati nei liberi del conto. Non si può annullare.' } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo emergenza" autoFocus={!k} /></ConErrore></View>
      </View>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{`La cesta sta ${contenitore}: è una parte del suo saldo e segue la sua condivisione.`}</Testo>
      {coFigli ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">Il traguardo è la somma di quelli delle sotto-ceste.</Testo>
      ) : (
        <>
          <Tendina etichetta="Spesa collegata (facoltativa)" valore={spesa} opzioni={opzioniSpesa} onCambia={setSpesa} iconaPrima="calendar-check" segnaposto="Nessuna" />
          {spesa ? (
            <Testo stile="dettaglio-normale" colore="testo-secondario">La cifra e la data le prende dalla spesa: l’app dice quanto manca e quanto mettere al mese. Quando spunti la spesa, la cesta scende della stessa cifra.</Testo>
          ) : (
            <ConErrore campo="traguardo"><Campo etichetta="Traguardo (facoltativo)" valore={traguardo} onCambia={setTraguardo} segnaposto="Facoltativo" inputMode="decimal" aiuto="La cifra da raggiungere: la barra dice a che punto sei" /></ConErrore>
          )}
        </>
      )}
      {k && !k.spesa_id ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}><Pulsante tipo="testo" etichetta="Sotto-cesta" icona="plus" onPress={() => onSotto(k)} /></View> : null}
    </FinestraModulo>
  );
}

// Sposta dei soldi a mano: dai liberi del conto a una cesta, da una cesta ai liberi, tra ceste dello stesso conto.
function FinestraSposta({ stato, conto, ceste, onChiudi }: { stato: { da?: string; a?: string } | null; conto: Conto | null; ceste: Cesta[]; onChiudi: () => void }) {
  const [da, setDa] = useState('liberi');
  const [a, setA] = useState('');
  const [importo, setImporto] = useState('');
  useEffect(() => { if (stato) { setDa(stato.da ?? 'liberi'); setA(stato.a ?? (stato.da ? 'liberi' : '')); setImporto(''); } }, [stato]);
  const elenco = useMemo(() => {
    const out: { id: string; nome: string; icona: string; livello: number; propria: number }[] = [];
    const visita = (xs: Cesta[], livello: number) => xs.forEach((x) => { out.push({ id: x.id, nome: x.nome, icona: x.icona, livello, propria: Number(x.versato) }); visita(x.figli, livello + 1); });
    visita(ceste, 0);
    return out;
  }, [ceste]);
  const opzioni = [{ valore: 'liberi', testo: 'Liberi del conto', icona: 'wallet', rientro: 0 }, ...elenco.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona, rientro: x.livello }))];
  const disponibile = (v: string) => (v === 'liberi' ? (conto?.liberi != null ? Number(conto.liberi) : 0) : elenco.find((x) => x.id === v)?.propria ?? 0);
  const salva = async () => {
    if (!a) throw new ErroreCampo('a', 'Scegli dove mettere i soldi');
    if (da === a) throw new ErroreCampo('a', 'Scegli due posti diversi');
    const x = serve(leggiImporto(importo), 'Scrivi quanto spostare, es. 50', 'importo');
    if (Number(x) <= 0) throw new ErroreCampo('importo', 'L’importo deve essere maggiore di zero');
    if (Number(x) > disponibile(da) + 0.005) throw new ErroreCampo('importo', `Da qui puoi prendere al massimo ${euro(Math.max(0, disponibile(da)))}`);
    await crea('/ceste/sposta', { da: da === 'liberi' ? null : da, a: a === 'liberi' ? null : a, importo: x });
  };
  return (
    <FinestraModulo titolo="Sposta soldi" icona="arrow-left-right" aperta={!!stato} onChiudi={onChiudi} onSalva={salva} etichettaSalva="Sposta">
      <Testo colore="testo-secondario">{`I soldi restano sul conto ${conto?.nome ?? ''}: cambia solo in quale parte stanno. Nei liberi ci sono ${euro(disponibile('liberi'))}.`}</Testo>
      <Tendina etichetta="Da dove" valore={da} opzioni={opzioni} onCambia={setDa} iconaPrima="arrow-up-from-line" />
      <ConErrore campo="a"><Tendina etichetta="Dove" valore={a || null} opzioni={opzioni.filter((o) => o.valore !== da)} onCambia={setA} iconaPrima="arrow-down-to-line" segnaposto="Scegli la cesta" /></ConErrore>
      <ConErrore campo="importo"><Campo etichetta="Quanto" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus aiuto={`Da qui si possono prendere al massimo ${euro(Math.max(0, disponibile(da)))}`} /></ConErrore>
    </FinestraModulo>
  );
}

function FinestraTraguardo({ stato, onChiudi }: { stato: { cesta: Cesta; traguardo: Traguardo | null } | null; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const t = stato?.traguardo ?? null;
  useEffect(() => { if (stato) { setNome(t?.nome ?? ''); setImporto(importoInTesto(t?.importo)); } }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), importo: serve(leggiImporto(importo), 'Scrivi l’importo') };
    if (t) await modifica(`/ceste/traguardi/${t.id}`, corpo); else await crea(`/ceste/${stato!.cesta.id}/traguardi`, corpo);
  };
  return (
    <FinestraModulo titolo={t ? 'Modifica traguardo di copertura' : 'Nuovo traguardo di copertura'} icona="shield" aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={t ? () => cancella(`/ceste/traguardi/${t.id}`).then(() => undefined) : undefined}
      confermaElimina={t ? { nome: `il traguardo «${t.nome}»`, dettaglio: 'I soldi della cesta non cambiano.' } : undefined}>
      <Testo colore="testo-secondario">{`Un importo senza soldi propri: mostra se «${stato?.cesta.nome ?? ''}» basta a coprirlo per intero.`}</Testo>
      <Campo etichetta="Cosa deve coprire" valore={nome} onCambia={setNome} segnaposto="Es. Riparazione auto" autoFocus />
      <Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" />
    </FinestraModulo>
  );
}
