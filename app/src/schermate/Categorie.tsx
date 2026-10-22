import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, Tendina } from '../componenti/campi.tsx';
import { Intestazione, RigaCategoria, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Categoria } from '../dati/tipi.ts';
import { euro, nomeMeseMinuscolo } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { FinestraModulo, serve } from './moduli.tsx';

// Icone della libreria adatte alle categorie (CMP-01).
const ICONE = ['house', 'zap', 'trash-2', 'sofa', 'wrench', 'utensils', 'shopping-cart', 'coffee', 'car', 'fuel', 'square-parking', 'shield', 'file-text', 'bus', 'repeat', 'tv', 'music',
  'laptop', 'smartphone', 'ticket', 'tree-palm', 'plane', 'bed', 'gamepad-2', 'heart', 'pill', 'stethoscope', 'glasses', 'package', 'shirt', 'gift', 'cat', 'landmark', 'credit-card', 'trending-up',
  'piggy-bank', 'banknote', 'briefcase', 'camera', 'refrigerator', 'globe', 'factory', 'percent', 'calculator', 'ellipsis'];

// SC-08 Categorie (decisione 8): albero con icona propria o presa dal padre.
export function Categorie() {
  const rif = useRiferimenti();
  const spese = useDati<{ categoria_id: string; speso: string }[]>(`/categorie/spese?mese=${rif.mese}`).dati ?? [];
  const [tipo, setTipo] = useState<'uscita' | 'entrata'>('uscita');
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [aperta, setAperta] = useState<Categoria | { padre: string | null } | null>(null);
  const tutte = rif.categorie;
  const figli = (id: string | null) => tutte.filter((c) => c.padre_id === id && c.tipo === tipo).sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome));
  const spesoDiretto = new Map(spese.map((s) => [s.categoria_id, Number(s.speso)]));
  const speso = (id: string): number => (spesoDiretto.get(id) ?? 0) + tutte.filter((c) => c.padre_id === id).reduce((t, c) => t + speso(c.id), 0);
  const radici = (t: 'uscita' | 'entrata') => tutte.filter((c) => !c.padre_id && c.tipo === t).length;

  const righe: React.JSX.Element[] = [];
  const visita = (id: string | null, livello: number) => {
    for (const c of figli(id)) {
      const sotto = tutte.filter((x) => x.padre_id === c.id);
      const ramo = sotto.length ? (aperte.has(c.id) ? 'aperto' : 'chiuso') : 'foglia';
      const s = speso(c.id);
      righe.push(<RigaCategoria key={c.id} livello={Math.min(livello, 2)} ramo={ramo} nome={c.nome} sottocategorie={sotto.length ? `${sotto.length} sottocategorie` : undefined}
        speso={s ? euro(s) : '—'} icona={rif.iconaCategoria(c.id)} ereditata={!c.icona} colore={c.colore}
        onApriChiudi={() => { const n = new Set(aperte); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setAperte(n); }} onModifica={() => setAperta(c)} />);
      if (ramo === 'aperto') visita(c.id, livello + 1);
    }
  };
  visita(null, 0);

  return (
    <>
      <Intestazione titolo="Categorie" sottotitolo="Ogni categoria ha un'icona: la vedi accanto a ogni spesa, budget e movimento."
        azioni={<Pulsante tipo="primario" etichetta="Nuova categoria" icona="plus" onPress={() => setAperta({ padre: null })} />} />
      <SceltaSegmenti etichetta="Uscite o entrate" valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'uscita', testo: `Uscite · ${radici('uscita')}` }, { valore: 'entrata', testo: `Entrate · ${radici('entrata')}` }]} />
      <Esito tono="informazione" testo="Icona piena: scelta per quella categoria. Icona grigia chiara: presa dalla categoria padre. I colori delle categorie sono ancora da scegliere." />
      <Scheda>
        <View role="tree" aria-label="Categorie">
          <View style={{ flexDirection: 'row', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ flex: 1, paddingLeft: 76 }}>Categoria</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: 120 }}>Colore</Testo>
            <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ width: 120, textAlign: 'right' }}>{`Speso a ${nomeMeseMinuscolo(rif.mese)}`}</Testo>
            <View style={{ width: 36 }} />
          </View>
          {righe}
        </View>
      </Scheda>
      <FinestraCategoria stato={aperta} tipo={tipo} onChiudi={() => setAperta(null)} />
    </>
  );
}

function FinestraCategoria({ stato, tipo, onChiudi }: { stato: Categoria | { padre: string | null } | null; tipo: 'uscita' | 'entrata'; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const c = stato && 'id' in stato ? stato : null;
  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('nessuna');
  const [icona, setIcona] = useState('padre');
  const [sposta, setSposta] = useState<string | null>(null);
  const [inUso, setInUso] = useState(false);
  useEffect(() => {
    if (!stato) return;
    setNome(c?.nome ?? ''); setPadre(c?.padre_id ?? ('padre' in stato ? stato.padre : null) ?? 'nessuna'); setIcona(c?.icona ?? 'padre'); setSposta(null); setInUso(false);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), padre_id: padre === 'nessuna' ? null : padre, icona: icona === 'padre' ? null : icona, ...(c ? {} : { tipo }) };
    if (c) await modifica(`/categorie/${c.id}`, corpo); else await crea('/categorie', corpo);
  };
  const elimina = async () => {
    try { await cancella(`/categorie/${c!.id}${sposta ? `?sposta_su=${sposta}` : ''}`); }
    catch (e) { if ((e as { stato?: number }).stato === 409) { setInUso(true); throw new Error('La categoria è in uso: scegli sotto dove spostare spese e movimenti, poi premi di nuovo Elimina.'); } throw e; }
  };
  const altre = opzioniCategorie(rif.categorie).filter((o) => o.valore !== c?.id);
  return (
    <FinestraModulo titolo={c ? c.nome : 'Nuova categoria'} icona={icona === 'padre' ? rif.iconaCategoria(padre === 'nessuna' ? null : padre) : icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={c ? elimina : undefined}>
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} autoFocus={!c} />
      <Tendina etichetta="Dentro" valore={padre} onCambia={setPadre} opzioni={[{ valore: 'nessuna', testo: 'Nessuna: categoria principale', rientro: 0 }, ...altre]} />
      <Tendina etichetta="Icona" valore={icona} onCambia={setIcona} opzioni={[{ valore: 'padre', testo: 'Quella della categoria padre', icona: rif.iconaCategoria(padre === 'nessuna' ? null : padre) }, ...ICONE.map((i) => ({ valore: i, testo: i.replace(/-\d$/, '').replace(/-/g, ' '), icona: i }))]} />
      {inUso ? <Tendina etichetta="Sposta spese, movimenti e sottocategorie su" valore={sposta} onCambia={setSposta} opzioni={altre} /> : null}
    </FinestraModulo>
  );
}
