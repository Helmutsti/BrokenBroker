import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Etichetta, Interruttore, Pulsante, PulsanteIcona, SceltaSegmenti, Tessera, type ToneAvanzamento } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, SelettorePeriodo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Budget as VoceBudget, Condivisione, ElencoBudget, PersonaSistema, UscitaBudget } from '../dati/tipi.ts';
import { data, dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese, oggiIso } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { FinestraMovimento } from './Movimenti.tsx';
import { ConErrore, ErroreCampo, FinestraModulo, Riquadro, salvaCondivisione, serve, Voce } from './moduli.tsx';

// Budget (decisioni 49, 51 e 57): uno per categoria, senza modi. Una cifra da tenere sotto controllo, non un limite: lo speso è tutto ciò che
// esce con la categoria, da qualunque conto; se si sfora si conta tutto lo stesso, in rosso, con di quanto si è sforato. Le uscite si
// registrano su qualunque budget. Nessun promemoria e nessun conto (decisione 57): chi vuole spostare i soldi guarda questa pagina e fa un
// giroconto da «Fai un giroconto» (la finestra «Nuovo movimento» di Movimenti, già su Giroconto).
// Il passato non si cambia: nei mesi precedenti a quello in corso niente uscite nuove o tolte.

const speso = (b: VoceBudget) => Number(b.speso ?? 0);
const tetto = (b: VoceBudget) => Number(b.importo);
const nomeCategoria = (b: VoceBudget) => (b.categoria_padre ? `${b.categoria_padre} › ${b.categoria}` : b.categoria);

export function Budget() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const compatto = useCompatto();
  const { dati, errore } = useDati<ElencoBudget>(`/budget?mese=${mese}`);
  const [aperto, setAperto] = useState<VoceBudget | 'nuovo' | null>(null);
  const [giroconto, setGiroconto] = useState(false);
  const [uscitaPer, setUscitaPer] = useState<VoceBudget | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const passato = mese < rif.meseOggi;
  const attivi = dati.budget.filter((b) => b.attivo), spenti = dati.budget.filter((b) => !b.attivo);
  const spesoTot = attivi.reduce((t, b) => t + speso(b) * b.mia_percentuale / 100, 0);
  const tettiTot = attivi.reduce((t, b) => t + tetto(b) * b.mia_percentuale / 100, 0);
  const sforati = attivi.filter((b) => speso(b) > tetto(b));
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
        <Testo stile="dettaglio-normale" colore="testo-secondario">
          {`Conta tutto ciò che esce con la categoria «${b.categoria}», da qualunque conto${b.spese_contate.length ? `. Di cui ${b.spese_contate.length} ${b.spese_contate.length === 1 ? 'spesa spuntata' : 'spese spuntate'}: ${euro(b.speso_da_spese ?? 0)}` : ''}. Non è un limite: se lo superi si conta tutto lo stesso.`}</Testo>
        {!passato && b.attivo ? <Pulsante tipo="secondario" icona="plus" etichetta="Aggiungi uscita" onPress={() => setUscitaPer(b)} /> : null}
        {b.uscite.length ? (
          <View>{b.uscite.map((u) => <RigaUscita key={u.id} u={u} />)}</View>
        ) : <Testo colore="testo-secondario">{passato ? 'Nessuna uscita in questo mese.' : 'Ancora nessuna uscita in questo mese.'}</Testo>}
      </Scheda>
    );
  };

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo="Budget" sottotitolo={`${nomeMese(mese)} · dal ${data(dati.periodo.dal, 'corta')} al ${data(dati.periodo.al, 'corta')}`}
            azioni={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
              <Pulsante etichetta="Fai un giroconto" icona="arrow-left-right" onPress={() => setGiroconto(true)} />
              <Pulsante tipo="primario" etichetta="Nuovo budget" icona="plus" onPress={() => setAperto('nuovo')} />
            </View>} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      <RigaNumeri>
        <NumeroChiave etichetta="Speso nei budget" valore={euro(spesoTot)} icona="wallet" tono={sforati.length ? 'errore' : undefined}
          nota={attivi.length ? `su ${euro(tettiTot)} di budget${sforati.length ? ` · ${sforati.length} ${sforati.length === 1 ? 'sforato' : 'sforati'}` : ''}` : 'Nessun budget attivo'} />
      </RigaNumeri>
      {passato ? <Esito tono="informazione" testo="Mese passato: le uscite non si possono più cambiare, il passato non si tocca." /> : null}
      {!dati.budget.length ? <Scheda><Vuoto testo="Ancora nessun budget. Crea il primo da una categoria: una cifra del mese da tenere sotto controllo." /></Scheda> : null}
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
      <FinestraBudget budget={aperto === 'nuovo' ? null : aperto} categoriaId={null} aperta={!!aperto} onChiudi={() => setAperto(null)} />
      <FinestraMovimento movimento={giroconto ? 'nuovo' : null} contoDiBase={null} tipoDiBase="giroconto" onChiudi={() => setGiroconto(false)} />
      <FinestraUscita budget={uscitaPer} onChiudi={() => setUscitaPer(null)} />
    </>
  );
}

// Una riga dell'elenco delle uscite: data e ora, descrizione, da quale conto, chi, importo; il cestino solo se si può ancora togliere.
function RigaUscita({ u }: { u: UscitaBudget }) {
  const compatto = useCompatto();
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const togli = async () => {
    setChiede(false);
    try { await cancella(`/budget/uscite/${u.id}`); } catch (e) { setErrore((e as Error).message); }
  };
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], borderBottomWidth: d['misura-bordo'], borderBottomColor: 'transparent' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" numberOfLines={1}>{u.descrizione}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={compatto ? 2 : 1}>
            {[dataOra(u.momento), u.conto ?? 'senza conto', u.utente].filter(Boolean).join(' · ')}</Testo>
        </View>
        <Testo stile="corpo-forte" colore="testo-errore">{euro(`-${u.importo}`)}</Testo>
        {u.modificabile ? <PulsanteIcona icona="trash-2" etichetta={`Togli l'uscita ${u.descrizione}`} fantasma onPress={() => setChiede(true)} /> : null}
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <ConfermaFinestra aperta={chiede} titolo="Togliere questa uscita?" testo={`${u.descrizione}, ${euro(u.importo)}${u.conto ? `: i soldi tornano su ${u.conto}` : ''}.`} tono="pericolo" etichettaConferma="Togli"
        onAnnulla={() => setChiede(false)} onConferma={togli} />
    </View>
  );
}

// «Aggiungi uscita»: importo, descrizione, giorno (di base oggi, con l'ora di adesso) e conto da cui esce (facoltativo).
function FinestraUscita({ budget, onChiudi }: { budget: VoceBudget | null; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [importo, setImporto] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [giorno, setGiorno] = useState('');
  const [conto, setConto] = useState('');
  useEffect(() => {
    if (!budget) return;
    setImporto(''); setDescrizione(''); setGiorno(dataInTesto(oggiIso())); setConto('');
  }, [budget]);
  const conti = rif.conti.filter((c) => !c.archiviato);
  const salva = async () => {
    if (!budget) return;
    const corpo = { importo: serve(leggiImporto(importo), 'Scrivi quanto hai speso, es. 12,50', 'importo'), descrizione: descrizione.trim() || undefined,
      data: serve(leggiData(giorno), 'Scegli il giorno', 'giorno'), conto_id: conto || null };
    if (Number(corpo.importo) <= 0) throw new Error("L'importo deve essere positivo");
    await crea(`/budget/${budget.id}/uscite`, corpo);
  };
  const scelto = conti.find((c) => c.id === conto);
  return (
    <FinestraModulo titolo={budget ? `Nuova uscita · ${budget.categoria}` : 'Nuova uscita'} icona="wallet" aperta={!!budget} onChiudi={onChiudi} onSalva={salva} etichettaSalva="Aggiungi">
      <Campo etichetta="Quanto hai speso" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus />
      <Campo etichetta="Descrizione (facoltativa)" valore={descrizione} onCambia={setDescrizione} segnaposto={budget ? `Es. ${budget.categoria.toLowerCase()}` : ''} />
      <CampoData etichetta="Giorno" valore={giorno} onCambia={setGiorno} aiuto="Oggi vale l'ora di adesso. Non si registrano uscite in un mese già passato." />
      <Testo stile="dettaglio-normale" colore="testo-secondario">{budget ? `Categoria: ${nomeCategoria(budget)}. Conta nel budget da qualunque conto esca.` : ''}</Testo>
      <Tendina etichetta="Da quale conto esce (facoltativo)" valore={conto} segnaposto="Nessun conto" iconaPrima="landmark"
        opzioni={[{ valore: '', testo: 'Nessun conto' }, ...conti.map((c) => ({ valore: c.id, testo: c.nome, icona: c.icona }))]} onCambia={setConto} />
      <Testo stile="dettaglio-normale" colore="testo-secondario">
        {scelto ? `Il saldo di ${scelto.nome} scende di ${importo ? euro(leggiImporto(importo) ?? 0) : 'quanto scrivi'}.` : 'Senza conto riempie solo il budget: nessun saldo si muove. Scegli il conto da cui hai pagato: quello del budget non c’entra.'}</Testo>
    </FinestraModulo>
  );
}

const NON_SPECIFICATO = 'non-specificato';

// Crea o cambia il budget di una categoria. Aperta da una categoria (categoriaId) la categoria è fissa; da «Nuovo budget» si sceglie tra
// quelle senza budget. Cifra del mese, divisione e condivisione.
export function FinestraBudget({ budget, categoriaId, aperta, onChiudi }: { budget: VoceBudget | null; categoriaId: string | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const miaCondivisione = useDati<Condivisione[]>(aperta && budget ? '/condivisioni' : null).dati?.find((x) => x.voce === 'budget' && x.voce_id === budget?.id && x.mia);
  const persone = useDati<PersonaSistema[]>(aperta ? '/persone/tutte' : null).dati;
  const [categoria, setCategoria] = useState<string | null>(null);
  const [importo, setImporto] = useState('');
  const [attivo, setAttivo] = useState(true);
  const [note, setNote] = useState('');
  const [diviso, setDiviso] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  const [divisione, setDivisione] = useState<'meta' | 'altra'>('meta');
  const [miaQuota, setMiaQuota] = useState('50');
  useEffect(() => {
    if (!aperta) return;
    const b = budget;
    setCategoria(b?.categoria_id ?? categoriaId); setImporto(importoInTesto(b?.importo));
    setAttivo(b?.attivo ?? true); setNote(b?.note ?? '');
    setDiviso(!!b && (b.condiviso || (b.mia && b.mia_percentuale < 100))); setCondiviso(b?.condiviso ?? false); setCon(null);
    setDivisione(!b || b.mia_percentuale === 50 || b.mia_percentuale === 100 ? 'meta' : 'altra'); setMiaQuota(String(b?.mia_percentuale ?? 50));
  }, [aperta, budget, categoriaId]);

  const senzaBudget = opzioniCategorie(rif.categorie, 'uscita').filter((o) => !rif.categoria(o.valore)?.budget);
  const fissa = !!budget || !!categoriaId;
  const cat = rif.categoria(categoria);
  const conEff = con ?? miaCondivisione?.condiviso_con_id ?? (budget && !budget.condiviso && budget.mia_percentuale < 100 ? NON_SPECIFICATO : null) ?? (persone?.length === 1 ? persone[0].id : persone?.length === 0 ? NON_SPECIFICATO : null);
  const nonSpec = conEff === NON_SPECIFICATO;
  const bloccata = !!budget?.condiviso && condiviso;
  const nomeAltro = persone?.find((p) => p.id === conEff)?.nome ?? 'l’altra persona';
  const valoreTetto = leggiImporto(importo);
  const accendiDivisione = (v: boolean) => { setDiviso(v); if (v && !budget?.condiviso) setCondiviso(true); if (!v) setCondiviso(false); };

  const dividi = async (id: string) => {
    if (!diviso) {
      await salvaCondivisione('budget', id, false, null);
      await sostituisci(`/budget/${id}/quote`, { quote: [] });
      return;
    }
    const altroId = nonSpec ? null : serve(conEff, 'Scegli con chi lo dividi', 'divisione');
    const mia = divisione === 'meta' ? 50 : Number(miaQuota.replace(',', '.'));
    if (!(mia > 0 && mia < 100)) serve(null, 'La tua quota deve essere tra 1 e 99%', 'quota');
    if (!altroId) {
      await salvaCondivisione('budget', id, false, null);
      await sostituisci(`/budget/${id}/quote`, { quote: [{ utente_id: rif.profilo!.id, percentuale: String(mia) }] });
      return;
    }
    await salvaCondivisione('budget', id, condiviso, altroId);
    await sostituisci(`/budget/${id}/quote`, { quote: [{ utente_id: rif.profilo!.id, percentuale: String(mia) }, { utente_id: altroId, percentuale: String(100 - mia) }] });
  };

  const salva = async () => {
    const tetto = serve(leggiImporto(importo), 'Scrivi la cifra del mese, es. 250,00', 'importo');
    if (Number(tetto) <= 0) throw new ErroreCampo('importo', 'La cifra deve essere positiva');
    const corpo: Record<string, unknown> = { importo: tetto, attivo, note: note.trim() || null };
    if (budget) {
      await modifica(`/budget/${budget.id}`, corpo);
      if (!budget.mia) return; // la divisione la decide chi l'ha creato
      await dividi(budget.id);
      return;
    }
    const nuovo = await crea<VoceBudget>('/budget', { ...corpo, categoria_id: serve(categoria, 'Scegli la categoria', 'categoria') });
    await dividi(nuovo.id);
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
        <Testo stile="dettaglio-normale" colore="testo-secondario">Conta tutto ciò che esce con questa categoria, da qualunque conto: le uscite che aggiungi dalla pagina Budget (per qualunque budget) e le spese previste spuntate. Il conto non è legato alla categoria.</Testo>
      </Riquadro>
      {!budget || budget.mia ? (
        <Riquadro titolo="Dividi il budget con qualcuno" icona="users" nota={diviso ? 'Scegli con chi e come lo dividete: nei tuoi conti conta solo la tua quota.' : 'Accendi se il budget è in due: conta solo la tua quota.'}
          interruttore={<Interruttore acceso={diviso} onCambia={accendiDivisione} etichetta="Dividi il budget con qualcuno" />}>
          {diviso ? (
            <>
              <ConErrore campo="divisione"><Tendina etichetta="Con chi" valore={conEff} iconaPrima="user" disattivato={bloccata} onCambia={(x) => { setCon(x); if (x === NON_SPECIFICATO) setCondiviso(false); }} segnaposto="Scegli una persona"
                opzioni={[{ valore: NON_SPECIFICATO, testo: 'Non specificato' }, ...(persone ?? []).map((p) => ({ valore: p.id, testo: p.nome }))]} />
                {bloccata ? <Testo stile="dettaglio-normale" colore="testo-secondario">Per cambiare persona spegni prima la condivisione.</Testo> : null}</ConErrore>
              <Voce etichetta="Come lo dividete" aiuto={`La tua quota: ${valoreTetto ? euro((Number(valoreTetto) * (divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : '—'}.`}>
                <SceltaSegmenti etichetta="Come lo dividete" larghezzaPiena valore={divisione} onCambia={setDivisione} opzioni={[{ valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
              </Voce>
              {divisione === 'altra' ? <ConErrore campo="quota"><Campo etichetta="La tua quota in %" valore={miaQuota} onCambia={setMiaQuota} inputMode="decimal" /></ConErrore> : null}
              {nonSpec ? null : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                  <View style={{ flex: 1, gap: d['spazio-testo'] }}>
                    <Testo stile="corpo-forte">{`Condividi anche con ${nomeAltro}`}</Testo>
                    <Testo stile="dettaglio-normale" colore="testo-secondario">{condiviso ? `${nomeAltro.charAt(0).toUpperCase()}${nomeAltro.slice(1)} lo vede e lo può modificare; solo tu puoi eliminarlo.` : 'Spento: il budget lo vedi solo tu.'}</Testo>
                  </View>
                  <Interruttore acceso={condiviso} onCambia={setCondiviso} etichetta={`Condividi anche con ${nomeAltro}`} />
                </View>
              )}
            </>
          ) : null}
        </Riquadro>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condiviso con te: la tua quota è ${budget.mia_percentuale}%. Può cambiarla solo chi l'ha creato.`}</Testo>}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
    </FinestraModulo>
  );
}
