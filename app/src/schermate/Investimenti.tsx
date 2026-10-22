import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, Tendina } from '../componenti/campi.tsx';
import { GraficoLinea, Intestazione, IntestazionePosizioni, NumeroChiave, RigaOperazione, RigaPosizione, Scheda, SchedaEsposizione, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Esposizione, Operazione, Portafoglio, Posizione, PuntoAndamento, Titolo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, meseCorto, numero, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

const quote = (q: string) => numero(q, Number.isInteger(Number(q)) ? 0 : 2);
const prezzo = (p: string | null) => (p === null ? '—' : euro(Number(p)));

// SC-11 Investimenti: portafoglio col prezzo medio di carico, prezzi inseriti a mano.
export function Investimenti() {
  const port = useDati<Portafoglio>('/investimenti/portafoglio');
  const andamento = useDati<PuntoAndamento[]>('/investimenti/andamento?mesi=12').dati ?? [];
  const esposizione = useDati<Esposizione>('/investimenti/esposizione').dati;
  const operazioni = useDati<Operazione[]>('/investimenti/operazioni').dati ?? [];
  const [operazione, setOperazione] = useState<Operazione | 'nuova' | null>(null);
  const [prezzi, setPrezzi] = useState(false);
  const [composizione, setComposizione] = useState<Posizione | null>(null);
  const p = port.dati;
  if (!p) return <Caricamento errore={port.errore} />;
  const guadagno = Number(p.guadagno);
  const ultimiPrezzi = p.posizioni.map((x) => x.prezzo_del).filter(Boolean).sort().at(-1);

  return (
    <>
      <Intestazione titolo="Investimenti" sottotitolo="Il tuo portafoglio: quanto vale, quanto ci hai messo e com'è distribuito. Prezzi inseriti a mano."
        azioni={<><Pulsante etichetta="Aggiorna prezzi" icona="pencil" onPress={() => setPrezzi(true)} disattivato={!p.posizioni.length} /><Pulsante tipo="primario" etichetta="Nuova operazione" icona="plus" onPress={() => setOperazione('nuova')} /></>} />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Valore oggi" valore={euro(p.valore)} icona="trending-up" nota={ultimiPrezzi ? `Prezzi del ${data(ultimiPrezzi)}` : 'Nessun prezzo ancora'} />
        <NumeroChiave etichetta="Guadagno" valore={`${euro(guadagno, { segno: true })}${p.guadagno_percentuale !== null ? ` · ${p.guadagno_percentuale > 0 ? '+' : ''}${numero(p.guadagno_percentuale, 1)}%` : ''}`}
          icona={guadagno >= 0 ? 'arrow-up-right' : 'arrow-down-left'} tono={guadagno >= 0 ? 'ok' : 'errore'} nota="Rispetto al prezzo medio di carico" />
        <NumeroChiave etichetta="Messo dentro" valore={euro(p.messo_dentro)} icona="piggy-bank" nota="Acquisti meno vendite, commissioni comprese" />
      </View>
      {andamento.length > 1 ? (
        <Scheda titolo="Andamento" nota="Ultimi 12 mesi" icona="chart-line">
          <GraficoLinea punti={andamento.map((x) => ({ etichetta: meseCorto(x.mese), valore: Number(x.valore), messo: Number(x.messo_dentro) }))} />
        </Scheda>
      ) : null}
      <Scheda titolo="Posizioni" nota={`${p.posizioni.length} titoli`} icona="layers">
        {p.posizioni.length === 0 ? <Vuoto testo="Nessun titolo in portafoglio. Aggiungi il primo acquisto." azione={<Pulsante tipo="primario" etichetta="Nuova operazione" icona="plus" onPress={() => setOperazione('nuova')} />} /> : (
          <View>
            <IntestazionePosizioni />
            {p.posizioni.map((x) => {
              const g = Number(x.guadagno);
              return <RigaPosizione key={x.id} titolo={x.nome} codice={[x.ticker, x.isin].filter(Boolean).join(' · ')} quote={`${quote(x.quote)} quote`} prezzoMedio={prezzo(x.prezzo_medio)} prezzoOggi={prezzo(x.prezzo)}
                valore={euro(x.valore)} guadagno={`${euro(g, { segno: true })}${x.guadagno_percentuale !== null ? ` · ${x.guadagno_percentuale > 0 ? '+' : ''}${numero(x.guadagno_percentuale, 1)}%` : ''}`} positivo={g >= 0}
                peso={`${numero(x.peso, 0)}%`} onApri={() => setComposizione(x)} />;
            })}
          </View>
        )}
      </Scheda>
      {esposizione && p.posizioni.length ? (
        <View style={{ flexDirection: 'row', gap: d['spazio-blocco'], alignItems: 'flex-start' }}>
          <SchedaEsposizione titolo="Per tipo" voci={esposizione.classe} />
          <SchedaEsposizione titolo="Per paese" voci={esposizione.area} />
          <SchedaEsposizione titolo="Per settore" voci={esposizione.settore} />
        </View>
      ) : null}
      {operazioni.length ? (
        <Scheda titolo="Ultime operazioni" icona="arrow-left-right">
          <View>
            {operazioni.slice(0, 20).map((o) => {
              const acq = o.verso === 'acquisto';
              const tot = Number(o.controvalore) + (acq ? Number(o.commissioni) : -Number(o.commissioni));
              return <RigaOperazione key={o.id} acquisto={acq} titolo={`${acq ? 'Acquisto' : 'Vendita'} · ${o.titolo}`} dettaglio={data(o.data)}
                quote={`${quote(o.quantita)} × ${euro(o.prezzo)}`} totale={euro(acq ? -tot : tot, { segno: true })} onApri={() => setOperazione(o)} />;
            })}
          </View>
        </Scheda>
      ) : null}
      <FinestraOperazione operazione={operazione === 'nuova' ? null : operazione} aperta={!!operazione} onChiudi={() => setOperazione(null)} />
      <FinestraPrezzi posizioni={p.posizioni} aperta={prezzi} onChiudi={() => setPrezzi(false)} />
      <FinestraComposizione posizione={composizione} onChiudi={() => setComposizione(null)} />
    </>
  );
}

function FinestraOperazione({ operazione, aperta, onChiudi }: { operazione: Operazione | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [cerca, setCerca] = useState('');
  const titoli = useDati<Titolo[]>(aperta ? `/investimenti/titoli${cerca.trim() ? `?cerca=${encodeURIComponent(cerca.trim())}` : ''}` : null).dati ?? [];
  const [titolo, setTitolo] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState({ isin: '', nome: '', ticker: '' });
  const [verso, setVerso] = useState<'acquisto' | 'vendita'>('acquisto');
  const [giorno, setGiorno] = useState('');
  const [quantita, setQuantita] = useState('');
  const [prezzoU, setPrezzoU] = useState('');
  const [commissioni, setCommissioni] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  useEffect(() => {
    if (!aperta) return;
    const o = operazione;
    setCerca(''); setTitolo(o?.titolo_id ?? null); setNuovo({ isin: '', nome: '', ticker: '' }); setVerso(o?.verso ?? 'acquisto');
    setGiorno(dataInTesto(o?.data ?? oggiIso())); setQuantita(o ? o.quantita.replace(/\.?0+$/, '').replace('.', ',') : ''); setPrezzoU(importoInTesto(o?.prezzo));
    setCommissioni(importoInTesto(o?.commissioni ?? '0')); setConto(o?.conto_id ?? rif.conti.find((c) => c.tipo === 'investimenti')?.id ?? null);
  }, [aperta, operazione]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = async () => {
    let id = titolo;
    if (id === 'nuovo' || !id) {
      if (!nuovo.isin.trim()) throw new Error('Scegli un titolo o scrivi l’ISIN di uno nuovo');
      id = (await crea<Titolo>('/investimenti/titoli', { isin: nuovo.isin.trim(), nome: serve(nuovo.nome.trim(), 'Scrivi il nome del titolo'), ticker: nuovo.ticker.trim() || undefined })).id;
    }
    const q = quantita.trim().replace(',', '.');
    if (!/^\d+(\.\d{1,6})?$/.test(q) || Number(q) <= 0) throw new Error('Scrivi le quote, es. 3,5');
    const corpo = { titolo_id: id, verso, data: serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA'), quantita: q,
      prezzo: serve(leggiImporto(prezzoU), 'Scrivi il prezzo di una quota'), commissioni: leggiImporto(commissioni || '0') ?? '0', conto_id: conto };
    if (operazione) await modifica(`/investimenti/operazioni/${operazione.id}`, corpo); else await crea('/investimenti/operazioni', corpo);
  };
  const opzioniTitoli = [...titoli.map((t) => ({ valore: t.id, testo: `${t.nome}${t.ticker ? ` · ${t.ticker}` : ''}` })), { valore: 'nuovo', testo: 'Un titolo nuovo…' }];
  return (
    <FinestraModulo titolo={operazione ? 'Modifica operazione' : 'Nuova operazione'} icona="arrow-left-right" aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={operazione ? () => cancella(`/investimenti/operazioni/${operazione.id}`).then(() => undefined) : undefined}>
      <SceltaSegmenti etichetta="Acquisto o vendita" larghezzaPiena valore={verso} onCambia={setVerso} opzioni={[{ valore: 'acquisto', testo: 'Acquisto' }, { valore: 'vendita', testo: 'Vendita' }]} />
      <Affiancati>
        <Meta><Campo etichetta="Cerca un titolo" valore={cerca} onCambia={setCerca} segnaposto="Nome, ISIN o ticker" iconaPrima="search" /></Meta>
        <Meta><Tendina etichetta="Titolo" valore={titolo} opzioni={opzioniTitoli} onCambia={setTitolo} /></Meta>
      </Affiancati>
      {titolo === 'nuovo' ? (
        <Voce etichetta="Titolo nuovo" aiuto="Si aggiunge all'elenco comune dei titoli.">
          <Affiancati>
            <Meta><Campo valore={nuovo.isin} onCambia={(v) => setNuovo({ ...nuovo, isin: v })} segnaposto="ISIN, es. IE00BK5BQT80" /></Meta>
            <Meta><Campo valore={nuovo.ticker} onCambia={(v) => setNuovo({ ...nuovo, ticker: v })} segnaposto="Ticker, facoltativo" /></Meta>
          </Affiancati>
          <Campo valore={nuovo.nome} onCambia={(v) => setNuovo({ ...nuovo, nome: v })} segnaposto="Nome, es. Vanguard FTSE All-World" />
        </Voce>
      ) : null}
      <Affiancati>
        <Meta><Campo etichetta="Data" valore={giorno} onCambia={setGiorno} iconaPrima="calendar" /></Meta>
        <Meta><Tendina etichetta="Conto" valore={conto} opzioni={rif.conti.map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
      </Affiancati>
      <Affiancati>
        <Meta><Campo etichetta="Quote" valore={quantita} onCambia={setQuantita} inputMode="decimal" /></Meta>
        <Meta><Campo etichetta="Prezzo di una quota" valore={prezzoU} onCambia={setPrezzoU} inputMode="decimal" /></Meta>
        <Meta><Campo etichetta="Commissioni" valore={commissioni} onCambia={setCommissioni} inputMode="decimal" /></Meta>
      </Affiancati>
    </FinestraModulo>
  );
}

function FinestraPrezzi({ posizioni, aperta, onChiudi }: { posizioni: Posizione[]; aperta: boolean; onChiudi: () => void }) {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [giorno, setGiorno] = useState('');
  useEffect(() => { if (aperta) { setValori(Object.fromEntries(posizioni.map((p) => [p.id, importoInTesto(p.prezzo)]))); setGiorno(dataInTesto(oggiIso())); } }, [aperta, posizioni]);
  const salva = async () => {
    const g = serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA');
    for (const p of posizioni) {
      const v = valori[p.id]?.trim();
      if (!v) continue;
      await sostituisci(`/investimenti/titoli/${p.id}/prezzi`, { prezzo: serve(leggiImporto(v), `Prezzo non valido per ${p.nome}`), data: g });
    }
  };
  return (
    <FinestraModulo titolo="Aggiorna prezzi" icona="pencil" aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      <Campo etichetta="Prezzi del giorno" valore={giorno} onCambia={setGiorno} iconaPrima="calendar" />
      {posizioni.map((p) => <Campo key={p.id} etichetta={`${p.nome}${p.ticker ? ` · ${p.ticker}` : ''}`} valore={valori[p.id] ?? ''} onCambia={(v) => setValori({ ...valori, [p.id]: v })} inputMode="decimal"
        aiuto={p.prezzo_del ? `Ultimo prezzo ${euro(p.prezzo ?? 0)} del ${data(p.prezzo_del)}` : undefined} />)}
    </FinestraModulo>
  );
}

type Dimensione = 'classe' | 'area' | 'settore';
function FinestraComposizione({ posizione, onChiudi }: { posizione: Posizione | null; onChiudi: () => void }) {
  const [dimensione, setDimensione] = useState<Dimensione>('area');
  const [testo, setTesto] = useState('');
  useEffect(() => { if (posizione) { setDimensione('area'); setTesto(''); } }, [posizione]);
  // Una voce per riga: "Stati Uniti 62".
  const salva = async () => {
    const voci = testo.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
      const m = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*%?$/.exec(r);
      if (!m) throw new Error(`Riga non valida: "${r}". Scrivi nome e percentuale, es. Stati Uniti 62`);
      return { voce: m[1], peso: m[2].replace(',', '.') };
    });
    await sostituisci(`/investimenti/titoli/${posizione!.id}/esposizioni`, { dimensione, voci });
  };
  return (
    <FinestraModulo titolo={posizione ? `Composizione di ${posizione.nome}` : ''} icona="chart-pie" aperta={!!posizione} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">Scrivi come è distribuito il titolo: una voce per riga con la percentuale. Sostituisce quella già inserita.</Testo>
      <SceltaSegmenti etichetta="Distribuzione" larghezzaPiena valore={dimensione} onCambia={setDimensione} opzioni={[{ valore: 'classe', testo: 'Per tipo' }, { valore: 'area', testo: 'Per paese' }, { valore: 'settore', testo: 'Per settore' }]} />
      <Campo etichetta="Voci" valore={testo} onCambia={setTesto} multiline segnaposto={'Stati Uniti 62\nEuropa 16\nGiappone 6'} />
    </FinestraModulo>
  );
}
