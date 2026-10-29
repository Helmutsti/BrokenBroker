import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Etichetta, Interruttore, Pulsante, PulsanteIcona, Tessera, type ToneAvanzamento } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, SelettorePeriodo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Budget as VoceBudget, ElencoBudget, ElencoMovimenti, Movimento } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { ConErrore, ErroreCampo, FinestraModulo, Riquadro, SezioneDivisione, serve, useDivisione, Voce } from './moduli.tsx';

// Movimenti (decisione 71): in alto i budget (si attivano dalle categorie, uno per categoria) con quanto si stanno riempiendo; sotto la griglia di
// tutte le uscite del mese personale (data, note, conto, categoria, cifra). Gli spostamenti tra conti non si mostrano. «Nuova uscita» scrive una spesa
// di tutti i giorni: il saldo del conto scende (decisioni 47 e 53). Le uscite scritte a mano si cambiano e si tolgono dalla griglia; quelle nate da
// una spunta si cambiano togliendo la spunta. Lo speso di un budget sono le uscite del mese con la sua categoria (spese previste e spostamenti no);
// se si sfora si conta tutto lo stesso, in rosso, con di quanto si è sforato.

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
  const [aperto, setAperto] = useState<VoceBudget | null>(null);
  const [uscita, setUscita] = useState<Movimento | 'nuova' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.budget.filter((b) => b.attivo), spenti = dati.budget.filter((b) => !b.attivo);
  const spesoTot = attivi.reduce((t, b) => t + speso(b) * b.mia_percentuale / 100, 0);
  const tettiTot = attivi.reduce((t, b) => t + tetto(b) * b.mia_percentuale / 100, 0);
  const sforati = attivi.filter((b) => speso(b) > tetto(b));
  const uscite = (elenco.dati?.movimenti ?? []).filter((x) => x.tipo === 'uscita');
  const totaleUscite = uscite.reduce((t, x) => t + Number(x.importo), 0);
  const scheda = (b: VoceBudget) => {
    const matita = <PulsanteIcona icona="pencil" etichetta={`Impostazioni del budget ${b.categoria}`} fantasma onPress={() => setAperto(b)} />;
    const testata = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={b.icona ?? 'wallet'} misura="media" />
        <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
          <Testo stile="titolo-scheda" numberOfLines={1}>{nomeCategoria(b)}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>Da tenere sotto controllo</Testo>
        </View>
        {!b.attivo ? <Etichetta testo="Non attivo" tono="neutro" /> : null}
        {b.condiviso ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
        {matita}
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
      {!dati.budget.length ? <Scheda><Vuoto testo="Ancora nessun budget. Si attivano dalle categorie: una cifra del mese da tenere sotto controllo." /></Scheda> : null}
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
      <FinestraBudget budget={aperto} categoriaId={null} aperta={!!aperto} onChiudi={() => setAperto(null)} />
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

// Crea o cambia il budget di una categoria. Aperta da una categoria (categoriaId) la categoria è fissa; da «Nuovo budget» si sceglie tra
// quelle senza budget. Cifra del mese, divisione e condivisione.
export function FinestraBudget({ budget, categoriaId, aperta, onChiudi }: { budget: VoceBudget | null; categoriaId: string | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [categoria, setCategoria] = useState<string | null>(null);
  const [importo, setImporto] = useState('');
  const [attivo, setAttivo] = useState(true);
  const [note, setNote] = useState('');
  const div = useDivisione({ aperta, voce: 'budget', rotta: '/budget', origine: budget ? { id: budget.id, mia: budget.mia, condiviso: budget.condiviso, miaPercentuale: budget.mia_percentuale } : null });
  useEffect(() => {
    if (!aperta) return;
    const b = budget;
    setCategoria(b?.categoria_id ?? categoriaId); setImporto(importoInTesto(b?.importo));
    setAttivo(b?.attivo ?? true); setNote(b?.note ?? '');
  }, [aperta, budget, categoriaId]);

  const senzaBudget = opzioniCategorie(rif.categorie, 'uscita').filter((o) => !rif.categoria(o.valore)?.budget);
  const fissa = !!budget || !!categoriaId;
  const cat = rif.categoria(categoria);
  const salva = async () => {
    const tetto = serve(leggiImporto(importo), 'Scrivi la cifra del mese, es. 250,00', 'importo');
    if (Number(tetto) <= 0) throw new ErroreCampo('importo', 'La cifra deve essere positiva');
    const corpo: Record<string, unknown> = { importo: tetto, attivo, note: note.trim() || null };
    if (!budget || budget.mia) div.controlla();
    if (budget) {
      await modifica(`/budget/${budget.id}`, corpo);
      if (!budget.mia) return; // la divisione la decide chi l'ha creato
      await div.salva(budget.id);
      return;
    }
    const nuovo = await crea<VoceBudget>('/budget', { ...corpo, categoria_id: serve(categoria, 'Scegli la categoria', 'categoria') });
    await div.salva(nuovo.id);
  };

  return (
    <FinestraModulo titolo={budget ? `Budget · ${budget.categoria}` : 'Nuovo budget'} icona={budget?.icona ?? 'chart-column'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={budget?.mia ? () => cancella(`/budget/${budget.id}`).then(() => undefined) : undefined}
      confermaElimina={budget ? { nome: `il budget «${budget.categoria}»`, dettaglio: ['La categoria resta, con le sue spese e le uscite già registrate.', budget.condiviso ? 'Sparisce anche per l’altra persona.' : null].filter(Boolean).join(' ') } : undefined}
      intestazioneDestra={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore="testo-secondario">{attivo ? 'Attivo' : 'Non attivo'}</Testo>
          <Interruttore acceso={attivo} onCambia={setAttivo} etichetta="Attivo" />
        </View>
      )}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">Un budget nasce da una categoria (uno per categoria). Non è un limite ma una cifra da tenere sotto controllo: se la superi si conta tutto lo stesso, in rosso.</Testo>
      <Riquadro titolo="Categoria e cifra" nota="La categoria è quella del budget; la cifra è quella del mese.">
        <ConErrore campo="categoria">
          {fissa ? (
            <Voce etichetta="Categoria"><Testo stile="corpo-forte">{cat ? rif.percorsoCategoria(cat.id) : budget ? nomeCategoria(budget) : '—'}</Testo></Voce>
          ) : (
            <Tendina etichetta="Categoria" valore={categoria} opzioni={senzaBudget} onCambia={setCategoria} iconaPrima="tags" segnaposto="Scegli una categoria senza budget" />
          )}
        </ConErrore>
        {budget && !budget.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è di ${budget.creato_da ?? 'chi ha creato il budget'}.`}</Testo> : null}
        <ConErrore campo="importo"><Campo etichetta="Cifra mensile" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus={!budget} /></ConErrore>
      </Riquadro>
      <Riquadro titolo="Cosa conta" nota="Vale per tutto il mese: non serve una data.">
        <Testo stile="dettaglio-normale" colore="testo-secondario">Contano le uscite fuori piano con questa categoria: i movimenti scritti a mano e le uscite aggiunte dalla pagina Movimenti. Le spese previste (anche se spuntate) e gli spostamenti tra conti non contano.</Testo>
      </Riquadro>
      {!budget || budget.mia ? <SezioneDivisione stato={div} cosa="budget" cifra={leggiImporto(importo)} testoCondividi="Condividi questo budget con un'altra persona" />
      : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condiviso con te: la tua quota è ${budget.mia_percentuale}%. Può cambiarla solo chi l'ha creato.`}</Testo>}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
    </FinestraModulo>
  );
}
