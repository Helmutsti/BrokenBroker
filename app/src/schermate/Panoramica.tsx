import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, MenuScelta, Tendina } from '../componenti/campi.tsx';
import { Foglio, Intestazione, NumeroChiave, Scheda, SelettorePeriodo, TitoloCategoria, TitoloGruppo, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { useNavigation } from '@react-navigation/native';
import { contoCondiviso, opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, ElencoSpese, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { ombre } from '../tema/token.ts';
import { Caricamento, daA, eAnnuale, fraMesi, importoDelMese, mensileSenzaGiorno, proxSpesa, quando, rateDelMese, vociDelMese } from './comuni.tsx';
import { FinestraSaldo } from './Conti.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';
import { leggiScelta, salvaScelta } from '../dati/preferenze';
import { useCompatto } from '../tema/compatto.ts';

// Mese (proposta v5): il foglio Spese dell'Excel in una pagina, come prospetto di UN conto (decisione 61): si sceglie in alto, di base il
// conto principale, e comprende i suoi sotto-conti. In alto saldo − devono uscire + in arrivo = avanzo, poi le voci da spuntare.
// Le spese sono promemoria di transazioni: la spunta crea la transazione (e muove il saldo), toglierla la cancella. Si vedono solo le voci
// del conto: quelle che escono da lui (spostamenti compresi) e quelle che arrivano da un altro conto («in arrivo»); uno spostamento tra
// due suoi sotto-conti non conta.
// Le annuali sono promemoria come le altre spese: compaiono nel mese in cui escono, per intero (decisione 50).
export function Panoramica() {
  const rif = useRiferimenti();
  const navigazione = useNavigation<{ navigate: (n: string) => void }>();
  const { mese, setMese } = rif;
  const riepilogo = useDati<RiepilogoMese>(`/analisi/mese?mese=${mese}`);
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const tutteLeRate = useDati<Rata[]>(`/rate?mese=${mese}`).dati ?? [];
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  const [errore, setErrore] = useState<string | null>(null);
  const [spesa, setSpesa] = useState<Spesa | 'nuova' | null>(null);
  const [rata, setRata] = useState<Rata | 'nuova' | null>(null);
  const [sulConto, setSulConto] = useState(false);
  const [spente, setSpente] = useState(false);
  const [raggruppa, setRaggruppa] = useState<'tipo' | 'categoria'>('tipo');
  const [ordina, setOrdina] = useState<'scadenza' | 'nome'>('scadenza');
  const [vista, setVista] = useState(false);
  // Il conto di cui si guarda il prospetto: di base il principale.
  const [scelto, setScelto] = useState<string | null>(null);
  useEffect(() => { leggiScelta('spese.conto').then((v) => { if (v) setScelto(v); }); }, []);
  const scegliConto = (v: string | null) => { setScelto(v); salvaScelta('spese.conto', v); };

  // I numeri del mese: quando escono dallo schermo scorrendo, si ripresentano piccoli in alto a destra.
  const { c } = useTema();
  const compatto = useCompatto();
  const quattro = useRef<unknown>(null);
  const [fuori, setFuori] = useState(false);
  const pronto = !!(riepilogo.dati && spese.dati && rif.profilo);
  useEffect(() => {
    const nodo = quattro.current as unknown as Element | null;
    if (!pronto || !nodo || typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(([e]) => setFuori(e.boundingClientRect.top < 0), { threshold: 1 });
    o.observe(nodo);
    return () => o.disconnect();
  }, [pronto]);
  const r = riepilogo.dati, el = spese.dati, profilo = rif.profilo;
  if (!r || !el || !profilo) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  const inizio = profilo.inizio_mese;
  const rate = tutteLeRate;
  const p = el.periodo;
  // In ordine di uscita: la data nel mese, poi il nome.
  const perUscita = (a: Spesa, b: Spesa) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome);
  const conGiorno = (s: Spesa) => [s.scadenza && !mensileSenzaGiorno(s) ? (s.senza_giorno ? nomeMeseMinuscolo(s.scadenza.slice(0, 7)) : `il ${Number(s.scadenza.slice(8, 10))}`) : null, daA(s)].filter(Boolean).join(' · ') || '—';
  const { fisse, investimenti, salvadanai } = vociDelMese(el, perUscita);
  // I budget (decisioni 49, 57 e 58) non sono spese né promemoria: una lente sui movimenti. Non entrano in nessun totale di questa pagina.
  const rateMese = rateDelMese(rate, p.dal, p.al);
  const nonAttive = el.spese.filter((s) => !s.attiva);

  // Il conto del prospetto (decisione 61): quello scelto in alto, di base il principale delle Impostazioni. Comprende i suoi sotto-conti.
  // Le annuali ci sono solo nel mese in cui escono, per intero.
  // Il conto ricordato, se esiste ancora; altrimenti il principale.
  const principale = (scelto ? rif.conto(scelto) : undefined) ?? rif.conto(profilo.conto_principale_id) ?? null;
  const dentro = new Set<string>();
  if (principale) {
    dentro.add(principale.id);
    for (let altri = true; altri;) { altri = false; for (const k of rif.conti) if (k.padre_id && dentro.has(k.padre_id) && !dentro.has(k.id)) { dentro.add(k.id); altri = true; } }
  }
  const nel = (id: string | null) => !!id && dentro.has(id);
  // Esce dal conto: parte da lui e non finisce in un suo sotto-conto. Arriva: parte da fuori del conto e finisce dentro.
  const esce = (s: Spesa) => nel(s.conto_id) && !nel(s.a_conto_id);
  const arriva = (s: Spesa) => nel(s.a_conto_id) && !nel(s.conto_id);
  const delProspetto = (s: Spesa) => esce(s) || arriva(s);
  // Quanto la spunta muove: l'importo intero se il conto è condiviso, altrimenti la mia quota (come fa l'API).
  const condiviso = !!principale && contoCondiviso(rif.conti, principale.id);
  const quantoEsce = (s: Spesa) => (condiviso ? Number(s.importo) : importoDelMese(s));
  const tutteDelMese = [...fisse, ...investimenti, ...salvadanai];
  const delConto = tutteDelMese.filter(esce);
  const rateDelConto = rateMese.filter((x) => nel(x.r.conto_id));
  const daSpuntare = delConto.filter((s) => !s.uscita);
  const rateDaPagare = rateDelConto.filter((x) => !x.r.pagata);
  const devonoUscire = daSpuntare.reduce((t, s) => t + quantoEsce(s), 0) + rateDaPagare.reduce((t, x) => t + Number(x.r.importo_rata), 0);
  const quanteDaSpuntare = daSpuntare.length + rateDaPagare.length;
  // In arrivo: gli spostamenti da un altro conto non ancora spuntati (per esempio la quota delle annuali verso il deposito).
  const inArrivo = tutteDelMese.filter((s) => arriva(s) && !s.uscita).reduce((t, s) => t + quantoEsce(s), 0);
  // Il saldo è quello del conto (sotto-conti compresi): lo muovono le spunte. Avanzo = saldo − devono uscire + in arrivo.
  const saldo = principale?.saldo == null ? null : Number(principale.saldo);
  const avanzo = saldo === null ? null : saldo - devonoUscire + inArrivo;

  const spunta = async (s: Spesa) => {
    setErrore(null);
    try {
      if (s.uscita) await cancella(`/spese-previste/${s.id}/spunta?mese=${mese}`);
      else await crea(`/spese-previste/${s.id}/spunta`, { mese });
    } catch (e) { setErrore((e as Error).message); }
  };
  const spuntaRata = async (x: Rata) => {
    setErrore(null);
    try {
      if (x.pagata) await cancella(`/rate/${x.id}/spunta?mese=${mese}`);
      else await crea(`/rate/${x.id}/spunta`, { mese });
    } catch (e) { setErrore((e as Error).message); }
  };
  // Usciti: le voci del conto principale spuntate nel mese (la spunta ha creato la loro transazione).
  // Uscite totali: tutte le voci del conto principale nel mese, spuntate o no (usciti + devono uscire), come la colonna dell'Excel.
  const spuntate = delConto.filter((s) => s.uscita);
  const ratePagate = rateDelConto.filter((x) => x.r.pagata);
  const usciti = spuntate.reduce((t, s) => t + quantoEsce(s), 0) + ratePagate.reduce((t, x) => t + Number(x.r.importo_rata), 0);
  const quanteUscite = spuntate.length + ratePagate.length;
  const usciteTotali = usciti + devonoUscire, quanteInTutto = quanteUscite + quanteDaSpuntare;
  // Nasce da un salvadanaio (promemoria «Ricordami», spesa creata al raggiungimento).
  const colSalvadanaio = (s: Spesa) => !!(s.alimenta_obiettivo_id || s.bloccato_da?.tipo === 'salvadanaio');
  // Segno sotto l'importo delle voci che arrivano da un altro conto.
  const segnoArrivo = (s: Spesa) => (arriva(s) ? 'in arrivo' : undefined);
  const voce = (s: Spesa, conIcona: boolean, icona = 'ellipsis', sotto?: string, dettaglio?: Parameters<typeof VoceDaSpuntare>[0]['dettaglio']) => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} importo={euro(s.mia_quota)} sottoImporto={[sotto, segnoArrivo(s)].filter(Boolean).join(' · ') || undefined}
      icona={conIcona ? s.icona ?? icona : null} salvadanaio={colSalvadanaio(s)} fatta={s.uscita}
      onSpunta={() => spunta(s)} onApri={() => setSpesa(s)} dettaglio={dettaglio} />
  );

  // Tutte le voci del mese in un elenco solo, poi raggruppate per tipo o per categoria.
  type Tipo = 'fisse' | 'spostamenti' | 'rate' | 'salvadanai';
  type Riga = { chiave: string; nome: string; scadenza: string | null; tipo: Tipo; categoria: string | null; importo: number; vista: (conIcona: boolean) => ReactNode };
  // Le annuali hanno il loro riquadro, separato e spuntabile nel loro mese (decisione 60): qui non compaiono, ma contano nei totali sopra.
  const righe: Riga[] = [
    // Le spese vere (escono verso fuori) e, a parte, gli spostamenti verso un altro conto (investimenti compresi: decisione 62).
    ...[...fisse, ...investimenti].filter((s) => !eAnnuale(s) && delProspetto(s)).map((s) => ({ s, tipo: (s.a_conto_id ? 'spostamenti' : 'fisse') as Tipo,
      vista: (i: boolean) => voce(s, i, s.a_conto_id ? 'arrow-left-right' : 'ellipsis', s.ogni_mesi === null ? 'una volta sola' : undefined) })),
    ...salvadanai.filter(delProspetto).map((s) => ({ s, tipo: 'salvadanai' as const, vista: (i: boolean) => voce({ ...s, icona: 'piggy-bank' }, i, 'piggy-bank', s.ogni_mesi === 12 ? "una volta all'anno" : undefined) })),
  ].map(({ s, tipo, vista }) => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, tipo, categoria: s.categoria_id, importo: Number(s.mia_quota), vista }));
  for (const { r: x, quando } of rateDelConto) righe.push({ chiave: x.id, nome: x.oggetto, scadenza: quando, tipo: 'rate', categoria: x.categoria_id, importo: Number(x.importo_rata), vista: (i) => (
    <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={[`il ${Number(quando!.slice(8, 10))}`, x.finanziaria].filter(Boolean).join(' · ')}
      importo={euro(x.importo_rata)} sottoImporto={`${x.pagate} di ${x.numero_rate}`} icona={i ? 'credit-card' : null} fatta={!!x.pagata} onSpunta={() => spuntaRata(x)} onApri={() => setRata(x)} />) });
  righe.sort(ordina === 'scadenza' ? (a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it') : (a, b) => a.nome.localeCompare(b.nome, 'it'));
  const alMeseEAnno = (m: number) => `${euro(m)} al mese · ${euro(m * 12)} all'anno`;
  const manca = rate.filter((x) => x.attiva).reduce((t, x) => t + Number(x.residuo), 0);
  const TITOLI: Record<Tipo, string> = { fisse: 'Fisse', spostamenti: 'Spostamenti', rate: 'Rate',
    salvadanai: 'Salvadanai · promemoria' };
  const radice = (id: string | null) => { let c = rif.categoria(id); while (c?.padre_id) c = rif.categoria(c.padre_id); return c ?? null; };
  const gruppi: { chiave: string; righe: Riga[]; sempre: boolean; titolo: ReactNode; piede?: ReactNode }[] = raggruppa === 'tipo'
    ? (Object.keys(TITOLI) as Tipo[]).map((t) => ({ chiave: t, titolo: <TitoloGruppo key={t} testo={TITOLI[t]} destra={t === 'rate' ? `manca ${euro(manca)} alla fine` : alMeseEAnno(righe.filter((x) => x.tipo === t).reduce((tot, x) => tot + x.importo, 0))} />, righe: righe.filter((x) => x.tipo === t), sempre: false }))
    : [...new Map(righe.map((x) => [radice(x.categoria)?.id ?? '', radice(x.categoria)])).entries()]
      .sort(([, a], [, b]) => (a ? 0 : 1) - (b ? 0 : 1) || (a?.nome ?? '').localeCompare(b?.nome ?? '', 'it'))
      .map(([id, c]) => {
        const dentro = righe.filter((x) => (radice(x.categoria)?.id ?? '') === id);
        return { chiave: id || 'senza', righe: dentro, sempre: false, titolo: <TitoloCategoria key={id || 'senza'} nome={c?.nome ?? 'Senza categoria'} icona={c?.icona ?? 'ellipsis'} colore={c?.colore ?? null}
          destra={alMeseEAnno(dentro.reduce((t, x) => t + x.importo, 0))} /> };
      });

  // Le due scelte di come si vedono le voci: in riga sul computer, nel foglio «Vista» sul telefono.
  const scelteVista = (
    <>
      <Voce etichetta="Raggruppa">
        <SceltaSegmenti etichetta="Raggruppa" larghezzaPiena={compatto} valore={raggruppa} onCambia={setRaggruppa} opzioni={[{ valore: 'tipo', testo: 'Per tipo' }, { valore: 'categoria', testo: 'Per categoria' }]} />
      </Voce>
      <Voce etichetta="Ordina">
        <SceltaSegmenti etichetta="Ordina" larghezzaPiena={compatto} valore={ordina} onCambia={setOrdina} opzioni={[{ valore: 'scadenza', testo: 'Per scadenza' }, { valore: 'nome', testo: 'Per nome' }]} />
      </Voce>
    </>
  );

  // I box (gruppi e, in fondo, le annuali) in due colonne equilibrate: ognuno, nel suo ordine, va nella colonna più corta finora
  // (il peso è il numero di righe più il titolo). Con un box solo resta una colonna sola, a tutta larghezza.
  const visibili = gruppi.filter((g) => g.righe.length || g.sempre);
  const annualiQui = el.spese.filter(delProspetto);
  const blocchi: { chiave: string; peso: number; vista: ReactNode }[] = visibili.map((g) => ({
    chiave: g.chiave, peso: g.righe.length + 2, vista: (
      <Scheda>
        <View style={{ gap: d['spazio-elenco'] }}>
          {g.titolo}
          {g.righe.map((x) => <View key={x.chiave}>{x.vista(raggruppa === 'tipo')}</View>)}
          {g.piede}
        </View>
      </Scheda>
    ) }));
  const quanteAnnuali = annualiQui.filter(eAnnuale).length;
  if (quanteAnnuali) blocchi.push({ chiave: 'annuali', peso: quanteAnnuali + 2,
    vista: <AnnualiInRotazione spese={annualiQui} inizio={inizio} dal={p.dal} al={p.al} onSpunta={spunta} onApri={setSpesa} segno={segnoArrivo} /> });
  const colonne: (typeof blocchi)[] = [[], []];
  const pesi = [0, 0];
  for (const b of blocchi) { const k = pesi[0] <= pesi[1] ? 0 : 1; colonne[k].push(b); pesi[k] += b.peso; }

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo={nomeMese(mese)} sottotitolo={`Dal ${data(p.dal, 'corta')} al ${data(p.al, 'corta')}${r.stipendio !== '0.00' ? ` · stipendio ${euro(r.stipendio)}` : ''}`} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      {principale ? (
        <View ref={quattro as never} style={{ flexDirection: 'row', flexWrap: compatto ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: compatto ? d['spazio-colonne'] : d['spazio-blocco'] }}>
          <NumeroChiave etichetta={`Sul conto · ${principale.nome}`} valore={saldo === null ? 'Scrivilo' : euro(saldo)} icona="wallet" tono={saldo !== null && saldo < 0 ? 'errore' : 'normale'}
            onPress={() => setSulConto(true)} etichettaPressione={`Riscrivi il saldo di ${principale.nome}`}
            titolo={(
              <MenuScelta valore={principale.id} onCambia={scegliConto} larghezzaMinima={240}
                opzioni={rif.conti.filter((k) => !k.padre_id && !k.archiviato).map((k) => ({ valore: k.id, testo: k.id === profilo.conto_principale_id ? `${k.nome} (principale)` : k.nome, icona: k.icona }))}>
                {({ ref, apri, aperto }) => (
                  <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${principale.nome}`} aria-expanded={aperto} onPress={apri}
                    style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                    <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{`Sul conto · ${principale.nome}`}</Testo>
                    <Icona nome="chevron-down" misura={16} />
                  </Pressable>
                )}
              </MenuScelta>
            )}
            nota={saldo === null ? 'Il saldo del conto, come lo vedi in banca' : principale.saldo_scritto_il ? `Scritto il ${dataOra(principale.saldo_scritto_il)}, poi mosso dalle spunte · tocca per riscriverlo` : 'Solo dalle transazioni · tocca per scriverlo'} />
          <NumeroChiave etichetta="Uscite totali" valore={euro(usciteTotali)} icona="list-checks"
            nota={quanteInTutto ? `${quanteInTutto} ${quanteInTutto === 1 ? 'voce' : 'voci'} del conto nel mese` : 'Nessuna voce del conto nel mese'} />
          <NumeroChiave etichetta="Usciti" valore={euro(usciti)} icona="circle-check"
            nota={quanteUscite ? `${quanteUscite} ${quanteUscite === 1 ? 'voce spuntata' : 'voci spuntate'}: già fuori dal saldo` : 'Ancora nessuna voce spuntata'} />
          <NumeroChiave etichetta="Devono uscire" valore={euro(devonoUscire)} icona="arrow-up-right"
            nota={quanteDaSpuntare ? `${quanteDaSpuntare} ${quanteDaSpuntare === 1 ? 'voce' : 'voci'} da spuntare` : 'Tutto spuntato'} />
          <NumeroChiave etichetta="Avanzo" valore={avanzo === null ? '—' : euro(avanzo, { segno: true })} icona="scale" tono={avanzo === null ? 'normale' : avanzo < 0 ? 'errore' : avanzo < 0.005 ? 'attenzione' : 'ok'}
            nota={avanzo === null ? 'Scrivi quanto c\'è sul conto' : avanzo < 0 ? `Sul conto mancano ${euro(-avanzo)} per sostenere le spese` : inArrivo > 0.005 ? `Sul conto meno quello che deve uscire, più ${euro(inArrivo)} in arrivo` : 'Sul conto meno quello che deve ancora uscire'} />
        </View>
      ) : (
        <Scheda>
          <Vuoto testo="Scegli il conto principale in Impostazioni: è il conto da cui escono le spese del mese. Da lì vengono saldo, usciti, devono uscire e avanzo."
            azione={<Pulsante tipo="primario" etichetta="Vai a Impostazioni" icona="sliders-horizontal" onPress={() => navigazione.navigate('impostazioni')} />} />
        </Scheda>
      )}
      {fuori && principale ? createPortal(
        <View accessibilityRole="summary" style={{ position: 'fixed', top: compatto ? 0 : 12, right: compatto ? 0 : 16, ...(compatto ? { left: 0 } : {}), zIndex: 50, flexDirection: 'row', justifyContent: compatto ? 'space-between' : 'flex-start', gap: compatto ? 4 : d['spazio-colonne'], paddingVertical: compatto ? 6 : 8, paddingHorizontal: compatto ? 12 : 14, ...(compatto ? { paddingTop: 'max(6px, env(safe-area-inset-top))' } : {}),
          // Fondo come le schede, bordo di 2 px in testo-terziario e testi come i numeri chiave (etichette secondarie, valori primari):
          // si stacca dalla pagina mentre si scorre, in tutti e due i temi, senza mai un blocco bianco.
          backgroundColor: c['sfondo-scheda'], borderRadius: compatto ? 0 : d['raggio-scheda'], borderWidth: 2, borderColor: c['testo-terziario'],
          boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          {([['Sul conto', saldo === null ? '—' : euro(saldo), 'testo-primario'], ['Usciti', euro(usciti), 'testo-primario'], ['Devono uscire', euro(devonoUscire), 'testo-primario'],
            ['Avanzo', avanzo === null ? '—' : euro(avanzo, { segno: true }), avanzo === null ? 'testo-primario' : avanzo < 0 ? 'testo-errore' : avanzo < 0.005 ? 'testo-attenzione' : 'testo-ok']] as const).map(([et, val, col]) => (
            <View key={et} style={{ minWidth: 0, flexShrink: 1 }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1} style={compatto ? { fontSize: 11, lineHeight: 14 } : undefined}>{compatto ? et.replace('Devono uscire', 'Da uscire') : et}</Testo>
              <Testo stile="corpo-forte" colore={col} numberOfLines={1} style={compatto ? { fontSize: 13, lineHeight: 18 } : undefined}>{val}</Testo>
            </View>
          ))}
        </View>, document.body) : null}
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      {/* Barra degli strumenti: non è contenuto, quindi non sta in un box. Prima i pulsanti per aggiungere, poi come si vedono le voci.
          Su telefono le due scelte (Raggruppa, Ordina) stanno dietro un solo pulsante «Vista». */}
      {compatto ? (
        <View style={{ gap: d['spazio-colonne'] }}>
          <Pulsante tipo="primario" etichetta="Aggiungi una spesa" icona="plus" larghezzaPiena onPress={() => setSpesa('nuova')} />
          <View style={{ flexDirection: 'row', gap: d['spazio-colonne'] }}>
            <View style={{ flex: 1, minWidth: 0 }}><Pulsante tipo="secondario" etichetta="Aggiungi una rata" icona="plus" larghezzaPiena onPress={() => setRata('nuova')} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><Pulsante tipo="secondario" etichetta="Vista" icona="sliders-horizontal" larghezzaPiena onPress={() => setVista(true)} /></View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: d['spazio-blocco'] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
            <Pulsante tipo="primario" etichetta="Aggiungi una spesa" icona="plus" onPress={() => setSpesa('nuova')} />
            <Pulsante tipo="secondario" etichetta="Aggiungi una rata" icona="plus" onPress={() => setRata('nuova')} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-gruppo'] }}>{scelteVista}</View>
        </View>
      )}
      <Foglio aperto={vista} titolo="Vista" onChiudi={() => setVista(false)}>
        {scelteVista}
        <Pulsante tipo="primario" etichetta="Fatto" larghezzaPiena onPress={() => setVista(false)} />
      </Foglio>
      {compatto && !spesa && !rata && !sulConto && !vista ? createPortal(
        <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi una spesa" onPress={() => setSpesa('nuova')}
          style={{ position: 'fixed', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 77px)', zIndex: 40, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
            backgroundColor: c['sfondo-accento'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          <Icona nome="plus" misura={24} colore="icona-su-accento" />
        </Pressable>, document.body) : null}
      {!righe.length ? <Vuoto testo="Nessuna spesa in questo mese. Aggiungi affitto, bollette e abbonamenti." /> : null}
      {/* Un box per gruppo, in due colonne equilibrate (con un box solo, una colonna a tutta larghezza). */}
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        {colonne.filter((col) => col.length).map((col, i) => (
          <View key={i} style={{ flex: compatto ? undefined : 1, minWidth: 0, gap: d['spazio-blocco'] }}>
            {col.map((b) => <View key={b.chiave}>{b.vista}</View>)}
          </View>
        ))}
      </View>
      {nonAttive.length ? (
        <View>
          <Pulsante tipo="testo" etichetta={`${spente ? 'Nascondi' : 'Mostra'} ${nonAttive.length} ${nonAttive.length === 1 ? 'spesa non attiva' : 'spese non attive'}`} icona={spente ? 'chevron-up' : 'chevron-down'} onPress={() => setSpente(!spente)} />
          {spente ? nonAttive.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={daA(s) ?? '—'} importo={euro(s.mia_quota)} icona={s.icona ?? 'ellipsis'} salvadanaio={colSalvadanaio(s)} fatta={false} onApri={() => setSpesa(s)} />) : null}
        </View>
      ) : null}
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraRata rata={rata === 'nuova' ? null : rata} aperta={!!rata} onChiudi={() => setRata(null)} />
      <FinestraSaldo conto={principale} aperta={sulConto} onChiudi={() => setSulConto(false)} />
    </>
  );
}

// Le annuali e periodiche sempre in vista in un riquadro a parte, come la sezione «Spese fisse annuali» dell'Excel (decisione 60): in rotazione,
// in cima la prossima a uscire dal mese che si guarda; passata la sua uscita torna in fondo con quella dopo. Nel mese in cui escono si
// spuntano qui (e contano nei totali, per intero); negli altri mesi la spunta è spenta.
// Quelle che escono da un altro conto (es. dal conto delle annuali) restano spuntabili ma sono segnate e non contano nei numeri in alto.
function AnnualiInRotazione({ spese, inizio, dal, al, onSpunta, onApri, segno }: { spese: Spesa[]; inizio: number; dal: string; al: string; onSpunta: (s: Spesa) => void; onApri: (s: Spesa) => void; segno: (s: Spesa) => string | undefined }) {
  const oggi = oggiIso();
  const da = oggi >= dal && oggi <= al ? oggi : dal;
  const annuali = spese.filter(eAnnuale).map((s) => ({ s, prossima: proxSpesa(s, da, inizio) }))
    .filter((x): x is { s: Spesa; prossima: string } => !!x.prossima)
    .sort((a, b) => a.prossima.localeCompare(b.prossima) || a.s.nome.localeCompare(b.s.nome));
  if (!annuali.length) return null;
  return (
    <Scheda>
      <View style={{ gap: d['spazio-elenco'] }}>
        <TitoloGruppo testo="Annuali" destra={`${euro(annuali.reduce((t, x) => t + (Number(x.s.mia_quota) * 12) / x.s.ogni_mesi!, 0))} all'anno`} />
        {annuali.map(({ s, prossima }) => (
          <VoceDaSpuntare key={s.id} nome={s.nome} conto={[quando(s, inizio), daA(s)].filter(Boolean).join(' · ')} importo={euro(s.mia_quota)}
            sottoImporto={[s.nel_mese ? 'questo mese' : fraMesi(prossima, inizio), segno(s)].filter(Boolean).join(' · ')} fatta={s.nel_mese && s.uscita}
            onSpunta={s.nel_mese ? () => onSpunta(s) : undefined} onApri={() => onApri(s)} />
        ))}
      </View>
    </Scheda>
  );
}

// Una rata: cosa, quanto al mese, quante rate e da quando, da quale conto.
function FinestraRata({ rata, aperta, onChiudi }: { rata: Rata | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [oggetto, setOggetto] = useState('');
  const [finanziaria, setFinanziaria] = useState('');
  const [importo, setImporto] = useState('');
  const [numero, setNumero] = useState('');
  const [prima, setPrima] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  const [chiusa, setChiusa] = useState(false);
  useEffect(() => {
    if (!aperta) return;
    setOggetto(rata?.oggetto ?? ''); setFinanziaria(rata?.finanziaria ?? ''); setImporto(importoInTesto(rata?.importo_rata)); setNumero(rata ? String(rata.numero_rate) : '');
    setPrima(dataInTesto(rata?.prima_scadenza ?? oggiIso())); setConto(rata?.conto_id ?? null); setChiusa(rata?.chiusa ?? false);
  }, [aperta, rata]);
  const salva = async () => {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1) throw new Error('Scrivi quante rate sono, es. 12');
    const corpo = { oggetto: serve(oggetto.trim(), 'Scrivi cosa stai pagando a rate'), finanziaria: finanziaria.trim() || null, importo_rata: serve(leggiImporto(importo), 'Scrivi quanto è la rata, es. 83,60'),
      numero_rate: n, prima_scadenza: serve(leggiData(prima), 'Scegli il giorno della prima rata'), conto_id: conto, ...(rata ? { chiusa } : {}) };
    if (rata) await modifica(`/rate/${rata.id}`, corpo); else await crea('/rate', corpo);
  };
  const ultima = (() => { const d0 = leggiData(prima), n = Number(numero); if (!d0 || !Number.isInteger(n) || n < 1) return null; const [a, m] = d0.split('-').map(Number); const t = a * 12 + m - 1 + n - 1; return `${['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][t % 12]} ${Math.floor(t / 12)}`; })();
  return (
    <FinestraModulo titolo={rata ? rata.oggetto : 'Nuova rata'} icona="credit-card" aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={rata ? () => cancella(`/rate/${rata.id}`).then(() => undefined) : undefined}
      confermaElimina={rata ? { nome: `«${rata.oggetto}»`, dettaglio: 'La rata sparisce dal mese e dall’elenco delle rate, comprese quelle già pagate.' } : undefined}>
      <Affiancati>
        <Meta><Campo etichetta="Cosa paghi a rate" valore={oggetto} onCambia={setOggetto} segnaposto="Es. Pinguino" autoFocus={!rata} /></Meta>
        <Meta><Campo etichetta="Finanziaria (facoltativa)" valore={finanziaria} onCambia={setFinanziaria} segnaposto="Es. Cofidis" /></Meta>
      </Affiancati>
      <Affiancati>
        <Meta><Campo etichetta="Rata al mese" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" /></Meta>
        <Meta><Campo etichetta="Quante rate" valore={numero} onCambia={setNumero} inputMode="numeric" segnaposto="Es. 12" aiuto={ultima ? `L'ultima è a ${ultima}` : undefined} /></Meta>
      </Affiancati>
      <Affiancati>
        <Meta><CampoData etichetta="Prima rata" valore={prima} onCambia={setPrima} /></Meta>
        <Meta><Tendina etichetta="Da quale conto" valore={conto} opzioni={opzioniConti(rif.conti, { tenere: [conto] })} onCambia={setConto} /></Meta>
      </Affiancati>
      {rata ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={chiusa} onCambia={setChiusa} etichetta="Chiusa" />
          <Testo>{chiusa ? 'Chiusa: estinta prima della fine, non esce più' : 'Aperta'}</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
