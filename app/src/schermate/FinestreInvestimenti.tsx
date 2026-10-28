import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Etichetta, Interruttore, Pulsante, PulsanteIcona, SceltaSegmenti, type StatoPressione, Tessera } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { cancella, crea, ErroreRichiesta, modifica, sostituisci, useDati } from '../dati/api.ts';
import type { Bene, Lotto, Portafoglio, Posizione, PrezzoLetto, Titolo, TipoBene, VoceCatalogo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, leggiPrezzo, numero, oggiIso, prezzoInTesto } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, Riquadro, serve, Voce } from './moduli.tsx';

// Finestre di SC-11 Investimenti: portafoglio, aggiunta (acquisto di un titolo, bene non quotato, bene di mercato),
// posizione (una riga per titolo e portafoglio: quantità, PCM, ultimo acquisto, prezzo di mercato) e bene.

export const TIPI_BENE: { valore: Exclude<TipoBene, 'metallo'>; testo: string }[] = [
  { valore: 'fondo_pensione', testo: 'Fondo pensione' }, { valore: 'crowdfunding', testo: 'Crowdfunding' }, { valore: 'societa', testo: 'Quota di una società' },
  { valore: 'immobile', testo: 'Immobile' }, { valore: 'altro', testo: 'Altro' },
];
export const nomeTipo = (t: TipoBene) => (t === 'metallo' ? 'Metallo prezioso' : TIPI_BENE.find((x) => x.valore === t)?.testo ?? 'Altro');

// Quantità con i soli decimali che servono (al massimo 6): 7 → "7", 3.5 → "3,5".
export const quantitaTesto = (n: number | string) => {
  const dec = (String(Number(Number(n).toFixed(6))).split('.')[1] ?? '').length;
  return numero(n, dec);
};
export const prezzoDi = (p: string | null) => (p === null ? '—' : euro(Number(p)));
export const guadagnoTesto = (g: number, pct: number | null) => `${euro(g, { segno: true })}${pct !== null ? ` · ${pct > 0 ? '+' : ''}${numero(pct, 2)}%` : ''}`;
// «23/10» per «prezzo del 23/10».
// «26/10 14:24» da un istante ISO; senza ora (prezzi vecchi) solo il giorno da `giorno`.
export const giornoOra = (istante: string | null | undefined, giorno: string | null | undefined) => {
  if (!istante) return giornoMese(giorno);
  const t = new Date(istante);
  const due = (n: number) => String(n).padStart(2, '0');
  return `${due(t.getDate())}/${due(t.getMonth() + 1)} ${due(t.getHours())}:${due(t.getMinutes())}`;
};
export const giornoMese = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

const leggiQuantita = (testo: string, campo: string, intera = false) => {
  const q = testo.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(q) || Number(q) <= 0) throw new ErroreCampo(campo, intera ? 'Scrivi quanti pezzi, es. 3' : 'Scrivi la quantità, es. 3,5');
  if (intera && !Number.isInteger(Number(q))) throw new ErroreCampo(campo, 'Le monete si contano a pezzi interi');
  return q;
};
const leggiGiorno = (testo: string, campo: string): string | undefined => {
  if (!testo.trim()) return undefined;
  return serve(leggiData(testo), 'Scrivi la data come GG/MM/AAAA', campo);
};

// Portafogli tra cui scegliere (tutti), per le tendine.
function usePortafogli(attivo: boolean) {
  const elenco = useDati<Portafoglio[]>(attivo ? '/investimenti/portafogli' : null).dati;
  return { elenco, opzioni: (elenco ?? []).map((p) => ({ valore: p.id, testo: p.conta_nel_patrimonio ? p.nome : `${p.nome} (prova)`, icona: p.icona })) };
}
const NessunPortafoglio = () => <Esito tono="attenzione" testo="Non hai ancora nessun portafoglio: creane uno con «Nuovo portafoglio»." />;

// ---------------------------------------------------------------- Portafoglio
export function FinestraPortafoglio({ portafoglio, aperta, onChiudi }: { portafoglio: Portafoglio | null; aperta: boolean; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('briefcase');
  const [conta, setConta] = useState(true);
  useEffect(() => { if (aperta) { setNome(portafoglio?.nome ?? ''); setIcona(portafoglio?.icona ?? 'briefcase'); setConta(portafoglio?.conta_nel_patrimonio ?? true); } }, [aperta, portafoglio]);
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona, conta_nel_patrimonio: conta };
    if (portafoglio) await modifica(`/investimenti/portafogli/${portafoglio.id}`, corpo); else await crea('/investimenti/portafogli', corpo);
  };
  const elimina = async () => {
    try { await cancella(`/investimenti/portafogli/${portafoglio!.id}`); } catch (e) {
      if (e instanceof ErroreRichiesta && e.stato === 409) throw new Error('Svuota prima il portafoglio: sposta o elimina titoli e beni');
      throw e;
    }
  };
  return (
    <FinestraModulo titolo={portafoglio ? portafoglio.nome : 'Nuovo portafoglio'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={portafoglio ? elimina : undefined} etichettaElimina="Elimina portafoglio"
      confermaElimina={portafoglio ? { nome: `«${portafoglio.nome}»`, dettaglio: 'Si può eliminare solo se è vuoto.',
        controlla: () => (portafoglio.vuoto ? null : 'Svuota prima il portafoglio: sposta o elimina titoli e beni') } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Lungo termine" autoFocus={!portafoglio} /></ConErrore></View>
      </View>
      <Riquadro titolo="Conta nel patrimonio" icona="landmark"
        nota={conta ? 'Il suo valore entra nei totali: portafoglio, andamento, esposizione e patrimonio.' : 'Spento: è un portafoglio di prova. Ha i suoi totali ma resta fuori dai totali generali e dal patrimonio.'}
        interruttore={<Interruttore acceso={conta} onCambia={setConta} etichetta="Conta nel patrimonio" />} />
    </FinestraModulo>
  );
}

// ---------------------------------------------------------------- Scelta del titolo
// Ricerca di un titolo per ISIN, ticker o nome: prima nell'elenco comune, poi sui
// mercati (Yahoo Finance e OpenFIGI, tramite l'API). Un titolo trovato sul mercato
// entra nell'elenco al salvataggio.
export type NuovoTitolo = { isin: string; nome: string; ticker: string; simbolo?: string | null; borsa?: string | null; tipo?: string; daMercato?: boolean };
type TitoloMercato = { isin: string | null; ticker: string | null; simbolo: string | null; nome: string; tipo: string; borsa: string | null };
const codiceTitolo = (t: { tipo?: string; ticker?: string | null; borsa?: string | null; isin?: string | null }) =>
  [t.tipo?.toUpperCase(), t.ticker, t.borsa, t.isin].filter(Boolean).join(' · ');
const pareIsin = (q: string) => /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(q);

function RisultatoTitolo({ nome, codice, origine, onPress }: { nome: string; codice: string; origine: string; onPress: () => void }) {
  const { c } = useTema();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={nome} onPress={onPress}
      style={(s: StatoPressione) => ({ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'],
        borderRadius: d['raggio-controllo'], backgroundColor: s.hovered ? c['sfondo-hover'] : 'transparent' })}>
      <Tessera icona="globe" misura="piccola" />
      <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}><Testo stile="corpo-forte" numberOfLines={1}>{nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1}>{codice}</Testo></View>
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
          <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{codiceTitolo(scelto ?? nuovo)}</Testo></View>
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

async function idTitolo(titolo: string | null, nuovo: NuovoTitolo) {
  if (titolo && titolo !== 'nuovo') return titolo;
  if (titolo === 'nuovo' && nuovo.daMercato) {
    return (await crea<Titolo>('/investimenti/titoli', { isin: nuovo.isin || undefined, nome: nuovo.nome, ticker: nuovo.ticker || undefined, simbolo: nuovo.simbolo ?? undefined,
      borsa: nuovo.borsa ?? undefined, tipo: nuovo.tipo })).id;
  }
  if (!nuovo.isin.trim()) return serve(null, 'Cerca il titolo e sceglilo, oppure scrivi l’ISIN di uno nuovo', 'titolo');
  return (await crea<Titolo>('/investimenti/titoli', { isin: nuovo.isin.trim(), nome: serve(nuovo.nome.trim(), 'Scrivi il nome del titolo', 'titolo'), ticker: nuovo.ticker.trim() || undefined })).id;
}

// ---------------------------------------------------------------- Aggiunta
export type PartenzaAggiunta = { scelta?: 'quotato' | 'non_quotato' | 'mercato'; portafoglioId?: string | null; titoloId?: string | null };
type Scelta = 'quotato' | 'non_quotato' | 'mercato';

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

// Grammi di metallo fino e valore stimato di una voce del catalogo con la sua quotazione spot.
function stimaMetallo(voce: VoceCatalogo | undefined, quantita: number, purezza: number) {
  if (!voce || !(quantita > 0)) return { fini: null, valore: null };
  const fini = voce.unita === 'pezzi' ? (voce.grammi_fini ? quantita * Number(voce.grammi_fini) : null) : (purezza > 0 ? (quantita * purezza) / 1000 : null);
  return { fini, valore: fini !== null && voce.euro_grammo ? fini * Number(voce.euro_grammo) : null };
}
const purezzaInTesto = (p: string | null | undefined) => (p ? numero(p, Number.isInteger(Number(p)) ? 0 : 1) : '');

export function FinestraAggiungi({ aperta, partenza, onChiudi }: { aperta: boolean; partenza: PartenzaAggiunta; onChiudi: () => void }) {
  const { elenco, opzioni } = usePortafogli(aperta);
  const catalogo = useDati<VoceCatalogo[]>(aperta ? '/investimenti/catalogo' : null).dati ?? [];
  const [scelta, setScelta] = useState<Scelta>('quotato');
  const [portafoglio, setPortafoglio] = useState<string | null>(null);
  // Titolo quotato
  const [titolo, setTitolo] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<NuovoTitolo>({ isin: '', nome: '', ticker: '' });
  const [quantita, setQuantita] = useState('');
  const [giorno, setGiorno] = useState('');
  // Non quotato
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Exclude<TipoBene, 'metallo'>>('fondo_pensione');
  const [costo, setCosto] = useState('');
  const [valore, setValore] = useState('');
  // Di mercato
  const [codice, setCodice] = useState<string | null>(null);
  const [purezza, setPurezza] = useState('');
  // Comuni ai beni
  const [dove, setDove] = useState('');
  const [acquisto, setAcquisto] = useState('');

  useEffect(() => {
    if (!aperta) return;
    setScelta(partenza.scelta ?? 'quotato'); setPortafoglio(partenza.portafoglioId ?? null);
    setTitolo(partenza.titoloId ?? null); setNuovo({ isin: '', nome: '', ticker: '' }); setQuantita(''); setGiorno('');
    setNome(''); setTipo('fondo_pensione'); setCosto(''); setValore(''); setCodice(null); setPurezza(''); setDove(''); setAcquisto('');
  }, [aperta, partenza]);
  // Senza un portafoglio di partenza si propone il primo.
  useEffect(() => { if (aperta && !portafoglio && elenco?.length) setPortafoglio(elenco[0].id); }, [aperta, portafoglio, elenco]);

  const voce = catalogo.find((v) => v.codice === codice);
  const pezzi = voce?.unita === 'pezzi';
  useEffect(() => { setPurezza(purezzaInTesto(voce?.purezza_predefinita)); }, [codice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Titolo già nel portafoglio: l'acquisto si aggiunge ai precedenti (decisione 67).
  const idReale = titolo && titolo !== 'nuovo' ? titolo : null;
  const lotti = useDati<Lotto[]>(aperta && scelta === 'quotato' && idReale && portafoglio ? `/investimenti/lotti?titolo_id=${idReale}&portafoglio_id=${portafoglio}` : null).dati ?? [];
  const q0 = lotti.reduce((t, l) => t + Number(l.quantita), 0);
  const notaPosizione = lotti.length && idReale ? `Il titolo è già in questo portafoglio (${quantitaTesto(q0)} quote): l'acquisto si aggiunge ai precedenti.` : null;

  const dataAcq = acquisto.trim() ? leggiData(acquisto) : null;
  const costoN = Number(leggiImporto(costo) ?? NaN);
  const stima = stimaMetallo(voce, Number(quantita.trim().replace(',', '.')), Number(purezza.trim().replace(',', '.')));
  const guadagnoBene = guadagnoDal(costoN, scelta === 'mercato' ? stima.valore ?? NaN : Number(leggiImporto(valore) ?? NaN), dataAcq);

  const salva = async () => {
    const port = serve(portafoglio, 'Scegli il portafoglio', 'portafoglio');
    if (scelta === 'quotato') {
      const id = await idTitolo(titolo, nuovo);
      const qt = leggiQuantita(quantita, 'quantita');
      const dt = leggiGiorno(giorno, 'data');
      // Il prezzo lo prende l'app: la chiusura di borsa del giorno dell'acquisto.
      await crea('/investimenti/lotti', { titolo_id: id, portafoglio_id: port, quantita: qt, data: dt });
      return;
    }
    const dt = leggiGiorno(acquisto, 'data_acquisto');
    if (scelta === 'non_quotato') {
      await crea('/investimenti/beni', { portafoglio_id: port, nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), tipo, costo: serve(leggiImporto(costo), 'Scrivi quanto hai pagato', 'costo'),
        valore: serve(leggiImporto(valore), 'Scrivi quanto vale oggi', 'valore'), data_acquisto: dt, dove: dove.trim() || undefined });
      return;
    }
    const v = serve(voce, 'Scegli che cosa hai', 'voce');
    await crea('/investimenti/beni', { portafoglio_id: port, catalogo: v.codice, quantita: leggiQuantita(quantita, 'quantita', v.unita === 'pezzi'),
      purezza: v.unita === 'grammi' ? serve(purezza.trim().replace(',', '.') || null, 'Scrivi la purezza, es. 999,9', 'purezza') : undefined,
      costo: serve(leggiImporto(costo), 'Scrivi quanto hai pagato in tutto', 'costo'), data_acquisto: dt, dove: dove.trim() || undefined });
  };

  const tendinaPortafoglio = (
    <ConErrore campo="portafoglio"><Tendina etichetta="Portafoglio" valore={portafoglio} opzioni={opzioni} onCambia={setPortafoglio} iconaPrima="briefcase" segnaposto="Scegli il portafoglio" /></ConErrore>
  );
  const campoDove = <Campo etichetta="Dove si trova (facoltativo)" valore={dove} onCambia={setDove} segnaposto="Es. Cassetta di sicurezza, Fineco" />;

  return (
    <FinestraModulo titolo="Aggiungi" icona="trending-up" aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      <Voce etichetta="Che cosa aggiungi?" aiuto={scelta === 'quotato'
        ? 'Un acquisto di ETF, azioni, obbligazioni o crypto: quante quote e in che giorno. Il prezzo lo prende l\'app dalla borsa di quel giorno.'
        : scelta === 'non_quotato' ? 'Senza prezzo di mercato (fondo pensione, crowdfunding, immobile…): quanto hai pagato e quanto vale oggi, lo aggiorni tu.'
          : 'Oro, argento, platino, palladio o monete: il valore si calcola da solo con la quotazione del metallo.'}>
        <SceltaSegmenti etichetta="Che cosa aggiungi" larghezzaPiena valore={scelta} onCambia={setScelta}
          opzioni={[{ valore: 'quotato', testo: 'Titolo quotato' }, { valore: 'non_quotato', testo: 'Bene non quotato' }, { valore: 'mercato', testo: 'Bene con prezzo di mercato' }]} />
      </Voce>
      {elenco && elenco.length === 0 ? <NessunPortafoglio /> : null}
      {scelta === 'quotato' ? (
        <>
          <ConErrore campo="titolo"><View style={{ gap: d['spazio-blocco'] }}><SceltaTitolo aperta={aperta} titolo={titolo} setTitolo={setTitolo} nuovo={nuovo} setNuovo={setNuovo} /></View></ConErrore>
          <Affiancati>
            <Meta><ConErrore campo="quantita"><Campo etichetta="Quantità" valore={quantita} onCambia={setQuantita} inputMode="decimal" segnaposto="Es. 7" /></ConErrore></Meta>
            <Meta><ConErrore campo="data"><CampoData facoltativa etichetta="Giorno dell'acquisto" valore={giorno} onCambia={setGiorno} aiuto="Vuoto: oggi" /></ConErrore></Meta>
          </Affiancati>
          {tendinaPortafoglio}
          {notaPosizione ? <Esito tono="informazione" testo={notaPosizione} /> : null}
          <Esito tono="informazione" testo="Il prezzo di ogni quota è la chiusura di borsa di quel giorno. Se la tua banca ha un PCM diverso, lo correggi dopo nella finestra del titolo." />
        </>
      ) : scelta === 'non_quotato' ? (
        <>
          <ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo pensione" autoFocus /></ConErrore>
          <Tendina etichetta="Tipo" valore={tipo} opzioni={TIPI_BENE} onCambia={setTipo} />
          <Affiancati>
            <Meta><ConErrore campo="costo"><Campo etichetta="Prezzo di acquisto" valore={costo} onCambia={setCosto} inputMode="decimal" segnaposto="0,00" /></ConErrore></Meta>
            <Meta><ConErrore campo="valore"><Campo etichetta="Valore attuale" valore={valore} onCambia={setValore} inputMode="decimal" segnaposto="0,00" aiuto="Lo aggiorni tu quando cambia" /></ConErrore></Meta>
          </Affiancati>
          {campoDove}
          <ConErrore campo="data_acquisto"><CampoData facoltativa etichetta="Data di acquisto (facoltativa)" valore={acquisto} onCambia={setAcquisto} /></ConErrore>
          {tendinaPortafoglio}
          <Esito tono="informazione" testo={`Non ha un prezzo di mercato${guadagnoBene ? `: guadagno ${guadagnoBene}` : ': il guadagno si calcola dal prezzo di acquisto e dal valore che scrivi'}.`} />
        </>
      ) : (
        <>
          <ConErrore campo="voce">
            <Tendina etichetta="Che cosa hai" valore={codice} onCambia={setCodice} segnaposto="Scegli dall'elenco"
              opzioni={catalogo.map((v) => ({ valore: v.codice, testo: `${v.nome}${v.valore_unitario ? ` · ${euro(v.valore_unitario)}${v.unita === 'pezzi' ? ' al pezzo' : ' al grammo'}` : ''}` }))} />
          </ConErrore>
          {voce ? (
            <>
              <Affiancati>
                <Meta><ConErrore campo="quantita"><Campo etichetta={pezzi ? 'Pezzi' : 'Grammi'} valore={quantita} onCambia={setQuantita} inputMode="decimal" segnaposto={pezzi ? 'Es. 2' : 'Es. 10'} /></ConErrore></Meta>
                {pezzi ? null : <Meta><ConErrore campo="purezza"><Campo etichetta="Purezza (‰)" valore={purezza} onCambia={setPurezza} inputMode="decimal" segnaposto="999,9" aiuto="Millesimi: 999,9 = 24 carati, 750 = 18 carati" /></ConErrore></Meta>}
              </Affiancati>
              <ConErrore campo="costo"><Campo etichetta="Prezzo di acquisto totale" valore={costo} onCambia={setCosto} inputMode="decimal" segnaposto="0,00" /></ConErrore>
              {campoDove}
              <ConErrore campo="data_acquisto"><CampoData facoltativa etichetta="Data di acquisto (facoltativa)" valore={acquisto} onCambia={setAcquisto} /></ConErrore>
              {tendinaPortafoglio}
              <StimaMetallo voce={voce} fini={stima.fini} valore={stima.valore} guadagno={guadagnoBene} />
            </>
          ) : null}
        </>
      )}
    </FinestraModulo>
  );
}

function StimaMetallo({ voce, fini, valore, guadagno }: { voce: VoceCatalogo; fini: number | null; valore: number | null; guadagno: string | null }) {
  if (!voce.euro_grammo) return <Esito tono="attenzione" testo="La quotazione del metallo non è disponibile in questo momento: il bene si salva, il valore comparirà appena torna disponibile." />;
  return (
    <Voce etichetta="Valore stimato oggi">
      <Testo stile="corpo-forte">{valore !== null ? euro(valore) : 'Scrivi quanti ne hai'}</Testo>
      <Testo stile="dettaglio-normale" colore="testo-secondario">
        {`${fini !== null ? `${numero(fini, 3)} g di metallo fino × ` : ''}${euro(voce.euro_grammo)} al grammo${voce.quotazione_al ? `, quotazione del ${data(voce.quotazione_al)}` : ''}. Si aggiorna da solo.${guadagno ? ` Guadagno ${guadagno}.` : ''}`}
      </Testo>
    </Voce>
  );
}

// ---------------------------------------------------------------- Bene
export function FinestraBene({ bene, aperta, onChiudi }: { bene: Bene | null; aperta: boolean; onChiudi: () => void }) {
  const { opzioni } = usePortafogli(aperta);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Exclude<TipoBene, 'metallo'>>('altro');
  const [costo, setCosto] = useState('');
  const [valore, setValore] = useState('');
  const [valoreAl, setValoreAl] = useState('');
  const [quantita, setQuantita] = useState('');
  const [purezza, setPurezza] = useState('');
  const [dove, setDove] = useState('');
  const [acquisto, setAcquisto] = useState('');
  const [portafoglio, setPortafoglio] = useState<string | null>(null);
  useEffect(() => {
    if (!aperta || !bene) return;
    setNome(bene.nome); setTipo(bene.tipo === 'metallo' ? 'altro' : bene.tipo); setCosto(importoInTesto(bene.costo)); setValore(importoInTesto(bene.valore)); setValoreAl(dataInTesto(bene.valore_al ?? oggiIso()));
    setQuantita(bene.quantita ? quantitaTesto(bene.quantita) : ''); setPurezza(purezzaInTesto(bene.purezza)); setDove(bene.dove ?? ''); setAcquisto(dataInTesto(bene.data_acquisto)); setPortafoglio(bene.portafoglio_id);
  }, [aperta, bene]);
  const mercato = !!bene?.catalogo;
  const pezzi = bene?.catalogo?.unita === 'pezzi';
  const stimaFini = mercato && bene?.catalogo && quantita
    ? (pezzi ? Number(bene.grammi_fini) / Math.max(Number(bene.quantita), 1e-9) * Number(quantita.replace(',', '.')) : (Number(quantita.replace(',', '.')) * Number(purezza.replace(',', '.'))) / 1000) : null;
  const valoreStimato = stimaFini !== null && bene?.euro_grammo && Number.isFinite(stimaFini) ? stimaFini * Number(bene.euro_grammo) : null;
  const guadagno = guadagnoDal(Number(leggiImporto(costo) ?? NaN), mercato ? valoreStimato ?? NaN : Number(leggiImporto(valore) ?? NaN), acquisto.trim() ? leggiData(acquisto) : null);

  const salva = async () => {
    const dt = acquisto.trim() ? serve(leggiData(acquisto), 'Scrivi la data come GG/MM/AAAA', 'data_acquisto') : null;
    const comune = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), costo: serve(leggiImporto(costo), 'Scrivi quanto hai pagato', 'costo'), data_acquisto: dt, dove: dove.trim() || null,
      portafoglio_id: portafoglio && portafoglio !== bene!.portafoglio_id ? portafoglio : undefined };
    if (mercato) {
      await modifica(`/investimenti/beni/${bene!.id}`, { ...comune, quantita: leggiQuantita(quantita, 'quantita', pezzi),
        purezza: pezzi ? undefined : serve(purezza.trim().replace(',', '.') || null, 'Scrivi la purezza, es. 999,9', 'purezza') });
    } else {
      await modifica(`/investimenti/beni/${bene!.id}`, { ...comune, tipo, valore: serve(leggiImporto(valore), 'Scrivi quanto vale oggi', 'valore'),
        valore_al: serve(leggiData(valoreAl), 'Scrivi la data del valore come GG/MM/AAAA', 'valore_al') });
    }
  };
  return (
    <FinestraModulo titolo={bene ? `Modifica ${bene.nome}` : ''} icona={mercato ? 'banknote' : 'layers'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={bene ? () => cancella(`/investimenti/beni/${bene.id}`).then(() => undefined) : undefined}
      confermaElimina={bene ? { nome: `«${bene.nome}»`, dettaglio: 'Il bene esce dal portafoglio e dai totali.' } : undefined}>
      {bene ? (
        <>
          {mercato ? <Testo colore="testo-secondario">{`${bene.catalogo!.nome} · il valore si calcola dalla quotazione`}</Testo> : null}
          <ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} /></ConErrore>
          {mercato ? (
            <Affiancati>
              <Meta><ConErrore campo="quantita"><Campo etichetta={pezzi ? 'Pezzi' : 'Grammi'} valore={quantita} onCambia={setQuantita} inputMode="decimal" /></ConErrore></Meta>
              {pezzi ? null : <Meta><ConErrore campo="purezza"><Campo etichetta="Purezza (‰)" valore={purezza} onCambia={setPurezza} inputMode="decimal" /></ConErrore></Meta>}
            </Affiancati>
          ) : <Tendina etichetta="Tipo" valore={tipo} opzioni={TIPI_BENE} onCambia={setTipo} />}
          <Affiancati>
            <Meta><ConErrore campo="costo"><Campo etichetta="Prezzo di acquisto" valore={costo} onCambia={setCosto} inputMode="decimal" /></ConErrore></Meta>
            {mercato ? null : <Meta><ConErrore campo="valore"><Campo etichetta="Valore attuale" valore={valore} onCambia={setValore} inputMode="decimal" /></ConErrore></Meta>}
          </Affiancati>
          {mercato ? null : <ConErrore campo="valore_al"><CampoData etichetta="Valore aggiornato al" valore={valoreAl} onCambia={setValoreAl} /></ConErrore>}
          {campoDoveBene(dove, setDove)}
          <ConErrore campo="data_acquisto"><CampoData facoltativa etichetta="Data di acquisto (facoltativa)" valore={acquisto} onCambia={setAcquisto} /></ConErrore>
          <Tendina etichetta="Portafoglio" valore={portafoglio} opzioni={opzioni} onCambia={setPortafoglio} iconaPrima="briefcase" />
          {mercato && valoreStimato !== null ? <Esito tono="informazione" testo={`Vale circa ${euro(valoreStimato)} con la quotazione di oggi.${guadagno ? ` Guadagno ${guadagno}.` : ''}`} />
            : !mercato && guadagno ? <Esito tono="informazione" testo={`Guadagno ${guadagno}.`} /> : null}
        </>
      ) : null}
    </FinestraModulo>
  );
}
const campoDoveBene = (dove: string, setDove: (v: string) => void) => <Campo etichetta="Dove si trova (facoltativo)" valore={dove} onCambia={setDove} segnaposto="Es. Cassetta di sicurezza" />;

// ---------------------------------------------------------------- Posizione
// Un titolo in un portafoglio: gli acquisti (giorno e quote; il prezzo, nascosto, è la chiusura di Yahoo di quel giorno, decisione 67),
// l'allineamento alla banca (decisione 68: PCM e prezzo di mercato come li mostra la banca allineano in proporzione tutti i prezzi del
// titolo, anche nel passato del grafico, finché non premi «Sincronizza»), lo spostamento in un altro portafoglio o l'eliminazione.
export function FinestraPosizione({ posizione, aperta, portafogli, onChiudi, onAggiungiAcquisto }: {
  posizione: Posizione | null; aperta: boolean; portafogli: Portafoglio[]; onChiudi: () => void; onAggiungiAcquisto: () => void;
}) {
  const x = posizione;
  const acquisti = useDati<Lotto[]>(x ? `/investimenti/lotti?titolo_id=${x.titolo_id}&portafoglio_id=${x.portafoglio_id}` : null).dati;
  const [verso, setVerso] = useState<string | null>(null);
  const [pcm, setPcm] = useState('');
  const [prezzo, setPrezzo] = useState('');
  // Gli acquisti come si stanno scrivendo: giorno e quote; `tolto` = da eliminare salvando.
  const [righe, setRighe] = useState<{ id: string; giorno: string; quantita: string; tolto: boolean }[]>([]);
  const [leggendo, setLeggendo] = useState(false);
  const [erroreBorsa, setErroreBorsa] = useState<string | null>(null);
  useEffect(() => { if (x) setVerso(x.portafoglio_id); }, [x?.titolo_id, x?.portafoglio_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (aperta && x) { setPcm(prezzoInTesto(x.prezzo_medio)); setPrezzo(prezzoInTesto(x.prezzo)); setErroreBorsa(null); } }, [aperta, x?.prezzo_medio, x?.prezzo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aperta && acquisti) setRighe(acquisti.map((a) => ({ id: a.id, giorno: dataInTesto(a.data), quantita: quantitaTesto(a.quantita), tolto: false })));
  }, [aperta, acquisti]);
  const cambiaRiga = (id: string, campo: 'giorno' | 'quantita' | 'tolto', valore: string | boolean) => setRighe((rs) => rs.map((r) => (r.id === id ? { ...r, [campo]: valore } : r)));
  const sincronizza = () => (x ? cancella(`/investimenti/posizioni/allinea?titolo_id=${x.titolo_id}&portafoglio_id=${x.portafoglio_id}`) : Promise.resolve());
  const salva = async () => {
    if (righe.length && righe.every((r) => r.tolto)) throw new ErroreCampo('acquisti', 'Resta almeno un acquisto: per togliere il titolo usa «Elimina posizione»');
    // Prima gli acquisti (cambiano il PCM di Yahoo), poi l'allineamento alla banca, confrontato con i numeri di Yahoo aggiornati.
    for (const r of righe) {
      const prima = acquisti?.find((a) => a.id === r.id);
      if (!prima) continue;
      if (r.tolto) { await cancella(`/investimenti/lotti/${r.id}`); continue; }
      const q = leggiQuantita(r.quantita, `quantita-${r.id}`), g = serve(leggiGiorno(r.giorno, `giorno-${r.id}`), 'Scrivi il giorno come GG/MM/AAAA', `giorno-${r.id}`);
      if (Number(q) !== Number(prima.quantita) || g !== prima.data) await modifica(`/investimenti/lotti/${r.id}`, { quantita: q, ...(g !== prima.data ? { data: g } : {}) });
    }
    if (x) {
      const nuovoPcm = pcm.trim() && pcm.trim() !== prezzoInTesto(x.prezzo_medio) ? serve(leggiPrezzo(pcm), 'Scrivi il PCM, es. 121,7623', 'pcm') : undefined;
      const nuovoPrezzo = prezzo.trim() && prezzo.trim() !== prezzoInTesto(x.prezzo) ? serve(leggiPrezzo(prezzo), 'Scrivi il prezzo di mercato, es. 131,80', 'prezzo') : undefined;
      // Senza un prezzo di Yahoo non c'è niente da allineare: il prezzo scritto vale come prezzo di oggi.
      if (nuovoPrezzo && x.stato === 'mancante') await sostituisci(`/investimenti/titoli/${x.titolo_id}/prezzi`, { prezzo: nuovoPrezzo });
      const allinea = { ...(nuovoPcm ? { pcm: nuovoPcm } : {}), ...(nuovoPrezzo && x.stato !== 'mancante' ? { prezzo: nuovoPrezzo } : {}) };
      if (Object.keys(allinea).length) await sostituisci('/investimenti/posizioni/allinea', { titolo_id: x.titolo_id, portafoglio_id: x.portafoglio_id, ...allinea });
    }
    if (x && verso && verso !== x.portafoglio_id) await modifica('/investimenti/posizioni', { titolo_id: x.titolo_id, portafoglio_id: x.portafoglio_id, nuovo_portafoglio_id: verso });
  };
  const leggiDallaBorsa = async () => {
    if (!x) return;
    setLeggendo(true); setErroreBorsa(null);
    try { await crea<PrezzoLetto>(`/investimenti/titoli/${x.titolo_id}/prezzi/leggi`); } catch (e) {
      setErroreBorsa(e instanceof Error ? e.message : 'La borsa non risponde: riprova tra poco');
    } finally { setLeggendo(false); }
  };
  const elimina = () => cancella(`/investimenti/posizioni?titolo_id=${x!.titolo_id}&portafoglio_id=${x!.portafoglio_id}`).then(() => undefined);
  const g = x?.guadagno != null ? Number(x.guadagno) : null;
  const cifre: [string, string, 'testo-primario' | 'testo-ok' | 'testo-errore' | 'testo-secondario'][] = x ? [
    ['Quantità', quantitaTesto(x.quantita), 'testo-primario'], ['PCM', prezzoDi(x.prezzo_medio), 'testo-primario'],
    ['Prezzo di mercato', x.prezzo ? prezzoDi(x.prezzo) : 'mancante', x.prezzo ? 'testo-primario' : 'testo-errore'], ['Valore', euro(x.valore), 'testo-primario'],
    ['Guadagno', g === null ? '—' : guadagnoTesto(g, x.guadagno_percentuale), g === null ? 'testo-secondario' : g >= 0 ? 'testo-ok' : 'testo-errore'],
  ] : [];
  const yahoo = x ? `Yahoo dice PCM ${prezzoDi(x.pcm_borsa)} e prezzo ${x.prezzo_borsa ? prezzoDi(x.prezzo_borsa) : 'mancante'}` : '';
  return (
    <FinestraModulo titolo={x?.nome ?? ''} icona="globe" aperta={aperta} onChiudi={onChiudi} onSalva={salva} onElimina={elimina} etichettaElimina="Elimina posizione"
      confermaElimina={{ nome: `«${x?.nome ?? 'questa posizione'}» da ${x?.portafoglio ?? 'questo portafoglio'}`, dettaglio: x ? 'Spariscono tutti i suoi acquisti.' : undefined }}>
      {x ? (
        <>
          <Testo colore="testo-secondario">{[x.tipo.toUpperCase(), x.ticker, x.borsa, x.isin].filter(Boolean).join(' · ')}</Testo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: d['spazio-gruppo'], rowGap: d['spazio-blocco'] }}>
            {cifre.map(([l, v, col]) => <View key={l} style={{ gap: d['spazio-testo'] }}><Testo stile="dettaglio-normale" colore="testo-secondario">{l}</Testo><Testo stile="corpo-forte" colore={col}>{v}</Testo></View>)}
          </View>
          {x.stato !== 'ok' ? <Esito tono={x.stato === 'mancante' ? 'errore' : 'attenzione'} testo={x.stato === 'mancante' ? 'Prezzo mancante: il valore non si calcola. Premi «Leggi dalla borsa» o scrivi il prezzo qui sotto.' : `Il prezzo è del ${giornoMese(x.prezzo_al)}: non è aggiornato.`} /> : null}
          <Voce etichetta="Come la banca" aiuto={x.allineata
            ? `Allineato alla banca: ${yahoo}. Tutti i prezzi del titolo, anche nel passato del grafico, sono spostati in proporzione finché non sincronizzi.`
            : `${yahoo}. Se la tua banca mostra altri numeri, scrivili: tutto il grafico del titolo si allinea in proporzione.`}>
            <Affiancati>
              <Meta><ConErrore campo="pcm"><Campo etichetta="PCM" valore={pcm} onCambia={setPcm} inputMode="decimal" segnaposto="0,00" /></ConErrore></Meta>
              <Meta><ConErrore campo="prezzo"><Campo etichetta="Prezzo di mercato" valore={prezzo} onCambia={setPrezzo} inputMode="decimal" segnaposto="0,00" /></ConErrore></Meta>
            </Affiancati>
            {erroreBorsa ? <Esito tono="errore" testo={erroreBorsa} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
              {x.allineata ? <Pulsante tipo="testo" icona="repeat" etichetta="Sincronizza" onPress={sincronizza} /> : null}
              <Pulsante tipo="testo" icona="trending-up" etichetta={leggendo ? 'Leggo dalla borsa…' : 'Leggi dalla borsa'} onPress={leggiDallaBorsa} />
            </View>
          </Voce>
          <Voce etichetta="Acquisti" aiuto="Giorno e quote di ogni acquisto: il prezzo lo prende l'app dalla borsa di quel giorno.">
            <ConErrore campo="acquisti"><View style={{ gap: d['spazio-blocco'] }}>
              {righe.filter((r) => !r.tolto).map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
                  <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo={`giorno-${r.id}`}><CampoData etichetta="Giorno" valore={r.giorno} onCambia={(v) => cambiaRiga(r.id, 'giorno', v)} /></ConErrore></View>
                  <View style={{ width: 120 }}><ConErrore campo={`quantita-${r.id}`}><Campo etichetta="Quote" valore={r.quantita} onCambia={(v) => cambiaRiga(r.id, 'quantita', v)} inputMode="decimal" /></ConErrore></View>
                  <PulsanteIcona icona="trash-2" etichetta={`Togli l'acquisto del ${r.giorno}`} fantasma onPress={() => cambiaRiga(r.id, 'tolto', true)} />
                </View>
              ))}
            </View></ConErrore>
            <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="plus" etichetta="Aggiungi acquisto" onPress={onAggiungiAcquisto} /></View>
          </Voce>
          <Tendina etichetta="Sposta in un altro portafoglio" valore={verso} iconaPrima="briefcase" onCambia={setVerso}
            opzioni={portafogli.map((p) => ({ valore: p.id, testo: p.conta_nel_patrimonio ? p.nome : `${p.nome} (prova)`, icona: p.icona }))} />
        </>
      ) : null}
    </FinestraModulo>
  );
}
