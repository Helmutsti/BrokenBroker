import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { Foglio, Intestazione, NumeroChiave, Scheda, SelettorePeriodo, TitoloCategoria, TitoloGruppo, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, useDati } from '../dati/api.ts';
import { opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Conto, ElencoSpese, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, dataInTesto, euro, importoInTesto, leggiData, leggiImporto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { ombre } from '../tema/token.ts';
import { Caricamento, daA, eAnnuale, fraMesi, mensileSenzaGiorno, proxSpesa, quando, rateDelMese, vociDelMese } from './comuni.tsx';
import { FinestraSaldo } from './Conti.tsx';
import { FinestraSpesa } from './FinestraSpesa.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

// Spese (decisione 71, pagina iniziale): il foglio Spese dell'Excel in una pagina. In alto i conti con il saldo (si riscrive con un tocco) e,
// per ognuno e in totale, quanto deve ancora uscire e l'avanzo. Sotto, le voci del mese raggruppate per conto di partenza, così si legge il
// percorso dei soldi: entrano in un conto (saldo scritto a mano), un giroconto li porta in un altro conto, da lì esce la spesa.
// Ogni voce è un'uscita (da un conto, con categoria) o un giroconto (da un conto a un altro, senza categoria). Spuntarla sposta davvero i
// soldi (la tua quota): il saldo scende, o passa dal conto di partenza a quello di arrivo; togliendo la spunta i soldi tornano com'erano.
// Le annuali (nel loro mese, per intero) e le rate sono in riquadri a parte.
export function Spese() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const riepilogo = useDati<RiepilogoMese>(`/analisi/mese?mese=${mese}`);
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const rate = useDati<Rata[]>(`/rate?mese=${mese}`).dati ?? [];
  const [errore, setErrore] = useState<string | null>(null);
  const [spesa, setSpesa] = useState<Spesa | 'nuova' | null>(null);
  const [rata, setRata] = useState<Rata | 'nuova' | null>(null);
  const [saldoDi, setSaldoDi] = useState<Conto | null>(null);
  const [spente, setSpente] = useState(false);
  const [raggruppa, setRaggruppa] = useState<'conto' | 'categoria'>('conto');
  const [ordina, setOrdina] = useState<'scadenza' | 'nome'>('scadenza');
  const [vista, setVista] = useState(false);

  // I numeri in alto: quando escono dallo schermo scorrendo, i totali si ripresentano piccoli in alto a destra.
  const { c } = useTema();
  const compatto = useCompatto();
  const cifre = useRef<unknown>(null);
  const [fuori, setFuori] = useState(false);
  const pronto = !!(riepilogo.dati && spese.dati && rif.profilo);
  useEffect(() => {
    const nodo = cifre.current as unknown as Element | null;
    if (!pronto || !nodo || typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(([e]) => setFuori(e.boundingClientRect.top < 0), { threshold: 0.01 });
    o.observe(nodo);
    return () => o.disconnect();
  }, [pronto]);
  const r = riepilogo.dati, el = spese.dati, profilo = rif.profilo;
  if (!r || !el || !profilo) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  const inizio = profilo.inizio_mese;
  const p = el.periodo;
  // In ordine di uscita: la data nel mese, poi il nome.
  const perUscita = (a: Spesa, b: Spesa) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome);
  const giorno = (s: Spesa) => (s.scadenza && !mensileSenzaGiorno(s) ? (s.senza_giorno ? nomeMeseMinuscolo(s.scadenza.slice(0, 7)) : `il ${Number(s.scadenza.slice(8, 10))}`) : null);
  const { delConto: tutteDelMese } = vociDelMese(el, perUscita);
  const rateMese = rateDelMese(rate, p.dal, p.al);
  const nonAttive = el.spese.filter((s) => !s.attiva);

  const conti = rif.conti.filter((k) => !k.archiviato).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  // Quanto si muove spuntando: sempre la mia quota (decisione 71).
  const quota = (s: Spesa) => Number(s.mia_quota);
  // Esce dal conto: parte da lui. Arriva: è un giroconto che finisce dentro di lui.
  const esceDa = (id: string) => (s: Spesa) => s.conto_id === id;
  const arrivaA = (id: string) => (s: Spesa) => s.a_conto_id === id;
  const somma = (xs: Spesa[]) => xs.reduce((t, s) => t + quota(s), 0);
  const sommaRate = (xs: typeof rateMese) => xs.reduce((t, x) => t + Number(x.r.importo_rata), 0);
  // Per conto: ancora da uscire (spese e rate non spuntate, giroconti verso altri conti compresi), in arrivo (giroconti da altri conti non
  // spuntati) e avanzo = saldo − devono uscire + in arrivo.
  const delConto = (id: string) => {
    const saldo = rif.conto(id)?.saldo;
    const daSpuntare = tutteDelMese.filter((s) => esceDa(id)(s) && !s.uscita);
    const ratePerConto = rateMese.filter((x) => x.r.conto_id === id && !x.r.pagata);
    const devono = somma(daSpuntare) + sommaRate(ratePerConto);
    const inArrivo = somma(tutteDelMese.filter((s) => arrivaA(id)(s) && !s.uscita));
    return { saldo: saldo == null ? null : Number(saldo), devono, quante: daSpuntare.length + ratePerConto.length, inArrivo, avanzo: saldo == null ? null : Number(saldo) - devono + inArrivo };
  };
  // In totale i giroconti si annullano (escono da un conto ed entrano in un altro): contano solo i soldi che escono davvero.
  const saldi = conti.map((k) => k.saldo).filter((x): x is string => x != null).map(Number);
  const saldoTotale = saldi.length ? saldi.reduce((t, x) => t + x, 0) : null;
  const usciteDaFare = tutteDelMese.filter((s) => !s.a_conto_id && !s.uscita);
  const rateDaFare = rateMese.filter((x) => !x.r.pagata);
  const devonoTotale = somma(usciteDaFare) + sommaRate(rateDaFare);
  const quanteTotale = usciteDaFare.length + rateDaFare.length;
  const avanzoTotale = saldoTotale === null ? null : saldoTotale - devonoTotale;

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
  const voce = (s: Spesa, perConto: boolean) => (
    <VoceDaSpuntare key={s.id} nome={s.nome} conto={[giorno(s), perConto ? (s.a_conto_id ? `verso ${s.a_conto ?? 'un altro conto'}` : null) : daA(s)].filter(Boolean).join(' · ') || '—'}
      importo={euro(s.mia_quota)} sottoImporto={[s.a_conto_id ? 'giroconto' : null, s.ogni_mesi === null ? 'una volta sola' : null].filter(Boolean).join(' · ') || undefined}
      icona={s.a_conto_id ? 'arrow-left-right' : s.icona ?? 'ellipsis'} fatta={s.uscita}
      onSpunta={() => spunta(s)} onApri={() => setSpesa(s)} />
  );

  // Le voci del mese (le annuali hanno il loro riquadro): un elenco solo, poi raggruppato per conto di partenza o per categoria.
  type Riga = { chiave: string; nome: string; scadenza: string | null; conto: string; categoria: string | null; importo: number; vista: (perConto: boolean) => ReactNode };
  const righe: Riga[] = tutteDelMese.filter((s) => !eAnnuale(s))
    .map((s) => ({ chiave: s.id, nome: s.nome, scadenza: s.scadenza, conto: s.conto_id ?? '', categoria: s.categoria_id, importo: quota(s), vista: (pc: boolean) => voce(s, pc) }));
  righe.sort(ordina === 'scadenza' ? (a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it') : (a, b) => a.nome.localeCompare(b.nome, 'it'));
  const radiceCategoria = (id: string | null) => { let k = rif.categoria(id); while (k?.padre_id) k = rif.categoria(k.padre_id); return k ?? null; };
  const nelMese = (importo: number) => `${euro(importo)} nel mese`;
  const gruppi: { chiave: string; righe: Riga[]; titolo: ReactNode }[] = raggruppa === 'conto'
    ? [...new Set([...conti.map((k) => k.id), ...righe.map((x) => x.conto)])].map((id) => {
      const dentro = righe.filter((x) => x.conto === id);
      return { chiave: id || 'senza', righe: dentro, titolo: <TitoloGruppo key={id || 'senza'} testo={id ? rif.conto(id)?.nome ?? 'Conto' : 'Senza conto'} destra={nelMese(dentro.reduce((t, x) => t + x.importo, 0))} /> };
    })
    : [...new Map(righe.map((x) => [radiceCategoria(x.categoria)?.id ?? '', radiceCategoria(x.categoria)])).entries()]
      .sort(([, a], [, b]) => (a ? 0 : 1) - (b ? 0 : 1) || (a?.nome ?? '').localeCompare(b?.nome ?? '', 'it'))
      .map(([id, k]) => {
        const dentro = righe.filter((x) => (radiceCategoria(x.categoria)?.id ?? '') === id);
        return { chiave: id || 'senza', righe: dentro, titolo: <TitoloCategoria key={id || 'senza'} nome={k?.nome ?? 'Senza categoria'} icona={k?.icona ?? 'ellipsis'} colore={k?.colore ?? null} destra={nelMese(dentro.reduce((t, x) => t + x.importo, 0))} /> };
      });

  // Le due scelte di come si vedono le voci: in riga sul computer, nel foglio «Vista» sul telefono.
  const scelteVista = (
    <>
      <Voce etichetta="Raggruppa">
        <SceltaSegmenti etichetta="Raggruppa" larghezzaPiena={compatto} valore={raggruppa} onCambia={setRaggruppa} opzioni={[{ valore: 'conto', testo: 'Per conto' }, { valore: 'categoria', testo: 'Per categoria' }]} />
      </Voce>
      <Voce etichetta="Ordina">
        <SceltaSegmenti etichetta="Ordina" larghezzaPiena={compatto} valore={ordina} onCambia={setOrdina} opzioni={[{ valore: 'scadenza', testo: 'Per scadenza' }, { valore: 'nome', testo: 'Per nome' }]} />
      </Voce>
    </>
  );

  // I box (gruppi, rate e annuali) in due colonne equilibrate: ognuno, nel suo ordine, va nella colonna più corta finora
  // (il peso è il numero di righe più il titolo). Con un box solo resta una colonna sola, a tutta larghezza.
  const manca = rate.filter((x) => x.attiva).reduce((t, x) => t + Number(x.residuo), 0);
  const blocchi: { chiave: string; peso: number; vista: ReactNode }[] = gruppi.filter((g) => g.righe.length).map((g) => ({
    chiave: g.chiave, peso: g.righe.length + 2, vista: (
      <Scheda>
        <View style={{ gap: d['spazio-elenco'] }}>
          {g.titolo}
          {g.righe.map((x) => <View key={x.chiave}>{x.vista(raggruppa === 'conto')}</View>)}
        </View>
      </Scheda>
    ) }));
  if (rateMese.length) blocchi.push({ chiave: 'rate', peso: rateMese.length + 2, vista: (
    <Scheda>
      <View style={{ gap: d['spazio-elenco'] }}>
        <TitoloGruppo testo="Rate" destra={`manca ${euro(manca)} alla fine`} />
        {rateMese.map(({ r: x, quando: q }) => (
          <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={[`il ${Number(q!.slice(8, 10))}`, x.finanziaria, rif.conto(x.conto_id)?.nome].filter(Boolean).join(' · ')}
            importo={euro(x.importo_rata)} sottoImporto={`${x.pagate} di ${x.numero_rate}`} icona="credit-card" fatta={!!x.pagata} onSpunta={() => spuntaRata(x)} onApri={() => setRata(x)} />
        ))}
      </View>
    </Scheda>) });
  const quanteAnnuali = el.spese.filter(eAnnuale).length;
  if (quanteAnnuali) blocchi.push({ chiave: 'annuali', peso: quanteAnnuali + 2,
    vista: <AnnualiInRotazione spese={el.spese} inizio={inizio} dal={p.dal} al={p.al} onSpunta={spunta} onApri={setSpesa} /> });
  const colonne: (typeof blocchi)[] = [[], []];
  const pesi = [0, 0];
  for (const b of blocchi) { const k = pesi[0] <= pesi[1] ? 0 : 1; colonne[k].push(b); pesi[k] += b.peso; }

  const tonoAvanzo = (a: number | null) => (a !== null && a < 0 ? 'errore' : 'normale') as 'errore' | 'normale';
  const cartaConto = (k: Conto) => {
    const x = delConto(k.id);
    return (
      <View key={k.id} style={{ flexGrow: 1, flexBasis: compatto ? '100%' : 220, minWidth: compatto ? 0 : 210 }}>
        <NumeroChiave etichetta={k.nome} valore={x.saldo === null ? 'Scrivilo' : euro(x.saldo)} icona={k.icona} tono={tonoAvanzo(x.avanzo)}
          onPress={() => setSaldoDi(k)} etichettaPressione={`Riscrivi il saldo di ${k.nome}`}
          nota={x.saldo === null ? 'Il saldo come lo vedi in banca · tocca per scriverlo' : 'Tocca per riscrivere il saldo'}
          dettagli={[
            { testo: `Devono ancora uscire ${euro(x.devono)}${x.quante ? ` · ${x.quante} ${x.quante === 1 ? 'voce' : 'voci'}` : ''}` },
            ...(x.inArrivo > 0.005 ? [{ testo: `In arrivo da altri conti ${euro(x.inArrivo)}` }] : []),
            { testo: x.avanzo === null ? 'Avanzo: scrivi il saldo' : `Avanzo ${euro(x.avanzo, { segno: true })}`, rosso: x.avanzo !== null && x.avanzo < 0 },
          ]} />
      </View>
    );
  };

  return (
    <>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: compatto ? undefined : 1 }}>
          <Intestazione titolo={nomeMese(mese)} sottotitolo={`Dal ${data(p.dal, 'corta')} al ${data(p.al, 'corta')}${r.stipendio !== '0.00' ? ` · stipendio ${euro(r.stipendio)}` : ''}`} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      {conti.length ? (
        <View ref={cifre as never} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: compatto ? d['spazio-colonne'] : d['spazio-blocco'] }}>
          <View style={{ flexGrow: 1, flexBasis: compatto ? '100%' : 220, minWidth: compatto ? 0 : 210 }}>
            <NumeroChiave etichetta="Tutti i conti" valore={saldoTotale === null ? '—' : euro(saldoTotale)} icona="wallet" tono={tonoAvanzo(avanzoTotale)}
              nota={`${conti.length} ${conti.length === 1 ? 'conto' : 'conti'}, i giroconti si annullano`}
              dettagli={[
                { testo: `Devono ancora uscire ${euro(devonoTotale)}${quanteTotale ? ` · ${quanteTotale} ${quanteTotale === 1 ? 'voce' : 'voci'}` : ''}` },
                { testo: avanzoTotale === null ? 'Avanzo: scrivi i saldi' : `Avanzo ${euro(avanzoTotale, { segno: true })}`, rosso: avanzoTotale !== null && avanzoTotale < 0 },
              ]} />
          </View>
          {conti.map(cartaConto)}
        </View>
      ) : (
        <Scheda>
          <Vuoto testo="Ancora nessun conto. Aggiungi i tuoi conti nella pagina Conti: da lì vengono i saldi, quanto deve ancora uscire e l'avanzo." />
        </Scheda>
      )}
      {fuori && conti.length ? createPortal(
        <View accessibilityRole="summary" style={{ position: 'fixed', top: compatto ? 0 : 12, right: compatto ? 0 : 16, ...(compatto ? { left: 0 } : {}), zIndex: 50, flexDirection: 'row', justifyContent: compatto ? 'space-between' : 'flex-start', gap: compatto ? 4 : d['spazio-colonne'], paddingVertical: compatto ? 6 : 8, paddingHorizontal: compatto ? 12 : 14, ...(compatto ? { paddingTop: 'max(6px, env(safe-area-inset-top))' } : {}),
          // Fondo come le schede, bordo di 2 px in testo-terziario e testi come i numeri chiave (etichette secondarie, valori primari):
          // si stacca dalla pagina mentre si scorre, in tutti e due i temi, senza mai un blocco bianco.
          backgroundColor: c['sfondo-scheda'], borderRadius: compatto ? 0 : d['raggio-scheda'], borderWidth: 2, borderColor: c['testo-terziario'],
          boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          {([['Sui conti', saldoTotale === null ? '—' : euro(saldoTotale), 'testo-primario'], ['Devono uscire', euro(devonoTotale), 'testo-primario'],
            ['Avanzo', avanzoTotale === null ? '—' : euro(avanzoTotale, { segno: true }), avanzoTotale === null ? 'testo-primario' : avanzoTotale < 0 ? 'testo-errore' : avanzoTotale < 0.005 ? 'testo-attenzione' : 'testo-ok']] as const).map(([et, val, col]) => (
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
      {compatto && !spesa && !rata && !saldoDi && !vista ? createPortal(
        <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi una spesa" onPress={() => setSpesa('nuova')}
          style={{ position: 'fixed', right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 77px)', zIndex: 40, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
            backgroundColor: c['sfondo-accento'], boxShadow: `0 ${ombre.comparsa.offsetY}px ${ombre.comparsa.blur}px ${ombre.comparsa.colore}` } as never}>
          <Icona nome="plus" misura={24} colore="icona-su-accento" />
        </Pressable>, document.body) : null}
      {!righe.length && !rateMese.length && !quanteAnnuali ? <Vuoto testo="Nessuna spesa in questo mese. Aggiungi affitto, bollette e abbonamenti." /> : null}
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
          {spente ? nonAttive.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={daA(s) ?? '—'} importo={euro(s.mia_quota)} icona={s.a_conto_id ? 'arrow-left-right' : s.icona ?? 'ellipsis'} fatta={false} onApri={() => setSpesa(s)} />) : null}
        </View>
      ) : null}
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraRata rata={rata === 'nuova' ? null : rata} aperta={!!rata} onChiudi={() => setRata(null)} />
      <FinestraSaldo conto={saldoDi} aperta={!!saldoDi} onChiudi={() => setSaldoDi(null)} />
    </>
  );
}

// Le annuali e periodiche sempre in vista in un riquadro a parte, come la sezione «Spese fisse annuali» dell'Excel (decisione 60): in rotazione,
// in cima la prossima a uscire dal mese che si guarda; passata la sua uscita torna in fondo con quella dopo. Nel mese in cui escono si
// spuntano qui (e contano nei totali, per intero); negli altri mesi la spunta è spenta.
function AnnualiInRotazione({ spese, inizio, dal, al, onSpunta, onApri }: { spese: Spesa[]; inizio: number; dal: string; al: string; onSpunta: (s: Spesa) => void; onApri: (s: Spesa) => void }) {
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
            sottoImporto={[s.nel_mese ? 'questo mese' : fraMesi(prossima, inizio), s.a_conto_id ? 'giroconto' : null].filter(Boolean).join(' · ')} fatta={s.nel_mese && s.uscita}
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
