import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante, PulsanteIcona, SceltaSegmenti, Tessera } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { ConfermaFinestra, Intestazione, NumeroChiave, RigaNumeri, Scheda, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoMovimenti, Movimento, TipoMovimento } from '../dati/tipi.ts';
import { dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

// Movimenti (decisioni 53 e 59): le entrate e le uscite scritte a mano (anche quelle registrate da un budget), dal più recente. Insieme ai
// budget è uno strumento a parte: non tocca Spese, Panoramica o altre pagine. Il conto è solo un'etichetta, facoltativa. Chi ha fatto
// cosa; le righe scritte da chi guarda hanno matita e cestino.

// Il filtro scelto resta finché non si ricarica la pagina ('tutti', 'senza' o l'id di un conto; 'tutti' o AAAA-MM per il mese).
let ultimoConto = 'tutti';
let ultimoMese = 'tutti';

const ICONE: Record<TipoMovimento, string> = { entrata: 'arrow-down-left', uscita: 'arrow-up-right' };
const TIPI: Record<TipoMovimento, string> = { entrata: 'Entrata', uscita: 'Uscita' };

export function Movimenti() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const [contoScelto, setContoScelto] = useState(ultimoConto);
  const [meseScelto, setMeseScelto] = useState(ultimoMese);
  const [aperto, setAperto] = useState<Movimento | 'nuovo' | null>(null);
  const scegliConto = (v: string) => { ultimoConto = v; ultimoMese = 'tutti'; setContoScelto(v); setMeseScelto('tutti'); };
  const scegliMese = (v: string) => { ultimoMese = v; setMeseScelto(v); };
  const conti = rif.conti;
  const conto = conti.find((x) => x.id === contoScelto) ?? null;
  const filtroConto = contoScelto === 'senza' ? 'senza' : conto ? conto.id : 'tutti';
  const parametri = [filtroConto !== 'tutti' ? `conto=${filtroConto}` : '', meseScelto !== 'tutti' ? `mese=${meseScelto}` : '', 'limite=300'].filter(Boolean).join('&');
  const { dati, errore } = useDati<ElencoMovimenti>(`/movimenti?${parametri}`);
  if (!dati) return <Caricamento errore={errore} />;

  const mesi = dati.mesi;
  const meseValido = meseScelto === 'tutti' || mesi.includes(meseScelto) ? meseScelto : 'tutti';
  const uscite = dati.movimenti.filter((x) => x.tipo === 'uscita').reduce((t, x) => t + Number(x.importo), 0);
  const entrate = dati.movimenti.filter((x) => x.tipo === 'entrata').reduce((t, x) => t + Number(x.importo), 0);
  const dove = meseValido === 'tutti' ? 'In tutto l\'elenco' : nomeMese(meseValido);
  const quanti = `${dati.movimenti.length} ${dati.movimenti.length === 1 ? 'movimento' : 'movimenti'}${dati.movimenti.length >= 300 ? ' (i più recenti)' : ''}`;

  return (
    <>
      <Intestazione titolo="Movimenti" sottotitolo="Le entrate e le uscite che scrivi a mano, anche dai budget. Uno strumento a parte: non cambia le spese del mese."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo movimento" icona="plus" onPress={() => setAperto('nuovo')} />} />
      <RigaNumeri>
        <NumeroChiave etichetta="Uscite" valore={euro(uscite)} icona="arrow-up-right" nota={`${dove} · ${quanti}`} />
        <NumeroChiave etichetta="Entrate" valore={euro(entrate)} icona="arrow-down-left" nota={dove} />
      </RigaNumeri>
      <View style={{ flexDirection: compatto ? 'column' : 'row', gap: d['spazio-colonne'] }}>
        <View style={{ width: compatto ? undefined : 300 }}>
          <Tendina etichetta="Conto" valore={filtroConto} iconaPrima="landmark" onCambia={scegliConto}
            opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona })), { valore: 'senza', testo: 'Senza conto', icona: 'circle-x' }]} />
        </View>
        <View style={{ width: compatto ? undefined : 300 }}>
          <Tendina etichetta="Mese" valore={meseValido} iconaPrima="calendar" onCambia={scegliMese}
            opzioni={[{ valore: 'tutti', testo: 'Tutti i mesi' }, ...mesi.map((m) => ({ valore: m, testo: m === dati.mese_in_corso ? `${nomeMese(m)} · in corso` : nomeMese(m) }))]} />
        </View>
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

// Una riga dell'elenco: icona, descrizione, data e ora · entrata o uscita · categoria · conto · chi, importo. Le righe di chi guarda hanno matita e cestino.
function RigaMovimento({ x, onModifica }: { x: Movimento; onModifica: () => void }) {
  const compatto = useCompatto();
  const [chiede, setChiede] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const togli = async () => {
    setChiede(false);
    try { await cancella(`/movimenti/${x.id}`); } catch (e) { setErrore((e as Error).message); }
  };
  return (
    <View style={{ gap: d['spazio-testo'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], minHeight: compatto ? 56 : undefined }}>
        <Tessera icona={x.budget_id ? 'wallet' : ICONE[x.tipo]} misura="piccola" tono="neutro" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" numberOfLines={compatto ? 2 : 1}>{x.descrizione}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={compatto ? 3 : 1}>
            {[dataOra(x.momento), TIPI[x.tipo], x.categoria, x.conto, x.utente ? `di ${x.utente}` : null].filter(Boolean).join(' · ')}</Testo>
        </View>
        <Testo stile="corpo-forte" colore={x.tipo === 'uscita' ? 'testo-errore' : 'testo-ok'}>
          {euro(`${x.tipo === 'uscita' ? '-' : ''}${x.importo}`, { segno: true })}</Testo>
        {x.modificabile ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PulsanteIcona icona="pencil" etichetta={`Modifica ${x.descrizione}`} fantasma onPress={onModifica} />
            <PulsanteIcona icona="trash-2" etichetta={`Elimina ${x.descrizione}`} fantasma onPress={() => setChiede(true)} />
          </View>
        ) : null}
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <ConfermaFinestra aperta={chiede} titolo="Eliminare questo movimento?" testo={`${x.descrizione}, ${euro(x.importo)}.`} tono="pericolo" etichettaConferma="Elimina"
        onAnnulla={() => setChiede(false)} onConferma={togli} />
    </View>
  );
}

const adesso = () => { const t = new Date(); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const leggiOra = (testo: string): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(testo.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

// «Nuovo movimento» / «Modifica movimento» (decisioni 53 e 59): entrata o uscita, importo, conto (etichetta facoltativa), giorno e ora
// (di base adesso), descrizione e, per le uscite, la categoria facoltativa (se ha un budget l'uscita conta nel suo speso).
function FinestraMovimento({ movimento, contoDiBase, onChiudi }: { movimento: Movimento | 'nuovo' | null; contoDiBase: string | null; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const esistente = movimento && movimento !== 'nuovo' ? movimento : null;
  const [tipo, setTipo] = useState<TipoMovimento>('uscita');
  const [importo, setImporto] = useState('');
  const [conto, setConto] = useState('');
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [categoria, setCategoria] = useState('');
  useEffect(() => {
    if (!movimento) return;
    if (esistente) {
      const t = new Date(esistente.momento);
      setTipo(esistente.tipo); setImporto(importoInTesto(esistente.importo)); setConto(esistente.conto_id ?? '');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`));
      setOra(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
      setDescrizione(esistente.descrizione); setCategoria(esistente.categoria_id ?? '');
    } else {
      const t = new Date();
      setTipo('uscita'); setImporto(''); setConto(contoDiBase ?? '');
      setGiorno(dataInTesto(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)); setOra(adesso());
      setDescrizione(''); setCategoria('');
    }
  }, [movimento]);   // eslint-disable-line react-hooks/exhaustive-deps
  const conti = rif.conti.filter((c) => !c.archiviato || c.id === conto);
  const salva = async () => {
    const soldi = serve(leggiImporto(importo), 'Scrivi l\'importo, es. 12,50', 'importo');
    if (!(Number(soldi) > 0)) throw new ErroreCampo('importo', "L'importo deve essere positivo");
    const corpo: Record<string, unknown> = { tipo, importo: soldi, conto_id: conto || null };
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
      etichettaSalva={esistente ? 'Salva' : 'Aggiungi'} confermaElimina={esistente ? { nome: esistente.descrizione, dettaglio: 'Il movimento sparisce dall\'elenco.' } : undefined}>
      <Voce etichetta="Che movimento è">
        <SceltaSegmenti etichetta="Tipo di movimento" valore={tipo} onCambia={setTipo} larghezzaPiena
          opzioni={[{ valore: 'entrata', testo: 'Entrata' }, { valore: 'uscita', testo: 'Uscita' }]} />
      </Voce>
      <ConErrore campo="importo"><Campo etichetta="Importo" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" autoFocus /></ConErrore>
      <Tendina etichetta="Conto (facoltativo)" valore={conto} segnaposto="Nessun conto" iconaPrima="landmark" onCambia={setConto}
        opzioni={[{ valore: '', testo: 'Nessun conto' }, ...conti.map((c) => ({ valore: c.id, testo: c.nome, icona: c.icona }))]} />
      <Affiancati>
        <Meta><ConErrore campo="giorno"><CampoData etichetta="Giorno" valore={giorno} onCambia={setGiorno} /></ConErrore></Meta>
        <Meta><ConErrore campo="ora"><Campo etichetta="Ora" valore={ora} onCambia={setOra} segnaposto="14:35" inputMode="numeric" iconaPrima="calendar-clock" /></ConErrore></Meta>
      </Affiancati>
      <Testo stile="dettaglio-normale" colore="testo-secondario">Di base è adesso.</Testo>
      <Campo etichetta="Descrizione (facoltativa)" valore={descrizione} onCambia={setDescrizione} segnaposto={tipo === 'entrata' ? 'Es. stipendio' : 'Es. spesa al mercato'} />
      {tipo === 'uscita' ? (
        <Tendina etichetta="Categoria (facoltativa)" valore={categoria} segnaposto="Nessuna categoria" iconaPrima="tags" onCambia={setCategoria}
          opzioni={[{ valore: '', testo: 'Nessuna categoria' }, ...opzioniCategorie(rif.categorie, 'uscita')]} />
      ) : null}
      {conBudget ? <Testo stile="dettaglio-normale" colore="testo-secondario">Questa categoria ha un budget: l'uscita conta nel suo speso.</Testo> : null}
    </FinestraModulo>
  );
}
