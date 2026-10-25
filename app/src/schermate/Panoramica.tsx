import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { Foglio, Intestazione, NumeroChiave, RigaRata, Scheda, SelettorePeriodo, TitoloCategoria, TitoloGruppo, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, ElencoSpese, Obiettivo, Proiezione, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { ombre } from '../tema/token.ts';
import { Caricamento, divisioneTraSotto, importoDelMese, proxSpesa, quando, rateDelMese, tuttiGliObiettivi, vociDelMese } from './comuni.tsx';
import { DaGirareAiConti } from './DaGirare.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';
import { useCompatto } from '../tema/compatto.ts';

// Mese (proposta v5): il foglio Spese dell'Excel in una pagina. In alto il conto
// dell'Excel (sul conto oggi − devono uscire = avanzo), poi una sola lista con le
// spunte, da cui si aggiungono e si modificano le voci; in fondo le rate,
// cosa succede se nulla cambia. Le annuali contano ogni mese con la quota mensile.
export function Panoramica() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const riepilogo = useDati<RiepilogoMese>(`/analisi/mese?mese=${mese}`);
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const rate = useDati<Rata[]>(`/rate?mese=${mese}`).dati ?? [];
  const proiezione = useDati<Proiezione>('/analisi/proiezione').dati;
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  const [errore, setErrore] = useState<string | null>(null);
  const [spesa, setSpesa] = useState<Spesa | 'nuova' | null>(null);
  const [rata, setRata] = useState<Rata | 'nuova' | null>(null);
  const [sulConto, setSulConto] = useState(false);
  const [spente, setSpente] = useState(false);
  const [raggruppa, setRaggruppa] = useState<'tipo' | 'categoria'>('tipo');
  const [ordina, setOrdina] = useState<'scadenza' | 'nome'>('scadenza');
  const [vista, setVista] = useState(false);
  const tuttiObiettivi = tuttiGliObiettivi(useDati<Obiettivo[]>('/obiettivi').dati ?? []);

  // I quattro numeri del mese: quando escono dallo schermo scorrendo, si ripresentano piccoli in alto a destra.
  const { c } = useTema();
  const compatto = useCompatto();
  const quattro = useRef<unknown>(null);
  const [fuori, setFuori] = useState(false);
  const pronto = !!(riepilogo.dati && spese.dati && rif.profilo);
  useEffect(() => {
    const nodo = quattro.current as unknown as Element | null;
    if (!pronto || !nodo || typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(([e]) => setFuori(!e.isIntersecting && e.boundingClientRect.top < 0));
    o.observe(nodo);
    return () => o.disconnect();
  }, [pronto]);
  const r = riepilogo.dati, el = spese.dati, profilo = rif.profilo;
  if (!r || !el || !profilo) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  const p = el.periodo;
  // In ordine di uscita: la data nel mese, poi il nome.
  const perUscita = (a: Spesa, b: Spesa) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome);
  const conGiorno = (s: Spesa) => [s.scadenza ? (s.senza_giorno ? nomeMeseMinuscolo(s.scadenza.slice(0, 7)) : `il ${Number(s.scadenza.slice(8, 10))}`) : null, s.conto].filter(Boolean).join(' · ') || '—';
  const { fisse, budget, investimenti, salvadanai, annuali } = vociDelMese(el, profilo, perUscita);
  // Annuali (e biennali ecc.): contano ogni mese con la quota mensile, in ordine di prossima uscita.
  const prossima = (s: Spesa) => (s.nel_mese && s.scadenza ? s.scadenza : proxSpesa(s, p.dal) ?? '9999');
  const annualiTutte = annuali.sort((a, b) => prossima(a).localeCompare(prossima(b)) || a.nome.localeCompare(b.nome, 'it'));
  const annoAnnuali = annualiTutte.reduce((t, s) => t + Number(s.quota_mensile) * 12, 0);
  const rateMese = rateDelMese(rate, p.dal, p.al);
  const nonAttive = el.spese.filter((s) => !s.attiva);

  // Il conto dell'Excel: escono dal conto le voci non ancora spuntate. Le annuali ci sono con la quota del mese (da mettere da parte), non con l'importo intero.
  const delConto = [...fisse, ...budget, ...investimenti, ...salvadanai, ...annualiTutte];
  const daSpuntare = delConto.filter((s) => !s.uscita);
  const rateDaPagare = rateMese.filter((x) => !x.r.pagata);
  const devonoUscire = daSpuntare.reduce((t, s) => t + importoDelMese(s), 0) + rateDaPagare.reduce((t, x) => t + Number(x.r.importo_rata), 0);
  const quanteDaSpuntare = daSpuntare.length + rateDaPagare.length;
  const saldo = profilo.sul_conto === null ? null : Number(profilo.sul_conto);
  const avanzo = saldo === null ? null : saldo - devonoUscire;

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
  // Usciti: quello che è già spuntato e le rate pagate.
  const spuntate = delConto.filter((s) => s.uscita);
  const ratePagate = rateMese.filter((x) => x.r.pagata);
  const usciti = spuntate.reduce((t, s) => t + importoDelMese(s), 0) + ratePagate.reduce((t, x) => t + Number(x.r.importo_rata), 0);
  const quanteUscite = spuntate.length + ratePagate.length;
  // Ha un salvadanaio (creato da questa spesa) o nasce da uno (promemoria, spesa generata).
  const colSalvadanaio = (s: Spesa) => !!(s.obiettivo_id || s.alimenta_obiettivo_id || s.bloccato_da);
  const voce = (s: Spesa, conIcona: boolean, icona = 'ellipsis', sotto?: string, dettaglio?: Parameters<typeof VoceDaSpuntare>[0]['dettaglio']) => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} importo={euro(s.mia_quota)} sottoImporto={sotto} icona={conIcona ? s.icona ?? icona : null} salvadanaio={colSalvadanaio(s)} fatta={s.uscita}
      onSpunta={() => spunta(s)} onApri={() => setSpesa(s)} dettaglio={dettaglio} />
  );
  // Un salvadanaio con sotto-salvadanai si apre e mostra come si divide la cifra (le parti non si spuntano).
  const dettaglioSalvadanaio = (s: Spesa) => {
    const o = tuttiObiettivi.find((x) => x.id === s.alimenta_obiettivo_id);
    if (!o?.figli.length) return undefined;
    const { parti, resto } = divisioneTraSotto(o, Number(s.mia_quota));
    return { etichetta: `${o.figli.length} ${o.figli.length === 1 ? 'voce' : 'voci'} dentro`, righe: parti.map((p) => ({ nome: p.obiettivo.nome, importo: euro(p.importo) })),
      nota: `Si spunta solo la riga sopra: ${euro(s.mia_quota)} si dividono da soli secondo quanto serve a ciascuno${resto > 0.005 ? `, ${euro(resto)} restano nel salvadanaio` : ''}.` };
  };

  // Tutte le voci del mese in un elenco solo, poi raggruppate per tipo o per categoria.
  type Tipo = 'fisse' | 'budget' | 'rate' | 'investimenti' | 'salvadanai' | 'annuali';
  type Riga = { chiave: string; nome: string; scadenza: string | null; tipo: Tipo; categoria: string | null; importo: number; vista: (conIcona: boolean) => ReactNode };
  // Un'annuale: in grande la quota del mese (la spunta vuol dire "messa da parte"), sotto quando esce davvero.
  const rigaAnnuale = (s: Spesa): Riga => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, tipo: 'annuali', categoria: s.categoria_id, importo: Number(s.quota_mensile), vista: () => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.nel_mese ? conGiorno(s) : quando(s)} importo={euro(s.quota_mensile)}
      sottoImporto={s.nel_mese ? `esce questo mese: ${euro(s.mia_quota)}` : `esce a ${nomeMeseMinuscolo(prossima(s).slice(0, 7))}`}
      icona={s.icona ?? 'calendar'} salvadanaio={colSalvadanaio(s)} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setSpesa(s)} />) });
  const righe: Riga[] = [
    ...fisse.map((s) => ({ s, tipo: 'fisse' as const, vista: (i: boolean) => voce(s, i) })),
    ...budget.map((s) => ({ s, tipo: 'budget' as const, vista: (i: boolean) => voce(s, i, 'wallet', 'budget del mese') })),
    ...investimenti.map((s) => ({ s, tipo: 'investimenti' as const, vista: (i: boolean) => voce(s, i, 'trending-up') })),
    ...salvadanai.map((s) => ({ s, tipo: 'salvadanai' as const, vista: (i: boolean) => voce({ ...s, icona: 'piggy-bank' }, i, 'piggy-bank', s.ogni_mesi === 12 ? "una volta all'anno" : undefined, dettaglioSalvadanaio(s)) })),
  ].map(({ s, tipo, vista }) => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, tipo, categoria: s.categoria_id, importo: Number(s.mia_quota), vista }));
  for (const s of annualiTutte) righe.push(rigaAnnuale(s));
  for (const { r: x, quando } of rateMese) righe.push({ chiave: x.id, nome: x.oggetto, scadenza: quando, tipo: 'rate', categoria: x.categoria_id, importo: Number(x.importo_rata), vista: (i) => (
    <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={[`il ${Number(quando!.slice(8, 10))}`, x.finanziaria].filter(Boolean).join(' · ')}
      importo={euro(x.importo_rata)} sottoImporto={`${x.pagate} di ${x.numero_rate}`} icona={i ? 'credit-card' : null} fatta={!!x.pagata} onSpunta={() => spuntaRata(x)} onApri={() => setRata(x)} />) });
  righe.sort(ordina === 'scadenza' ? (a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it') : (a, b) => a.nome.localeCompare(b.nome, 'it'));
  const alMeseEAnno = (m: number) => `${euro(m)} al mese · ${euro(m * 12)} all'anno`;
  const manca = rate.filter((x) => x.attiva).reduce((t, x) => t + Number(x.residuo), 0);
  const TITOLI: Record<Tipo, string> = { fisse: 'Fisse', budget: 'Budget del mese', rate: 'Rate', investimenti: 'Investimenti',
    salvadanai: 'Salvadanai · da versare, poi spunta', annuali: 'Annuali' };
  const radice = (id: string | null) => { let c = rif.categoria(id); while (c?.padre_id) c = rif.categoria(c.padre_id); return c ?? null; };
  // Per tipo, le annuali sono un gruppo sempre presente con tutte le annuali attive, a rotazione:
  // dal mese in corso in avanti, un mese dopo l'altro (richiesta di Manuel).
  const rotazione = () => annualiTutte.flatMap((s, i) => {
    const m = prossima(s).slice(0, 7), primo = i === 0 || prossima(annualiTutte[i - 1]).slice(0, 7) !== m;
    const etichetta: Riga[] = primo && m !== '9999' ? [{ chiave: `mese-${m}`, nome: '', scadenza: null, tipo: 'annuali', categoria: null, importo: 0, vista: () => (
      <Testo stile="dettaglio-forte" colore="testo-secondario" style={{ paddingHorizontal: d['margine-voce-h'], paddingTop: d['spazio-icona'] }}>{m === mese ? `${nomeMese(m)} · questo mese` : nomeMese(m)}</Testo>) }] : [];
    return [...etichetta, rigaAnnuale(s)];
  });
  const gruppi: { chiave: string; righe: Riga[]; sempre: boolean; titolo: ReactNode; piede?: ReactNode }[] = raggruppa === 'tipo'
    ? (Object.keys(TITOLI) as Tipo[]).map((t) => t === 'annuali'
      ? { chiave: t, righe: rotazione(), sempre: annualiTutte.length > 0,
        titolo: <TitoloGruppo key={t} testo={`Annuali · ${annualiTutte.length} ${annualiTutte.length === 1 ? 'spesa' : 'spese'}`} destra={alMeseEAnno(annoAnnuali / 12)} />,
        piede: <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ paddingHorizontal: d['margine-voce-h'] }}>Ogni mese conti la quota e la metti da parte (spunta). Quando una spesa esce, la paga il tuo risparmio: scrivi il prelievo nel salvadanaio con “Togli”.</Testo> }
      : { chiave: t, titolo: <TitoloGruppo key={t} testo={TITOLI[t]} destra={t === 'rate' ? `manca ${euro(manca)} alla fine` : alMeseEAnno(righe.filter((x) => x.tipo === t).reduce((tot, x) => tot + x.importo, 0))} />, righe: righe.filter((x) => x.tipo === t), sempre: false })
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

  // Per tipo: le mensili a sinistra, rate e annuali a destra. Per categoria: a turno nelle due colonne.
  const visibili = gruppi.filter((g) => g.righe.length || g.sempre);
  const SINISTRA: string[] = ['fisse', 'budget', 'investimenti', 'salvadanai'];
  const colonne = raggruppa === 'tipo'
    ? [visibili.filter((g) => SINISTRA.includes(g.chiave)), visibili.filter((g) => !SINISTRA.includes(g.chiave))]
    : [visibili.filter((_, i) => i % 2 === 0), visibili.filter((_, i) => i % 2 === 1)];

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo={nomeMese(mese)} sottotitolo={`Dal ${data(p.dal, 'corta')} al ${data(p.al, 'corta')}${r.stipendio !== '0.00' ? ` · stipendio ${euro(r.stipendio)}` : ''}`} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      <View ref={quattro as never} style={{ flexDirection: 'row', flexWrap: compatto ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: compatto ? d['spazio-colonne'] : d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Usciti" valore={euro(usciti)} icona="circle-check"
          nota={quanteUscite ? `${quanteUscite} ${quanteUscite === 1 ? 'voce spuntata' : 'voci spuntate'}` : 'Ancora nessuna voce spuntata'} />
        <Pressable accessibilityRole="button" accessibilityLabel="Cambia quanto c'è sul conto oggi" onPress={() => setSulConto(true)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', ...(compatto ? { flexBasis: '45%', flexGrow: 1 } : {}) }}>
          <NumeroChiave etichetta="Sul conto oggi" valore={saldo === null ? 'Scrivilo' : euro(saldo)} icona="wallet"
            nota={saldo === null ? 'Il saldo del conto, come lo vedi in banca' : `Scritto il ${data(profilo.sul_conto_al, 'corta')} · tocca per cambiarlo`} />
        </Pressable>
        <NumeroChiave etichetta="Devono uscire" valore={euro(devonoUscire)} icona="arrow-up-right"
          nota={[quanteDaSpuntare ? `${quanteDaSpuntare} ${quanteDaSpuntare === 1 ? 'voce' : 'voci'} da spuntare` : 'Tutto spuntato'].join(' · ')} />
        <NumeroChiave etichetta="Avanzo" valore={avanzo === null ? '—' : euro(avanzo, { segno: true })} icona="scale" tono={avanzo === null ? 'normale' : avanzo < 0 ? 'errore' : 'ok'}
          nota={avanzo === null ? 'Scrivi quanto c\'è sul conto' : avanzo < 0 ? `Sul conto mancano ${euro(-avanzo)} per arrivare a fine mese` : 'Resta sul conto dopo le uscite del mese'} />
      </View>
      {fuori ? createPortal(
        <View accessibilityRole="summary" style={{ position: 'fixed', top: compatto ? 0 : 12, right: compatto ? 0 : 16, ...(compatto ? { left: 0 } : {}), zIndex: 50, flexDirection: 'row', justifyContent: compatto ? 'space-between' : 'flex-start', gap: compatto ? 4 : d['spazio-colonne'], paddingVertical: compatto ? 6 : 8, paddingHorizontal: compatto ? 12 : 14, ...(compatto ? { paddingTop: 'max(6px, env(safe-area-inset-top))' } : {}),
          // Fondo come le schede, bordo di 2 px in testo-terziario e testi come i numeri chiave (etichette secondarie, valori primari):
          // si stacca dalla pagina mentre si scorre, in tutti e due i temi, senza mai un blocco bianco.
          backgroundColor: c['sfondo-scheda'], borderRadius: compatto ? 0 : d['raggio-scheda'], borderWidth: 2, borderColor: c['testo-terziario'],
          boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          {([['Usciti', euro(usciti), 'testo-primario'], ['Sul conto', saldo === null ? '—' : euro(saldo), 'testo-primario'], ['Devono uscire', euro(devonoUscire), 'testo-primario'],
            ['Avanzo', avanzo === null ? '—' : euro(avanzo, { segno: true }), avanzo !== null && avanzo < 0 ? 'testo-errore' : 'testo-primario']] as const).map(([et, val, col]) => (
            <View key={et} style={{ minWidth: 0, flexShrink: 1 }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1} style={compatto ? { fontSize: 11, lineHeight: 14 } : undefined}>{compatto ? et.replace('Devono uscire', 'Da uscire').replace('Sul conto', 'Conto') : et}</Testo>
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
      {/* Un box per tipo di spesa, in due colonne: le mensili a sinistra, rate e annuali a destra. */}
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        {colonne.map((box, i) => (
          <View key={i} style={{ flex: compatto ? undefined : 1, minWidth: 0, gap: d['spazio-blocco'] }}>
            {box.map((g) => (
              <Scheda key={g.chiave}>
                <View style={{ gap: d['spazio-elenco'] }}>
                  {g.titolo}
                  {g.righe.map((x) => <View key={x.chiave}>{x.vista(raggruppa === 'tipo')}</View>)}
                  {g.piede}
                </View>
              </Scheda>
            ))}
          </View>
        ))}
      </View>
      {nonAttive.length ? (
        <View>
          <Pulsante tipo="testo" etichetta={`${spente ? 'Nascondi' : 'Mostra'} ${nonAttive.length} ${nonAttive.length === 1 ? 'spesa non attiva' : 'spese non attive'}`} icona={spente ? 'chevron-up' : 'chevron-down'} onPress={() => setSpente(!spente)} />
          {spente ? nonAttive.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.conto ?? '—'} importo={euro(s.mia_quota)} icona={s.icona ?? 'ellipsis'} salvadanaio={colSalvadanaio(s)} fatta={false} onApri={() => setSpesa(s)} />) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        {proiezione ? (
          <Scheda titolo="Se nulla cambia" icona="trending-up" style={{ flex: 1 }}>
            <View>
              <Testo stile="dettaglio-normale" colore="testo-secondario">Patrimonio con l'avanzo di ogni mese, contando la fine delle rate</Testo>
              {[1, 12, 60].map((m) => {
                const punto = proiezione.punti.find((x) => x.mesi === m);
                return <RigaRata key={m} compatta icona="trending-up" nome={m === 1 ? 'Fra 1 mese' : m === 12 ? 'Fra 1 anno' : 'Fra 5 anni'} fine="" rata={euroTondi(Number(punto?.patrimonio ?? 0))} />;
              })}
            </View>
          </Scheda>
        ) : null}
      </View>
      <DaGirareAiConti />
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraRata rata={rata === 'nuova' ? null : rata} aperta={!!rata} onChiudi={() => setRata(null)} />
      <FinestraSulConto aperta={sulConto} valore={profilo.sul_conto} onChiudi={() => setSulConto(false)} />
    </>
  );
}

// "Sul conto oggi": il saldo scritto a mano, come la cella dell'Excel.
function FinestraSulConto({ aperta, valore, onChiudi }: { aperta: boolean; valore: string | null; onChiudi: () => void }) {
  const [testo, setTesto] = useState('');
  useEffect(() => { if (aperta) setTesto(importoInTesto(valore)); }, [aperta, valore]);
  const salva = async () => {
    await modifica('/profilo', { sul_conto: testo.trim() ? serve(leggiImporto(testo), 'Scrivi il saldo, es. 450,79 (anche negativo, es. -20,00)') : null });
  };
  return (
    <FinestraModulo titolo="Sul conto oggi" icona="wallet" aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      <Campo etichetta="Quanto c'è sul conto" valore={testo} onCambia={setTesto} inputMode="decimal" segnaposto="0,00" autoFocus
        aiuto="Il saldo del conto da cui escono le spese del mese, come lo vedi in banca. Serve a calcolare l'avanzo." />
    </FinestraModulo>
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
        <Meta><Tendina etichetta="Da quale conto" valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
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
