import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { RigaAvanzamento, RigaSalvadanaio, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import type { ElencoSpese, Obiettivo, Spesa, Traguardo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso, percento } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { contoCondiviso, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import { meseDi, meseDiVoce } from '../mesePersonale.ts';
import { Caricamento, fraMesi, mancaAlTraguardo, pianoCifra, quotaMensileSalvadanaio, ritmoObiettivo, ordinaPerScadenza, suQuelConto } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

// SC-04 Obiettivi (decisione 20): obiettivi annidabili con sotto-salvadanai
// (salvadanai con soldi propri) e traguardi di copertura (quanto copre il padre).

const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);
// L'icona scelta dall'utente; se non l'ha scelta, una di base.
const iconaDi = (o: Obiettivo) => o.icona ?? (o.traguardi.length ? 'shield-check' : 'target');
const tonoDi = (pct: number | null) => (pct !== null && pct >= 100 ? 'ok' as const : 'accento' as const);
// Riga della parte propria (quanto è messo direttamente nel padre), solo se ha sotto-salvadanai.
const rigaPropria = (o: Obiettivo, apri: () => void) => (
  <RigaSalvadanaio variante="sotto" propria nome="Liberi nel salvadanaio" icona="wallet" valore={0} cifra={euro(o.versato)} onCifra={apri} onModifica={apri} />
);
// Scadenza in piccolo: «entro». Colore per urgenza. Con una durata che si ripete: «ogni N mesi».
const scadenzaDi = (o: Obiettivo, inizio: number): { testo: string; tono: 'secondario' | 'attenzione' | 'errore' } | undefined => {
  if (o.durata_mesi) return { testo: o.durata_mesi === 1 ? 'ogni mese' : `ogni ${o.durata_mesi} mesi`, tono: 'secondario' };
  const dt = o.scadenza;
  if (!dt) return undefined;
  const mese = meseDi(dt, inizio);
  // L'anno si mostra solo se non è quello di oggi.
  const anno = dt.slice(0, 4);
  const giornoMese = `${Number(dt.slice(8, 10))} ${meseCorto(dt)}`;
  const forma = anno === oggiIso().slice(0, 4) ? giornoMese : `${giornoMese} ${anno}`;
  const raggiunto = o.percentuale !== null && o.percentuale >= 100;
  const adesso = meseDi(oggiIso(), inizio);
  if (!raggiunto && dt < oggiIso()) return { testo: `scaduto ${forma}`, tono: 'errore' };
  return { testo: `entro ${forma}`, tono: !raggiunto && mese === adesso ? 'attenzione' : 'secondario' };
};
// La durata scritta: un numero intero di mesi, da 1 a 120 (come l'API).
const leggiMesi = (x: string): number | null => { const n = Number(x.trim()); return x.trim() && Number.isInteger(n) && n >= 1 && n <= 120 ? n : null; };
const cifraDi = (o: Obiettivo) => (o.traguardo_effettivo ? `${euro(o.saldo)}/${euro(o.traguardo_effettivo)}` : euro(o.saldo));
const pctDi = (o: Obiettivo) => (o.traguardo_effettivo && o.percentuale !== null ? percento(o.percentuale) : undefined);

// Dentro Salvadanai: ogni salvadanaio ha il suo riquadro (richiesta di Manuel), con quanto
// c'è, i traguardi di copertura e i sotto-salvadanai annidati, in ordine di scadenza.
// `spese`: le spese del mese scelto, per dire nel riquadro se il promemoria del mese è spuntato (la spunta sposta i soldi, decisione 61).
export function Obiettivi({ nuovo = 0, filtro = 'tutti', spese = [] }: { nuovo?: number; filtro?: string; spese?: Spesa[] }) {
  const tutti = useDati<Obiettivo[]>('/obiettivi');
  const dati = tutti.dati ?? null, errore = tutti.errore;
  const [modifica_, setModifica] = useState<{ obiettivo: Obiettivo | null; padre?: string } | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  const [sopra, setSopra] = useState<number | string | null>(null);
  const [traguardo, setTraguardo] = useState<{ obiettivo: Obiettivo; traguardo: Traguardo | null } | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const [apertiFigli, setApertiFigli] = useState<Set<string>>(new Set());
  const { c } = useTema();
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const inizio = rif.profilo?.inizio_mese ?? 1;
  // Il pulsante «Nuovo salvadanaio» sta nella testata di Salvadanai: ogni pressione alza `nuovo` e apre la finestra.
  useEffect(() => { if (nuovo > 0) setModifica({ obiettivo: null }); }, [nuovo]);
  if (!dati) return <Caricamento errore={errore} />;

  const apriChiudi = (id: string) => setAperti((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Sotto-salvadanai annidati: ogni livello ha un rientro con una linea a sinistra e il suo "Aggiungi dentro".
  const apriChiudiFigli = (id: string) => setApertiFigli((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const MAX = 4;
  const albero = (figli: Obiettivo[], padreConto: string | null, padreId: string, livello = 0): ReactNode => (
    <View style={{ gap: d['spazio-pillole'] }}>
      {(apertiFigli.has(padreId) ? figli : figli.slice(0, MAX)).map((f) => (
        <View key={f.id} style={{ gap: d['spazio-pillole'] }}>
          <RigaSalvadanaio variante="sotto" nome={f.nome} icona={iconaDi(f)} valore={f.percentuale ?? 0} tono={tonoDi(f.percentuale)} cifra={cifraDi(f)} percentuale={pctDi(f)} scadenza={scadenzaDi(f, inizio)}
            conto={f.conto && !f.conto_ereditato && f.conto_id !== padreConto ? { nome: f.conto, icona: f.conto_icona } : undefined}
            onCifra={() => setVersa(f)} onModifica={() => setModifica({ obiettivo: f })} />
          {f.figli.length ? (
            <View style={{ gap: d['spazio-pillole'], paddingLeft: d['margine-voce-h'], borderLeftWidth: d['misura-bordo-forte'], borderLeftColor: c['bordo-separatore'] }}>
              {rigaPropria(f, () => setVersa(f))}
              {albero(f.figli, f.conto_id, f.id, livello + 1)}
              <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta={`Aggiungi dentro ${f.nome}`} icona="plus" onPress={() => setModifica({ obiettivo: null, padre: f.id })} /></View>
            </View>
          ) : null}
        </View>
      ))}
      {figli.length > MAX ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Pulsante tipo="testo" etichetta={apertiFigli.has(padreId) ? 'Mostra meno' : `Mostra tutti (${figli.length})`} icona={apertiFigli.has(padreId) ? 'chevron-up' : 'chevron-down'} onPress={() => apriChiudiFigli(padreId)} />
        </View>
      ) : null}
    </View>
  );

  // Ogni salvadanaio ha il suo riquadro: quanto c'è, soglie e sotto-salvadanai.
  const scheda = (o: Obiettivo) => {
    const ordinatiTr = [...o.traguardi].sort((a, b) => Number(a.importo) - Number(b.importo));
    const visibili = aperti.has(o.id) ? ordinatiTr : ordinatiTr.slice(0, MAX);
    // Il promemoria è una spesa come le altre: se cade nel mese scelto se ne dice la quota e se è spuntato (la spunta sposta i soldi nel salvadanaio).
    const delMese = o.alimentato_da ? spese.find((s) => s.alimenta_obiettivo_id === o.id && s.attiva && s.nel_mese) : undefined;
    const nota = delMese ? `promemoria in Spese ${euro(delMese.mia_quota)} a ${nomeMeseMinuscolo(rif.mese)} · ${delMese.uscita ? 'spuntato' : 'da spuntare'}`
      : o.alimentato_da ? `promemoria in Spese ${euro(o.alimentato_da.importo)} al mese` : '';
    return (
      <View key={o.id} {...{ onMouseEnter: () => setSopra(o.id), onMouseLeave: () => setSopra(null) }} style={{ width: '100%' }}>
        <Scheda style={{ width: '100%' }}>
          <View style={{ gap: d['spazio-blocco'] }}>
            <RigaSalvadanaio variante="testata" nome={o.nome} icona={iconaDi(o)} valore={o.percentuale ?? 0} tono={tonoDi(o.percentuale)} cifra={cifraDi(o)} percentuale={pctDi(o)} scadenza={scadenzaDi(o, inizio)} nota={nota || undefined}
              conto={o.conto ? { nome: o.conto, icona: o.conto_icona } : undefined}
              matitaNascosta={!compatto && sopra !== o.id} onCifra={() => setVersa(o)} onModifica={() => setModifica({ obiettivo: o })} />
            {o.figli.length ? <View style={{ gap: d['spazio-pillole'] }}>{rigaPropria(o, () => setVersa(o))}{albero(o.figli, o.conto_id, o.id)}</View> : null}
            {o.traguardi.length ? (
              <View style={{ gap: d['spazio-pillole'] }}>
                {visibili.map((t) => (
                  <RigaSalvadanaio key={t.id} variante="sotto" nome={t.nome} icona="shield" valore={t.percentuale} tono={t.percentuale >= 100 ? 'ok' : 'attenzione'}
                    cifra={euro(t.importo)} percentuale={percento(t.percentuale)}
                    onCifra={() => setTraguardo({ obiettivo: o, traguardo: t })} onModifica={() => setTraguardo({ obiettivo: o, traguardo: t })} />
                ))}
                {ordinatiTr.length > MAX ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <Pulsante tipo="testo" etichetta={aperti.has(o.id) ? 'Mostra meno' : `Mostra tutti (${ordinatiTr.length})`} icona={aperti.has(o.id) ? 'chevron-up' : 'chevron-down'} onPress={() => apriChiudi(o.id)} />
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
              <Pulsante tipo="secondario" etichetta="Aggiungi sotto-salvadanaio" icona="plus" onPress={() => setModifica({ obiettivo: null, padre: o.id })} />
              <Pulsante tipo="secondario" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ obiettivo: o, traguardo: null })} />
            </View>
          </View>
        </Scheda>
      </View>
    );
  };

  // In ordine di prossima scadenza nel mese personale (anche i sotto-salvadanai), poi senza scadenza per nome.
  const ordinati = ordinaPerScadenza(dati, oggiIso(), inizio).filter((o) => filtro === 'tutti' || tuttiGliObiettivi([o]).some((x) => suQuelConto(x, filtro)));
  // Stima dell'altezza di un riquadro (sotto-salvadanai nell'albero + traguardi visibili, max 4 + pulsante, + avviso):
  // ogni riquadro va, in ordine, nella colonna più leggera finora (due colonne indipendenti, senza righe).
  const contaFigli = (x: Obiettivo): number => {
    const vis = apertiFigli.has(x.id) ? x.figli : x.figli.slice(0, MAX);
    return vis.reduce((t, f) => t + 1 + contaFigli(f), 0) + (x.figli.length > MAX ? 1 : 0);
  };
  const pesoDi = (o: Obiettivo) => 1 + contaFigli(o) + (aperti.has(o.id) ? o.traguardi.length : Math.min(o.traguardi.length, MAX)) + (o.traguardi.length > MAX ? 1 : 0);
  const colonne: Obiettivo[][] = compatto ? [ordinati] : [[], []];
  if (!compatto) {
    const pesi = [0, 0];
    for (const o of ordinati) { const k = pesi[1] < pesi[0] ? 1 : 0; colonne[k].push(o); pesi[k] += pesoDi(o); }
  }
  return (
    <>
      {!ordinati.length && dati.length ? <Testo colore="testo-secondario">Nessun salvadanaio su questo conto.</Testo> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        {colonne.map((col, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0, gap: d['spazio-blocco'] }}>{col.map(scheda)}</View>
        ))}
      </View>
      <FinestraObiettivo stato={modifica_} obiettivi={dati} onChiudi={() => setModifica(null)} onTraguardo={(o) => { setModifica(null); setTraguardo({ obiettivo: o, traguardo: null }); }}
        onSotto={(o) => setModifica({ obiettivo: null, padre: o.id })} />
      <FinestraVersa obiettivo={versa} onChiudi={() => setVersa(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
    </>
  );
}

function FinestraObiettivo({ stato, obiettivi, onChiudi, onTraguardo, onSotto }: {
  stato: { obiettivo: Obiettivo | null; padre?: string } | null; obiettivi: Obiettivo[]; onChiudi: () => void; onTraguardo: (o: Obiettivo) => void; onSotto: (o: Obiettivo) => void;
}) {
  const o = stato?.obiettivo ?? null;
  const rif = useRiferimenti();
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('target');
  const [traguardo, setTraguardo] = useState('');
  const [scadenza, setScadenza] = useState('');
  // Il tempo del salvadanaio (decisione 63): una scadenza, una durata che si ripete (in mesi) o niente.
  const [tempo, setTempo] = useState<'nessuno' | 'scadenza' | 'durata'>('nessuno');
  const [durata, setDurata] = useState('');
  const [creaSpesa, setCreaSpesa] = useState(false);
  // Dove sta (decisione 61): un salvadanaio è un sotto-conto, quindi sta sempre in un conto (in cima) o dentro un altro salvadanaio.
  const [dove, setDove] = useState<'conto' | 'salvadanaio'>('conto');
  const [contoSal, setContoSal] = useState('');
  const [padre, setPadre] = useState('');
  // «Mostra nelle spese come promemoria»: ogni mese una voce in Spese DA un conto (di base il conto principale) DENTRO il salvadanaio;
  // spuntandola i soldi passano davvero. Con scadenza e traguardo la quota è quanto manca / mesi rimasti; senza, una cifra fissa scritta qui.
  const [daParte, setDaParte] = useState(false);
  const [quota, setQuota] = useState('');
  const [conto, setConto] = useState('');
  useEffect(() => {
    if (!stato) return;
    setIcona(o ? iconaDi(o) : 'target');
    setNome(o?.nome ?? ''); setTraguardo(importoInTesto(o?.traguardo));
    setScadenza(dataInTesto(o?.scadenza)); setCreaSpesa(o?.crea_spesa ?? false);
    setTempo(o?.scadenza ? 'scadenza' : o?.durata_mesi ? 'durata' : 'nessuno'); setDurata(o?.durata_mesi ? String(o.durata_mesi) : '');
    const dentro = o ? o.padre_id : stato.padre ?? null;
    setDove(dentro ? 'salvadanaio' : 'conto'); setPadre(dentro ?? ''); setContoSal(o && !o.padre_id ? o.conto_id ?? '' : '');
    const a = o?.alimentato_da;
    setDaParte(!!a); setQuota(importoInTesto(a && Number(a.importo_fisso) > 0 ? a.importo_fisso : undefined)); setConto(a ? a.conto_id ?? '' : rif.profilo?.conto_principale_id ?? '');
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps

  // La proposta segue quello che è scritto nella finestra (traguardo, scadenza o durata).
  const t = leggiImporto(traguardo);
  const sc = tempo === 'scadenza' ? leggiData(scadenza) : null;
  const dm = tempo === 'durata' ? leggiMesi(durata) : null;
  const perProposta: Obiettivo | null = o ? { ...o, traguardo: t ?? o.traguardo, traguardo_effettivo: t ?? o.traguardo_effettivo, scadenza: sc, durata_mesi: dm }
    : t ? { traguardo: t, traguardo_effettivo: t, scadenza: sc, durata_mesi: dm, saldo: '0', figli: [] } as unknown as Obiettivo : null;
  // La quota del mese la calcola l'app (come l'API, quotaPromemoria) se il salvadanaio ha un traguardo con una scadenza o una durata
  // («propria»), oppure se contiene salvadanai che li hanno («dentro»: la somma delle loro quote, come «Spese annuali»). Altrimenti cifra fissa.
  const conTempo = (x: Obiettivo): boolean => x.figli.some((f) => ((!!f.scadenza || !!f.durata_mesi) && f.traguardo_effettivo !== null) || conTempo(f));
  const calcolo: 'propria' | 'dentro' | null = (!!sc || !!dm) && (t !== null || (!!o?.figli.length && o.traguardo_effettivo !== null)) ? 'propria'
    : o && conTempo(o) ? 'dentro' : null;
  const automatica = calcolo !== null;
  const quotaCalcolata = calcolo === 'propria' && perProposta ? ritmoObiettivo(perProposta, rif.profilo?.inizio_mese ?? 1).alMese
    : calcolo === 'dentro' && o?.alimentato_da?.automatica ? Number(o.alimentato_da.importo) : null;
  const comeSiCalcola = calcolo === 'dentro' ? 'la somma delle quote dei salvadanai qui dentro'
    : dm ? `il traguardo diviso ${dm === 1 ? '1 mese' : `${dm} mesi`}` : 'quanto manca al traguardo diviso i mesi rimasti fino alla scadenza';

  // Il salvadanaio e quelli che contiene non possono contenerlo, né dargli i soldi del promemoria.
  const vietati = useMemo(() => new Set(o ? tuttiGliObiettivi([o]).map((x) => x.id) : []), [o]);
  const padri = useMemo(() => {
    const out: { valore: string; testo: string; icona?: string; rientro?: number }[] = [];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((x) => { if (!vietati.has(x.id)) { out.push({ valore: x.id, testo: x.nome, icona: iconaDi(x), rientro: l }); visita(x.figli, l + 1); } });
    visita(obiettivi, 0); return out;
  }, [vietati, obiettivi]);
  // I conti in cima (non archiviati, più quello già scelto): un salvadanaio in cima sta dentro uno di loro.
  const contiInCima = rif.conti.filter((x) => !x.padre_id && (!x.archiviato || x.id === contoSal)).map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona }));
  // Il conto che lo contiene, anche per un sotto-salvadanaio (quello del superiore): la sua condivisione vale anche per il salvadanaio.
  const contoContenitore = dove === 'conto' ? contoSal : tuttiGliObiettivi(obiettivi).find((x) => x.id === padre)?.conto_id ?? '';
  const nomeContenitore = rif.conto(contoContenitore)?.nome;
  const salva = async () => {
    const t = traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000', 'traguardo') : null;
    const s = tempo === 'scadenza' && scadenza.trim() ? serve(leggiData(scadenza), 'Scrivi la scadenza come GG/MM/AAAA', 'scadenza') : null;
    const mesi = tempo === 'durata' ? serve(leggiMesi(durata), 'Scrivi ogni quanti mesi si ripete, da 1 a 120', 'durata') : null;
    if (creaSpesa && !t && !o?.figli.length) serve(null, 'Per creare la spesa serve un traguardo', 'traguardo');
    const nomeScritto = serve(nome.trim(), 'Scrivi il nome', 'nome');
    const dovesta = dove === 'conto' ? { conto_id: serve(contoSal || null, 'Scegli in quale conto sta', 'contenitore') }
      : { padre_id: serve(padre || null, 'Scegli dentro quale salvadanaio sta', 'contenitore') };
    if (daParte && !conto) throw new ErroreCampo('contoPromemoria', 'Scegli da quale conto arrivano i soldi');
    const corpo = { nome: nomeScritto, ...dovesta, traguardo: t, scadenza: s, durata_mesi: mesi, crea_spesa: creaSpesa, icona };
    const salvato = o ? await modifica<Obiettivo>(`/obiettivi/${o.id}`, corpo) : await crea<Obiettivo>('/obiettivi', corpo);
    // Il promemoria: nasce, cambia o sparisce con l'interruttore. Con scadenza e traguardo la quota la calcola l'API.
    if (daParte) {
      const fisso = leggiImporto(quota);
      if (!automatica) serve(fisso, 'Scrivi quanto mettere da parte ogni mese, es. 150', 'quota');
      await sostituisci(`/obiettivi/${salvato.id}/promemoria`, { ...(fisso ? { importo: fisso } : {}), conto_id: conto });
    } else if (o?.alimentato_da) await cancella(`/obiettivi/${o.id}/promemoria`);
  };

  const { c } = useTema();
  // Un argomento del modulo: titolo, una riga che dice a cosa serve e, a destra, l'interruttore se c'è.
  const riquadro = (titolo: string, nota: string, corpo: ReactNode, interruttore?: ReactNode, tenue?: boolean) => (
    <View style={{ gap: d['spazio-blocco'], padding: d['spazio-blocco'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-scheda'], backgroundColor: tenue ? c['sfondo-tenue'] : c['sfondo-scheda'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
        <View style={{ flex: 1, gap: d['spazio-testo'] }}>
          <Testo stile="corpo-forte" accessibilityRole="header">{titolo}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo>
        </View>
        {interruttore}
      </View>
      {corpo}
    </View>
  );
  // Si elimina solo un salvadanaio vuoto e senza sotto-salvadanai: altrimenti l'API risponde con il motivo, che compare nella finestra.
  const dettaglioElimina = (x: Obiettivo) =>
    x.alimentato_da ? 'Sparisce anche il suo promemoria in Spese. Non si può annullare.' : 'Non si può annullare.';

  return (
    <FinestraModulo titolo={o ? 'Modifica salvadanaio' : 'Nuovo salvadanaio'} icona={icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={o?.mio ? () => cancella(`/obiettivi/${o.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina"
      confermaElimina={o ? { nome: `«${o.nome}»`, dettaglio: dettaglioElimina(o) } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo emergenza" autoFocus={!o} /></ConErrore></View>
      </View>
      {riquadro('Quanto e quando', 'Facoltativi. Con un traguardo l’app ti dice a che punto sei; con una scadenza o una durata che si ripete calcola anche la quota del mese.', (
        <>
          <ConErrore campo="traguardo"><Campo etichetta="Traguardo" valore={traguardo} onCambia={setTraguardo} segnaposto="Facoltativo" inputMode="decimal" aiuto={o?.figli.length ? 'Vuoto: la somma dei sotto-salvadanai' : undefined} /></ConErrore>
          <SceltaSegmenti etichetta="Quando" larghezzaPiena valore={tempo} onCambia={setTempo}
            opzioni={[{ valore: 'nessuno', testo: 'Nessuna data' }, { valore: 'scadenza', testo: 'Scadenza' }, { valore: 'durata', testo: 'Si ripete' }]} />
          {tempo === 'scadenza' ? <ConErrore campo="scadenza"><CampoData etichetta="Scadenza" valore={scadenza} onCambia={setScadenza} /></ConErrore> : null}
          {tempo === 'durata' ? <ConErrore campo="durata"><Campo etichetta="Ogni quanti mesi" valore={durata} onCambia={setDurata} inputMode="numeric" segnaposto="12" aiuto="Es. 12 per una spesa annuale: la quota del mese è il traguardo diviso 12" /></ConErrore> : null}
        </>
      ))}
      {riquadro('Dove sta', 'Un salvadanaio è una parte di un conto: sta in un conto, oppure dentro un altro salvadanaio.',
        <>
          <SceltaSegmenti etichetta="Dove sta" larghezzaPiena valore={dove} onCambia={setDove}
            opzioni={[{ valore: 'conto', testo: 'In un conto' }, ...(padri.length ? [{ valore: 'salvadanaio' as const, testo: 'Dentro un altro salvadanaio' }] : [])]} />
          <ConErrore campo="contenitore">
            {dove === 'conto'
              ? <Tendina etichetta="In quale conto sta" valore={contoSal || null} opzioni={contiInCima} onCambia={setContoSal} iconaPrima="landmark" segnaposto="Scegli il conto" />
              : <Tendina etichetta="Dentro quale salvadanaio" valore={padre || null} opzioni={padri} onCambia={setPadre} iconaPrima="layers" segnaposto="Scegli il salvadanaio" />}
          </ConErrore>
        </>)}
      {riquadro('Mostra nelle spese come promemoria', daParte ? `Ogni mese compare in Spese: spuntandolo i soldi passano${rif.conto(conto) ? ` da ${rif.conto(conto)!.nome}` : ''} in questo salvadanaio.` : 'Spento: nessuna voce in Spese. Accendilo per avere ogni mese la quota da mettere da parte.', daParte ? (
          <>
            {automatica ? (
              <Testo stile="dettaglio-normale" colore="testo-secondario">{quotaCalcolata !== null
                ? `Quota del mese: ${comeSiCalcola}, oggi ${euro(quotaCalcolata)}. La calcola l’app.`
                : `Quota del mese: ${comeSiCalcola}. La calcola l’app.`}</Testo>
            ) : (
              <ConErrore campo="quota"><Campo etichetta="Quanto al mese" valore={quota} onCambia={setQuota} inputMode="decimal" segnaposto="0,00" aiuto="Senza scadenza e traguardo la cifra la scrivi tu" /></ConErrore>
            )}
            <ConErrore campo="contoPromemoria"><Tendina etichetta="Da quale conto" valore={conto || null} iconaPrima="landmark" onCambia={setConto} segnaposto="Scegli il conto"
              opzioni={opzioniConti(rif.conti, { tenere: [conto], escludi: [...vietati] })} /></ConErrore>
          </>
        ) : null, <Interruttore acceso={daParte} onCambia={setDaParte} etichetta="Mostra nelle spese come promemoria" />, true)}
      {riquadro('Quando lo raggiungi', 'Quando arriva al traguardo crea in Spese una spesa «una volta sola» come promemoria.', null,
        <Interruttore acceso={creaSpesa} onCambia={setCreaSpesa} etichetta="Crea spesa al raggiungimento" />)}
      {riquadro('Condivisione', nomeContenitore
        ? `Il salvadanaio segue la condivisione di ${nomeContenitore}: ${contoCondiviso(rif.conti, contoContenitore) ? 'è condiviso come il conto' : 'oggi è solo tuo'}. Per cambiarla apri ${nomeContenitore} nella pagina Conti.`
        : 'Il salvadanaio segue la condivisione del conto in cui sta: si cambia dalla pagina Conti.', null)}
      {o ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
          <Pulsante tipo="testo" etichetta="Sotto-salvadanaio" icona="plus" onPress={() => onSotto(o)} />
          <Pulsante tipo="testo" etichetta="Traguardo di copertura" icona="plus" onPress={() => onTraguardo(o)} />
        </View>
      ) : null}
    </FinestraModulo>
  );
}

// Cambiare la cifra di un salvadanaio: si scrive la cifra di oggi, oppure si aggiunge o si toglie. Il salvadanaio è un sotto-conto
// (decisione 61): mettere via o togliere è uno spostamento tra il salvadanaio e quello che lo contiene (il conto, o il salvadanaio
// superiore); il totale del contenitore non cambia, cambia solo quanto vi resta non assegnato. «Aggiungi quota mensile» spunta invece
// il promemoria del mese, che sposta la quota dal suo conto.
type ModoCifra = 'cifra' | 'aggiungi' | 'togli';
export function FinestraVersa({ obiettivo, onChiudi }: { obiettivo: Obiettivo | null; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [modo, setModo] = useState<ModoCifra>('cifra');
  const [importo, setImporto] = useState('');
  // true dopo «Aggiungi quota mensile»: salvando si spunta il promemoria del mese. Cambiare modo o importo lo spegne.
  const [daPromemoria, setDaPromemoria] = useState(false);
  const dettaglio = useDati<Obiettivo>(obiettivo ? `/obiettivi/${obiettivo.id}` : null).dati;
  // Il promemoria del mese in corso (quello che l'API spunta), se c'è e non è ancora spuntato.
  const spese = useDati<ElencoSpese>(obiettivo?.alimentato_da ? '/spese-previste' : null).dati;
  const promemoria = obiettivo?.alimentato_da ? spese?.spese.find((s) => s.alimenta_obiettivo_id === obiettivo.id && s.attiva && s.nel_mese && !s.uscita) : undefined;
  const quotaPromemoria = promemoria ? Number(contoCondiviso(rif.conti, promemoria.conto_id) ? promemoria.importo : promemoria.mia_quota) : null;
  // Il contenitore: il salvadanaio superiore o, in cima, il conto. Il suo «non assegnato» viene da /conti.
  const contenitore = obiettivo ? rif.conto(obiettivo.padre_id ?? obiettivo.conto_id) : undefined;
  const nomeContenitore = contenitore?.nome ?? 'il conto che lo contiene';
  const nonAssegnato = contenitore?.non_assegnato != null ? Number(contenitore.non_assegnato) : null;
  // Con sotto-salvadanai la cifra è la somma: si toglie solo la parte messa direttamente nel salvadanaio.
  const attuale = Number(obiettivo?.saldo ?? 0), propria = Number(obiettivo?.versato ?? 0);
  useEffect(() => {
    if (!obiettivo) return;
    setModo('cifra'); setImporto(importoInTesto(obiettivo.saldo)); setDaPromemoria(false);
  }, [obiettivo]);
  const v = leggiImporto(importo);
  const piano = pianoCifra({ modo, valore: v === null ? null : Number(v), saldo: attuale, propria, daLiberi: false, liberiPadre: null });
  const { differenza } = piano;
  const erroreTogli = piano.errore ? `Puoi togliere al massimo ${euro(piano.errore.massimo)}: il resto è nei sotto-salvadanai` : undefined;
  // Scorciatoie: «Riempi» (quanto manca al traguardo) e «Metti 1/12» (quota mensile); impostano sempre «Aggiungi».
  const manca = obiettivo ? mancaAlTraguardo(obiettivo) : null;
  const mensile = obiettivo ? quotaMensileSalvadanaio(obiettivo) : null;
  const imposta = (x: number, quota = false) => { setModo('aggiungi'); setImporto(importoInTesto(x.toFixed(2))); setDaPromemoria(quota); };
  const salva = async () => {
    serve(v, 'Scrivi l’importo', 'importo');
    if (modo !== 'cifra' && Number(v) <= 0) throw new ErroreCampo('importo', "L'importo deve essere maggiore di zero");
    if (modo === 'cifra' && Number(v) < 0) throw new ErroreCampo('importo', 'La cifra non può essere sotto zero');
    if (Math.abs(differenza!) < 0.005) return;
    if (erroreTogli) throw new ErroreCampo('importo', erroreTogli);
    await crea(`/obiettivi/${obiettivo!.id}/versamenti`, { importo: differenza!.toFixed(2), data: oggiIso(), dividi: !!obiettivo?.figli.length, ...(daPromemoria ? { promemoria: true } : {}) });
  };
  const cosaSuccede = (): string | undefined => {
    if (differenza === null || Math.abs(differenza) < 0.005) return undefined;
    if (daPromemoria && promemoria) return `Spunti il promemoria del mese: ${euro(differenza)} passano da ${promemoria.conto ?? 'il suo conto'} in questo salvadanaio`;
    const dopo = nonAssegnato !== null ? ` (non assegnati: ${euro(nonAssegnato - differenza)})` : '';
    return differenza > 0 ? `Sposti ${euro(differenza)} da ${nomeContenitore}${dopo}` : `Rimetti ${euro(-differenza)} in ${nomeContenitore}${dopo}`;
  };
  // Ogni movimento del salvadanaio: da o verso quale conto (null = fuori), e se è nato da una spunta in Spese.
  const dettaglioVersamento = (x: NonNullable<Obiettivo['versamenti']>[number]) => {
    const entra = Number(x.importo) > 0;
    return [`${entra ? 'da' : 'verso'} ${x.spostamento_con ?? 'fuori'}`, x.da_spunta ? 'dalla spunta in Spese' : null].filter(Boolean).join(' · ');
  };
  return (
    <FinestraModulo titolo={obiettivo ? obiettivo.nome : ''} icona="piggy-bank" aperta={!!obiettivo} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">{`Oggi ci sono ${euro(attuale)}${obiettivo?.traguardo_effettivo ? ` su ${euro(obiettivo.traguardo_effettivo)}` : ''}. I soldi che metti arrivano da ${nomeContenitore}${nonAssegnato !== null ? `, dove oggi ci sono ${euro(nonAssegnato)} non assegnati` : ''}; quelli che togli tornano lì.${obiettivo?.figli.length ? ' Quello che aggiungi si divide tra i sotto-salvadanai, secondo quanto serve a ciascuno; puoi togliere solo la parte che non è nei sotto-salvadanai.' : ''}`}</Testo>
      <SceltaSegmenti etichetta="Come cambiare la cifra" larghezzaPiena valore={modo} onCambia={(m) => { setModo(m); setDaPromemoria(false); }}
        opzioni={[{ valore: 'cifra', testo: 'Scrivi la cifra' }, { valore: 'aggiungi', testo: 'Aggiungi' }, { valore: 'togli', testo: 'Togli' }]} />
      {manca !== null || mensile !== null || quotaPromemoria !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: d['spazio-colonne'] }}>
          {manca !== null ? (manca > 0.005
            ? <Pulsante tipo="secondario" etichetta={`Riempi · ${euro(manca)}`} icona="plus" onPress={() => imposta(manca)} />
            : <><Pulsante tipo="secondario" etichetta="Riempi" icona="plus" disattivato /><Testo stile="dettaglio-normale" colore="testo-secondario">Già pieno</Testo></>) : null}
          {mensile !== null ? <Pulsante tipo="secondario" etichetta={`Metti 1/12 · ${euro(mensile)}`} icona="calendar" onPress={() => imposta(mensile)} /> : null}
          {quotaPromemoria !== null && quotaPromemoria > 0.005 ? <Pulsante tipo="secondario" etichetta={`Aggiungi quota mensile · ${euro(quotaPromemoria)}`} icona="calendar-check" onPress={() => imposta(quotaPromemoria, true)} /> : null}
        </View>
      ) : null}
      <ConErrore campo="importo">
        <Campo etichetta={modo === 'cifra' ? 'Cifra di oggi' : modo === 'aggiungi' ? 'Quanto aggiungi' : 'Quanto togli'} valore={importo} onCambia={(x) => { setImporto(x); setDaPromemoria(false); }} segnaposto="0,00" inputMode="decimal" autoFocus
          errore={erroreTogli} aiuto={cosaSuccede()} />
      </ConErrore>
      {dettaglio?.versamenti?.length ? (
        <Voce etichetta="Ultimi movimenti">
          {dettaglio.versamenti.slice(0, 5).map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ flexShrink: 1 }}>{`${data(x.data)} · ${x.utente} · ${dettaglioVersamento(x)}`}</Testo>
              <Testo stile="dettaglio-forte" colore={Number(x.importo) < 0 ? 'testo-errore' : 'testo-primario'}>{euro(x.importo, { segno: true })}</Testo>
            </View>
          ))}
        </Voce>
      ) : null}
    </FinestraModulo>
  );
}

function FinestraTraguardo({ stato, onChiudi }: { stato: { obiettivo: Obiettivo; traguardo: Traguardo | null } | null; onChiudi: () => void }) {
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const t = stato?.traguardo ?? null;
  useEffect(() => { if (stato) { setNome(t?.nome ?? ''); setImporto(importoInTesto(t?.importo)); } }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), importo: serve(leggiImporto(importo), 'Scrivi l’importo') };
    if (t) await modifica(`/obiettivi/traguardi/${t.id}`, corpo); else await crea(`/obiettivi/${stato!.obiettivo.id}/traguardi`, corpo);
  };
  return (
    <FinestraModulo titolo={t ? 'Modifica traguardo di copertura' : 'Nuovo traguardo di copertura'} icona="shield" aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={t ? () => cancella(`/obiettivi/traguardi/${t.id}`).then(() => undefined) : undefined}
      confermaElimina={t ? { nome: `il traguardo «${t.nome}»`, dettaglio: 'I soldi del salvadanaio non cambiano.' } : undefined}>
      <Testo colore="testo-secondario">{`Un importo senza soldi propri: mostra se "${stato?.obiettivo.nome ?? ''}" basta a coprirlo per intero.`}</Testo>
      <Campo etichetta="Cosa deve coprire" valore={nome} onCambia={setNome} segnaposto="Es. Riparazione auto" autoFocus />
      <Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" />
    </FinestraModulo>
  );
}
