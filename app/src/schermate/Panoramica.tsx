import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, MenuScelta, Tendina } from '../componenti/campi.tsx';
import { Foglio, Intestazione, NumeroChiave, Scheda, SelettorePeriodo, TitoloCategoria, TitoloGruppo, VoceBudget, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Conto, ControlloRate, ElencoSpese, Obiettivo, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, dataInTesto, dataOra, euro, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { ombre } from '../tema/token.ts';
import { meseDi } from '../mesePersonale.ts';
import { pesoBudget } from '../calcoliAvanzo.ts';
import { useNavigation } from '@react-navigation/native';
import { Caricamento, divisioneTraSotto, importoDelMese, mensileSenzaGiorno, proxSpesa, quando, rateDelMese, tuttiGliObiettivi, vociDelMese } from './comuni.tsx';
import { DaGirareAiConti } from './DaGirare.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';
import { useCompatto } from '../tema/compatto.ts';

// Il conto scelto nella tendina resta finché l'app è aperta, anche cambiando schermata.
let ultimoConto = 'tutti';

// Mese (proposta v5): il foglio Spese dell'Excel in una pagina. In alto il conto
// dell'Excel (saldo attuale dei conti − devono uscire = avanzo), poi una sola lista con le
// spunte, da cui si aggiungono e si modificano le voci; in fondo le rate.
// Le annuali contano ogni mese con la quota mensile.
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
  const [contoScelto, setContoScelto] = useState(ultimoConto);
  const scegliConto = (v: string) => { ultimoConto = v; setContoScelto(v); };
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
  const r = riepilogo.dati, elencoCompleto = spese.dati, profilo = rif.profilo;
  if (!r || !elencoCompleto || !profilo) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  // Un conto scelto: solo le sue spese e rate (quelle senza conto compaiono solo in «Tutti i conti») e il suo saldo.
  const inizio = profilo.inizio_mese;
  const conti = rif.conti.filter((x) => !x.archiviato);
  const conto = conti.find((x) => x.id === contoScelto) ?? null;
  const titoloSaldo = conto ? `Su ${conto.nome} oggi` : 'Sui conti oggi';
  // Un budget non ha un conto: con un conto scelto compare se lo sposta (partenza o arrivo) o se ne ha già speso (decisione 48).
  const delContoScelto = (s: Spesa) => s.tipo === 'budget'
    ? s.conto_partenza_id === conto!.id || s.conto_arrivo_id === conto!.id || Number(s.speso_per_conto?.[conto!.id] ?? 0) > 0
    : s.conto_id === conto!.id;
  const el: ElencoSpese = conto ? { ...elencoCompleto, spese: elencoCompleto.spese.filter(delContoScelto) } : elencoCompleto;
  const rate = conto ? tutteLeRate.filter((x) => x.conto_id === conto.id) : tutteLeRate;
  const p = el.periodo;
  // In ordine di uscita: la data nel mese, poi il nome.
  const perUscita = (a: Spesa, b: Spesa) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome);
  const conGiorno = (s: Spesa) => [s.scadenza && !mensileSenzaGiorno(s) ? (s.senza_giorno ? nomeMeseMinuscolo(s.scadenza.slice(0, 7)) : `il ${Number(s.scadenza.slice(8, 10))}`) : null, s.conto].filter(Boolean).join(' · ') || '—';
  const { fisse, budget, investimenti, salvadanai, annuali } = vociDelMese(el, perUscita);
  // Annuali (e biennali ecc.): contano ogni mese con la quota mensile, in ordine di prossima uscita.
  const prossima = (s: Spesa) => (s.nel_mese && s.scadenza ? s.scadenza : proxSpesa(s, p.dal, inizio) ?? '9999');
  // Il mese personale in cui esce (non il mese di calendario della data).
  const meseProssima = (s: Spesa) => { const x = prossima(s); return x === '9999' ? x : meseDi(x, inizio); };
  const annualiTutte = annuali.sort((a, b) => prossima(a).localeCompare(prossima(b)) || a.nome.localeCompare(b.nome, 'it'));
  const annoAnnuali = annualiTutte.reduce((t, s) => t + Number(s.quota_mensile) * 12, 0);
  const rateMese = rateDelMese(rate, p.dal, p.al);
  const nonAttive = el.spese.filter((s) => !s.attiva);

  // Il conto dell'Excel: escono dal conto le voci non ancora spuntate. Le annuali ci sono con la quota del mese (da mettere da parte), non con l'importo intero.
  // I budget pesano a modo loro (decisione 48, calcoliAvanzo.ts): un giroconto esce dalla partenza ed entra nell'arrivo (con «Tutti i conti» si annulla),
  // un budget che conta le uscite pesa per quanto resta del tetto.
  const delConto = [...fisse, ...investimenti, ...salvadanai, ...annualiTutte];
  const pesi = budget.map((s) => ({ s, w: pesoBudget(s, conto?.id ?? null) }));
  const daSpuntare = delConto.filter((s) => !s.uscita);
  const rateDaPagare = rateMese.filter((x) => !x.r.pagata);
  const devonoUscire = daSpuntare.reduce((t, s) => t + importoDelMese(s), 0) + rateDaPagare.reduce((t, x) => t + Number(x.r.importo_rata), 0) + pesi.reduce((t, x) => t + x.w.daUscire, 0);
  const inArrivo = pesi.reduce((t, x) => t + x.w.inArrivo, 0);
  const quanteDaSpuntare = daSpuntare.length + rateDaPagare.length + pesi.filter((x) => x.w.daSpuntare).length;
  // Il saldo ATTUALE dei conti (decisione 47): scritto a mano una volta e mosso da spunte e salvadanai. Con «Tutti i conti» è la somma dei
  // saldi dei conti visibili; solo se nessun conto ha un saldo vale ancora il vecchio «sul conto» del profilo, finché non se ne scrive uno.
  // L'avanzo è il saldo attuale meno quello che deve ancora uscire: le voci già spuntate sono già nel saldo.
  const contiConSaldo = conti.filter((x) => x.saldo !== null);
  const saldoVecchio = !conto && !contiConSaldo.length && profilo.sul_conto !== null;
  const saldo = conto ? (conto.saldo === null ? null : Number(conto.saldo))
    : contiConSaldo.length ? contiConSaldo.reduce((t, x) => t + Number(x.saldo), 0) : saldoVecchio ? Number(profilo.sul_conto) : null;
  const avanzo = saldo === null ? null : saldo - devonoUscire + inArrivo;
  const notaSaldo = conto
    ? (conto.saldo === null ? `Scrivi quanto c'è su ${conto.nome}` : `Aggiornato il ${dataOra(conto.saldo_aggiornato_il)} · tocca per riallinearlo`)
    : saldoVecchio ? `Scritto il ${data(profilo.sul_conto_al, 'corta')} a mano · scrivi il saldo di un conto per sostituirlo`
      : !contiConSaldo.length ? 'Scrivi il saldo di un conto, come lo vedi in banca'
        : contiConSaldo.length < conti.length ? `Somma di ${contiConSaldo.length} conti su ${conti.length}: manca il saldo di ${conti.filter((x) => x.saldo === null).map((x) => x.nome).join(', ')}`
          : `Somma dei saldi di ${conti.length === 1 ? 'un conto' : `${conti.length} conti`} · tocca per riallinearne uno`;
  // Il passato non si cambia: le spunte dei mesi precedenti a quello in corso restano come sono.
  const passato = mese < rif.meseOggi;

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
  const usciti = spuntate.reduce((t, s) => t + importoDelMese(s), 0) + ratePagate.reduce((t, x) => t + Number(x.r.importo_rata), 0) + pesi.reduce((t, x) => t + x.w.uscito, 0);
  const quanteUscite = spuntate.length + ratePagate.length + pesi.filter((x) => x.w.uscito > 0).length;
  // Ha un salvadanaio (creato da questa spesa) o nasce da uno (promemoria, spesa generata).
  const colSalvadanaio = (s: Spesa) => !!(s.obiettivo_id || s.alimenta_obiettivo_id || s.bloccato_da);
  const voce = (s: Spesa, conIcona: boolean, icona = 'ellipsis', sotto?: string, dettaglio?: Parameters<typeof VoceDaSpuntare>[0]['dettaglio']) => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} importo={euro(s.mia_quota)} sottoImporto={sotto} icona={conIcona ? s.icona ?? icona : null} salvadanaio={colSalvadanaio(s)} fatta={s.uscita}
      onSpunta={passato ? undefined : () => spunta(s)} onApri={() => setSpesa(s)} dettaglio={dettaglio} />
  );
  // Un budget è un promemoria (decisione 48): «Sposto i soldi» si spunta (giroconto), «Conto le uscite» mostra quanto è stato speso sul tetto.
  const voceBudget = (s: Spesa, conIcona: boolean) => {
    if (s.budget_modo === 'conto') {
      const sp = Number(s.speso ?? 0), tetto = Number(s.importo), pct = tetto > 0 ? sp / tetto * 100 : sp > 0 ? 100 : 0;
      return <VoceBudget key={s.id} nome={s.nome} nota={sp > tetto ? `Speso ${euro(sp)}: sforato di ${euro(sp - tetto)}` : `Speso ${euro(sp)} · restano ${euro(tetto - sp)}`} conto="Conto le uscite" importo={euro(tetto)} icona={conIcona ? s.icona ?? 'wallet' : null}
        valore={pct} stato={sp > tetto ? 'superato' : pct >= 85 ? 'attenzione' : 'normale'} onApri={() => setSpesa(s)} />;
    }
    const giro = s.conto_partenza && s.conto_arrivo ? `da ${s.conto_partenza} a ${s.conto_arrivo}` : 'budget del mese';
    return <VoceDaSpuntare key={s.id} nome={s.nome} conto={giro} importo={euro(s.mia_quota)} sottoImporto={s.conto_partenza && s.conto_arrivo ? 'giroconto' : 'budget del mese'} icona={conIcona ? s.icona ?? 'wallet' : null}
      fatta={s.uscita} onSpunta={passato ? undefined : () => spunta(s)} onApri={() => setSpesa(s)} />;
  };
  // Un salvadanaio con sotto-salvadanai si apre e mostra come si divide la cifra (le parti non si spuntano).
  const dettaglioSalvadanaio = (s: Spesa) => {
    const o = tuttiObiettivi.find((x) => x.id === s.alimenta_obiettivo_id);
    if (!o?.figli.length) return undefined;
    const { parti, resto } = divisioneTraSotto(o, Number(s.mia_quota), inizio);
    return { etichetta: `${o.figli.length} ${o.figli.length === 1 ? 'voce' : 'voci'} dentro`, righe: parti.map((p) => ({ nome: p.obiettivo.nome, importo: euro(p.importo) })),
      nota: `Si spunta solo la riga sopra: ${euro(s.mia_quota)} si dividono da soli secondo quanto serve a ciascuno${resto > 0.005 ? `, ${euro(resto)} restano nel salvadanaio` : ''}.` };
  };

  // Tutte le voci del mese in un elenco solo, poi raggruppate per tipo o per categoria.
  type Tipo = 'fisse' | 'budget' | 'rate' | 'investimenti' | 'salvadanai' | 'annuali';
  type Riga = { chiave: string; nome: string; scadenza: string | null; tipo: Tipo; categoria: string | null; importo: number; vista: (conIcona: boolean) => ReactNode };
  // Un'annuale: in grande la quota del mese (la spunta vuol dire "messa da parte"), sotto quando esce davvero.
  const rigaAnnuale = (s: Spesa): Riga => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, tipo: 'annuali', categoria: s.categoria_id, importo: Number(s.quota_mensile), vista: () => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.nel_mese ? conGiorno(s) : quando(s, inizio)} importo={euro(s.quota_mensile)}
      sottoImporto={s.nel_mese ? `esce questo mese: ${euro(s.mia_quota)}` : `esce a ${nomeMeseMinuscolo(meseProssima(s))}`}
      icona={s.icona ?? 'calendar'} salvadanaio={colSalvadanaio(s)} fatta={s.uscita} onSpunta={passato ? undefined : () => spunta(s)} onApri={() => setSpesa(s)} />) });
  const righe: Riga[] = [
    ...fisse.map((s) => ({ s, tipo: 'fisse' as const, vista: (i: boolean) => voce(s, i) })),
    ...budget.map((s) => ({ s, tipo: 'budget' as const, vista: (i: boolean) => voceBudget(s, i) })),
    ...investimenti.map((s) => ({ s, tipo: 'investimenti' as const, vista: (i: boolean) => voce(s, i, 'trending-up') })),
    ...salvadanai.map((s) => ({ s, tipo: 'salvadanai' as const, vista: (i: boolean) => voce({ ...s, icona: 'piggy-bank' }, i, 'piggy-bank', s.ogni_mesi === 12 ? "una volta all'anno" : undefined, dettaglioSalvadanaio(s)) })),
  ].map(({ s, tipo, vista }) => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, tipo, categoria: s.categoria_id, importo: Number(s.mia_quota), vista }));
  for (const s of annualiTutte) righe.push(rigaAnnuale(s));
  for (const { r: x, quando } of rateMese) righe.push({ chiave: x.id, nome: x.oggetto, scadenza: quando, tipo: 'rate', categoria: x.categoria_id, importo: Number(x.importo_rata), vista: (i) => (
    <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={[`il ${Number(quando!.slice(8, 10))}`, x.finanziaria].filter(Boolean).join(' · ')}
      importo={euro(x.importo_rata)} sottoImporto={`${x.pagate} di ${x.numero_rate}`} icona={i ? 'credit-card' : null} fatta={!!x.pagata} onSpunta={passato ? undefined : () => spuntaRata(x)} onApri={() => setRata(x)} />) });
  righe.sort(ordina === 'scadenza' ? (a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it') : (a, b) => a.nome.localeCompare(b.nome, 'it'));
  const alMeseEAnno = (m: number) => `${euro(m)} al mese · ${euro(m * 12)} all'anno`;
  const manca = rate.filter((x) => x.attiva).reduce((t, x) => t + Number(x.residuo), 0);
  const TITOLI: Record<Tipo, string> = { fisse: 'Fisse', budget: 'Budget del mese · promemoria', rate: 'Rate', investimenti: 'Investimenti',
    salvadanai: 'Salvadanai · da versare, poi spunta', annuali: 'Annuali' };
  const radice = (id: string | null) => { let c = rif.categoria(id); while (c?.padre_id) c = rif.categoria(c.padre_id); return c ?? null; };
  // Per tipo, le annuali sono un gruppo sempre presente con tutte le annuali attive, a rotazione:
  // dal mese in corso in avanti, un mese dopo l'altro (richiesta di Manuel).
  const rotazione = () => annualiTutte.flatMap((s, i) => {
    const m = meseProssima(s), primo = i === 0 || meseProssima(annualiTutte[i - 1]) !== m;
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
        <NumeroChiave etichetta={titoloSaldo} valore={saldo === null ? 'Scrivilo' : euro(saldo)} icona="wallet"
          onPress={() => setSulConto(true)} etichettaPressione={conto ? `Riscrivi il saldo di ${conto.nome}` : 'Riscrivi il saldo di un conto'}
          titolo={conti.length ? (
            <MenuScelta valore={conto ? conto.id : 'tutti'} onCambia={scegliConto} larghezzaMinima={240}
              opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona }))]}>
              {({ ref, apri, aperto }) => (
                <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${conto ? conto.nome : 'Tutti i conti'}`} aria-expanded={aperto} onPress={apri}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                  <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{titoloSaldo}</Testo>
                  <Icona nome="chevron-down" misura={16} />
                </Pressable>
              )}
            </MenuScelta>
          ) : undefined}
          nota={notaSaldo} />
        <NumeroChiave etichetta="Usciti" valore={euro(usciti)} icona="circle-check"
          nota={quanteUscite ? `${quanteUscite} ${quanteUscite === 1 ? 'voce spuntata' : 'voci spuntate'}` : 'Ancora nessuna voce spuntata'} />
        <NumeroChiave etichetta="Devono uscire" valore={euro(devonoUscire)} icona="arrow-up-right"
          nota={[quanteDaSpuntare ? `${quanteDaSpuntare} ${quanteDaSpuntare === 1 ? 'voce' : 'voci'} da spuntare` : 'Tutto spuntato'].join(' · ')} />
        <NumeroChiave etichetta="Avanzo" valore={avanzo === null ? '—' : euro(avanzo, { segno: true })} icona="scale" tono={avanzo === null ? 'normale' : avanzo < 0 ? 'errore' : avanzo < 0.005 ? 'attenzione' : 'ok'}
          nota={avanzo === null ? (conto ? `Scrivi quanto c'è su ${conto.nome}` : 'Scrivi il saldo di un conto') : avanzo < 0 ? `Sul conto mancano ${euro(-avanzo)} per sostenere le spese` : inArrivo > 0.005 ? `Saldo di oggi meno quello che deve ancora uscire, più ${euro(inArrivo)} che arrivano dai giroconti` : 'Saldo di oggi meno quello che deve ancora uscire'} />
      </View>
      {fuori ? createPortal(
        <View accessibilityRole="summary" style={{ position: 'fixed', top: compatto ? 0 : 12, right: compatto ? 0 : 16, ...(compatto ? { left: 0 } : {}), zIndex: 50, flexDirection: 'row', justifyContent: compatto ? 'space-between' : 'flex-start', gap: compatto ? 4 : d['spazio-colonne'], paddingVertical: compatto ? 6 : 8, paddingHorizontal: compatto ? 12 : 14, ...(compatto ? { paddingTop: 'max(6px, env(safe-area-inset-top))' } : {}),
          // Fondo come le schede, bordo di 2 px in testo-terziario e testi come i numeri chiave (etichette secondarie, valori primari):
          // si stacca dalla pagina mentre si scorre, in tutti e due i temi, senza mai un blocco bianco.
          backgroundColor: c['sfondo-scheda'], borderRadius: compatto ? 0 : d['raggio-scheda'], borderWidth: 2, borderColor: c['testo-terziario'],
          boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          {([[conto ? conto.nome : 'Sui conti', saldo === null ? '—' : euro(saldo), 'testo-primario'], ['Usciti', euro(usciti), 'testo-primario'], ['Devono uscire', euro(devonoUscire), 'testo-primario'],
            ['Avanzo', avanzo === null ? '—' : euro(avanzo, { segno: true }), avanzo === null ? 'testo-primario' : avanzo < 0 ? 'testo-errore' : avanzo < 0.005 ? 'testo-attenzione' : 'testo-ok']] as const).map(([et, val, col]) => (
            <View key={et} style={{ minWidth: 0, flexShrink: 1 }}>
              <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={1} style={compatto ? { fontSize: 11, lineHeight: 14 } : undefined}>{compatto ? et.replace('Devono uscire', 'Da uscire').replace('Sui conti', 'Conti') : et}</Testo>
              <Testo stile="corpo-forte" colore={col} numberOfLines={1} style={compatto ? { fontSize: 13, lineHeight: 18 } : undefined}>{val}</Testo>
            </View>
          ))}
        </View>, document.body) : null}
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      {passato ? <Esito tono="informazione" testo="Mese passato: le spunte non si possono più cambiare, il passato non si tocca." /> : null}
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
      {budget.length ? <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="chart-column" etichetta="Vai alla pagina Budget" onPress={() => navigazione.navigate('budget')} /></View> : null}
      {nonAttive.length ? (
        <View>
          <Pulsante tipo="testo" etichetta={`${spente ? 'Nascondi' : 'Mostra'} ${nonAttive.length} ${nonAttive.length === 1 ? 'spesa non attiva' : 'spese non attive'}`} icona={spente ? 'chevron-up' : 'chevron-down'} onPress={() => setSpente(!spente)} />
          {spente ? nonAttive.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.conto ?? '—'} importo={euro(s.mia_quota)} icona={s.icona ?? 'ellipsis'} salvadanaio={colSalvadanaio(s)} fatta={false} onApri={() => setSpesa(s)} />) : null}
        </View>
      ) : null}
      <DaGirareAiConti />
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraRata rata={rata === 'nuova' ? null : rata} aperta={!!rata} onChiudi={() => setRata(null)} />
      <FinestraSulConto aperta={sulConto} conti={conti} conto={conto} onChiudi={() => setSulConto(false)} />
    </>
  );
}

// «Saldo di oggi»: riscrive il saldo di partenza del conto scelto, come lo vedi in banca (decisione 47). Da lì in poi si muove da solo con
// le spunte e i salvadanai. Con «Tutti i conti» si sceglie quale conto riscrivere.
function FinestraSulConto({ aperta, conti, conto, onChiudi }: { aperta: boolean; conti: Conto[]; conto: Conto | null; onChiudi: () => void }) {
  const [scelto, setScelto] = useState<string | null>(null);
  const [testo, setTesto] = useState('');
  const bersaglio = conti.find((x) => x.id === (conto?.id ?? scelto)) ?? null;
  useEffect(() => {
    if (!aperta) return;
    const primo = conto ?? conti.find((x) => x.saldo === null) ?? conti[0] ?? null;
    setScelto(primo?.id ?? null); setTesto(importoInTesto(primo?.saldo));
  }, [aperta]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiaConto = (id: string) => { setScelto(id); setTesto(importoInTesto(conti.find((x) => x.id === id)?.saldo)); };
  const salva = async () => {
    if (!bersaglio) throw new Error('Crea prima un conto, in Conti');
    const importo = serve(leggiImporto(testo), 'Scrivi il saldo, es. 450,79 (anche negativo, es. -20,00)', 'importo');
    await sostituisci(`/conti/${bersaglio.id}/saldo`, { importo });
  };
  return (
    <FinestraModulo titolo={bersaglio ? `Saldo di oggi · ${bersaglio.nome}` : 'Saldo di oggi'} icona={bersaglio?.icona ?? 'wallet'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      {!conto && conti.length > 1 ? <Tendina etichetta="Quale conto" valore={scelto} opzioni={conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona }))} onCambia={cambiaConto} /> : null}
      <Campo etichetta="Quanto c'è sul conto" valore={testo} onCambia={setTesto} inputMode="decimal" segnaposto="0,00" autoFocus
        aiuto={bersaglio ? `Il saldo di ${bersaglio.nome}, come lo vedi in banca${bersaglio.condiviso || !bersaglio.mio ? ' (è lo stesso per tutti e due)' : ''}. Da adesso si muove da solo con le spunte e i salvadanai; riscrivilo per riallinearlo.` : 'Non hai ancora un conto: aggiungilo in Conti.'} />
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
