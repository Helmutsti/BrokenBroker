import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { anelloFocus, Esito, Pulsante, SceltaSegmenti, type StatoPressione } from '../componenti/base.tsx';
import { Icona } from '../componenti/Icona.tsx';
import { Check } from 'lucide-react-native';
import { coloriCategorie, nomeColoreCategoria, suColoreCategoria } from '../tema/token.ts';
import { Campo, Tendina, TendinaGriglia } from '../componenti/campi.tsx';
import { Intestazione, RigaCategoria, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Categoria, ElencoSpese, Rata } from '../dati/tipi.ts';
import { euro, nomeMeseMinuscolo, numero } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { FinestraModulo, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

// Icone della libreria adatte alle categorie (CMP-01).
const ICONE = ['house', 'zap', 'trash-2', 'sofa', 'wrench', 'utensils', 'shopping-cart', 'coffee', 'car', 'fuel', 'square-parking', 'shield', 'file-text', 'bus', 'repeat', 'tv', 'music',
  'laptop', 'smartphone', 'ticket', 'tree-palm', 'plane', 'bed', 'gamepad-2', 'heart', 'pill', 'stethoscope', 'glasses', 'package', 'shirt', 'gift', 'cat', 'landmark', 'credit-card', 'trending-up',
  'piggy-bank', 'banknote', 'briefcase', 'camera', 'refrigerator', 'globe', 'factory', 'percent', 'calculator', 'ellipsis'];

// SC-08 Categorie (decisione 8): albero con icona propria o presa dal padre.
export function Categorie() {
  const compatto = useCompatto();
  const rif = useRiferimenti();
  const spese = useDati<{ categoria_id: string; speso: string }[]>(`/categorie/spese?mese=${rif.mese}`).dati ?? [];
  const [tipo, setTipo] = useState<'uscita' | 'entrata'>('uscita');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [aperta, setAperta] = useState<Categoria | { padre: string | null } | null>(null);
  const tutte = rif.categorie;
  const figli = (id: string | null) => tutte.filter((c) => c.padre_id === id && c.tipo === tipo).sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome));
  const spesoDiretto = new Map(spese.map((s) => [s.categoria_id, Number(s.speso)]));
  const speso = (id: string): number => (spesoDiretto.get(id) ?? 0) + tutte.filter((c) => c.padre_id === id).reduce((t, c) => t + speso(c.id), 0);
  // Peso sullo stipendio netto: manca o zero, niente percentuali.
  const stipendio = Number(rif.profilo?.stipendio_netto ?? 0);
  const radici = (t: 'uscita' | 'entrata') => tutte.filter((c) => !c.padre_id && c.tipo === t).length;

  const righe: React.JSX.Element[] = [];
  const visita = (id: string | null, livello: number) => {
    for (const c of figli(id)) {
      const sotto = tutte.filter((x) => x.padre_id === c.id);
      const ramo = sotto.length ? (aperte.has(c.id) ? 'aperto' : 'chiuso') : 'foglia';
      const s = speso(c.id);
      righe.push(<RigaCategoria key={c.id} livello={Math.min(livello, 2)} ramo={ramo} nome={c.nome} sottocategorie={sotto.length ? `${sotto.length} sottocategorie` : undefined}
        speso={s ? euro(s) : '—'} percentuale={s && stipendio > 0 ? `${numero((s / stipendio) * 100, 1)}%` : '—'} icona={rif.iconaCategoria(c.id)} ereditata={!c.icona} colore={c.colore}
        onApriChiudi={() => { const n = new Set(aperte); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setAperte(n); }} onModifica={() => setAperta(c)} />);
      if (ramo === 'aperto') visita(c.id, livello + 1);
    }
  };
  visita(null, 0);

  return (
    <>
      <Intestazione titolo="Categorie" sottotitolo="Ogni categoria ha un'icona: la vedi accanto a ogni spesa e budget."
        azioni={<Pulsante tipo="primario" etichetta="Nuova categoria" icona="plus" onPress={() => setAperta({ padre: null })} />} />
      <SceltaSegmenti etichetta="Uscite o entrate" valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'uscita', testo: `Uscite · ${radici('uscita')}` }, { valore: 'entrata', testo: `Entrate · ${radici('entrata')}` }]} />
      <Esito tono="informazione" testo="Icona piena: scelta per quella categoria. Icona grigia chiara: presa dalla categoria padre (se la categoria non ha un colore). Se la categoria ha un colore, l’icona lo mantiene, anche quando è presa dal padre. Il colore si sceglie con la matita." />
      <Scheda>
        <View role="tree" aria-label="Categorie">
          {compatto ? null : <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1, paddingLeft: 76 }}>Categoria</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: 120, textAlign: 'right' }}>{`Spese a ${nomeMeseMinuscolo(rif.mese)}`}</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: 80, textAlign: 'right' }}>% stipendio</Testo>
            <View style={{ width: 36 }} />
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
  // Cosa usa la categoria: spese, rate e sottocategorie. Se c'è qualcosa, alla cancellazione vanno spostate altrove.
  const spese = useDati<ElencoSpese>(c ? '/spese-previste' : null).dati;
  const rate = useDati<Rata[]>(c ? '/rate' : null).dati;
  const nSpese = c ? (spese?.spese.filter((s) => s.categoria_id === c.id).length ?? 0) : 0;
  const nRate = c ? (rate?.filter((x) => x.categoria_id === c.id).length ?? 0) : 0;
  const nSotto = c ? rif.categorie.filter((x) => x.padre_id === c.id).length : 0;
  const coinvolte = nSpese + nRate + nSotto;
  const elenco = [nSpese ? `${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}` : null, nRate ? `${nRate} ${nRate === 1 ? 'rata' : 'rate'}` : null, nSotto ? `${nSotto} ${nSotto === 1 ? 'sottocategoria' : 'sottocategorie'}` : null].filter(Boolean).join(', ');
  useEffect(() => {
    if (!stato) return;
    setNome(c?.nome ?? ''); setPadre(c?.padre_id ?? ('padre' in stato ? stato.padre : null) ?? 'nessuna'); setIcona(c?.icona ?? 'padre'); setColore(c?.colore ?? null); setSposta(null); setInUso(false);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), padre_id: padre === 'nessuna' ? null : padre, icona: icona === 'padre' ? null : icona, colore, ...(c ? {} : { tipo }) };
    if (c) await modifica(`/categorie/${c.id}`, corpo); else await crea('/categorie', corpo);
  };
  const elimina = async () => {
    try { await cancella(`/categorie/${c!.id}${sposta ? `?sposta_su=${sposta}` : ''}`); }
    catch (e) { if ((e as { stato?: number }).stato === 409) { setInUso(true); throw new Error('La categoria è in uso: scegli dove spostare le voci nel campo «Sposta spese e sottocategorie su», poi premi di nuovo Elimina.'); } throw e; }
  };
  const altre = opzioniCategorie(rif.categorie).filter((o) => o.valore !== c?.id);
  return (
    <FinestraModulo titolo={c ? c.nome : 'Nuova categoria'} icona={icona === 'padre' ? rif.iconaCategoria(padre === 'nessuna' ? null : padre) : icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={c ? elimina : undefined}
      confermaElimina={c ? { nome: `«${c.nome}»`,
        dettaglio: coinvolte || inUso ? `${elenco ? `${elenco} ${coinvolte === 1 ? 'passa' : 'passano'}` : 'Le voci collegate passano'} a «${rif.categoria(sposta)?.nome ?? ''}».` : 'Nessuna spesa o rata la usa.',
        controlla: () => ((coinvolte || inUso) && !sposta ? 'Scegli prima dove spostare le voci, nel campo «Sposta spese e sottocategorie su».' : null) } : undefined}>
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} autoFocus={!c} />
      <Tendina etichetta="Dentro" valore={padre} onCambia={setPadre} opzioni={[{ valore: 'nessuna', testo: 'Nessuna: categoria principale', rientro: 0 }, ...altre]} />
      <TendinaGriglia soloIcone etichetta="Icona" valore={icona} onCambia={setIcona} opzioni={[{ valore: 'padre', testo: 'Quella della categoria padre', icona: rif.iconaCategoria(padre === 'nessuna' ? null : padre) }, ...ICONE.map((i) => ({ valore: i, testo: i.replace(/-\d$/, '').replace(/-/g, ' '), icona: i }))]} />
      <Voce etichetta="Colore" aiuto={colore ? nomeColoreCategoria(colore) ?? undefined : 'Nessun colore'}>
        <SceltaColore valore={colore} onCambia={setColore} />
      </Voce>
      {c && (coinvolte || inUso) ? (
        <View style={{ gap: d['spazio-testo'] }}>
          <Tendina etichetta="Sposta spese e sottocategorie su" valore={sposta} onCambia={setSposta} opzioni={altre} />
          <Testo stile="dettaglio-normale" colore="testo-secondario">{coinvolte
            ? `Se elimini «${c.nome}»: ${elenco} ${coinvolte === 1 ? 'passa' : 'passano'} alla categoria che scegli qui.`
            : 'La categoria è in uso: scegli dove spostare le voci.'}</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
