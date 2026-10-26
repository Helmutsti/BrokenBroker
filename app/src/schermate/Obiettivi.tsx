import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { RigaAvanzamento, RigaSalvadanaio, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import type { Condivisione, ElencoSpese, Obiettivo, Spesa, Traguardo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso, percento } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { useRiferimenti } from '../dati/contesto.tsx';
import { meseDi, meseDiVoce } from '../mesePersonale.ts';
import { Caricamento, fraMesi, liberiDi, mancaAlTraguardo, pianoCifra, proposta, quotaMensileSalvadanaio, ordinaPerScadenza, prossimeAnnuali, sommaSuConto, suQuelConto } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, RiquadroCondivisione, salvaCondivisione, serve, Voce } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';
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
// Scadenza in piccolo: «entro»/«esce», solo mese e anno se la spesa non ha il giorno. Colore per urgenza.
const scadenzaDi = (o: Obiettivo, inizio: number): { testo: string; tono: 'secondario' | 'attenzione' | 'errore' } | undefined => {
  const dt = o.paga_spesa ? o.paga_spesa.prossima : o.scadenza;
  if (!dt) return undefined;
  const senza = !!o.paga_spesa?.senza_giorno;
  const mese = meseDiVoce(dt, senza, inizio);
  // L'anno si mostra solo se non è quello di oggi.
  const anno = senza ? mese.slice(0, 4) : dt.slice(0, 4);
  const giornoMese = senza ? meseCorto(mese) : `${Number(dt.slice(8, 10))} ${meseCorto(dt)}`;
  const forma = anno === oggiIso().slice(0, 4) ? giornoMese : `${giornoMese} ${anno}`;
  const raggiunto = o.percentuale !== null && o.percentuale >= 100;
  const adesso = meseDi(oggiIso(), inizio);
  if (!raggiunto && (senza ? mese < adesso : dt < oggiIso())) return { testo: `scaduto ${forma}`, tono: 'errore' };
  return { testo: `${o.paga_spesa ? 'esce' : 'entro'} ${forma}`, tono: !raggiunto && mese === adesso ? 'attenzione' : 'secondario' };
};
const cifraDi = (o: Obiettivo) => (o.traguardo_effettivo ? `${euro(o.saldo)}/${euro(o.traguardo_effettivo)}` : euro(o.saldo));
const pctDi = (o: Obiettivo) => (o.traguardo_effettivo && o.percentuale !== null ? percento(o.percentuale) : undefined);

// Dentro Salvadanai: ogni salvadanaio ha il suo riquadro (richiesta di Manuel), con quanto
// c'è, i traguardi di copertura e i sotto-salvadanai annidati, in ordine di scadenza.
export function Obiettivi({ nuovo = 0, filtro = 'tutti' }: { nuovo?: number; filtro?: string }) {
  const tutti = useDati<Obiettivo[]>('/obiettivi');
  const dati = tutti.dati ?? null, errore = tutti.errore;
  const spese = useDati<ElencoSpese>('/spese-previste').dati;
  const [modifica_, setModifica] = useState<{ obiettivo: Obiettivo | null; padre?: string } | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  const [sopra, setSopra] = useState<number | string | null>(null);
  // La spesa da cui nasce un salvadanaio bloccato: si apre da lì.
  const [spesaAperta, setSpesaAperta] = useState<Spesa | null>(null);
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

  // Salvadanai delle spese annuali: quanto manca per le uscite dei prossimi mesi.
  const annuali = spese ? prossimeAnnuali(spese.spese, dati, 3, oggiIso(), inizio) : null;
  const mancaPer = (o: Obiettivo) => annuali?.elenco.filter((x) => x.s.obiettivo_id === o.id && x.copertura.tono === 'attenzione')
    .reduce((t, x) => t + Number(x.copertura.testo.replace(/[^\d,]/g, '').replace(',', '.')), 0) || 0;
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
            nota={f.paga_spesa ? `Esce a ${nomeMese(meseDi(f.paga_spesa.prossima, inizio)).toLowerCase()} · ${euro(Number(f.paga_spesa.importo) / f.paga_spesa.ogni_mesi)} al mese` : undefined}
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
    const nota = o.alimentato_da ? `promemoria in Spese ${euro(o.alimentato_da.importo)} ${o.alimentato_da.ogni_mesi === 12 ? "all'anno" : o.alimentato_da.ogni_mesi && o.alimentato_da.ogni_mesi > 1 ? `ogni ${o.alimentato_da.ogni_mesi} mesi` : 'al mese'}` : '';
    // Con un conto scelto in alto: quanto di questo salvadanaio sta su quel conto (il resto è su altri conti).
    const notaFiltro = filtro === 'tutti' ? '' : `${filtro === 'senza' ? 'Senza conto' : `Su ${rif.conti.find((x) => x.id === filtro)?.nome ?? 'questo conto'}`}: ${euro(sommaSuConto([o], filtro))}`;
    return (
      <View key={o.id} {...{ onMouseEnter: () => setSopra(o.id), onMouseLeave: () => setSopra(null) }} style={{ width: '100%' }}>
        <Scheda style={{ width: '100%' }}>
          <View style={{ gap: d['spazio-blocco'] }}>
            <RigaSalvadanaio variante="testata" nome={o.nome} icona={iconaDi(o)} valore={o.percentuale ?? 0} tono={mancaPer(o) ? 'attenzione' : tonoDi(o.percentuale)} cifra={cifraDi(o)} percentuale={pctDi(o)} scadenza={scadenzaDi(o, inizio)} nota={[nota, notaFiltro].filter(Boolean).join(' · ') || undefined}
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
        onSotto={(o) => setModifica({ obiettivo: null, padre: o.id })}
        onApriSpesa={spese ? (id) => { const s = spese.spese.find((x) => x.id === id); if (s) { setModifica(null); setSpesaAperta(s); } } : undefined} />
      <FinestraSpesa spesa={spesaAperta} aperta={!!spesaAperta} onChiudi={() => setSpesaAperta(null)} />
      <FinestraVersa obiettivo={versa} onChiudi={() => setVersa(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
    </>
  );
}

function FinestraObiettivo({ stato, obiettivi, onChiudi, onTraguardo, onSotto, onApriSpesa }: {
  stato: { obiettivo: Obiettivo | null; padre?: string } | null; obiettivi: Obiettivo[]; onChiudi: () => void; onTraguardo: (o: Obiettivo) => void; onSotto: (o: Obiettivo) => void; onApriSpesa?: (id: string) => void;
}) {
  const o = stato?.obiettivo ?? null;
  const rif = useRiferimenti();
  const miaCondivisione = useDati<Condivisione[]>(stato && stato.obiettivo ? '/condivisioni' : null).dati?.find((x) => x.voce === 'obiettivo' && x.voce_id === o?.id && x.mia);
  // Decisione 37: nato da una spesa, si cambia dalla spesa.
  const bloc = o?.bloccato_da ?? null;
  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('nessuno');
  const [icona, setIcona] = useState('target');
  const [traguardo, setTraguardo] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [creaSpesa, setCreaSpesa] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  // "Ricordami": una voce in Spese, ogni mese o ogni tanto, che ricorda di mettere dei soldi nel salvadanaio.
  const [daParte, setDaParte] = useState(false);
  const [ogni, setOgni] = useState<'1' | '3' | '6' | '12'>('1');
  const [quota, setQuota] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  // Su quale conto stanno i soldi: 'nessuno', 'ereditato' (come il salvadanaio superiore) o l'id di un conto.
  const [contoSal, setContoSal] = useState('nessuno');
  useEffect(() => {
    if (!stato) return;
    setIcona(o ? iconaDi(o) : 'target');
    setNome(o?.nome ?? ''); setPadre(o?.padre_id ?? stato.padre ?? 'nessuno'); setTraguardo(importoInTesto(o?.traguardo));
    setScadenza(o?.paga_spesa?.senza_giorno ? '' : dataInTesto(o?.scadenza)); setContoSal(o?.conto_proprio_id ?? ((o?.padre_id ?? stato.padre) ? 'ereditato' : 'nessuno')); setCreaSpesa(o?.crea_spesa ?? false); setCondiviso(o?.condiviso ?? false); setCon(null);
    const a = o?.alimentato_da;
    setDaParte(!!a); setOgni(a && [3, 6, 12].includes(a.ogni_mesi ?? 1) ? (String(a.ogni_mesi) as '3' | '6' | '12') : '1'); setQuota(importoInTesto(a?.importo)); setConto(a?.conto_id ?? null);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps

  // La proposta segue quello che è scritto nella finestra (traguardo e scadenza).
  const t = leggiImporto(traguardo), sc = leggiData(scadenza);
  const perProposta: Obiettivo | null = o ? { ...o, traguardo: t ?? o.traguardo, traguardo_effettivo: t ?? o.traguardo_effettivo, scadenza: o.paga_spesa ? o.scadenza : sc }
    : t ? { traguardo: t, traguardo_effettivo: t, scadenza: sc, saldo: '0', figli: [] } as unknown as Obiettivo : null;
  const consigliata = perProposta ? proposta(perProposta, Number(ogni), rif.profilo?.inizio_mese ?? 1) : null;
  const accendi = (v: boolean) => { setDaParte(v); if (v && !quota && consigliata) setQuota(importoInTesto(consigliata.toFixed(2))); };
  const cambiaOgni = (v: '1' | '3' | '6' | '12') => {
    setOgni(v);
    const nuova = perProposta ? proposta(perProposta, v === '1' ? 1 : 12, rif.profilo?.inizio_mese ?? 1) : null;
    if (nuova) setQuota(importoInTesto(nuova.toFixed(2)));
  };

  const padri = useMemo(() => {
    const vietati = new Set(o ? tuttiGliObiettivi([o]).map((x) => x.id) : []);
    const out: { valore: string; testo: string; rientro?: number }[] = [{ valore: 'nessuno', testo: 'Nessuno: è un salvadanaio principale' }];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((x) => { if (!vietati.has(x.id)) { out.push({ valore: x.id, testo: x.nome, rientro: l }); visita(x.figli, l + 1); } });
    visita(obiettivi, 0); return out;
  }, [o, obiettivi]);

  const contoDaSalvare = contoSal === 'nessuno' || contoSal === 'ereditato' ? null : contoSal;
  // Dei conti proposti: quelli non archiviati (e quello già scelto). Un sotto-salvadanaio può prendere il conto del superiore.
  const opzioniConto = [
    ...(padre !== 'nessuno' ? [{ valore: 'ereditato', testo: 'Come il salvadanaio superiore', icona: 'layers' }] : []),
    { valore: 'nessuno', testo: 'Nessun conto', icona: 'circle-x' },
    ...rif.conti.filter((x) => !x.archiviato || x.id === o?.conto_proprio_id).map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona })),
  ];
  const salva = async () => {
    if (o && bloc) { // solo l'icona: il resto si cambia dalla spesa
      await modifica<Obiettivo>(`/obiettivi/${o.id}`, { icona, conto_id: contoDaSalvare });
      return;
    }
    // Se il salvadanaio paga una spesa, traguardo e scadenza vengono dalla spesa: non si inviano e la spesa non si tocca.
    const dallaSpesa = !!o?.paga_spesa;
    const t = !dallaSpesa && traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000', 'traguardo') : null;
    const s = !dallaSpesa && scadenza.trim() ? serve(leggiData(scadenza), 'Scrivi la scadenza come GG/MM/AAAA', 'scadenza') : null;
    if (creaSpesa && !dallaSpesa && !t && !o?.figli.length) serve(null, 'Per creare la spesa serve un traguardo', 'traguardo');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), padre_id: padre === 'nessuno' ? null : padre, ...(dallaSpesa ? {} : { traguardo: t, scadenza: s }), crea_spesa: creaSpesa, icona, conto_id: contoDaSalvare };
    const salvato = o ? await modifica<Obiettivo>(`/obiettivi/${o.id}`, corpo) : await crea<Obiettivo>('/obiettivi', corpo);
    // La spesa "mettici da parte": nasce, cambia o sparisce con l'interruttore.
    if (daParte && !bloc) {
      await sostituisci(`/obiettivi/${salvato.id}/promemoria`, { importo: serve(leggiImporto(quota), 'Scrivi quanto mettere da parte, es. 150', 'quota'), ogni_mesi: Number(ogni), conto_id: conto });
    } else if (o?.alimentato_da) await cancella(`/obiettivi/${o.id}/promemoria`);
    if (o && !o.mio) return;
    await salvaCondivisione('obiettivo', salvato.id, condiviso, con ?? miaCondivisione?.condiviso_con_id ?? null);
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
  // Cosa sparisce con il salvadanaio: i sotto-salvadanai, i soldi versati e i promemoria di versamento in Spese.
  const dettaglioElimina = (x: Obiettivo) => {
    const dentro = tuttiGliObiettivi(x.figli);
    const promemoria = [x, ...dentro].filter((y) => y.alimentato_da).length;
    return [
      dentro.length ? `Spariscono anche ${dentro.length} ${dentro.length === 1 ? 'sotto-salvadanaio' : 'sotto-salvadanai'}.` : null,
      promemoria ? `${promemoria === 1 ? 'Sparisce' : 'Spariscono'} anche ${promemoria} promemoria di versamento in Spese.` : null,
      'Spariscono anche i versamenti segnati.',
    ].filter(Boolean).join(' ');
  };
  const ogniTesto = ogni === '1' ? 'Quanto al mese' : ogni === '12' ? "Quanto all'anno" : `Quanto ogni ${ogni} mesi`;

  return (
    <FinestraModulo titolo={o ? 'Modifica salvadanaio' : 'Nuovo salvadanaio'} icona={icona} aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={o?.mio && !bloc ? () => cancella(`/obiettivi/${o.id}`).then(() => undefined) : undefined} etichettaElimina={o?.figli.length ? 'Elimina con i sotto-salvadanai' : 'Elimina'}
      confermaElimina={o ? { nome: `«${o.nome}»`, dettaglio: dettaglioElimina(o) } : undefined}>
      {bloc ? (
        <View style={{ gap: d['spazio-testo'], alignItems: 'flex-start' }}>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{`Nasce dalla spesa «${bloc.nome}»: per cambiarlo apri la spesa.`}</Testo>
          {onApriSpesa ? <Pulsante tipo="testo" etichetta="Apri la spesa" icona="calendar-check" onPress={() => onApriSpesa(bloc.id)} /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo emergenza" autoFocus={!o} disattivato={!!bloc} /></ConErrore></View>
      </View>
      {riquadro('Quanto e quando', 'Facoltativi. Con un traguardo l’app ti dice a che punto sei.', o?.paga_spesa ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`Cifra e scadenza vengono dalla spesa «${o.paga_spesa.nome}»: si cambiano da Spese.`}</Testo>
      ) : (
        <Affiancati>
          <Meta><ConErrore campo="traguardo"><Campo etichetta="Traguardo" valore={traguardo} onCambia={setTraguardo} segnaposto="Facoltativo" inputMode="decimal" disattivato={!!bloc} aiuto={o?.figli.length ? 'Vuoto: la somma dei sotto-salvadanai' : undefined} /></ConErrore></Meta>
          <Meta><ConErrore campo="scadenza"><CampoData facoltativa etichetta="Scadenza" valore={scadenza} onCambia={setScadenza} disattivato={!!bloc} /></ConErrore></Meta>
        </Affiancati>
      ))}
      {bloc ? riquadro('Ricordamelo', 'Il promemoria non c’è: la quota mensile arriva dalla spesa.', null, undefined, true)
        : riquadro('Ricordamelo', 'Compare in Spese per ricordarti di versare. I soldi li metti tu e li segni qui toccando la cifra del salvadanaio.', daParte ? (
          <>
            <SceltaSegmenti etichetta="Ogni quanto" larghezzaPiena valore={ogni} onCambia={cambiaOgni} opzioni={[{ valore: '1', testo: 'Ogni mese' }, { valore: '3', testo: 'Ogni 3 mesi' }, { valore: '6', testo: 'Ogni 6 mesi' }, { valore: '12', testo: 'Ogni anno' }]} />
            <ConErrore campo="quota"><Campo etichetta={ogniTesto} valore={quota} onCambia={setQuota} inputMode="decimal" segnaposto="0,00"
              aiuto={consigliata !== null ? `Per arrivarci in tempo: ${euro(consigliata)} ${ogni === '1' ? 'al mese' : ogni === '12' ? "all'anno" : `ogni ${ogni} mesi`}` : 'Con traguardo e scadenza l’app ti propone la cifra'} /></ConErrore>
            <Tendina etichetta="Da quale conto (facoltativo)" valore={conto} opzioni={rif.conti.filter((x) => !x.archiviato).map((x) => ({ valore: x.id, testo: x.nome }))} onCambia={setConto} />
          </>
        ) : null, <Interruttore acceso={daParte} onCambia={accendi} etichetta="Ricordamelo" />, true)}
      {riquadro('Dove sta', 'Dentro un altro salvadanaio, oppure da solo; e su quale conto stanno i suoi soldi.',
        <>
          <Tendina etichetta="Dentro" valore={padre} opzioni={padri} onCambia={setPadre} iconaPrima="layers" disattivato={!!bloc} />
          <Tendina etichetta="Su quale conto" valore={padre === 'nessuno' && contoSal === 'ereditato' ? 'nessuno' : contoSal} opzioni={opzioniConto} onCambia={setContoSal} />
        </>)}
      {riquadro('Quando lo raggiungi', 'Crea una spesa «una volta sola» che pesa su questo salvadanaio, non sul mese.', null,
        <Interruttore acceso={creaSpesa} onCambia={setCreaSpesa} etichetta="Crea spesa al raggiungimento" disattivato={!!bloc} />)}
      {!o || o.mio ? (
        <ConErrore campo="condivisione"><RiquadroCondivisione aperta={!!stato} nome="questo salvadanaio" condiviso={condiviso} onCambia={setCondiviso} con={con ?? miaCondivisione?.condiviso_con_id ?? null} onCon={setCon}
          giaCondivisa={!!o?.condiviso} testoAttivo="Vede e modifica anche i sotto-salvadanai." /></ConErrore>
      ) : null}
      {o ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
          <Pulsante tipo="testo" etichetta="Sotto-salvadanaio" icona="plus" onPress={() => onSotto(o)} />
          <Pulsante tipo="testo" etichetta="Traguardo di copertura" icona="plus" onPress={() => onTraguardo(o)} />
        </View>
      ) : null}
    </FinestraModulo>
  );
}

// Cambiare la cifra di un salvadanaio: si scrive la cifra di oggi, oppure si aggiunge o si
// toglie. Nel database resta un versamento della differenza, con la data.
type ModoCifra = 'cifra' | 'aggiungi' | 'togli';
export function FinestraVersa({ obiettivo, onChiudi }: { obiettivo: Obiettivo | null; onChiudi: () => void }) {
  const [modo, setModo] = useState<ModoCifra>('cifra');
  const [importo, setImporto] = useState('');
  // Per un sotto-salvadanaio: i soldi arrivano dai liberi del superiore (o ci tornano) invece di essere nuovi (o uscire).
  const [daLiberi, setDaLiberi] = useState(false);
  const dettaglio = useDati<Obiettivo>(obiettivo ? `/obiettivi/${obiettivo.id}` : null).dati;
  const tutti = useDati<Obiettivo[]>(obiettivo?.padre_id ? '/obiettivi' : null).dati;
  // Il superiore diretto (anche se è a sua volta un sotto-salvadanaio): i suoi «liberi» sono la parte messa direttamente in lui.
  const padre = obiettivo?.padre_id && tutti ? tuttiGliObiettivi(tutti).find((x) => x.id === obiettivo.padre_id) ?? null : null;
  const liberi = padre ? liberiDi(padre) : null;
  // Con sotto-salvadanai la cifra è la somma: si cambia solo la parte messa nel padre.
  const attuale = Number(obiettivo?.saldo ?? 0), propria = Number(obiettivo?.versato ?? 0);
  useEffect(() => { if (obiettivo) { setModo('cifra'); setImporto(importoInTesto(obiettivo.saldo)); setDaLiberi(false); } }, [obiettivo]);
  const v = leggiImporto(importo);
  const piano = pianoCifra({ modo, valore: v === null ? null : Number(v), saldo: attuale, propria, daLiberi: !!padre && daLiberi, liberiPadre: liberi });
  const { differenza } = piano;
  // Scorciatoie: «Riempi» (quanto manca al traguardo) e «Metti 1/12» (quota mensile); impostano sempre «Aggiungi».
  const manca = obiettivo ? mancaAlTraguardo(obiettivo) : null;
  const mensile = obiettivo ? quotaMensileSalvadanaio(obiettivo) : null;
  const imposta = (x: number) => { setModo('aggiungi'); setImporto(importoInTesto(x.toFixed(2))); };
  const salva = async () => {
    serve(v, 'Scrivi l’importo', 'importo');
    if (modo !== 'cifra' && Number(v) <= 0) throw new ErroreCampo('importo', "L'importo deve essere maggiore di zero");
    if (modo === 'cifra' && Number(v) < 0) throw new ErroreCampo('importo', 'La cifra non può essere sotto zero');
    if (Math.abs(differenza!) < 0.005) return;
    if (piano.errore) throw new Error(piano.errore.tipo === 'liberi' ? `Nei liberi ci sono solo ${euro(piano.errore.massimo)}` : `Puoi togliere al massimo ${euro(piano.errore.massimo)}: il resto è nei sotto-salvadanai`);
    await crea(`/obiettivi/${obiettivo!.id}/versamenti`, { importo: differenza!.toFixed(2), data: oggiIso(), dividi: !!obiettivo?.figli.length, ...(piano.sposta ? { da_liberi: true } : {}) });
  };
  // Di dove arrivano (o dove vanno) i soldi: solo per un sotto-salvadanaio e quando la cifra entra (o esce).
  const mostraOrigine = !!padre && (modo === 'togli' || (differenza !== null ? differenza > 0 || modo === 'aggiungi' : modo === 'aggiungi'));
  const cosaSuccede = (): string | undefined => {
    if (differenza === null) return undefined;
    if (piano.sposta && padre && piano.restanoLiberi !== null) {
      return differenza > 0 ? `Sposti ${euro(differenza)} da ${padre.nome}: restano ${euro(piano.restanoLiberi)} liberi`
        : `Rimetti ${euro(-differenza)} nei liberi di ${padre.nome}: diventano ${euro(piano.restanoLiberi)}`;
    }
    if (modo === 'cifra') return Math.abs(differenza) >= 0.005 ? `${differenza > 0 ? 'Aggiungi' : 'Togli'} ${euro(Math.abs(differenza))}` : undefined;
    return `Diventano ${euro(attuale + differenza)}`;
  };
  const dettaglioVersamento = (x: NonNullable<Obiettivo['versamenti']>[number]) => {
    if (!x.spostamento_con) return '';
    const entra = Number(x.importo) > 0;
    return x.spostamento_con_padre ? ` · ${entra ? 'da' : 'nei'} liberi di ${x.spostamento_con}` : ` · ${entra ? 'tornati da' : 'spostati in'} ${x.spostamento_con}`;
  };
  return (
    <FinestraModulo titolo={obiettivo ? obiettivo.nome : ''} icona="piggy-bank" aperta={!!obiettivo} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">{`Oggi ci sono ${euro(attuale)}${obiettivo?.traguardo_effettivo ? ` su ${euro(obiettivo.traguardo_effettivo)}` : ''}.${obiettivo?.figli.length ? ' Quello che aggiungi si divide tra i sotto-salvadanai, secondo quanto serve a ciascuno; puoi togliere solo la parte che non è nei sotto-salvadanai.' : ''}`}</Testo>
      <SceltaSegmenti etichetta="Come cambiare la cifra" larghezzaPiena valore={modo} onCambia={setModo}
        opzioni={[{ valore: 'cifra', testo: 'Scrivi la cifra' }, { valore: 'aggiungi', testo: 'Aggiungi' }, { valore: 'togli', testo: 'Togli' }]} />
      {manca !== null || mensile !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: d['spazio-colonne'] }}>
          {manca !== null ? (manca > 0.005
            ? <Pulsante tipo="secondario" etichetta={`Riempi · ${euro(manca)}`} icona="plus" onPress={() => imposta(manca)} />
            : <><Pulsante tipo="secondario" etichetta="Riempi" icona="plus" disattivato /><Testo stile="dettaglio-normale" colore="testo-secondario">Già pieno</Testo></>) : null}
          {mensile !== null ? <Pulsante tipo="secondario" etichetta={`Metti 1/12 · ${euro(mensile)}`} icona="calendar" onPress={() => imposta(mensile)} /> : null}
        </View>
      ) : null}
      {mostraOrigine && padre ? (
        <SceltaSegmenti etichetta={modo === 'togli' ? 'Dove vanno i soldi' : 'Da dove arrivano i soldi'} larghezzaPiena valore={daLiberi ? 'liberi' : 'altro'} onCambia={(x) => setDaLiberi(x === 'liberi')}
          opzioni={modo === 'togli'
            ? [{ valore: 'altro', testo: 'Esce dal salvadanaio' }, { valore: 'liberi', testo: `Rimetti nei liberi di ${padre.nome}` }]
            : [{ valore: 'altro', testo: 'Soldi nuovi' }, { valore: 'liberi', testo: `Dai liberi di ${padre.nome} · ${euro(liberi)}` }]} />
      ) : null}
      <ConErrore campo="importo">
        <Campo etichetta={modo === 'cifra' ? 'Cifra di oggi' : modo === 'aggiungi' ? 'Quanto aggiungi' : 'Quanto togli'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus
          errore={piano.errore ? (piano.errore.tipo === 'liberi' ? `Nei liberi ci sono solo ${euro(piano.errore.massimo)}` : `Puoi togliere al massimo ${euro(piano.errore.massimo)}: il resto è nei sotto-salvadanai`) : undefined}
          aiuto={cosaSuccede()} />
      </ConErrore>
      {dettaglio?.versamenti?.length ? (
        <Voce etichetta="Ultimi versamenti">
          {dettaglio.versamenti.slice(0, 5).map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{`${data(x.data)} · ${x.utente}${dettaglioVersamento(x)}`}</Testo>
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
