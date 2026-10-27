import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Esito, Pulsante, PulsanteIcona, SceltaSegmenti, Tessera } from '../componenti/base.tsx';
import { Campo, CampoData, MenuScelta, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { CausaMovimento, ElencoMovimenti, MovimentoElenco } from '../dati/tipi.ts';
import { dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

// Movimenti (decisioni 48 e 51): tutto ciò che ha mosso i conti che vedi, dal più recente: spunte di spese e rate, versamenti e
// prelievi dei salvadanai, giroconti e uscite dei budget. Ogni riga va «Da → A»: da un conto a un altro (giroconto), da un conto a
// «Uscita» (i soldi escono) o da «Entrata» a un conto (i soldi arrivano). Con un conto scelto si vedono i movimenti in cui è sorgente
// o destinazione, con il segno visto da quel conto. Chi ha fatto cosa, e in grigio «già nel saldo» ciò che è stato registrato prima
// del saldo di partenza del conto (e quindi nel saldo scritto a mano c'è già). «Nuovo movimento» (decisione 53) scrive a mano un'entrata,
// un'uscita o un giroconto; le righe scritte a mano (e solo quelle) hanno matita e cestino.

// Il filtro scelto resta finché non si ricarica la pagina ('tutti', 'senza' o l'id di un conto; 'tutti' o AAAA-MM per il mese).
let ultimoConto = 'tutti';
let ultimoMese = 'tutti';
// Da Conti: «Tutti i movimenti» apre la pagina già sul conto.
export const filtraMovimentiPerConto = (id: string) => { ultimoConto = id; ultimoMese = 'tutti'; };

// «Da» e «A» di una riga: il conto per nome, «Entrata» / «Uscita» quando l'altro capo è Niente, «Senza conto» per un'uscita di budget senza conto.
export const dalConto = (x: Pick<MovimentoElenco, 'da' | 'da_niente' | 'da_senza_conto'>) => (x.da_niente ? 'Entrata' : x.da_senza_conto ? 'Senza conto' : x.da ?? 'Un altro conto');
export const alConto = (x: Pick<MovimentoElenco, 'a' | 'a_niente'>) => (x.a_niente ? 'Uscita' : x.a ?? 'Un altro conto');

const ICONE: Record<CausaMovimento, string> = { spesa: 'calendar-check', rata: 'credit-card', versamento: 'piggy-bank', giroconto: 'arrow-left-right', budget: 'wallet', a_mano: 'pencil' };
const CAUSE: Record<CausaMovimento, string> = { spesa: 'Spesa', rata: 'Rata', versamento: 'Salvadanaio', giroconto: 'Giroconto', budget: 'Budget', a_mano: 'A mano' };

export function Movimenti() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const [contoScelto, setContoScelto] = useState(ultimoConto);
  const [meseScelto, setMeseScelto] = useState(ultimoMese);
  const [aperto, setAperto] = useState<MovimentoElenco | 'nuovo' | null>(null);
  const scegliConto = (v: string) => { ultimoConto = v; ultimoMese = 'tutti'; setContoScelto(v); setMeseScelto('tutti'); };
  const scegliMese = (v: string) => { ultimoMese = v; setMeseScelto(v); };
  const conti = rif.conti;
  const conto = conti.find((x) => x.id === contoScelto) ?? null;
  const filtroConto = contoScelto === 'senza' ? 'senza' : conto ? conto.id : 'tutti';
  const parametri = [filtroConto !== 'tutti' ? `conto=${filtroConto}` : '', meseScelto !== 'tutti' ? `mese=${meseScelto}` : '', 'limite=300'].filter(Boolean).join('&');
  const { dati, errore } = useDati<ElencoMovimenti>(`/movimenti?${parametri}`);
  if (!dati) return <Caricamento errore={errore} />;

  const titolo = filtroConto === 'senza' ? 'Senza conto' : conto ? conto.nome : 'Tutti i conti';
  // Il saldo attuale: quello del conto scelto, o la somma dei saldi dei conti non archiviati che ne hanno uno.
  const visibili = conti.filter((x) => !x.archiviato && x.saldo !== null);
  const saldo = filtroConto === 'senza' ? null : conto ? (conto.saldo === null ? null : Number(conto.saldo)) : visibili.length ? visibili.reduce((t, x) => t + Number(x.saldo), 0) : null;
  const mesi = dati.mesi;
  const meseValido = meseScelto === 'tutti' || mesi.includes(meseScelto) ? meseScelto : 'tutti';
  // Il segno lo dà l'API (visto dal filtro): un giroconto tra due conti tuoi con «Tutti i conti» vale 0, non è né entrata né uscita.
  const contano = dati.movimenti.filter((x) => x.conta);
  const uscite = contano.filter((x) => x.segno < 0).reduce((t, x) => t + Number(x.importo), 0);
  const entrate = contano.filter((x) => x.segno > 0).reduce((t, x) => t + Number(x.importo), 0);

  return (
    <>
      <Intestazione titolo="Movimenti" sottotitolo="Tutto ciò che ha mosso i tuoi conti, da un conto a un altro, verso un'uscita o da un'entrata. In grigio quello che nel saldo scritto a mano c'è già."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo movimento" icona="plus" onPress={() => setAperto('nuovo')} />} />
      <RigaNumeri>
        <NumeroChiave etichetta={titolo} valore={saldo === null ? '—' : euro(saldo)} icona="wallet" nota={saldo === null && filtroConto !== 'senza' ? 'Nessun saldo scritto: lo scrivi in Conti' : `${dati.movimenti.length} ${dati.movimenti.length === 1 ? 'movimento' : 'movimenti'}${dati.movimenti.length >= 300 ? ' (i più recenti)' : ''}`}
          titolo={(
            <MenuScelta valore={filtroConto} onCambia={scegliConto} larghezzaMinima={240}
              opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona })), { valore: 'senza', testo: 'Senza conto', icona: 'circle-x' }]}>
              {({ ref, apri, aperto }) => (
                <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${titolo}`} aria-expanded={aperto} onPress={apri}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                  <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{titolo}</Testo>
                  <Icona nome="chevron-down" misura={16} />
                </Pressable>
              )}
            </MenuScelta>
          )} />
        <NumeroChiave etichetta="Usciti" valore={euro(uscite)} icona="arrow-up-right" nota={meseValido === 'tutti' ? 'Dentro il saldo, in tutto l\'elenco' : `Dentro il saldo, ${nomeMese(meseValido).toLowerCase()}`} />
        <NumeroChiave etichetta="Entrati" valore={euro(entrate)} icona="arrow-down-left" nota={meseValido === 'tutti' ? 'Dentro il saldo, in tutto l\'elenco' : `Dentro il saldo, ${nomeMese(meseValido).toLowerCase()}`} />
      </RigaNumeri>
      <View style={{ width: compatto ? undefined : 300 }}>
        <Tendina etichetta="Mese" valore={meseValido} iconaPrima="calendar" onCambia={scegliMese}
          opzioni={[{ valore: 'tutti', testo: 'Tutti i mesi' }, ...mesi.map((m) => ({ valore: m, testo: m === dati.mese_in_corso ? `${nomeMese(m)} · in corso` : nomeMese(m) }))]} />
      </View>
      <Scheda>
        {dati.movimenti.length === 0 ? <Vuoto testo="Nessun movimento con questi filtri." /> : (
          <View>
            {dati.movimenti.map((x) => <RigaMovimento key={x.id} x={x} onModifica={() => setAperto(x)} />)}
          </View>
        )}
      </Scheda>
      <FinestraMovimento movimento={aperto} contoDiBase={conto?.id ?? null} onChiudi={() => setAperto(null)} />
    </>
  );
}

// Una riga dell'elenco: icona, descrizione, data e ora · causa · da → a · chi, importo. Le righe scritte a mano hanno matita e cestino.
function RigaMovimento({ x, onModifica }: { x: MovimentoElenco; onModifica: () => void }) {
  const compatto = useCompatto();
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const grigio = !x.conta;
  const togli = async () => {
    setChiede(false);
    try { await cancella(`/movimenti/${x.id}`); } catch (e) { setErrore((e as Error).message); }
  };
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], minHeight: compatto ? 56 : undefined }}>
        <Tessera icona={ICONE[x.causa]} misura="piccola" tono="neutro" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" colore={grigio ? 'testo-terziario' : 'testo-primario'} numberOfLines={compatto ? 2 : 1}>{x.descrizione}</Testo>
          <Testo stile="dettaglio-normale" colore={grigio ? 'testo-terziario' : 'testo-secondario'} numberOfLines={compatto ? 3 : 1}>
            {[dataOra(x.momento), CAUSE[x.causa], x.categoria, `${dalConto(x)} → ${alConto(x)}`, x.utente ? `di ${x.utente}` : null, grigio ? 'già nel saldo' : null].filter(Boolean).join(' · ')}</Testo>
        </View>
        <Testo stile="corpo-forte" colore={grigio ? 'testo-terziario' : x.segno < 0 ? 'testo-errore' : x.segno > 0 ? 'testo-ok' : 'testo-secondario'}>
          {x.segno === 0 ? euro(x.importo) : euro(`${x.segno < 0 ? '-' : ''}${x.importo}`, { segno: true })}</Testo>
        {x.modificabile ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PulsanteIcona icona="pencil" etichetta={`Modifica ${x.descrizione}`} fantasma onPress={onModifica} />
            <PulsanteIcona icona="trash-2" etichetta={`Elimina ${x.descrizione}`} fantasma onPress={() => setChiede(true)} />
          </View>
        ) : null}
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <ConfermaFinestra aperta={chiede} titolo="Eliminare questo movimento?" testo={`${x.descrizione}, ${euro(x.importo)}: il saldo dei conti torna com'era prima.`} tono="pericolo" etichettaConferma="Elimina"
        onAnnulla={() => setChiede(false)} onConferma={togli} />
    </View>
  );
}

export type TipoMano = 'entrata' | 'uscita' | 'giroconto';
const adesso = () => { const t = new Date(); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const leggiOra = (testo: string): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(testo.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
const tipoDi = (x: MovimentoElenco): TipoMano => (x.da_niente ? 'entrata' : x.a_niente ? 'uscita' : 'giroconto');

// «Nuovo movimento» / «Modifica movimento» (decisione 53): tipo, importo, conto (o i due conti), giorno e ora (di base adesso), descrizione e,
// per le uscite, la categoria facoltativa (se ha un budget l'uscita conta nel suo speso). Entrata = Niente → conto, uscita = conto → Niente,
// giroconto = conto → conto. I mesi passati sono bloccati. Le tendine non mostrano mai «Niente». `tipoDiBase` è il tipo proposto per un movimento
// nuovo (da Budget si apre già su Giroconto, decisione 57).
export function FinestraMovimento({ movimento, contoDiBase, tipoDiBase = 'uscita', onChiudi }: { movimento: MovimentoElenco | 'nuovo' | null; contoDiBase: string | null; tipoDiBase?: TipoMano; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const esistente = movimento && movimento !== 'nuovo' ? movimento : null;
  const [tipo, setTipo] = useState<TipoMano>('uscita');
  const [importo, setImporto] = useState('');
  const [contoA, setContoA] = useState('');     // il conto di un'entrata o di un'uscita, oppure la sorgente del giroconto
  const [contoB, setContoB] = useState('');     // la destinazione del giroconto
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [categoria, setCategoria] = useState('');
  useEffect(() => {
    if (!movimento) return;
    if (esistente) {
      const t = new Date(esistente.momento);
      const tp = tipoDi(esistente);
      setTipo(tp); setImporto(importoInTesto(esistente.importo));
      setContoA((tp === 'entrata' ? esistente.a_conto_id : esistente.da_conto_id) ?? ''); setContoB(tp === 'giroconto' ? esistente.a_conto_id ?? '' : '');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`));
      setOra(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
      setDescrizione(esistente.descrizione); setCategoria(esistente.categoria_id ?? '');
    } else {
      const t = new Date();
      setTipo(tipoDiBase); setImporto(''); setContoA(contoDiBase ?? ''); setContoB('');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)); setOra(adesso());
      setDescrizione(''); setCategoria('');
    }
  }, [movimento]);   // eslint-disable-line react-hooks/exhaustive-deps
  const conti = rif.conti.filter((c) => !c.archiviato || c.id === contoA || c.id === contoB);
  const opzioniConti = conti.map((c) => ({ valore: c.id, testo: c.nome, icona: c.icona }));
  const salva = async () => {
    const soldi = serve(leggiImporto(importo), 'Scrivi l\'importo, es. 12,50', 'importo');
    if (!(Number(soldi) > 0)) throw new ErroreCampo('importo', "L'importo deve essere positivo");
    const corpo: Record<string, unknown> = { tipo, importo: soldi };
    if (tipo === 'giroconto') {
      corpo.da_conto_id = serve(contoA, 'Scegli il conto da cui partono i soldi', 'da');
      corpo.a_conto_id = serve(contoB, 'Scegli il conto su cui arrivano', 'a');
      if (contoA === contoB) throw new ErroreCampo('a', 'I due conti devono essere diversi');
    } else corpo.conto_id = serve(contoA, tipo === 'entrata' ? 'Scegli il conto su cui arrivano i soldi' : 'Scegli il conto da cui escono i soldi', 'conto');
    corpo.data = serve(leggiData(giorno), 'Scegli il giorno', 'giorno');
    corpo.ora = serve(leggiOra(ora), 'Scrivi l\'ora, es. 14:35', 'ora');
    corpo.descrizione = descrizione.trim() || undefined;
    corpo.categoria_id = tipo === 'uscita' ? categoria || null : null;
    if (esistente) await modifica(`/movimenti/${esistente.id}`, { ...corpo, descrizione: descrizione.trim() });
    else await crea('/movimenti', corpo);
  };
  const elimina = esistente ? async () => { await cancella(`/movimenti/${esistente.id}`); } : undefined;
  const conBudget = tipo === 'uscita' && categoria ? rif.categoria(categoria)?.budget : null;
  return (
    <FinestraModulo titolo={esistente ? 'Modifica movimento' : 'Nuovo movimento'} icona="arrow-left-right" aperta={!!movimento} onChiudi={onChiudi} onSalva={salva} onElimina={elimina}
      etichettaSalva={esistente ? 'Salva' : 'Aggiungi'} confermaElimina={esistente ? { nome: esistente.descrizione, dettaglio: 'Il saldo dei conti torna com\'era prima.' } : undefined}>
      <Voce etichetta="Che movimento è">
        <SceltaSegmenti etichetta="Tipo di movimento" valore={tipo} onCambia={setTipo} larghezzaPiena
          opzioni={[{ valore: 'entrata', testo: 'Entrata' }, { valore: 'uscita', testo: 'Uscita' }, { valore: 'giroconto', testo: 'Giroconto' }]} />
      </Voce>
      <ConErrore campo="importo"><Campo etichetta="Importo" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus /></ConErrore>
      {tipo === 'giroconto' ? (
        <Affiancati>
          <Meta><ConErrore campo="da"><Tendina etichetta="Da quale conto" valore={contoA} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setContoA} opzioni={opzioniConti} /></ConErrore></Meta>
          <Meta><ConErrore campo="a"><Tendina etichetta="Verso quale conto" valore={contoB} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setContoB} opzioni={opzioniConti} /></ConErrore></Meta>
        </Affiancati>
      ) : (
        <ConErrore campo="conto"><Tendina etichetta={tipo === 'entrata' ? 'Su quale conto' : 'Da quale conto'} valore={contoA} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setContoA} opzioni={opzioniConti} /></ConErrore>
      )}
      <Affiancati>
        <Meta><ConErrore campo="giorno"><CampoData etichetta="Giorno" valore={giorno} onCambia={setGiorno} /></ConErrore></Meta>
        <Meta><ConErrore campo="ora"><Campo etichetta="Ora" valore={ora} onCambia={setOra} segnaposto="14:35" inputMode="numeric" iconaPrima="calendar-clock" /></ConErrore></Meta>
      </Affiancati>
      <Testo stile="dettaglio-normale" colore="testo-secondario">Di base è adesso. Non si scrivono né si cambiano movimenti di un mese già passato.</Testo>
      <Campo etichetta="Descrizione (facoltativa)" valore={descrizione} onCambia={setDescrizione} segnaposto={tipo === 'entrata' ? 'Es. stipendio' : tipo === 'uscita' ? 'Es. spesa al mercato' : 'Es. bonifico tra i miei conti'} />
      {tipo === 'uscita' ? (
        <Tendina etichetta="Categoria (facoltativa)" valore={categoria} segnaposto="Nessuna categoria" iconaPrima="tags" onCambia={setCategoria}
          opzioni={[{ valore: '', testo: 'Nessuna categoria' }, ...opzioniCategorie(rif.categorie, 'uscita')]} />
      ) : null}
      {conBudget ? <Testo stile="dettaglio-normale" colore="testo-secondario">Questa categoria ha un budget: l'uscita conta nel suo speso.</Testo> : null}
    </FinestraModulo>
  );
}
