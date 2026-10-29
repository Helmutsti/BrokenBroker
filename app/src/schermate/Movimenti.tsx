import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Etichetta, Pulsante, PulsanteIcona, Tessera, type ToneAvanzamento } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, SelettorePeriodo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Budget as VoceBudget, ElencoBudget, ElencoMovimenti, Movimento } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { ConErrore, ErroreCampo, FinestraModulo, serve } from './moduli.tsx';

// Movimenti (decisione 71): in alto i budget (limiti di spesa che si creano dalle Categorie, uno per categoria) con quanto si stanno riempiendo; sotto
// la griglia di tutte le uscite del mese personale (data, note, conto, categoria, cifra). Gli spostamenti tra conti non si mostrano. «Nuova uscita»
// scrive una spesa di tutti i giorni: il saldo del conto scende (decisioni 47 e 53). Le uscite scritte a mano si cambiano e si tolgono dalla griglia;
// quelle nate da una spunta si cambiano togliendo la spunta. Lo speso di un budget sono tutte le uscite del mese con la sua categoria, anche
// quelle nate da una spunta (i giroconti no); se si sfora si conta tutto lo stesso, in rosso, con di quanto si è sforato. Il budget si cambia dalle Categorie.

const speso = (b: VoceBudget) => Number(b.speso ?? 0);
const tetto = (b: VoceBudget) => Number(b.importo);
const nomeCategoria = (b: VoceBudget) => (b.categoria_padre ? `${b.categoria_padre} › ${b.categoria}` : b.categoria);
const COLONNE = { data: 110, conto: 170, categoria: 170, cifra: 110, azioni: 88 };

export function Movimenti() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const compatto = useCompatto();
  const { dati, errore } = useDati<ElencoBudget>(`/budget?mese=${mese}`);
  const elenco = useDati<ElencoMovimenti>(`/movimenti?mese=${mese}&limite=500`);
  const [uscita, setUscita] = useState<Movimento | 'nuova' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.budget.filter((b) => b.attivo), spenti = dati.budget.filter((b) => !b.attivo);
  const spesoTot = attivi.reduce((t, b) => t + speso(b), 0);
  const tettiTot = attivi.reduce((t, b) => t + tetto(b), 0);
  const sforati = attivi.filter((b) => speso(b) > tetto(b));
  const uscite = (elenco.dati?.movimenti ?? []).filter((x) => x.tipo === 'uscita');
  const totaleUscite = uscite.reduce((t, x) => t + Number(x.importo), 0);
  const scheda = (b: VoceBudget) => {
    const testata = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={b.icona ?? 'wallet'} misura="media" />
        <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
          <Testo stile="titolo-scheda" numberOfLines={1}>{nomeCategoria(b)}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>Limite di spesa del mese</Testo>
        </View>
        {!b.attivo ? <Etichetta testo="Non attivo" tono="neutro" /> : null}
      </View>
    );
    // Lo speso si conta sempre, anche oltre la cifra: sforando barra e cifre diventano rosse e si dice di quanto.
    const s = speso(b), t = tetto(b), pct = t > 0 ? (s / t) * 100 : s > 0 ? 100 : 0;
    const tono: ToneAvanzamento = s > t ? 'errore' : pct >= 85 ? 'attenzione' : 'accento';
    const resta = t - s;
    return (
      <Scheda key={b.id}>
        {testata}
        <View style={{ gap: d['spazio-testo'] }}>
          <Barra valore={pct} tono={tono} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'], flexWrap: 'wrap' }}>
            <Testo colore={tono === 'errore' ? 'testo-errore' : 'testo-primario'} stile="corpo-forte">{`Speso ${euro(s)} su ${euro(t)}`}</Testo>
            <Testo colore={tono === 'errore' ? 'testo-errore' : tono === 'attenzione' ? 'testo-attenzione' : 'testo-secondario'}>
              {resta >= 0 ? `Restano ${euro(resta)}` : `Sforato di ${euro(-resta)}`}</Testo>
          </View>
        </View>
      </Scheda>
    );
  };

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo="Movimenti" sottotitolo={`${nomeMese(mese)} · dal ${data(dati.periodo.dal, 'corta')} al ${data(dati.periodo.al, 'corta')}`} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      <RigaNumeri>
        <NumeroChiave etichetta="Speso nei budget" valore={euro(spesoTot)} icona="wallet" tono={sforati.length ? 'errore' : undefined}
          nota={attivi.length ? `su ${euro(tettiTot)} di budget${sforati.length ? ` · ${sforati.length} ${sforati.length === 1 ? 'sforato' : 'sforati'}` : ''}` : 'Nessun budget attivo'} />
        <NumeroChiave etichetta="Uscite del mese" valore={euro(totaleUscite)} icona="arrow-up-right" nota={`${uscite.length} ${uscite.length === 1 ? 'uscita' : 'uscite'}`} />
      </RigaNumeri>
      {!dati.budget.length ? <Scheda><Vuoto testo="Ancora nessun budget. Si creano dalle Categorie: un limite di spesa del mese su una categoria." /></Scheda> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        {attivi.map((b) => <View key={b.id} style={{ flexGrow: 1, flexBasis: compatto ? '100%' : 420, minWidth: 0 }}>{scheda(b)}</View>)}
      </View>
      {spenti.length ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <Testo stile="titolo-scheda">Non attivi</Testo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
            {spenti.map((b) => <View key={b.id} style={{ flexGrow: 1, flexBasis: compatto ? '100%' : 420, minWidth: 0 }}>{scheda(b)}</View>)}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
        <Testo stile="titolo-scheda">Uscite</Testo>
        <Pulsante tipo="primario" etichetta="Nuova uscita" icona="plus" onPress={() => setUscita('nuova')} />
      </View>
      <Scheda>
        {!elenco.dati ? <Caricamento errore={elenco.errore} /> : uscite.length === 0 ? <Vuoto testo="Nessuna uscita in questo mese." /> : (
          <View>
            {!compatto ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'], paddingBottom: d['spazio-testo'] }}>
                <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: COLONNE.data }}>Data</Testo>
                <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1 }}>Descrizione</Testo>
                <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: COLONNE.conto }}>Conto</Testo>
                <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: COLONNE.categoria }}>Categoria</Testo>
                <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: COLONNE.cifra, textAlign: 'right' }}>Cifra</Testo>
                <View style={{ width: COLONNE.azioni }} />
              </View>
            ) : null}
            {uscite.map((x) => <RigaUscita key={x.id} x={x} onModifica={() => setUscita(x)} />)}
          </View>
        )}
      </Scheda>
      <FinestraUscita uscita={uscita} onChiudi={() => setUscita(null)} />
    </>
  );
}

// Una riga della griglia: data, descrizione, conto, categoria, cifra. Matita e cestino solo per le uscite scritte a mano da chi guarda;
// quelle nate da una spunta si cambiano togliendo la spunta.
function RigaUscita({ x, onModifica }: { x: Movimento; onModifica: () => void }) {
  const compatto = useCompatto();
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const togli = async () => {
    setChiede(false);
    try { await cancella(`/movimenti/${x.id}`); } catch (e) { setErrore((e as Error).message); }
  };
  const giorno = data(x.data, 'corta');
  const azioni = x.modificabile ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', width: compatto ? undefined : COLONNE.azioni, justifyContent: 'flex-end' }}>
      <PulsanteIcona icona="pencil" etichetta={`Modifica ${x.descrizione}`} fantasma onPress={onModifica} />
      <PulsanteIcona icona="trash-2" etichetta={`Elimina ${x.descrizione}`} fantasma onPress={() => setChiede(true)} />
    </View>
  ) : <View style={{ width: compatto ? 0 : COLONNE.azioni }} />;
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      {compatto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], minHeight: 56 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Testo stile="corpo-forte" numberOfLines={2}>{x.descrizione}</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={2}>
              {[giorno, x.da ?? 'senza conto', x.categoria, x.da_spunta ? 'da una spunta' : null].filter(Boolean).join(' · ')}</Testo>
          </View>
          <Testo stile="corpo-forte" colore="testo-errore">{euro(`-${x.importo}`)}</Testo>
          {azioni}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'] }}>
          <Testo colore="testo-secondario" style={{ width: COLONNE.data }}>{giorno}</Testo>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Testo stile="corpo-forte" numberOfLines={1}>{x.descrizione}</Testo>
            {x.da_spunta ? <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>Da una spunta: si cambia togliendo la spunta</Testo> : null}
          </View>
          <Testo style={{ width: COLONNE.conto }} numberOfLines={1}>{x.da ?? 'Senza conto'}</Testo>
          <Testo style={{ width: COLONNE.categoria }} numberOfLines={1}>{x.categoria ?? '—'}</Testo>
          <Testo stile="corpo-forte" colore="testo-errore" style={{ width: COLONNE.cifra, textAlign: 'right' }}>{euro(`-${x.importo}`)}</Testo>
          {azioni}
        </View>
      )}
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <ConfermaFinestra aperta={chiede} titolo="Eliminare questa uscita?" testo={`${x.descrizione}, ${euro(x.importo)}: il saldo del conto torna com'era prima.`} tono="pericolo" etichettaConferma="Elimina"
        onAnnulla={() => setChiede(false)} onConferma={togli} />
    </View>
  );
}

// «Nuova uscita» / «Modifica uscita»: cifra, conto da cui esce, categoria, giorno (di base oggi) e note. Salvarla abbassa il saldo del conto.
function FinestraUscita({ uscita, onChiudi }: { uscita: Movimento | 'nuova' | null; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const esistente = uscita && uscita !== 'nuova' ? uscita : null;
  const [importo, setImporto] = useState('');
  const [conto, setConto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [giorno, setGiorno] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!uscita) return;
    if (esistente) {
      setImporto(importoInTesto(esistente.importo)); setConto(esistente.da_conto_id ?? ''); setCategoria(esistente.categoria_id ?? '');
      setGiorno(dataInTesto(esistente.data)); setNote(esistente.descrizione);
    } else {
      const t = new Date();
      setImporto(''); setConto(''); setCategoria(''); setNote('');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`));
    }
  }, [uscita]);   // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const soldi = serve(leggiImporto(importo), 'Scrivi la cifra, es. 2,00', 'importo');
    if (!(Number(soldi) > 0)) throw new ErroreCampo('importo', 'La cifra deve essere positiva');
    const corpo: Record<string, unknown> = { tipo: 'uscita', importo: soldi, conto_id: serve(conto, 'Scegli il conto da cui esce', 'conto'),
      categoria_id: serve(categoria, 'Scegli la categoria', 'categoria'), data: serve(leggiData(giorno), 'Scegli il giorno', 'giorno') };
    if (esistente) await modifica(`/movimenti/${esistente.id}`, { ...corpo, descrizione: note.trim() });
    else await crea('/movimenti', { ...corpo, descrizione: note.trim() || undefined });
  };
  const conBudget = categoria ? rif.categoria(categoria)?.budget : null;
  return (
    <FinestraModulo titolo={esistente ? 'Modifica uscita' : 'Nuova uscita'} icona="arrow-up-right" aperta={!!uscita} onChiudi={onChiudi} onSalva={salva}
      onElimina={esistente ? async () => { await cancella(`/movimenti/${esistente.id}`); } : undefined}
      confermaElimina={esistente ? { nome: esistente.descrizione, dettaglio: "Il saldo del conto torna com'era prima." } : undefined}
      etichettaSalva={esistente ? 'Salva' : 'Aggiungi'}>
      <ConErrore campo="importo"><Campo etichetta="Cifra" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus /></ConErrore>
      <ConErrore campo="conto">
        <Tendina etichetta="Da quale conto" valore={conto} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setConto}
          opzioni={opzioniConti(rif.conti, { tenere: [conto] })} />
      </ConErrore>
      <ConErrore campo="categoria">
        <Tendina etichetta="Categoria" valore={categoria} segnaposto="Scegli la categoria" iconaPrima="tags" onCambia={setCategoria}
          opzioni={opzioniCategorie(rif.categorie, 'uscita')} />
      </ConErrore>
      {conBudget ? <Testo stile="dettaglio-normale" colore="testo-secondario">Questa categoria ha un budget: l'uscita conta nel suo speso.</Testo> : null}
      <ConErrore campo="giorno"><CampoData etichetta="Data" valore={giorno} onCambia={setGiorno} aiuto="Di base è oggi." /></ConErrore>
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} segnaposto="Es. caffè" />
      <Testo stile="dettaglio-normale" colore="testo-secondario">Il saldo del conto scende di questa cifra; se la togli o la cambi, il saldo si aggiusta.</Testo>
    </FinestraModulo>
  );
}
