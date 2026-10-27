import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Etichetta, Pulsante, PulsanteIcona, Tessera, type ToneAvanzamento } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, SelettorePeriodo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { BudgetDelMese, ElencoBudget, UscitaBudget } from '../dati/tipi.ts';
import { data, dataInTesto, dataOra, euro, leggiData, leggiImporto, nomeMese, oggiIso } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { FinestraModulo, serve } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';

// Budget (decisione 48): i budget del mese personale, ognuno con uno dei suoi due modi.
//  - «Sposto i soldi»: spuntarlo nel mese fa un giroconto dal conto di partenza a quello di arrivo; si toglie la spunta e tornano.
//  - «Conto le uscite»: un tetto del mese; si registrano le uscite vere, che fanno scendere il conto e riempiono il budget.
// Il passato non si cambia: nei mesi precedenti a quello in corso niente spunte, niente uscite nuove o tolte.

const nomeModo = (b: BudgetDelMese) => (b.budget_modo === 'conto' ? 'Conto le uscite' : 'Sposto i soldi');
const speso = (b: BudgetDelMese) => Number(b.speso ?? 0);
const tetto = (b: BudgetDelMese) => Number(b.importo);

export function Budget() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const compatto = useCompatto();
  const { dati, errore } = useDati<ElencoBudget>(`/budget?mese=${mese}`);
  const [aperto, setAperto] = useState<BudgetDelMese | 'nuovo' | null>(null);
  const [uscitaPer, setUscitaPer] = useState<BudgetDelMese | null>(null);
  const [errAzione, setErrAzione] = useState<string | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const passato = mese < rif.meseOggi;
  const attivi = dati.budget.filter((b) => b.attiva), spenti = dati.budget.filter((b) => !b.attiva);
  const conUscite = attivi.filter((b) => b.budget_modo === 'conto');
  const spesoTot = conUscite.reduce((t, b) => t + speso(b) * b.mia_percentuale / 100, 0);
  const tettiTot = conUscite.reduce((t, b) => t + tetto(b) * b.mia_percentuale / 100, 0);
  const configurato = (b: BudgetDelMese) => b.budget_modo === 'sposto' && !!b.conto_partenza_id && !!b.conto_arrivo_id;
  const daSpostare = attivi.filter((b) => configurato(b) && !b.uscita);
  const daSpostareTot = daSpostare.reduce((t, b) => t + Number(b.mia_quota), 0);

  const sposta = async (b: BudgetDelMese) => {
    setErrAzione(null);
    try {
      if (b.uscita) await cancella(`/spese-previste/${b.id}/spunta?mese=${mese}`);
      else await crea(`/spese-previste/${b.id}/spunta`, { mese });
    } catch (e) { setErrAzione((e as Error).message); }
  };

  const scheda = (b: BudgetDelMese) => {
    const nomeCategoria = b.categoria_padre ? `${b.categoria_padre} › ${b.categoria}` : b.categoria ?? 'Senza categoria';
    const matita = <PulsanteIcona icona="pencil" etichetta={`Impostazioni di ${b.nome}`} fantasma onPress={() => setAperto(b)} />;
    const testata = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <Tessera icona={b.icona ?? 'wallet'} misura="media" />
        <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
          <Testo stile="titolo-scheda" numberOfLines={1}>{b.nome}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{`${nomeCategoria} · ${nomeModo(b)}`}</Testo>
        </View>
        {!b.attiva ? <Etichetta testo="Non attivo" tono="neutro" /> : null}
        {b.condivisa ? <Etichetta testo="Condiviso" icona="users" tono="accento" /> : null}
        {matita}
      </View>
    );
    if (b.budget_modo === 'conto') {
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
          {!passato && b.attiva ? <Pulsante tipo="secondario" icona="plus" etichetta="Aggiungi uscita" onPress={() => setUscitaPer(b)} /> : null}
          {b.uscite.length ? (
            <View>{b.uscite.map((u) => <RigaUscita key={u.id} u={u} />)}</View>
          ) : <Testo colore="testo-secondario">{passato ? 'Nessuna uscita in questo mese.' : 'Ancora nessuna uscita in questo mese.'}</Testo>}
        </Scheda>
      );
    }
    const pronto = configurato(b);
    const quota = euro(b.mia_quota);
    return (
      <Scheda key={b.id}>
        {testata}
        <View style={{ gap: d['spazio-testo'] }}>
          <Barra valore={b.uscita ? 100 : 0} tono={b.uscita ? 'ok' : 'accento'} />
          <Testo stile="corpo-forte">
            {pronto ? (b.uscita ? `Spostati ${quota}` : `Da spostare ${quota}`) : `${quota} al mese`}</Testo>
          <Testo colore="testo-secondario">
            {pronto ? `Da ${b.conto_partenza ?? 'un conto'} a ${b.conto_arrivo ?? 'un conto'}${b.uscita ? '' : ': spuntalo per fare il giroconto'}`
              : 'Scegli il conto di partenza e quello di arrivo con la matita: finché non li imposti non si muove nulla.'}</Testo>
        </View>
        {pronto && !passato && b.attiva && b.nel_mese
          ? <Pulsante tipo={b.uscita ? 'secondario' : 'primario'} icona={b.uscita ? 'x' : 'arrow-left-right'} etichetta={b.uscita ? 'Annulla lo spostamento' : 'Sposta ora'} onPress={() => sposta(b)} /> : null}
      </Scheda>
    );
  };

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo="Budget" sottotitolo={`${nomeMese(mese)} · dal ${data(dati.periodo.dal, 'corta')} al ${data(dati.periodo.al, 'corta')}`}
            azioni={<Pulsante tipo="primario" etichetta="Nuovo budget" icona="plus" onPress={() => setAperto('nuovo')} />} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      <RigaNumeri>
        <NumeroChiave etichetta="Speso nei budget" valore={euro(spesoTot)} icona="wallet" nota={conUscite.length ? `su ${euro(tettiTot)} di tetti · ${conUscite.length} ${conUscite.length === 1 ? 'budget conta' : 'budget contano'} le uscite` : 'Nessun budget conta le uscite'} />
        <NumeroChiave etichetta="Da spostare" valore={euro(daSpostareTot)} icona="arrow-left-right" nota={daSpostare.length ? `${daSpostare.length} ${daSpostare.length === 1 ? 'spostamento' : 'spostamenti'} ancora da fare` : 'Niente da spostare'} />
      </RigaNumeri>
      {passato ? <Esito tono="informazione" testo="Mese passato: spostamenti e uscite non si possono più cambiare, il passato non si tocca." /> : null}
      {errAzione ? <Esito tono="errore" testo={errAzione} /> : null}
      {!dati.budget.length ? <Scheda><Vuoto testo="Ancora nessun budget. Crea il primo: un tetto del mese per una categoria, oppure un giroconto da un conto a un altro." /></Scheda> : null}
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
      <FinestraSpesa spesa={aperto === 'nuovo' ? null : aperto} tipoIniziale="budget" aperta={!!aperto} onChiudi={() => setAperto(null)} />
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
function FinestraUscita({ budget, onChiudi }: { budget: BudgetDelMese | null; onChiudi: () => void }) {
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
    <FinestraModulo titolo={budget ? `Nuova uscita · ${budget.nome}` : 'Nuova uscita'} icona="wallet" aperta={!!budget} onChiudi={onChiudi} onSalva={salva} etichettaSalva="Aggiungi">
      <Campo etichetta="Quanto hai speso" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus />
      <Campo etichetta="Descrizione (facoltativa)" valore={descrizione} onCambia={setDescrizione} segnaposto={budget ? `Es. ${budget.nome.toLowerCase()}` : ''} />
      <CampoData etichetta="Giorno" valore={giorno} onCambia={setGiorno} aiuto="Oggi vale l'ora di adesso. Non si registrano uscite in un mese già passato." />
      <Tendina etichetta="Da quale conto esce (facoltativo)" valore={conto} segnaposto="Nessun conto" iconaPrima="landmark"
        opzioni={[{ valore: '', testo: 'Nessun conto' }, ...conti.map((c) => ({ valore: c.id, testo: c.nome, icona: c.icona }))]} onCambia={setConto} />
      <Testo stile="dettaglio-normale" colore="testo-secondario">
        {scelto ? `Il saldo di ${scelto.nome} scende di ${importo ? euro(leggiImporto(importo) ?? 0) : 'quanto scrivi'}.` : 'Senza conto riempie solo il budget: nessun saldo si muove.'}</Testo>
    </FinestraModulo>
  );
}
