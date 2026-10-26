import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, PulsanteIcona, SceltaSegmenti, type Tono } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { CifraModificabile, RigaAvanzamento, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import type { Condivisione, ElencoSpese, Obiettivo, Spesa, Traguardo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso, percento } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { useRiferimenti } from '../dati/contesto.tsx';
import { Caricamento, fraMesi, proposta, prossimeAnnuali, ritmoObiettivo } from './comuni.tsx';
import { Affiancati, ConErrore, FinestraModulo, Meta, RiquadroCondivisione, salvaCondivisione, serve, Voce } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';
import { useCompatto } from '../tema/compatto.ts';

// SC-04 Obiettivi (decisione 20): obiettivi annidabili con sotto-salvadanai
// (salvadanai con soldi propri) e traguardi di copertura (quanto copre il padre).

const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);
// L'icona scelta dall'utente; se non l'ha scelta, una di base.
const iconaDi = (o: Obiettivo) => o.icona ?? (o.traguardi.length ? 'shield-check' : 'target');
const statoDi = (pct: number | null) => (pct === null ? 'in-corso' : pct >= 100 ? 'completo' : 'in-corso');
const valore = (o: Obiettivo) => (o.traguardo_effettivo ? `${euroTondi(o.saldo).replace(' €', '')} / ${euroTondi(o.traguardo_effettivo)}` : euro(o.saldo));

function statoObiettivo(o: Obiettivo, mancaAnnuali?: number): { testo: string; tono: Tono } {
  if (mancaAnnuali) return { testo: `Mancano ${euro(mancaAnnuali)} alle annuali`, tono: 'attenzione' };
  if (o.traguardi.length) {
    const coperti = o.traguardi.filter((t) => t.percentuale >= 100).length;
    return { testo: `Copre ${coperti} su ${o.traguardi.length}`, tono: coperti === o.traguardi.length ? 'ok' : 'attenzione' };
  }
  if (o.percentuale !== null && o.percentuale >= 100) return { testo: 'Raggiunto', tono: 'ok' };
  if (o.scadenza && o.scadenza < oggiIso()) return { testo: 'Scaduto', tono: 'errore' };
  if (Number(o.saldo) <= 0) return { testo: 'Da iniziare', tono: 'neutro' };
  return { testo: o.scadenza ? 'In corso' : 'Quando puoi', tono: o.scadenza ? 'accento' : 'neutro' };
}

// Dentro Salvadanai: ogni salvadanaio ha il suo riquadro (richiesta di Manuel), con quanto
// c'è, i traguardi di copertura e i sotto-salvadanai annidati, in ordine di scadenza.
// `escludi`: il salvadanaio delle annuali, che ha il suo riquadro con la tabella.
export function Obiettivi({ escludi }: { escludi?: string | null }) {
  const tutti = useDati<Obiettivo[]>('/obiettivi');
  const dati = tutti.dati?.filter((o) => o.id !== escludi) ?? null, errore = tutti.errore;
  const spese = useDati<ElencoSpese>('/spese-previste').dati;
  const [modifica_, setModifica] = useState<{ obiettivo: Obiettivo | null; padre?: string } | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  // La spesa da cui nasce un salvadanaio bloccato: si apre da lì.
  const [spesaAperta, setSpesaAperta] = useState<Spesa | null>(null);
  // Con "Aggiungi quota mensile" il versamento parte con la quota scritta e spunta il promemoria.
  const [quotaVersa, setQuotaVersa] = useState<string | null>(null);
  const apriVersa = (o: Obiettivo | null, quota: string | null = null) => { setQuotaVersa(quota); setVersa(o); };
  const [traguardo, setTraguardo] = useState<{ obiettivo: Obiettivo; traguardo: Traguardo | null } | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const { c } = useTema();
  const rif = useRiferimenti();
  // Errore delle azioni sulle annuali (aggiungi tutte, dividi per spesa).
  const [erroreAnnuali, setErroreAnnuali] = useState<string | null>(null);
  const sulleAnnuali = (o: Obiettivo, corpo?: { tutte: boolean }) => {
    setErroreAnnuali(null);
    crea(`/obiettivi/${o.id}/annuali`, corpo).catch((e) => setErroreAnnuali(e instanceof Error ? e.message : String(e)));
  };
  if (!dati) return <Caricamento errore={errore} />;

  // Salvadanai delle spese annuali: quanto manca per le uscite dei prossimi mesi.
  const annuali = spese ? prossimeAnnuali(spese.spese, dati) : null;
  const mancaPer = (o: Obiettivo) => annuali?.elenco.filter((x) => x.s.obiettivo_id === o.id && x.copertura.tono === 'attenzione')
    .reduce((t, x) => t + Number(x.copertura.testo.replace(/[^\d,]/g, '').replace(',', '.')), 0) || 0;
  const apriChiudi = (id: string) => setAperti((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Sotto-salvadanai annidati: ogni livello ha un rientro con una linea a sinistra e il suo "Aggiungi dentro".
  const albero = (figli: Obiettivo[], livello = 0): ReactNode => (
    <View style={{ gap: d['spazio-testo'] }}>
      {figli.map((f) => (
        <View key={f.id} style={{ gap: d['spazio-testo'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <RigaAvanzamento nome={f.paga_spesa ? `${f.nome} · esce a ${nomeMese(f.paga_spesa.prossima.slice(0, 7)).toLowerCase()} · ${euro(Number(f.paga_spesa.importo) / f.paga_spesa.ogni_mesi)} al mese` : f.nome} importo={valore(f)} valore={f.percentuale ?? 0} percentuale={f.percentuale !== null && f.percentuale >= 100 ? '100% ✓' : percento(f.percentuale)}
                stato={statoDi(f.percentuale)} icona={iconaDi(f)} compatta={livello > 0} onApri={() => apriVersa(f)} />
            </View>
            <PulsanteIcona icona="pencil" etichetta={`Modifica ${f.nome}`} fantasma onPress={() => setModifica({ obiettivo: f })} />
          </View>
          {f.figli.length ? (
            <View style={{ gap: d['spazio-testo'], paddingLeft: d['margine-voce-h'], borderLeftWidth: d['misura-bordo-forte'], borderLeftColor: c['bordo-separatore'] }}>
              {albero(f.figli, livello + 1)}
              <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta={`Aggiungi dentro ${f.nome}`} icona="plus" onPress={() => setModifica({ obiettivo: null, padre: f.id })} /></View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );

  // Ogni salvadanaio ha il suo riquadro: quanto c'è, soglie e sotto-salvadanai.
  const scheda = (o: Obiettivo) => {
    const { traguardo: t, alMese } = ritmoObiettivo(o);
    const dellAnnuali = !o.paga_spesa && (o.id === rif.profilo?.obiettivo_annuali || /annual/i.test(o.nome) || o.figli.some((f) => f.paga_spesa));
    const stato = statoObiettivo(o, mancaPer(o));
    const primo = o.traguardi.find((x) => x.percentuale < 100);
    const coperti = o.traguardi.filter((x) => x.percentuale >= 100).length;
    const nota = [t !== null ? `C'è ${euro(o.saldo)} su ${euro(t)}` : `C'è ${euro(o.saldo)}`, o.scadenza ? (o.paga_spesa?.senza_giorno ? `esce a ${nomeMeseMinuscolo(o.scadenza.slice(0, 7))}` : `entro ${data(o.scadenza)}`) : null,
      o.alimentato_da ? `promemoria in Spese ${euro(o.alimentato_da.importo)} ${o.alimentato_da.ogni_mesi === 12 ? "all'anno" : o.alimentato_da.ogni_mesi && o.alimentato_da.ogni_mesi > 1 ? `ogni ${o.alimentato_da.ogni_mesi} mesi` : 'al mese'}` : alMese ? `${euro(alMese)} al mese per arrivarci` : null].filter(Boolean).join(' · ');
    return (
      <Scheda key={o.id} titolo={o.nome} nota={nota} icona={iconaDi(o)}
        azione={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: d['spazio-colonne'], maxWidth: '100%' }}>
          {o.alimentato_da || alMese ? <Pulsante tipo="testo" etichetta="Aggiungi quota mensile" icona="plus" onPress={() => apriVersa(o, Number(o.alimentato_da?.importo ?? alMese).toFixed(2))} /> : null}
          <Pulsante tipo="testo" etichetta="Modifica" icona="pencil" onPress={() => setModifica({ obiettivo: o })} />
          <CifraModificabile cifra={euro(o.saldo)} etichetta={`Cambia la cifra di ${o.nome}: ${euro(o.saldo)}`} onPress={() => apriVersa(o)} />
        </View>}>
        <View style={{ gap: d['spazio-blocco'] }}>
          {o.figli.length ? albero(o.figli) : (
            <RigaAvanzamento nome={stato.testo} importo={valore(o)} valore={o.percentuale ?? 0} percentuale={o.percentuale !== null && o.percentuale >= 100 ? '100% ✓' : percento(o.percentuale)}
              stato={stato.tono === 'attenzione' ? 'attenzione' : statoDi(o.percentuale)} icona={iconaDi(o)} onApri={() => apriVersa(o)} />
          )}
                      {o.traguardi.length ? (
                        <View style={{ gap: d['spazio-testo'] }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                            <View style={{ flex: 1 }}>
                              <Esito tono={primo ? 'attenzione' : 'ok'} testo={primo
                                ? `Copre per intero ${coperti} ${coperti === 1 ? 'traguardo' : 'traguardi'} su ${o.traguardi.length}. Per coprire anche "${primo.nome}" mancano ${euro(Number(primo.importo) - Number(o.saldo))}.`
                                : 'Copre per intero tutti i traguardi.'} />
                            </View>
                            <Pulsante tipo="testo" etichetta={aperti.has(o.id) ? 'Nascondi i traguardi' : 'Mostra i traguardi'} icona={aperti.has(o.id) ? 'chevron-up' : 'chevron-down'} onPress={() => apriChiudi(o.id)} />
                          </View>
                          {aperti.has(o.id) ? (
                            <View style={{ gap: d['spazio-elenco'] }}>
                              {o.traguardi.map((t) => <RigaAvanzamento key={t.id} nome={t.nome} importo={euroTondi(t.importo)} valore={t.percentuale} percentuale={t.percentuale >= 100 ? '100% ✓' : percento(t.percentuale)}
                                stato={t.percentuale >= 100 ? 'completo' : 'attenzione'} icona="shield" onApri={() => setTraguardo({ obiettivo: o, traguardo: t })} />)}
                              <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ obiettivo: o, traguardo: null })} /></View>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
            <Pulsante tipo="testo" etichetta="Aggiungi sotto-salvadanaio" icona="plus" onPress={() => setModifica({ obiettivo: null, padre: o.id })} />
            {!o.traguardi.length ? <Pulsante tipo="testo" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ obiettivo: o, traguardo: null })} /> : null}
            {dellAnnuali ? <Pulsante tipo="testo" etichetta="Aggiungi tutte le annuali" icona="calendar-check" onPress={() => sulleAnnuali(o, { tutte: true })} /> : null}
            {dellAnnuali ? <Pulsante tipo="testo" etichetta="Dividi per spesa" icona="layers" onPress={() => sulleAnnuali(o)} /> : null}
          </View>
        </View>
      </Scheda>
    );
  };

  // In ordine di scadenza, poi quelli senza scadenza per nome.
  const ordinati = [...dati].sort((a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it'));
  return (
    <>
      {erroreAnnuali ? <Esito tono="errore" testo={erroreAnnuali} /> : null}
      {ordinati.map(scheda)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
        <Pulsante tipo="testo" etichetta="Nuovo salvadanaio" icona="plus" onPress={() => setModifica({ obiettivo: null })} />
      </View>
      <FinestraObiettivo stato={modifica_} obiettivi={dati} onChiudi={() => setModifica(null)} onTraguardo={(o) => { setModifica(null); setTraguardo({ obiettivo: o, traguardo: null }); }}
        onSotto={(o) => setModifica({ obiettivo: null, padre: o.id })}
        onApriSpesa={spese ? (id) => { const s = spese.spese.find((x) => x.id === id); if (s) { setModifica(null); setSpesaAperta(s); } } : undefined} />
      <FinestraSpesa spesa={spesaAperta} aperta={!!spesaAperta} onChiudi={() => setSpesaAperta(null)} />
      <FinestraVersa obiettivo={versa} quota={quotaVersa} onChiudi={() => apriVersa(null)} />
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
  // Decisione 37: nato da una spesa, si cambia dalla spesa; il contenitore delle annuali non ha un promemoria.
  const bloc = o?.bloccato_da ?? null;
  const contenitore = !!o && (o.contenitore_annuali || o.id === rif.profilo?.obiettivo_annuali);
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
  useEffect(() => {
    if (!stato) return;
    setIcona(o ? iconaDi(o) : 'target');
    setNome(o?.nome ?? ''); setPadre(o?.padre_id ?? stato.padre ?? 'nessuno'); setTraguardo(importoInTesto(o?.traguardo));
    setScadenza(o?.paga_spesa?.senza_giorno ? '' : dataInTesto(o?.scadenza)); setCreaSpesa(o?.crea_spesa ?? false); setCondiviso(o?.condiviso ?? false); setCon(null);
    const a = o?.alimentato_da;
    setDaParte(!!a); setOgni(a && [3, 6, 12].includes(a.ogni_mesi ?? 1) ? (String(a.ogni_mesi) as '3' | '6' | '12') : '1'); setQuota(importoInTesto(a?.importo)); setConto(a?.conto_id ?? null);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps

  // La proposta segue quello che è scritto nella finestra (traguardo e scadenza).
  const t = leggiImporto(traguardo), sc = leggiData(scadenza);
  const perProposta: Obiettivo | null = o ? { ...o, traguardo: t ?? o.traguardo, traguardo_effettivo: t ?? o.traguardo_effettivo, scadenza: o.paga_spesa ? o.scadenza : sc }
    : t ? { traguardo: t, traguardo_effettivo: t, scadenza: sc, saldo: '0', figli: [] } as unknown as Obiettivo : null;
  const consigliata = perProposta ? proposta(perProposta, Number(ogni)) : null;
  const accendi = (v: boolean) => { setDaParte(v); if (v && !quota && consigliata) setQuota(importoInTesto(consigliata.toFixed(2))); };
  const cambiaOgni = (v: '1' | '3' | '6' | '12') => {
    setOgni(v);
    const nuova = perProposta ? proposta(perProposta, v === '1' ? 1 : 12) : null;
    if (nuova) setQuota(importoInTesto(nuova.toFixed(2)));
  };

  const padri = useMemo(() => {
    const vietati = new Set(o ? tuttiGliObiettivi([o]).map((x) => x.id) : []);
    const out: { valore: string; testo: string; rientro?: number }[] = [{ valore: 'nessuno', testo: 'Nessuno: è un salvadanaio principale' }];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((x) => { if (!vietati.has(x.id)) { out.push({ valore: x.id, testo: x.nome, rientro: l }); visita(x.figli, l + 1); } });
    visita(obiettivi, 0); return out;
  }, [o, obiettivi]);

  const salva = async () => {
    if (o && bloc) { // solo l'icona: il resto si cambia dalla spesa
      await modifica<Obiettivo>(`/obiettivi/${o.id}`, { icona });
      return;
    }
    // Se il salvadanaio paga una spesa, traguardo e scadenza vengono dalla spesa: non si inviano e la spesa non si tocca.
    const dallaSpesa = !!o?.paga_spesa;
    const t = !dallaSpesa && traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000', 'traguardo') : null;
    const s = !dallaSpesa && scadenza.trim() ? serve(leggiData(scadenza), 'Scrivi la scadenza come GG/MM/AAAA', 'scadenza') : null;
    if (creaSpesa && !dallaSpesa && !t && !o?.figli.length) serve(null, 'Per creare la spesa serve un traguardo', 'traguardo');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), padre_id: padre === 'nessuno' ? null : padre, ...(dallaSpesa ? {} : { traguardo: t, scadenza: s }), crea_spesa: creaSpesa, icona };
    const salvato = o ? await modifica<Obiettivo>(`/obiettivi/${o.id}`, corpo) : await crea<Obiettivo>('/obiettivi', corpo);
    // La spesa "mettici da parte": nasce, cambia o sparisce con l'interruttore (il contenitore delle annuali non ne ha).
    if (daParte && !contenitore) {
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
      {contenitore ? riquadro('Ricordamelo', 'La quota mensile è la somma delle spese annuali che contiene: la trovi in Spese, box Annuali.', null, undefined, true)
        : bloc ? riquadro('Ricordamelo', 'Il promemoria non c’è: la quota mensile arriva dalla spesa.', null, undefined, true)
        : riquadro('Ricordamelo', 'Compare in Spese per ricordarti di versare. I soldi li metti tu e li segni qui con “Aggiungi quota mensile”.', daParte ? (
          <>
            <SceltaSegmenti etichetta="Ogni quanto" larghezzaPiena valore={ogni} onCambia={cambiaOgni} opzioni={[{ valore: '1', testo: 'Ogni mese' }, { valore: '3', testo: 'Ogni 3 mesi' }, { valore: '6', testo: 'Ogni 6 mesi' }, { valore: '12', testo: 'Ogni anno' }]} />
            <ConErrore campo="quota"><Campo etichetta={ogniTesto} valore={quota} onCambia={setQuota} inputMode="decimal" segnaposto="0,00"
              aiuto={consigliata !== null ? `Per arrivarci in tempo: ${euro(consigliata)} ${ogni === '1' ? 'al mese' : ogni === '12' ? "all'anno" : `ogni ${ogni} mesi`}` : 'Con traguardo e scadenza l’app ti propone la cifra'} /></ConErrore>
            <Tendina etichetta="Da quale conto (facoltativo)" valore={conto} opzioni={rif.conti.filter((x) => !x.archiviato).map((x) => ({ valore: x.id, testo: x.nome }))} onCambia={setConto} />
          </>
        ) : null, <Interruttore acceso={daParte} onCambia={accendi} etichetta="Ricordamelo" />, true)}
      {riquadro('Dove sta', 'Dentro un altro salvadanaio, oppure da solo.',
        <Tendina etichetta="Dentro" valore={padre} opzioni={padri} onCambia={setPadre} iconaPrima="layers" disattivato={!!bloc} />)}
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
export function FinestraVersa({ obiettivo, quota = null, onChiudi }: { obiettivo: Obiettivo | null; quota?: string | null; onChiudi: () => void }) {
  const [modo, setModo] = useState<ModoCifra>('cifra');
  const [importo, setImporto] = useState('');
  const [giorno, setGiorno] = useState('');
  const dettaglio = useDati<Obiettivo>(obiettivo ? `/obiettivi/${obiettivo.id}` : null).dati;
  // Con sotto-salvadanai la cifra è la somma: si cambia solo la parte messa nel padre.
  const attuale = Number(obiettivo?.saldo ?? 0), propria = Number(obiettivo?.versato ?? 0);
  useEffect(() => { if (obiettivo) { setModo(quota ? 'aggiungi' : 'cifra'); setImporto(quota ? importoInTesto(quota) : importoInTesto(obiettivo.saldo)); setGiorno(dataInTesto(oggiIso())); } }, [obiettivo, quota]);
  const cambiaModo = (m: ModoCifra) => { setModo(m); setImporto(m === 'cifra' ? importoInTesto(attuale) : ''); };
  const v = leggiImporto(importo);
  const differenza = v === null ? null : modo === 'cifra' ? Number(v) - attuale : modo === 'aggiungi' ? Number(v) : -Number(v);
  const salva = async () => {
    serve(v, 'Scrivi l’importo');
    if (modo !== 'cifra' && Number(v) <= 0) throw new Error("L'importo deve essere maggiore di zero");
    if (modo === 'cifra' && Number(v) < 0) throw new Error('La cifra non può essere sotto zero');
    if (Math.abs(differenza!) < 0.005) return;
    if (propria + differenza! < -0.005) throw new Error(`Puoi togliere al massimo ${euro(propria)}: il resto è nei sotto-salvadanai`);
    await crea(`/obiettivi/${obiettivo!.id}/versamenti`, { importo: differenza!.toFixed(2), data: serve(leggiData(giorno), 'Scegli la data'), dividi: !!obiettivo?.figli.length, promemoria: !!quota });
  };
  return (
    <FinestraModulo titolo={obiettivo ? obiettivo.nome : ''} icona="piggy-bank" aperta={!!obiettivo} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">{`${quota ? 'Quota da versare: se hai fatto il bonifico di un’altra cifra, correggila. ' : ''}Oggi ci sono ${euro(attuale)}${obiettivo?.traguardo_effettivo ? ` su ${euro(obiettivo.traguardo_effettivo)}` : ''}.${obiettivo?.figli.length ? ' Quello che aggiungi si divide tra i sotto-salvadanai, secondo quanto serve a ciascuno; puoi togliere solo la parte che non è nei sotto-salvadanai.' : ''}`}</Testo>
      <SceltaSegmenti etichetta="Come cambiare la cifra" larghezzaPiena valore={modo} onCambia={cambiaModo}
        opzioni={[{ valore: 'cifra', testo: 'Scrivi la cifra' }, { valore: 'aggiungi', testo: 'Aggiungi' }, { valore: 'togli', testo: 'Togli' }]} />
      <Affiancati>
        <Meta><Campo etichetta={modo === 'cifra' ? 'Cifra di oggi' : modo === 'aggiungi' ? 'Quanto aggiungi' : 'Quanto togli'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus
          aiuto={differenza !== null && modo === 'cifra' && Math.abs(differenza) >= 0.005 ? `${differenza > 0 ? 'Aggiungi' : 'Togli'} ${euro(Math.abs(differenza))}` : modo !== 'cifra' && differenza !== null ? `Diventano ${euro(attuale + differenza)}` : undefined} /></Meta>
        <Meta><CampoData etichetta="Data" valore={giorno} onCambia={setGiorno} /></Meta>
      </Affiancati>
      {dettaglio?.versamenti?.length ? (
        <Voce etichetta="Ultimi versamenti">
          {dettaglio.versamenti.slice(0, 5).map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{`${data(x.data)} · ${x.utente}`}</Testo>
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
