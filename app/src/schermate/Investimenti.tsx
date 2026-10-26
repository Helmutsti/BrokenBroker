import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Etichetta, Pulsante, SceltaSegmenti, type StatoPressione, Tessera } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { GraficoLinea, Intestazione, RigaAvanzamento, Scheda, TabellaPortafoglio, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Bene, Esposizione, Operazione, Portafoglio, Posizione, PuntoAndamento, QuotazioneOro, TipoBene, Titolo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, leggiPrezzo, meseCorto, numero, oggiIso, prezzoInTesto } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Caricamento, mesiFino } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

const quote = (q: string) => numero(q, Number.isInteger(Number(q)) ? 0 : 2);
const prezzo = (p: string | null) => (p === null ? '—' : euro(Number(p)));
const guadagnoTesto = (g: number, pct: number | null) => `${euro(g, { segno: true })}${pct !== null ? ` · ${pct > 0 ? '+' : ''}${numero(pct, 2)}%` : ''}`;

const TIPI_BENE: { valore: TipoBene; testo: string }[] = [
  { valore: 'fondo_pensione', testo: 'Fondo pensione' }, { valore: 'crowdfunding', testo: 'Crowdfunding' }, { valore: 'societa', testo: 'Quota di una società' },
  { valore: 'immobile', testo: 'Immobile' }, { valore: 'oro', testo: 'Oro fisico' }, { valore: 'altro', testo: 'Altro' },
];
const PUREZZE = [{ valore: '999.9', testo: '999,9 ‰ (24 carati)' }, { valore: '999', testo: '999 ‰ (24 carati)' }, { valore: '916', testo: '916 ‰ (22 carati)' }, { valore: '750', testo: '750 ‰ (18 carati)' }];
const nomeTipo = (t: TipoBene) => TIPI_BENE.find((x) => x.valore === t)?.testo ?? 'Altro';
const grammi = (g: string | null) => (g === null ? '—' : `${numero(g, Number.isInteger(Number(g)) ? 0 : 2)} g`);
// Guadagno dal giorno dell'acquisto, con il rendimento annuo se è passato almeno un trimestre.
function guadagnoDal(costo: number, valore: number, dal: string | null) {
  if (!(costo > 0) || !Number.isFinite(valore)) return null;
  const g = valore - costo, pct = (g / costo) * 100;
  let testo = `${euro(g, { segno: true })} (${pct >= 0 ? '+' : ''}${numero(pct, 2)}%)`;
  if (dal) {
    const anni = (Date.parse(oggiIso()) - Date.parse(dal)) / (365.25 * 86400000);
    testo += ` dal ${data(dal)}`;
    if (anni >= 0.25) { const annuo = (Math.pow(valore / costo, 1 / anni) - 1) * 100; testo += `, circa ${annuo >= 0 ? '+' : ''}${numero(annuo, 2)}% l'anno`; }
  }
  return testo;
}

type Periodo = '1' | '6' | '12' | 'tutto';
// "prezzi del 23 ottobre": la data più vecchia tra i prezzi del riquadro, così si vede se uno è rimasto indietro.
const prezziDel = (xs: Posizione[]) => { const d = xs.map((x) => x.prezzo_del).filter((x): x is string => !!x).sort()[0]; return d ? `prezzi del ${data(d)}` : null; };

// SC-11 Investimenti (proposta v2): il portafoglio al centro, come nelle app delle
// banche; titoli divisi per portafoglio, oro e beni non quotati insieme a loro.
export function Investimenti() {
  const compatto = useCompatto();
  const port = useDati<Portafoglio>('/investimenti/portafoglio');
  const operazioni = useDati<Operazione[]>('/investimenti/operazioni').dati ?? [];
  const [periodo, setPeriodo] = useState<Periodo>('12');
  const [composizioneDi, setComposizioneDi] = useState<'tipo' | 'area' | 'settore'>('tipo');
  const p = port.dati;
  const primo = [...operazioni.map((o) => o.data), ...(p?.beni ?? []).map((b) => b.data_acquisto ?? b.valore_al)].sort()[0];
  // Un mese: un punto a settimana. Altrimenti un punto al mese, "da sempre" dal primo investimento.
  const mesi = periodo === 'tutto' ? Math.min(600, Math.max(2, primo ? mesiFino(oggiIso(), primo) : 12)) : Number(periodo) + 1;
  const andamento = useDati<PuntoAndamento[]>(`/investimenti/andamento?${periodo === '1' ? 'settimane=5' : `mesi=${mesi}`}`).dati ?? [];
  const etichetta = (x: PuntoAndamento) => (periodo === '1' ? data(x.al, 'corta') : mesi > 12 ? `${meseCorto(x.mese)} ${x.mese.slice(2, 4)}` : meseCorto(x.mese));
  const esposizione = useDati<Esposizione>('/investimenti/esposizione').dati;
  const [aggiungi, setAggiungi] = useState<Bene | 'nuovo' | null>(null);
  const [prezzi, setPrezzi] = useState<Posizione[] | null>(null);
  const [composizione, setComposizione] = useState<Posizione | null>(null);
  const [dettaglio, setDettaglio] = useState<Posizione | null>(null);

  if (!p) return <Caricamento errore={port.errore} />;
  const guadagno = Number(p.guadagno);
  const ultimiPrezzi = p.posizioni.map((x) => x.prezzo_del).filter(Boolean).sort().at(-1);
  const oro = p.beni.filter((b) => b.tipo === 'oro'), altriBeni = p.beni.filter((b) => b.tipo !== 'oro');
  const somma = (xs: { valore: string }[]) => xs.reduce((t, x) => t + Number(x.valore), 0);
  const totale = Number(p.valore);
  const diviso = [
    { nome: 'ETF e azioni', icona: 'globe', valore: Number(p.valore_titoli) },
    { nome: 'Oro fisico', icona: 'banknote', valore: somma(oro) },
    { nome: 'Non quotati', icona: 'layers', valore: somma(altriBeni) },
  ].filter((x) => x.valore > 0);

  // Un riquadro per portafoglio (il conto dove stanno titoli e non quotati), poi i
  // non quotati fuori dai portafogli e i beni fisici, sempre separati dai titoli.
  type Riquadro = { chiave: string; titolo: string; nota: string; icona: string; posizioni: Posizione[]; beni: Bene[] };
  const riquadri: Riquadro[] = [];
  const riquadro = (chiave: string, titolo: string, nota: string, icona: string) => {
    let r = riquadri.find((x) => x.chiave === chiave);
    if (!r) { r = { chiave, titolo, nota, icona, posizioni: [], beni: [] }; riquadri.push(r); }
    return r;
  };
  for (const x of p.posizioni) (x.conto_id ? riquadro(x.conto_id, x.conto ?? 'Portafoglio', 'Portafoglio', 'wallet') : riquadro('senza', 'Titoli senza portafoglio', 'Titoli a cui non hai dato un conto', 'wallet')).posizioni.push(x);
  for (const b of altriBeni) (b.conto_id ? riquadro(b.conto_id, b.conto ?? 'Portafoglio', 'Portafoglio', 'wallet') : riquadro('non-quotati', 'Non quotati', 'Fuori dai portafogli · costo e valore scritti a mano', 'layers')).beni.push(b);
  riquadri.sort((a, b) => Number(a.chiave === 'non-quotati') - Number(b.chiave === 'non-quotati'));
  if (oro.length) riquadri.push({ chiave: 'beni-fisici', titolo: 'Beni fisici', nota: 'Oro che possiedi direttamente · valore dalla quotazione', icona: 'banknote', posizioni: [], beni: oro });
  const voceComposizione = composizioneDi === 'tipo'
    ? diviso.map((x) => ({ nome: x.nome, icona: x.icona, importo: euro(x.valore), peso: totale > 0 ? (x.valore / totale) * 100 : 0 }))
    : (esposizione?.[composizioneDi === 'area' ? 'area' : 'settore'] ?? []).map((x) => ({ nome: x.voce, icona: composizioneDi === 'area' ? 'globe' : 'factory', importo: '', peso: x.peso }));
  const nuovo = <Pulsante tipo="primario" etichetta="Aggiungi investimento" icona="plus" onPress={() => setAggiungi('nuovo')} />;

  return (
    <>
      <Intestazione titolo="Investimenti" sottotitolo="Tutti i portafogli insieme: in alto andamento e composizione, sotto un riquadro per ogni portafoglio."
        azioni={nuovo} />
      <Scheda titolo="Tutti i portafogli" nota="Titoli, non quotati e oro insieme" icona="chart-line">
        <View style={{ flexDirection: compatto ? 'column' : 'row', gap: d['spazio-gruppo'] }}>
          <View style={{ flex: compatto ? undefined : 1, minWidth: 0, gap: d['spazio-blocco'] }}>
            <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-end', gap: d['spazio-colonne'] }}>
              <View style={{ flex: compatto ? undefined : 1, gap: d['spazio-testo'] }}>
                <Testo stile="etichetta-gruppo" colore="testo-secondario">VALORE DI TUTTI I PORTAFOGLI OGGI</Testo>
                <Testo stile="numero-grande">{euro(p.valore)}</Testo>
                <Testo stile="corpo-forte" colore={guadagno >= 0 ? 'testo-ok' : 'testo-errore'}>{`${guadagnoTesto(guadagno, p.guadagno_percentuale)} da sempre`}</Testo>
                <Testo colore="testo-secondario">{`Investiti ${euro(p.messo_dentro)}${ultimiPrezzi ? ` · prezzi del ${data(ultimiPrezzi)}` : ''}`}</Testo>
              </View>
              <SceltaSegmenti etichetta="Periodo del grafico" larghezzaPiena={compatto} valore={periodo} onCambia={setPeriodo}
                opzioni={[{ valore: '1', testo: '1 mese' }, { valore: '6', testo: '6 mesi' }, { valore: '12', testo: '1 anno' }, { valore: 'tutto', testo: 'Da sempre' }]} />
            </View>
            {andamento.length > 1 && totale > 0
              ? <GraficoLinea punti={andamento.map((x) => ({ etichetta: etichetta(x), valore: Number(x.valore), messo: Number(x.messo_dentro) }))} />
              : <Vuoto testo="Il grafico compare quando c'è almeno un investimento." />}
          </View>
          <View style={{ width: compatto ? undefined : 300, gap: d['spazio-elenco'] }}>
            <SceltaSegmenti etichetta="Composizione" larghezzaPiena valore={composizioneDi} onCambia={setComposizioneDi}
              opzioni={[{ valore: 'tipo', testo: 'Per tipo' }, { valore: 'area', testo: 'Per paese' }, { valore: 'settore', testo: 'Per settore' }]} />
            {voceComposizione.length === 0 ? <Testo colore="testo-secondario">{composizioneDi === 'tipo' ? 'Ancora niente.' : 'Nessun titolo quotato con la composizione inserita.'}</Testo> : null}
            {voceComposizione.slice(0, 8).map((x) => <RigaAvanzamento key={x.nome} compatta nome={x.nome} icona={x.icona} importo={x.importo} valore={x.peso}
              percentuale={`${numero(x.peso, 2)}%`} />)}
            {composizioneDi !== 'tipo' ? <Testo stile="dettaglio-normale" colore="testo-secondario">Per paese e per settore si guardano solo i titoli quotati.</Testo> : null}
          </View>
        </View>
      </Scheda>
      {riquadri.length === 0 ? <Scheda><Vuoto testo="Nessun investimento. Aggiungi un titolo, un fondo pensione o l'oro che possiedi." /></Scheda> : null}
      {riquadri.map((r) => {
        const valore = somma(r.posizioni) + somma(r.beni);
        const costo = r.posizioni.reduce((t, x) => t + Number(x.costo), 0) + r.beni.reduce((t, b) => t + Number(b.costo), 0);
        const g = valore - costo;
        return (
          <Scheda key={r.chiave} titolo={r.titolo} nota={prezziDel(r.posizioni) ?? undefined} icona={r.icona}
            azione={r.posizioni.length ? <Pulsante tipo="testo" etichetta="Aggiorna prezzi" icona="pencil" onPress={() => setPrezzi(r.posizioni)} /> : undefined}>
            <View style={{ gap: d['spazio-blocco'] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: compatto ? d['spazio-gruppo'] : d['spazio-gruppo'] * 2, rowGap: d['spazio-blocco'], paddingHorizontal: d['margine-voce-h'] }}>
                {([['Valore', euro(valore), 'testo-primario'], [r.posizioni.length ? 'Investiti' : 'Costo', euro(costo), 'testo-primario'],
                  ['Guadagno', guadagnoTesto(g, costo > 0 ? Math.round((g / costo) * 1000) / 10 : null), g >= 0 ? 'testo-ok' : 'testo-errore']] as const).map(([l, v, col], i) => (
                  <View key={l} style={{ gap: d['spazio-testo'] }}><Testo stile="dettaglio-normale" colore="testo-secondario">{l}</Testo><Testo stile={i === 0 ? 'titolo-scheda' : 'corpo-forte'} colore={col}>{v}</Testo></View>
                ))}
              </View>
              <TabellaPortafoglio titoloColonna={r.chiave === 'beni-fisici' ? 'Bene' : r.posizioni.length ? 'Titolo' : 'Nome'} righe={[
                ...r.posizioni.map((x) => ({ chiave: `${x.id}|${x.conto_id ?? ''}`, nome: x.nome, dettaglio: `${quote(x.quote)} quote · PMC ${prezzo(x.prezzo_medio)}`,
                  prezzo: prezzo(x.prezzo), valore: euro(x.valore), guadagno: guadagnoTesto(Number(x.guadagno), x.guadagno_percentuale), positivo: Number(x.guadagno) >= 0, onApri: () => setDettaglio(x) })),
                ...r.beni.map((b) => {
                  const peso = b.peso_grammi ? Number(b.peso_grammi) : null;
                  const dettaglio = b.tipo === 'oro'
                    ? [grammi(b.peso_grammi), b.purezza ? `oro ${numero(b.purezza, Number.isInteger(Number(b.purezza)) ? 0 : 1)} ‰` : 'oro', b.forma].filter(Boolean).join(' · ')
                    : [nomeTipo(b.tipo), `valore del ${data(b.valore_al, 'corta')}`].join(' · ');
                  return { chiave: b.id, nome: b.nome, dettaglio, prezzo: peso ? `${euro(Number(b.valore) / peso)}/g` : '—', valore: euro(b.valore),
                    guadagno: guadagnoTesto(Number(b.guadagno), b.guadagno_percentuale), positivo: Number(b.guadagno) >= 0, onApri: () => setAggiungi(b) };
                }),
              ]} />
            </View>
          </Scheda>
        );
      })}
      <FinestraInvestimento bene={aggiungi === 'nuovo' ? null : aggiungi} aperta={!!aggiungi} posizioni={p.posizioni} onChiudi={() => setAggiungi(null)} />
      <FinestraPosizione posizione={dettaglio} primoAcquisto={dettaglio ? operazioni.filter((o) => o.titolo_id === dettaglio.id && (o.conto_id ?? null) === (dettaglio.conto_id ?? null)).map((o) => o.data).sort()[0] ?? null : null}
        onChiudi={() => setDettaglio(null)} onComposizione={() => { const x = dettaglio!; setDettaglio(null); setComposizione(x); }} />
      <FinestraPrezzi posizioni={(prezzi ?? []).filter((x, i, xs) => xs.findIndex((y) => y.id === x.id) === i)} aperta={!!prezzi} onChiudi={() => setPrezzi(null)} />
      <FinestraComposizione posizione={composizione} onChiudi={() => setComposizione(null)} />
    </>
  );
}

// Ricerca di un titolo per ISIN, ticker o nome: prima nell'elenco comune, poi sui
// mercati (Yahoo Finance e OpenFIGI, tramite l'API). Un titolo trovato sul mercato
// entra nell'elenco al salvataggio.
type NuovoTitolo = { isin: string; nome: string; ticker: string; simbolo?: string | null; borsa?: string | null; tipo?: string; daMercato?: boolean };
type TitoloMercato = { isin: string | null; ticker: string | null; simbolo: string | null; nome: string; tipo: string; borsa: string | null };
const codiceTitolo = (t: { tipo?: string; ticker?: string | null; borsa?: string | null; isin?: string | null }) =>
  [t.tipo?.toUpperCase(), t.ticker, t.borsa, t.isin].filter(Boolean).join(' · ');

function RisultatoTitolo({ nome, codice, origine, onPress }: { nome: string; codice: string; origine: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={nome} onPress={onPress}
      style={(s: StatoPressione) => ({ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'],
        borderRadius: d['raggio-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent' })}>
      <Tessera icona="globe" misura="piccola" />
      <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte" numberOfLines={1}>{nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{codice}</Testo></View>
      <Etichetta testo={origine} tono={origine === 'Nel tuo elenco' ? 'accento' : 'neutro'} />
    </Pressable>
  );
}

function SceltaTitolo({ aperta, titolo, setTitolo, nuovo, setNuovo }: {
  aperta: boolean; titolo: string | null; setTitolo: (v: string | null) => void; nuovo: NuovoTitolo; setNuovo: (v: NuovoTitolo) => void;
}) {
  const { c } = useTema();
  const [cerca, setCerca] = useState('');
  const [cercaMercato, setCercaMercato] = useState('');
  useEffect(() => { if (aperta) { setCerca(''); setCercaMercato(''); } }, [aperta]);
  // Sul mercato si cerca quando smetti di scrivere per un attimo.
  useEffect(() => { const t = setTimeout(() => setCercaMercato(cerca.trim()), 450); return () => clearTimeout(t); }, [cerca]);
  const q = cerca.trim();
  const tutti = useDati<Titolo[]>(aperta ? '/investimenti/titoli' : null).dati ?? [];
  const locali = useDati<Titolo[]>(aperta && q ? `/investimenti/titoli?cerca=${encodeURIComponent(q)}` : null).dati ?? [];
  const mercato = useDati<TitoloMercato[]>(aperta && cercaMercato.length >= 2 ? `/investimenti/titoli/mercato?cerca=${encodeURIComponent(cercaMercato)}` : null);
  const dalMercato = (mercato.dati ?? []).filter((m) => !locali.some((l) => (m.simbolo && l.simbolo === m.simbolo) || (m.isin && l.isin === m.isin && !m.simbolo)));
  const scelto = titolo && titolo !== 'nuovo' ? tutti.find((t) => t.id === titolo) ?? locali.find((t) => t.id === titolo) : null;
  const sceltaFatta = scelto || (titolo === 'nuovo' && nuovo.daMercato);
  const cambia = () => { setTitolo(null); setNuovo({ isin: '', nome: '', ticker: '' }); };

  if (sceltaFatta) {
    const nome = scelto ? scelto.nome : nuovo.nome;
    return (
      <Voce etichetta="Titolo" aiuto={scelto ? undefined : 'Trovato sul mercato: entra nel tuo elenco quando salvi.'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], padding: d['margine-riquadro-h'], borderRadius: d['raggio-controllo'], backgroundColor: c['sfondo-accento-tenue'] }}>
          <Tessera icona="globe" misura="piccola" />
          <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{codiceTitolo(scelto ?? nuovo)}</Testo></View>
          <Pulsante tipo="testo" etichetta="Cambia" onPress={cambia} />
        </View>
      </Voce>
    );
  }
  return (
    <>
      <Campo etichetta="Cerca il titolo" valore={cerca} onCambia={setCerca} segnaposto="ISIN, ticker o nome, es. IE00B4L5Y983, SWDA, MSCI World" iconaPrima="search" autoFocus />
      {q && titolo !== 'nuovo' ? (
        <View style={{ gap: d['spazio-testo'] }}>
          {locali.map((t) => <RisultatoTitolo key={t.id} nome={t.nome} codice={codiceTitolo(t)} origine="Nel tuo elenco" onPress={() => setTitolo(t.id)} />)}
          {dalMercato.map((m) => <RisultatoTitolo key={m.simbolo ?? m.nome} nome={m.nome} codice={codiceTitolo(m)} origine="Dal mercato"
            onPress={() => { setNuovo({ isin: m.isin ?? '', nome: m.nome, ticker: m.ticker ?? '', simbolo: m.simbolo, borsa: m.borsa, tipo: m.tipo, daMercato: true }); setTitolo('nuovo'); }} />)}
          {cercaMercato !== q || (!mercato.dati && !mercato.errore) ? <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ paddingHorizontal: d['margine-voce-h'] }}>Cerco sui mercati…</Testo> : null}
          {cercaMercato === q && mercato.dati && !locali.length && !dalMercato.length ? (
            <View style={{ alignItems: 'flex-start', gap: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
              <Testo colore="testo-secondario">{`Nessun titolo trovato per «${q}».`}</Testo>
              <Pulsante tipo="testo" etichetta="Inseriscilo a mano" onPress={() => { setNuovo({ isin: pareIsin(q) ? q.toUpperCase() : '', nome: '', ticker: pareIsin(q) ? '' : q.toUpperCase() }); setTitolo('nuovo'); }} />
            </View>
          ) : null}
        </View>
      ) : null}
      {titolo === 'nuovo' ? (
        <Voce etichetta="Titolo nuovo, inserito a mano" aiuto="Si aggiunge all'elenco comune dei titoli.">
          <Affiancati>
            <Meta><Campo valore={nuovo.isin} onCambia={(v) => setNuovo({ ...nuovo, isin: v })} segnaposto="ISIN, es. IE00BK5BQT80" /></Meta>
            <Meta><Campo valore={nuovo.ticker} onCambia={(v) => setNuovo({ ...nuovo, ticker: v })} segnaposto="Ticker, facoltativo" /></Meta>
          </Affiancati>
          <Campo valore={nuovo.nome} onCambia={(v) => setNuovo({ ...nuovo, nome: v })} segnaposto="Nome, es. Vanguard FTSE All-World" />
          <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Torna alla ricerca" onPress={cambia} /></View>
        </Voce>
      ) : null}
    </>
  );
}

const pareIsin = (q: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(q);
async function idTitolo(titolo: string | null, nuovo: NuovoTitolo) {
  if (titolo && titolo !== 'nuovo') return titolo;
  if (titolo === 'nuovo' && nuovo.daMercato) {
    return (await crea<Titolo>('/investimenti/titoli', { isin: nuovo.isin || undefined, nome: nuovo.nome, ticker: nuovo.ticker || undefined, simbolo: nuovo.simbolo ?? undefined,
      borsa: nuovo.borsa ?? undefined, tipo: nuovo.tipo })).id;
  }
  if (!nuovo.isin.trim()) throw new Error('Cerca il titolo e sceglilo, oppure scrivi l’ISIN di uno nuovo');
  return (await crea<Titolo>('/investimenti/titoli', { isin: nuovo.isin.trim(), nome: serve(nuovo.nome.trim(), 'Scrivi il nome del titolo'), ticker: nuovo.ticker.trim() || undefined })).id;
}
const leggiQuote = (testo: string) => {
  const q = testo.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(q) || Number(q) <= 0) throw new Error('Scrivi la quantità, es. 3,5');
  return q;
};

// SC-12 Aggiungi investimento (proposta v2): titolo quotato (quantità e prezzo medio
// di carico) o non quotato (costo e valore attuale); l'oro fisico è un tipo di non
// quotato e non sta in nessun portafoglio.
function FinestraInvestimento({ bene, aperta, posizioni, onChiudi }: { bene: Bene | null; aperta: boolean; posizioni: Posizione[]; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [scelta, setScelta] = useState<'quotato' | 'non_quotato'>('quotato');
  // Titolo quotato
  const [titolo, setTitolo] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<NuovoTitolo>({ isin: '', nome: '', ticker: '' });
  const [quantita, setQuantita] = useState('');
  const [pmc, setPmc] = useState('');
  const [commissioni, setCommissioni] = useState('');
  const [giorno, setGiorno] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  // Non quotato
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoBene>('fondo_pensione');
  const [costo, setCosto] = useState('');
  const [valore, setValore] = useState('');
  const [valoreAl, setValoreAl] = useState('');
  const [portafoglio, setPortafoglio] = useState('nessuno');
  const [forma, setForma] = useState<'lingotto' | 'moneta'>('lingotto');
  const [purezza, setPurezza] = useState('999.9');
  const [peso, setPeso] = useState('');
  const [dove, setDove] = useState('');
  const [acquisto, setAcquisto] = useState('');
  const quotazione = useDati<QuotazioneOro | null>(aperta ? '/investimenti/oro/quotazione' : null).dati ?? null;

  useEffect(() => {
    if (!aperta) return;
    const b = bene;
    setScelta(b ? 'non_quotato' : 'quotato');
    setTitolo(null); setNuovo({ isin: '', nome: '', ticker: '' }); setQuantita(''); setPmc(''); setCommissioni('0'); setGiorno(dataInTesto(oggiIso()));
    setConto(null);
    setNome(b?.nome ?? ''); setTipo(b?.tipo ?? 'fondo_pensione'); setCosto(importoInTesto(b?.costo)); setValore(importoInTesto(b?.valore));
    setValoreAl(dataInTesto(b?.valore_al ?? oggiIso())); setPortafoglio(b?.conto_id ?? 'nessuno'); setForma(b?.forma ?? 'lingotto');
    setPurezza(b?.purezza ? String(Number(b.purezza)) : '999.9'); setPeso(b?.peso_grammi ? String(Number(b.peso_grammi)).replace('.', ',') : ''); setDove(b?.dove ?? ''); setAcquisto(dataInTesto(b?.data_acquisto ?? null));
  }, [aperta, bene]); // eslint-disable-line react-hooks/exhaustive-deps

  const conti = rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }));
  const oro = tipo === 'oro';
  const q = Number(quantita.replace(',', '.')), u = Number(leggiPrezzo(pmc) ?? NaN), comm = Number(leggiImporto(commissioni || '0') ?? 0);
  const costoTitolo = Number.isFinite(q * u) && q > 0 ? q * u + comm : null;
  // L'oro vale da solo: grammi × purezza × quotazione dell'oro fino.
  const pesoN = Number(peso.replace(',', '.'));
  const fini = oro && pesoN > 0 ? (pesoN * Number(purezza)) / 1000 : null;
  const valoreOro = fini !== null && quotazione ? fini * quotazione.euro_grammo : null;
  const dataAcquisto = acquisto.trim() ? leggiData(acquisto) : null;
  const c = Number(leggiImporto(costo) ?? NaN), v = oro && quotazione ? valoreOro ?? NaN : Number(leggiImporto(valore) ?? NaN);
  const guadagnoBene = guadagnoDal(c, v, dataAcquisto);

  const salva = async () => {
    if (scelta === 'quotato') {
      const id = await idTitolo(titolo, nuovo);
      const gia = posizioni.find((x) => x.id === id && (x.conto_id ?? null) === (conto ?? null));
      if (gia) throw new Error(`${gia.nome} è già nel portafoglio ${gia.conto ?? ''}: correggi quantità e prezzo medio dal suo riquadro.`);
      await crea('/investimenti/operazioni', { titolo_id: id, verso: 'acquisto', data: serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA'), quantita: leggiQuote(quantita),
        prezzo: serve(leggiPrezzo(pmc), 'Scrivi il prezzo medio di carico, es. 121,7623'), commissioni: leggiImporto(commissioni || '0') ?? '0', conto_id: conto });
      return;
    }
    if (acquisto.trim() && !dataAcquisto) throw new Error('Scrivi la data di acquisto come GG/MM/AAAA');
    const corpo: Record<string, unknown> = {
      nome: serve(nome.trim(), 'Scrivi il nome'), tipo, costo: serve(leggiImporto(costo), 'Scrivi quanto hai messo'),
      valore: oro && quotazione ? undefined : serve(leggiImporto(valore), 'Scrivi quanto vale oggi'), data_acquisto: dataAcquisto,
      valore_al: oro ? oggiIso() : serve(leggiData(valoreAl), 'Scrivi la data del valore come GG/MM/AAAA'),
      conto_id: oro || portafoglio === 'nessuno' ? null : portafoglio,
      forma: oro ? forma : null, purezza: oro ? purezza : null, dove: dove.trim() || null,
      peso_grammi: oro ? serve(pesoN > 0 ? String(Math.round(pesoN * 1000) / 1000) : null, 'Scrivi il peso in grammi, es. 7,988') : null,
    };
    if (bene) await modifica(`/investimenti/beni/${bene.id}`, corpo); else await crea('/investimenti/beni', corpo);
  };

  return (
    <FinestraModulo titolo={bene ? `Modifica ${bene.nome}` : 'Aggiungi investimento'} icona="trending-up" aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={bene ? () => cancella(`/investimenti/beni/${bene.id}`).then(() => undefined) : undefined}
      confermaElimina={bene ? { nome: `«${bene.nome}»`, dettaglio: 'L’investimento esce dal patrimonio.' } : undefined}>
      {!bene ? (
        <Voce etichetta="Che cosa aggiungi?" aiuto={scelta === 'quotato'
          ? 'Un ETF, un\'azione, un\'obbligazione o una crypto che ha un prezzo su un mercato: inserisci quantità e prezzo medio di carico.'
          : 'Un investimento senza prezzo di mercato (fondo pensione, crowdfunding, oro fisico…): inserisci quanto hai messo e quanto vale oggi.'}>
          <SceltaSegmenti etichetta="Che cosa aggiungi" larghezzaPiena valore={scelta} onCambia={setScelta} opzioni={[{ valore: 'quotato', testo: 'Titolo quotato' }, { valore: 'non_quotato', testo: 'Non quotato' }]} />
        </Voce>
      ) : null}
      {scelta === 'quotato' ? (
        <>
          <SceltaTitolo aperta={aperta} titolo={titolo} setTitolo={setTitolo} nuovo={nuovo} setNuovo={setNuovo} />
          <Affiancati>
            <Meta><Campo etichetta="Quantità" valore={quantita} onCambia={setQuantita} inputMode="decimal" segnaposto="Es. 7" /></Meta>
            <Meta><Campo etichetta="Prezzo medio di carico (PMC)" valore={pmc} onCambia={setPmc} inputMode="decimal" segnaposto="0,00" /></Meta>
          </Affiancati>
          <Affiancati>
            <Meta><Campo etichetta="Commissioni" valore={commissioni} onCambia={setCommissioni} inputMode="decimal" /></Meta>
            <Meta><CampoData etichetta="Data del primo acquisto" valore={giorno} onCambia={setGiorno} /></Meta>
          </Affiancati>
          <Tendina etichetta="Portafoglio" valore={conto} opzioni={conti} onCambia={setConto} />
          {costoTitolo !== null ? <Esito tono="informazione" testo={`Costo ${euro(costoTitolo)}. Il valore di oggi si calcola dall'ultimo prezzo del titolo; la composizione per paese e settore la scrivi dalla riga del titolo.`} /> : null}
        </>
      ) : (
        <>
          <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto={oro ? 'Es. Lingotto 10 g' : 'Es. Fondo pensione'} autoFocus={!bene} />
          <Tendina etichetta="Tipo" valore={tipo} opzioni={TIPI_BENE} onCambia={setTipo} />
          {oro ? (
            <>
              <Affiancati>
                <Meta><Tendina etichetta="Forma" valore={forma} opzioni={[{ valore: 'lingotto', testo: 'Lingotto' }, { valore: 'moneta', testo: 'Moneta' }]} onCambia={setForma} /></Meta>
                <Meta><Tendina etichetta="Purezza" valore={purezza} opzioni={PUREZZE} onCambia={setPurezza} /></Meta>
              </Affiancati>
              <Affiancati>
                <Meta><Campo etichetta="Peso in grammi" valore={peso} onCambia={setPeso} inputMode="decimal" segnaposto="Es. 10" /></Meta>
                <Meta><CampoData facoltativa etichetta="Data di acquisto" valore={acquisto} onCambia={setAcquisto} /></Meta>
              </Affiancati>
              <Campo etichetta="Costo d'acquisto" valore={costo} onCambia={setCosto} inputMode="decimal" segnaposto="0,00" />
              {quotazione ? (
                <Voce etichetta="Quanto vale oggi">
                  <Testo stile="corpo-forte">{valoreOro !== null ? euro(valoreOro) : 'Scrivi il peso'}</Testo>
                  <Testo stile="dettaglio-normale" colore="testo-secondario">{`${fini !== null ? `${numero(fini, 3)} g di oro fino × ` : ''}${euro(quotazione.euro_grammo)} al grammo, quotazione del ${data(quotazione.data)} (${quotazione.fonte}). Si aggiorna da solo.`}</Testo>
                </Voce>
              ) : (
                <Campo etichetta="Valore attuale" valore={valore} onCambia={setValore} inputMode="decimal" segnaposto="0,00"
                  aiuto="Non riesco a leggere la quotazione dell'oro in questo momento: scrivi quanto vale oggi, si aggiornerà da solo appena la quotazione torna disponibile." />
              )}
              <Campo etichetta="Dove si trova (facoltativo)" valore={dove} onCambia={setDove} segnaposto="Es. Cassetta di sicurezza" />
              <Esito tono="informazione" testo={`${guadagnoBene ? `Guadagno ${guadagnoBene}. ` : ''}L'oro fisico lo possiedi direttamente: non va in un portafoglio e lo trovi nel gruppo «Beni fisici».`} />
            </>
          ) : (
            <>
              <Affiancati>
                <Meta><Campo etichetta="Costo (quanto hai messo)" valore={costo} onCambia={setCosto} inputMode="decimal" segnaposto="0,00" /></Meta>
                <Meta><Campo etichetta="Valore attuale" valore={valore} onCambia={setValore} inputMode="decimal" segnaposto="0,00" aiuto="Lo aggiorni tu quando cambia" /></Meta>
              </Affiancati>
              <Affiancati>
                <Meta><CampoData facoltativa etichetta="Data di acquisto" valore={acquisto} onCambia={setAcquisto} /></Meta>
                <Meta><CampoData etichetta="Valore aggiornato al" valore={valoreAl} onCambia={setValoreAl} /></Meta>
              </Affiancati>
              <Tendina etichetta="Portafoglio (facoltativo)" valore={portafoglio} opzioni={[{ valore: 'nessuno', testo: 'Nessuno' }, ...conti]} onCambia={setPortafoglio} />
              <Esito tono="informazione" testo={`Non ha un prezzo di mercato${guadagnoBene ? `: guadagno ${guadagnoBene}, calcolato dal costo e dal valore che scrivi` : ': il guadagno si calcola dal costo e dal valore che scrivi'}.`} />
            </>
          )}
        </>
      )}
    </FinestraModulo>
  );
}

// Un titolo in un portafoglio: si corregge la situazione di oggi (quantità, prezzo
// medio di carico, portafoglio, data di acquisto) o lo si toglie. Niente storico.
function FinestraPosizione({ posizione, primoAcquisto, onChiudi, onComposizione }: {
  posizione: Posizione | null; primoAcquisto: string | null; onChiudi: () => void; onComposizione: () => void;
}) {
  const rif = useRiferimenti();
  const [quantita, setQuantita] = useState('');
  const [pmc, setPmc] = useState('');
  const [conto, setConto] = useState<string>('nessuno');
  const [giorno, setGiorno] = useState('');
  const x = posizione;
  useEffect(() => {
    if (!x) return;
    setQuantita(quote(x.quote).replace(/\./g, '')); setPmc(prezzoInTesto(x.prezzo_medio));
    setConto(x.conto_id ?? 'nessuno'); setGiorno(dataInTesto(primoAcquisto));
  }, [x, primoAcquisto]);
  const salva = async () => {
    await sostituisci('/investimenti/posizioni', { titolo_id: x!.id, conto_id: x!.conto_id, nuovo_conto_id: conto === 'nessuno' ? null : conto, quantita: leggiQuote(quantita),
      prezzo_medio: serve(leggiPrezzo(pmc), 'Scrivi il prezzo medio di carico, es. 121,7623'), data: giorno.trim() ? serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA') : undefined });
  };
  const elimina = () => cancella(`/investimenti/posizioni?titolo_id=${x!.id}${x!.conto_id ? `&conto_id=${x!.conto_id}` : ''}`).then(() => undefined);
  const g = Number(x?.guadagno ?? 0);
  return (
    <FinestraModulo titolo={x?.nome ?? ''} icona="globe" aperta={!!x} onChiudi={onChiudi} onSalva={salva} onElimina={elimina} etichettaElimina="Elimina dal portafoglio"
      confermaElimina={{ nome: `«${x?.nome ?? 'questo titolo'}» dal portafoglio`, dettaglio: x ? `Spariscono le ${quote(x.quote)} quote${x.conto_id ? ` di questo conto` : ''} e il prezzo medio di carico.` : undefined }}>
      {x ? (
        <>
          <Testo colore="testo-secondario">{[x.tipo.toUpperCase(), x.ticker, x.borsa, x.isin].filter(Boolean).join(' · ')}</Testo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-gruppo'] }}>
            {([['Prezzo oggi', `${prezzo(x.prezzo)}${x.prezzo_del ? ` · ${data(x.prezzo_del, 'corta')}` : ''}`, 'testo-primario'], ['Valore', euro(x.valore), 'testo-primario'],
              ['Guadagno', guadagnoTesto(g, x.guadagno_percentuale), g >= 0 ? 'testo-ok' : 'testo-errore']] as const).map(([l, v, col]) => (
              <View key={l} style={{ gap: d['spazio-testo'] }}><Testo stile="dettaglio-normale" colore="testo-secondario">{l}</Testo><Testo stile="corpo-forte" colore={col}>{v}</Testo></View>
            ))}
          </View>
          <Affiancati>
            <Meta><Campo etichetta="Quantità" valore={quantita} onCambia={setQuantita} inputMode="decimal" /></Meta>
            <Meta><Campo etichetta="Prezzo medio di carico (PMC)" valore={pmc} onCambia={setPmc} inputMode="decimal" /></Meta>
          </Affiancati>
          <Affiancati>
            <Meta><Tendina etichetta="Portafoglio" valore={conto} opzioni={[{ valore: 'nessuno', testo: 'Nessuno' }, ...rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))]} onCambia={setConto} /></Meta>
            <Meta><CampoData facoltativa etichetta="Data di acquisto" valore={giorno} onCambia={setGiorno} /></Meta>
          </Affiancati>
          <Voce etichetta="Composizione per paese e settore" aiuto="Facoltativa. Dice come è distribuito il titolo (es. Stati Uniti 62%, Europa 16%) e serve solo a calcolare «Per paese» e «Per settore» in cima alla pagina. La trovi nella scheda del fondo sul sito dell'emittente.">
            <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Scrivi la composizione" icona="pencil" onPress={onComposizione} /></View>
          </Voce>
        </>
      ) : null}
    </FinestraModulo>
  );
}

function FinestraPrezzi({ posizioni, aperta, onChiudi }: { posizioni: Posizione[]; aperta: boolean; onChiudi: () => void }) {
  const [valori, setValori] = useState<Record<string, string>>({});
  const [giorno, setGiorno] = useState('');
  useEffect(() => { if (aperta) { setValori(Object.fromEntries(posizioni.map((p) => [p.id, prezzoInTesto(p.prezzo)]))); setGiorno(dataInTesto(oggiIso())); } }, [aperta, posizioni]);
  const salva = async () => {
    const g = serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA');
    for (const p of posizioni) {
      const v = valori[p.id]?.trim();
      if (!v) continue;
      await sostituisci(`/investimenti/titoli/${p.id}/prezzi`, { prezzo: serve(leggiPrezzo(v), `Prezzo non valido per ${p.nome}: scrivilo come 9,197`), data: g });
    }
  };
  return (
    <FinestraModulo titolo="Aggiorna prezzi" icona="pencil" aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">I prezzi in euro arrivano da soli ogni giorno. Qui li correggi a mano, o li scrivi per i titoli che la fonte non conosce: il tuo prezzo vale per il giorno scelto.</Testo>
      <CampoData etichetta="Prezzi del giorno" valore={giorno} onCambia={setGiorno} />
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
      <Testo colore="testo-secondario">Come sono distribuiti i soldi dentro questo titolo, per esempio in quali paesi investe un ETF. Serve solo per «Per paese» e «Per settore» in cima alla pagina. Scrivi una voce per riga con la percentuale; sostituisce quella già scritta.</Testo>
      <SceltaSegmenti etichetta="Quale composizione" larghezzaPiena valore={dimensione} onCambia={setDimensione} opzioni={[{ valore: 'classe', testo: 'Per tipo' }, { valore: 'area', testo: 'Per paese' }, { valore: 'settore', testo: 'Per settore' }]} />
      <Campo etichetta="Voci" valore={testo} onCambia={setTesto} multiline segnaposto={'Stati Uniti 62\nEuropa 16\nGiappone 6'} />
    </FinestraModulo>
  );
}
