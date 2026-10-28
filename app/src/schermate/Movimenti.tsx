import { useEffect, useState } from 'react';
import { leggiScelta, salvaScelta } from '../dati/preferenze';
import { View } from 'react-native';
import { Esito, Pulsante, PulsanteIcona, SceltaSegmenti, Tessera } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoMovimenti, Movimento, TipoMovimento } from '../dati/tipi.ts';
import { dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

// Movimenti (decisione 61): le transazioni dei conti, dal più recente. Ogni riga va «Da → A»: da un conto a un altro (spostamento), da un
// conto verso fuori («Uscita») o da fuori su un conto («Entrata»). Le scrive la spunta di una spesa o di una rata (si cambiano togliendo la
// spunta) oppure si scrivono a mano, anche dai budget. Le categorie contano solo per entrate e uscite: uno spostamento non è una spesa.
// Con un conto scelto si vedono le transazioni da o verso quel conto, con il segno visto da lui. Chi ha fatto cosa; le righe scritte
// a mano da chi guarda hanno matita e cestino.

// Il filtro scelto resta finché non si ricarica la pagina ('tutti', 'senza' o l'id di un conto; 'tutti' o AAAA-MM per il mese).
let ultimoConto = 'tutti';
let ultimoMese = 'tutti';

const ICONE: Record<TipoMovimento, string> = { entrata: 'arrow-down-left', uscita: 'arrow-up-right', spostamento: 'arrow-left-right' };

// «Da» e «A» di una riga: il conto per nome, «Entrata» / «Uscita» per il fuori, «Senza conto» se un'entrata o un'uscita non ne ha.
const dalConto = (x: Movimento) => x.da ?? (x.tipo === 'entrata' ? 'Entrata' : 'Senza conto');
const alConto = (x: Movimento) => x.a ?? (x.tipo === 'uscita' ? 'Uscita' : 'Senza conto');
// Il segno visto dal filtro: con un conto scelto uno spostamento esce (−) o entra (+); con tutti i conti non è né l'uno né l'altro (0).
const segnoDi = (x: Movimento, filtro: string) =>
  x.tipo === 'entrata' ? 1 : x.tipo === 'uscita' ? -1 : filtro === x.da_conto_id ? -1 : filtro === x.a_conto_id ? 1 : 0;

export function Movimenti() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const [contoScelto, setContoScelto] = useState(ultimoConto);
  const [meseScelto, setMeseScelto] = useState(ultimoMese);
  const [aperto, setAperto] = useState<Movimento | 'nuovo' | null>(null);
  useEffect(() => { leggiScelta('movimenti.conto').then((v) => { if (v && ultimoConto === 'tutti') { ultimoConto = v; setContoScelto(v); } }); }, []);
  const scegliConto = (v: string) => { ultimoConto = v; ultimoMese = 'tutti'; setContoScelto(v); setMeseScelto('tutti'); salvaScelta('movimenti.conto', v); };
  const scegliMese = (v: string) => { ultimoMese = v; setMeseScelto(v); };
  const conti = rif.conti;
  const conto = conti.find((x) => x.id === contoScelto) ?? null;
  const filtroConto = contoScelto === 'senza' ? 'senza' : conto ? conto.id : 'tutti';
  const parametri = [filtroConto !== 'tutti' ? `conto=${filtroConto}` : '', meseScelto !== 'tutti' ? `mese=${meseScelto}` : '', 'limite=300'].filter(Boolean).join('&');
  const { dati, errore } = useDati<ElencoMovimenti>(`/movimenti?${parametri}`);
  if (!dati) return <Caricamento errore={errore} />;

  const mesi = dati.mesi;
  const meseValido = meseScelto === 'tutti' || mesi.includes(meseScelto) ? meseScelto : 'tutti';
  // Con un conto scelto gli spostamenti contano per lui (in uscita o in entrata); con tutti i conti no: restano dentro.
  const uscite = dati.movimenti.filter((x) => segnoDi(x, filtroConto) < 0).reduce((t, x) => t + Number(x.importo), 0);
  const entrate = dati.movimenti.filter((x) => segnoDi(x, filtroConto) > 0).reduce((t, x) => t + Number(x.importo), 0);
  const dove = meseValido === 'tutti' ? 'In tutto l\'elenco' : nomeMese(meseValido);
  const quanti = `${dati.movimenti.length} ${dati.movimenti.length === 1 ? 'movimento' : 'movimenti'}${dati.movimenti.length >= 300 ? ' (i più recenti)' : ''}`;
  const comeContano = conto ? `spostamenti di ${conto.nome} compresi` : 'spostamenti tra conti esclusi';

  return (
    <>
      <Intestazione titolo="Movimenti" sottotitolo="Le transazioni dei tuoi conti: dalle spunte delle spese e delle rate, dai budget o scritte a mano. Entrate, uscite e spostamenti tra conti."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo movimento" icona="plus" onPress={() => setAperto('nuovo')} />} />
      <RigaNumeri>
        <NumeroChiave etichetta="Usciti" valore={euro(uscite)} icona="arrow-up-right" nota={`${dove} · ${comeContano} · ${quanti}`} />
        <NumeroChiave etichetta="Entrati" valore={euro(entrate)} icona="arrow-down-left" nota={`${dove} · ${comeContano}`} />
      </RigaNumeri>
      <View style={{ flexDirection: compatto ? 'column' : 'row', gap: d['spazio-colonne'] }}>
        <View style={{ width: compatto ? undefined : 300 }}>
          <Tendina etichetta="Conto" valore={filtroConto} iconaPrima="landmark" onCambia={scegliConto}
            opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...opzioniConti(conti), { valore: 'senza', testo: 'Senza conto', icona: 'circle-x' }]} />
        </View>
        <View style={{ width: compatto ? undefined : 300 }}>
          <Tendina etichetta="Mese" valore={meseValido} iconaPrima="calendar" onCambia={scegliMese}
            opzioni={[{ valore: 'tutti', testo: 'Tutti i mesi' }, ...mesi.map((m) => ({ valore: m, testo: m === dati.mese_in_corso ? `${nomeMese(m)} · in corso` : nomeMese(m) }))]} />
        </View>
      </View>
      <Scheda>
        {dati.movimenti.length === 0 ? <Vuoto testo="Nessun movimento con questi filtri." /> : (
          <View>
            {dati.movimenti.map((x) => <RigaMovimento key={x.id} x={x} filtro={filtroConto} onModifica={() => setAperto(x)} />)}
          </View>
        )}
      </Scheda>
      <FinestraMovimento movimento={aperto} contoDiBase={conto?.id ?? null} onChiudi={() => setAperto(null)} />
    </>
  );
}

// Una riga dell'elenco: icona, descrizione, data e ora · da → a · categoria · da una spunta · chi, importo con il segno visto dal filtro.
// Le righe scritte a mano da chi guarda hanno matita e cestino; quelle nate da una spunta si cambiano togliendo la spunta.
function RigaMovimento({ x, filtro, onModifica }: { x: Movimento; filtro: string; onModifica: () => void }) {
  const compatto = useCompatto();
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const togli = async () => {
    setChiede(false);
    try { await cancella(`/movimenti/${x.id}`); } catch (e) { setErrore((e as Error).message); }
  };
  const segno = segnoDi(x, filtro);
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], minHeight: compatto ? 56 : undefined }}>
        <Tessera icona={x.da_spunta ? 'calendar-check' : x.budget_id ? 'wallet' : ICONE[x.tipo]} misura="piccola" tono="neutro" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" numberOfLines={compatto ? 2 : 1}>{x.descrizione}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={compatto ? 3 : 1}>
            {[dataOra(x.momento), `${dalConto(x)} → ${alConto(x)}`, x.categoria, x.da_spunta ? 'da una spunta: si cambia togliendo la spunta' : null, x.utente ? `di ${x.utente}` : null].filter(Boolean).join(' · ')}</Testo>
        </View>
        <Testo stile="corpo-forte" colore={segno < 0 ? 'testo-errore' : segno > 0 ? 'testo-ok' : 'testo-secondario'}>
          {segno === 0 ? euro(x.importo) : euro(`${segno < 0 ? '-' : ''}${x.importo}`, { segno: true })}</Testo>
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

const adesso = () => { const t = new Date(); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const leggiOra = (testo: string): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(testo.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

// «Nuovo movimento» / «Modifica movimento» (decisione 61): entrata (da fuori su un conto), uscita (da un conto verso fuori) o spostamento
// (tra due conti diversi), importo, giorno e ora (di base adesso), descrizione e, per entrate e uscite, la categoria facoltativa (un'uscita
// con la categoria di un budget conta nel suo speso). Per entrate e uscite il conto è facoltativo.
function FinestraMovimento({ movimento, contoDiBase, onChiudi }: { movimento: Movimento | 'nuovo' | null; contoDiBase: string | null; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const esistente = movimento && movimento !== 'nuovo' ? movimento : null;
  const [tipo, setTipo] = useState<TipoMovimento>('uscita');
  const [importo, setImporto] = useState('');
  const [contoA, setContoA] = useState('');     // il conto di un'entrata o di un'uscita, oppure da dove parte lo spostamento
  const [contoB, setContoB] = useState('');     // dove arriva lo spostamento
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [categoria, setCategoria] = useState('');
  useEffect(() => {
    if (!movimento) return;
    if (esistente) {
      const t = new Date(esistente.momento);
      setTipo(esistente.tipo); setImporto(importoInTesto(esistente.importo));
      setContoA((esistente.tipo === 'entrata' ? esistente.a_conto_id : esistente.da_conto_id) ?? ''); setContoB(esistente.tipo === 'spostamento' ? esistente.a_conto_id ?? '' : '');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`));
      setOra(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
      setDescrizione(esistente.descrizione); setCategoria(esistente.categoria_id ?? '');
    } else {
      const t = new Date();
      setTipo('uscita'); setImporto(''); setContoA(contoDiBase ?? ''); setContoB('');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)); setOra(adesso());
      setDescrizione(''); setCategoria('');
    }
  }, [movimento]);   // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const soldi = serve(leggiImporto(importo), 'Scrivi l\'importo, es. 12,50', 'importo');
    if (!(Number(soldi) > 0)) throw new ErroreCampo('importo', "L'importo deve essere positivo");
    const corpo: Record<string, unknown> = { tipo, importo: soldi };
    if (tipo === 'spostamento') {
      corpo.da_conto_id = serve(contoA, 'Scegli il conto da cui partono i soldi', 'da');
      corpo.a_conto_id = serve(contoB, 'Scegli il conto su cui arrivano', 'a');
      if (contoA === contoB) throw new ErroreCampo('a', 'I due conti devono essere diversi');
    } else {
      corpo.conto_id = contoA || null;
      corpo.categoria_id = categoria || null;
    }
    corpo.data = serve(leggiData(giorno), 'Scegli il giorno', 'giorno');
    corpo.ora = serve(leggiOra(ora), 'Scrivi l\'ora, es. 14:35', 'ora');
    corpo.descrizione = descrizione.trim() || undefined;
    if (esistente) await modifica(`/movimenti/${esistente.id}`, { ...corpo, descrizione: descrizione.trim() });
    else await crea('/movimenti', corpo);
  };
  const elimina = esistente ? async () => { await cancella(`/movimenti/${esistente.id}`); } : undefined;
  const conBudget = tipo === 'uscita' && categoria ? rif.categoria(categoria)?.budget : null;
  // Cambiando tipo la categoria scelta potrebbe non valere più (entrata ↔ uscita): si toglie.
  const cambiaTipo = (t: TipoMovimento) => { if (t !== tipo) setCategoria(''); setTipo(t); };
  const opzioni = (tenere: string, escludi?: string) => opzioniConti(rif.conti, { tenere: [tenere], escludi: [escludi] });
  return (
    <FinestraModulo titolo={esistente ? 'Modifica movimento' : 'Nuovo movimento'} icona="arrow-left-right" aperta={!!movimento} onChiudi={onChiudi} onSalva={salva} onElimina={elimina}
      etichettaSalva={esistente ? 'Salva' : 'Aggiungi'} confermaElimina={esistente ? { nome: esistente.descrizione, dettaglio: 'Il saldo dei conti torna com\'era prima.' } : undefined}>
      <Voce etichetta="Che movimento è">
        <SceltaSegmenti etichetta="Tipo di movimento" valore={tipo} onCambia={cambiaTipo} larghezzaPiena
          opzioni={[{ valore: 'entrata', testo: 'Entrata' }, { valore: 'uscita', testo: 'Uscita' }, { valore: 'spostamento', testo: 'Spostamento' }]} />
      </Voce>
      <ConErrore campo="importo"><Campo etichetta="Importo" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus /></ConErrore>
      {tipo === 'spostamento' ? (
        <>
          <Affiancati>
            <Meta><ConErrore campo="da"><Tendina etichetta="Da quale conto" valore={contoA} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setContoA} opzioni={opzioni(contoA)} /></ConErrore></Meta>
            <Meta><ConErrore campo="a"><Tendina etichetta="Verso quale conto" valore={contoB} segnaposto="Scegli il conto" iconaPrima="landmark" onCambia={setContoB} opzioni={opzioni(contoB, contoA)} /></ConErrore></Meta>
          </Affiancati>
          <Testo stile="dettaglio-normale" colore="testo-secondario">Uno spostamento tra due conti non è una spesa: niente categoria, non conta nei budget. Abbassa il saldo del primo conto e alza quello del secondo.</Testo>
        </>
      ) : (
        <Tendina etichetta={tipo === 'entrata' ? 'Su quale conto (facoltativo)' : 'Da quale conto (facoltativo)'} valore={contoA} segnaposto="Nessun conto" iconaPrima="landmark" onCambia={setContoA}
          opzioni={[{ valore: '', testo: 'Nessun conto' }, ...opzioni(contoA)]} />
      )}
      <Affiancati>
        <Meta><ConErrore campo="giorno"><CampoData etichetta="Giorno" valore={giorno} onCambia={setGiorno} /></ConErrore></Meta>
        <Meta><ConErrore campo="ora"><Campo etichetta="Ora" valore={ora} onCambia={setOra} segnaposto="14:35" inputMode="numeric" iconaPrima="calendar-clock" /></ConErrore></Meta>
      </Affiancati>
      <Testo stile="dettaglio-normale" colore="testo-secondario">Di base è adesso.</Testo>
      <Campo etichetta="Descrizione (facoltativa)" valore={descrizione} onCambia={setDescrizione}
        segnaposto={tipo === 'entrata' ? 'Es. stipendio' : tipo === 'uscita' ? 'Es. spesa al mercato' : 'Es. bonifico tra i miei conti'} />
      {tipo !== 'spostamento' ? (
        <Tendina etichetta="Categoria (facoltativa)" valore={categoria} segnaposto="Nessuna categoria" iconaPrima="tags" onCambia={setCategoria}
          opzioni={[{ valore: '', testo: 'Nessuna categoria' }, ...opzioniCategorie(rif.categorie, tipo)]} />
      ) : null}
      {conBudget ? <Testo stile="dettaglio-normale" colore="testo-secondario">Questa categoria ha un budget: l'uscita conta nel suo speso.</Testo> : null}
    </FinestraModulo>
  );
}
