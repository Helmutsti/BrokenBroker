import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { anelloFocus, Esito, Interruttore, Pulsante, SceltaSegmenti, type StatoPressione } from '../componenti/base.tsx';
import { Icona } from '../componenti/Icona.tsx';
import { Check } from 'lucide-react-native';
import { coloriCategorie, nomeColoreCategoria, suColoreCategoria } from '../tema/token.ts';
import { Campo, Tendina, TendinaGriglia } from '../componenti/campi.tsx';
import { Intestazione, LARGHEZZA_AZIONI_CATEGORIA, LARGHEZZE_CATEGORIA, RigaCategoria, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Categoria, ElencoSpese, Rata } from '../dati/tipi.ts';
import { euro, importoInTesto, leggiImporto, nomeMeseMinuscolo, numero } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { ConErrore, ErroreCampo, FinestraModulo, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

// Icone della libreria adatte alle categorie (CMP-01).
const ICONE = ['house', 'zap', 'trash-2', 'sofa', 'wrench', 'utensils', 'shopping-cart', 'coffee', 'car', 'fuel', 'square-parking', 'shield', 'file-text', 'bus', 'repeat', 'tv', 'music',
  'laptop', 'smartphone', 'ticket', 'tree-palm', 'plane', 'bed', 'gamepad-2', 'heart', 'pill', 'stethoscope', 'glasses', 'package', 'shirt', 'gift', 'cat', 'landmark', 'credit-card', 'trending-up',
  'piggy-bank', 'banknote', 'briefcase', 'camera', 'refrigerator', 'globe', 'factory', 'percent', 'calculator', 'ellipsis'];

// SC-08 Categorie (decisione 8): albero con icona propria o presa dal padre.
export function Categorie() {
  const compatto = useCompatto();
  const rif = useRiferimenti();
  const spese = useDati<{ categoria_id: string; previste: string; uscite: string }[]>(`/categorie/spese?mese=${rif.mese}`).dati ?? [];
  const [tipo, setTipo] = useState<'uscita' | 'entrata'>('uscita');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [aperta, setAperta] = useState<Categoria | { padre: string | null } | null>(null);
  const tutte = rif.categorie;
  const figli = (id: string | null) => tutte.filter((c) => c.padre_id === id && c.tipo === tipo).sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome));
  // Previste e uscite di una categoria comprendono le sue sottocategorie, come il budget (decisione 71).
  const previsteDirette = new Map(spese.map((s) => [s.categoria_id, Number(s.previste)]));
  const usciteDirette = new Map(spese.map((s) => [s.categoria_id, Number(s.uscite)]));
  const somma = (diretti: Map<string, number>, id: string): number => (diretti.get(id) ?? 0) + tutte.filter((c) => c.padre_id === id).reduce((t, c) => t + somma(diretti, c.id), 0);
  // Peso sullo stipendio netto: manca o zero, niente percentuali.
  const stipendio = Number(rif.profilo?.stipendio_netto ?? 0);
  // Cifra con la percentuale sullo stipendio tra parentesi; cifra assente: trattino; senza stipendio: solo la cifra.
  const conPercentuale = (v: number) => (!v ? '—' : stipendio > 0 ? `${euro(v)} (${numero((v / stipendio) * 100, 1)}%)` : euro(v));
  const radici = (t: 'uscita' | 'entrata') => tutte.filter((c) => !c.padre_id && c.tipo === t).length;

  const righe: React.JSX.Element[] = [];
  const visita = (id: string | null, livello: number) => {
    for (const c of figli(id)) {
      const sotto = tutte.filter((x) => x.padre_id === c.id);
      const ramo = sotto.length ? (aperte.has(c.id) ? 'aperto' : 'chiuso') : 'foglia';
      const pr = somma(previsteDirette, c.id);
      const s = somma(usciteDirette, c.id);
      righe.push(<RigaCategoria key={c.id} livello={Math.min(livello, 2)} ramo={ramo} nome={c.nome} sottocategorie={sotto.length ? `${sotto.length} sottocategorie` : undefined}
        previste={conPercentuale(pr)} speso={conPercentuale(s)} icona={rif.iconaCategoria(c.id)} ereditata={!c.icona} colore={c.colore}
        onApriChiudi={() => { const n = new Set(aperte); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setAperte(n); }} onModifica={() => setAperta(c)}
        budget={c.budget ? conPercentuale(Number(c.budget.importo)) : undefined} budgetAttivo={c.budget?.attivo ?? true} />);
      if (ramo === 'aperto') visita(c.id, livello + 1);
    }
  };
  visita(null, 0);

  return (
    <>
      <Intestazione titolo="Categorie" sottotitolo="Le categorie dividono le tue spese. Su una categoria di uscite puoi mettere un budget: un limite di spesa del mese, che conta anche le sue sottocategorie. Previste: spese e rate del mese, quelle che si ripetono ogni più mesi divise per mese; Uscite: quelle vere. Tra parentesi il peso sullo stipendio netto."
        azioni={<Pulsante tipo="primario" etichetta="Nuova categoria" icona="plus" onPress={() => setAperta({ padre: null })} />} />
      <SceltaSegmenti etichetta="Uscite o entrate" valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'uscita', testo: `Uscite · ${radici('uscita')}` }, { valore: 'entrata', testo: `Entrate · ${radici('entrata')}` }]} />
      <Esito tono="informazione" testo="Icona piena: scelta per la categoria. Icona chiara: presa dalla categoria padre. Con la matita si cambiano nome, icona, colore e budget, e si elimina la categoria." />
      <Scheda>
        <View role="tree" aria-label="Categorie">
          {compatto ? null : <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1, paddingLeft: 76 }}>Categoria</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: LARGHEZZE_CATEGORIA.budget, textAlign: 'right' }}>Budget</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: LARGHEZZE_CATEGORIA.previste, textAlign: 'right' }}>{`Previste a ${nomeMeseMinuscolo(rif.mese)}`}</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: LARGHEZZE_CATEGORIA.uscite, textAlign: 'right' }}>{`Uscite a ${nomeMeseMinuscolo(rif.mese)}`}</Testo>
            <View style={{ width: LARGHEZZA_AZIONI_CATEGORIA }} />
          </View>}
          {righe}
        </View>
      </Scheda>
      <FinestraCategoria stato={aperta} tipo={tipo} onChiudi={() => setAperta(null)} />
    </>
  );
}

// Tavolozza fissa: un cerchio per colore più "nessuno". Il colore scelto ha l'anello e la spunta.
function SceltaColore({ valore, onCambia }: { valore: string | null; onCambia: (v: string | null) => void }) {
  const { c } = useTema();
  const lato = useCompatto() ? 44 : d['misura-tessera-media'];
  const cerchio = (codice: string | null, nome: string) => {
    const scelto = (valore ?? null)?.toLowerCase() === codice?.toLowerCase() || (!valore && !codice);
    return (
      <Pressable key={nome} accessibilityRole="radio" aria-checked={scelto} accessibilityLabel={nome} onPress={() => onCambia(codice)}
        style={(s: StatoPressione) => [{ width: lato, height: lato, borderRadius: lato / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: codice ?? 'transparent', borderWidth: codice ? 0 : d['misura-bordo'], borderColor: c['bordo-controllo'],
          outlineColor: scelto ? c['bordo-focus'] : 'transparent', outlineWidth: d['misura-bordo-forte'], outlineStyle: 'solid', outlineOffset: 2 } as object, anelloFocus(c, s.focused)]}>
        {scelto && codice ? <Check size={16} color={suColoreCategoria(codice)} strokeWidth={2.5} aria-hidden /> : null}
        {!codice ? <Icona nome="x" misura={16} colore="icona-tenue" /> : null}
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Colore" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-icona'], paddingVertical: d['spazio-testo'] }}>
      {cerchio(null, 'Nessun colore')}
      {coloriCategorie.map((k) => cerchio(k.codice, k.nome))}
    </View>
  );
}

function FinestraCategoria({ stato, tipo, onChiudi }: { stato: Categoria | { padre: string | null } | null; tipo: 'uscita' | 'entrata'; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const c = stato && 'id' in stato ? stato : null;
  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('nessuna');
  const [icona, setIcona] = useState('padre');
  const [colore, setColore] = useState<string | null>(null);
  const [sposta, setSposta] = useState<string | null>(null);
  const [inUso, setInUso] = useState(false);
  // Budget (decisione 71): solo per le categorie di uscita già esistenti. Cifra vuota: nessun budget (se c'era, si elimina).
  const [budgetImporto, setBudgetImporto] = useState('');
  const [budgetAttivo, setBudgetAttivo] = useState(true);
  const conBudget = !!c && c.tipo === 'uscita';
  // Cosa usa la categoria: spese, rate e sottocategorie. Se c'è qualcosa, alla cancellazione vanno spostate altrove.
  const spese = useDati<ElencoSpese>(c ? '/spese-previste' : null).dati;
  const rate = useDati<Rata[]>(c ? '/rate' : null).dati;
  const nSpese = c ? (spese?.spese.filter((s) => s.categoria_id === c.id).length ?? 0) : 0;
  const nRate = c ? (rate?.filter((x) => x.categoria_id === c.id).length ?? 0) : 0;
  const nSotto = c ? rif.categorie.filter((x) => x.padre_id === c.id).length : 0;
  const nUscite = c?.n_uscite ?? 0;
  const coinvolte = nSpese + nRate + nUscite + nSotto;
  const elenco = [nSpese ? `${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}` : null, nRate ? `${nRate} ${nRate === 1 ? 'rata' : 'rate'}` : null, nUscite ? `${nUscite} ${nUscite === 1 ? 'uscita' : 'uscite'}` : null, nSotto ? `${nSotto} ${nSotto === 1 ? 'sottocategoria' : 'sottocategorie'}` : null].filter(Boolean).join(', ');
  useEffect(() => {
    if (!stato) return;
    setNome(c?.nome ?? ''); setPadre(c?.padre_id ?? ('padre' in stato ? stato.padre : null) ?? 'nessuna'); setIcona(c?.icona ?? 'padre'); setColore(c?.colore ?? null); setSposta(null); setInUso(false);
    setBudgetImporto(importoInTesto(c?.budget?.importo)); setBudgetAttivo(c?.budget?.attivo ?? true);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), padre_id: padre === 'nessuna' ? null : padre, icona: icona === 'padre' ? null : icona, colore, ...(c ? {} : { tipo }) };
    // Prima si controlla la cifra del budget, poi si scrive: se è sbagliata non cambia niente.
    let tetto: string | null = null;
    if (conBudget && budgetImporto.trim()) {
      tetto = serve(leggiImporto(budgetImporto), 'Scrivi la cifra del budget, es. 250,00', 'budget');
      if (Number(tetto) <= 0) throw new ErroreCampo('budget', 'La cifra deve essere positiva: per togliere il budget svuota il campo');
    }
    if (c) await modifica(`/categorie/${c.id}`, corpo); else await crea('/categorie', corpo);
    if (!c || !conBudget) return;
    if (tetto === null) { if (c.budget) await cancella(`/budget/${c.budget.id}`); }
    else if (c.budget) await modifica(`/budget/${c.budget.id}`, { importo: tetto, attivo: budgetAttivo });
    else await crea('/budget', { importo: tetto, attivo: budgetAttivo, categoria_id: c.id });
  };
  const elimina = async () => {
    try { await cancella(`/categorie/${c!.id}${sposta ? `?sposta_su=${sposta}` : ''}`); }
    catch (e) {
      if ((e as { stato?: number }).stato === 409) {
        if (c!.budget) throw new Error('Questa categoria ha un budget: svuota prima la cifra del budget qui sopra, salva, poi elimina la categoria.');
        setInUso(true); throw new Error('La categoria è in uso: scegli dove spostare le voci nel campo «Sposta le voci su», poi premi di nuovo Elimina.');
      }
      throw e;
    }
  };
  const altre = opzioniCategorie(rif.categorie).filter((o) => o.valore !== c?.id);
  return (
    <FinestraModulo titolo={c ? c.nome : 'Nuova categoria'} icona={icona === 'padre' ? rif.iconaCategoria(padre === 'nessuna' ? null : padre) : icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={c ? elimina : undefined}
      confermaElimina={c ? { nome: `«${c.nome}»`,
        dettaglio: coinvolte || inUso ? `${elenco ? `${elenco} ${coinvolte === 1 ? 'passa' : 'passano'}` : 'Le voci collegate passano'} a «${rif.categoria(sposta)?.nome ?? ''}».` : 'Nessuna spesa, rata o uscita la usa.',
        controlla: () => ((coinvolte || inUso) && !sposta ? 'Scegli prima dove spostare le voci, nel campo «Sposta le voci su».' : null) } : undefined}>
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} autoFocus={!c} />
      <Tendina etichetta="Dentro" valore={padre} onCambia={setPadre} opzioni={[{ valore: 'nessuna', testo: 'Nessuna: categoria principale', rientro: 0 }, ...altre]} />
      <TendinaGriglia soloIcone etichetta="Icona" valore={icona} onCambia={setIcona} opzioni={[{ valore: 'padre', testo: 'Quella della categoria padre', icona: rif.iconaCategoria(padre === 'nessuna' ? null : padre) }, ...ICONE.map((i) => ({ valore: i, testo: i.replace(/-\d$/, '').replace(/-/g, ' '), icona: i }))]} />
      <Voce etichetta="Colore" aiuto={colore ? nomeColoreCategoria(colore) ?? undefined : 'Nessun colore'}>
        <SceltaColore valore={colore} onCambia={setColore} />
      </Voce>
      {conBudget ? (
        <View style={{ gap: d['spazio-testo'] }}>
          <ConErrore campo="budget"><Campo etichetta="Budget mensile" valore={budgetImporto} onCambia={setBudgetImporto} segnaposto="0,00" inputMode="decimal" /></ConErrore>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
            <Testo stile="dettaglio-forte" colore="testo-secondario">{budgetAttivo ? 'Attivo' : 'Non attivo'}</Testo>
            <Interruttore acceso={budgetAttivo} onCambia={setBudgetAttivo} etichetta="Budget attivo" />
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">Il budget è un limite di spesa del mese: se lo superi, si conta tutto lo stesso e lo vedi in rosso. Conta anche le sottocategorie. Per togliere il budget svuota la cifra e salva.</Testo>
        </View>
      ) : null}
      {c && (coinvolte || inUso) ? (
        <View style={{ gap: d['spazio-testo'] }}>
          <Tendina etichetta="Sposta le voci su" valore={sposta} onCambia={setSposta} opzioni={altre} />
          <Testo stile="dettaglio-normale" colore="testo-secondario">{coinvolte
            ? `Se elimini «${c.nome}»: ${elenco} ${coinvolte === 1 ? 'passa' : 'passano'} alla categoria che scegli qui.`
            : 'La categoria è in uso: scegli dove spostare le voci.'}</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
