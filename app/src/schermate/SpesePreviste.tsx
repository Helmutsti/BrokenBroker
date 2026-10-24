import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti, Tessera } from '../componenti/base.tsx';
import { Campo, Tendina, TendinaGriglia } from '../componenti/campi.tsx';
import { CalendarioAnnuali, Intestazione, NumeroChiave, RigaNumeri, RigaSpesa, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, sostituisci, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, ElencoSpese, Obiettivo, Persona, Spesa, TipoSpesa } from '../dati/tipi.ts';
import { euro, importoInTesto, leggiImporto, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { Caricamento, calendarioAnnuali, eAnnuale, proxSpesa, prossimeAnnuali, quando, segnoQuota } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

type Filtro = 'tutte' | 'mese' | 'periodiche' | 'spente';
type Frequenza = 'mese' | 'anno' | 'biennale' | 'n' | 'una';
type Divisione = 'io' | 'meta' | 'altra';

// SC-02 Spese previste (proposta v2): le spese di ogni mese e le annuali in due
// schede separate; le annuali con il calendario dei prossimi 12 mesi e la quota da
// mettere via ogni mese.
export function SpesePreviste() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const { dati, errore } = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const obiettivi = useDati<Obiettivo[]>('/obiettivi').dati ?? [];
  const [filtro, setFiltro] = useState<Filtro>('tutte');
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Spesa | 'nuova' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attive = dati.spese.filter((s) => s.attiva);
  const mensili = attive.filter((s) => s.ogni_mesi === 1);
  const somma = (xs: Spesa[]) => xs.reduce((t, s) => t + Number(s.mia_quota), 0);
  const annuo = attive.filter(eAnnuale).reduce((t, s) => t + (Number(s.mia_quota) * 12) / s.ogni_mesi!, 0);
  const perTipo = (t: TipoSpesa) => somma(mensili.filter((s) => s.tipo === t));

  const testo = cerca.trim().toLowerCase();
  const visibili = dati.spese.filter((s) => (filtro === 'spente' ? !s.attiva : s.attiva)
    && (!testo || s.nome.toLowerCase().includes(testo) || (s.categoria ?? '').toLowerCase().includes(testo)));
  // In ordine di uscita: il giorno del mese in cui esce, poi il nome.
  const giorno = (s: Spesa) => (s.prossima_scadenza && !s.senza_giorno ? Number(s.prossima_scadenza.slice(8, 10)) : 99);
  const ogniMese = visibili.filter((s) => s.ogni_mesi === 1).sort((a, b) => giorno(a) - giorno(b) || a.nome.localeCompare(b.nome));
  const periodiche = visibili.filter((s) => s.ogni_mesi !== 1);
  const gruppiMese: [string, Spesa[]][] = [
    ['Fisse · ogni mese', ogniMese.filter((s) => s.tipo === 'fissa')],
    ['Budget variabili · ogni mese', ogniMese.filter((s) => s.tipo === 'budget')],
    ['Investimenti · ogni mese', ogniMese.filter((s) => s.tipo === 'investimento')],
  ];
  // Annuali in ordine di prossima uscita; le "una volta sola" in fondo.
  const prossima = (s: Spesa) => proxSpesa(s) ?? '9999';
  const annuali = periodiche.filter((s) => s.ogni_mesi !== null).sort((x, y) => prossima(x).localeCompare(prossima(y)));
  const unaVolta = periodiche.filter((s) => s.ogni_mesi === null);
  const copertura = prossimeAnnuali(attive, obiettivi);
  const scoperti = new Set(copertura.elenco.filter((x) => x.copertura.tono === 'attenzione').map((x) => x.quando.slice(0, 7)));
  const calendario = calendarioAnnuali(attive);
  const vediMese = filtro !== 'periodiche', vediAnnuali = filtro !== 'mese';
  const riga = (s: Spesa, alMese?: string) => (
    <RigaSpesa key={s.id} nome={s.nome} categoria={s.categoria_padre ? `${s.categoria_padre} › ${s.categoria}` : s.categoria ?? '—'} conto={s.conto ?? '—'}
      quando={quando(s)} totale={euro(s.importo)} quota={alMese ?? euro(s.mia_quota) + segnoQuota(s)} icona={s.icona ?? 'ellipsis'} onApri={() => setAperta(s)} />
  );
  const nuova = <Pulsante tipo="primario" etichetta="Nuova spesa prevista" icona="plus" onPress={() => setAperta('nuova')} />;

  return (
    <>
      <Intestazione titolo="Spese previste" sottotitolo="Le spese di ogni mese finiscono nella lista da spuntare; le annuali si vedono al mese e, nel mese giusto, per intero." azioni={nuova} />
      <RigaNumeri>
        <NumeroChiave etichetta="Ogni mese, la tua quota" valore={euro(somma(mensili))} icona="repeat" nota={`Fisse ${euro(perTipo('fissa'))} · budget ${euro(perTipo('budget'))} · investimenti ${euro(perTipo('investimento'))}`} />
        <NumeroChiave etichetta="Annuali, la tua quota" valore={`${euro(annuo)} l'anno`} icona="calendar" nota={`Da mettere via: ${euro(annuo / 12)} al mese`} />
        <NumeroChiave etichetta="Totale al mese" valore={euro(somma(mensili) + annuo / 12)} icona="wallet" nota="Mensili + annuali divise per 12 · rate escluse" />
      </RigaNumeri>
      <View style={{ flexDirection: compatto ? 'column' : 'row', alignItems: compatto ? 'stretch' : 'center', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
        <SceltaSegmenti etichetta="Quali spese" valore={filtro} onCambia={setFiltro}
          opzioni={[{ valore: 'tutte', testo: 'Tutte' }, { valore: 'mese', testo: 'Ogni mese' }, { valore: 'periodiche', testo: 'Annuali' }, { valore: 'spente', testo: 'Non attive' }]} />
        <View style={{ width: compatto ? undefined : 300 }}><Campo valore={cerca} onCambia={setCerca} segnaposto="Cerca una spesa…" iconaPrima="search" /></View>
      </View>
      {dati.spese.length === 0 ? (
        <Scheda><Vuoto testo="Ancora nessuna spesa prevista: aggiungi affitto, bollette e abbonamenti." azione={nuova} /></Scheda>
      ) : null}
      {dati.spese.length && vediMese ? (
        <Scheda titolo="Ogni mese" nota="Fisse, budget e investimenti" icona="repeat">
          {ogniMese.length === 0 ? <Vuoto testo="Nessuna spesa di ogni mese con questi filtri." /> : (
            <View>
              <RigaSpesa tipo="intestazione" nome="Spesa" categoria="Categoria" conto="Conto" quando="Giorno" totale="Totale" quota="Tua quota" />
              {gruppiMese.filter(([, xs]) => xs.length).map(([titolo, xs]) => (
                <View key={titolo}><TitoloGruppo testo={titolo} destra={euro(somma(xs))} />{xs.map((s) => riga(s))}</View>
              ))}
            </View>
          )}
        </Scheda>
      ) : null}
      {dati.spese.length && vediAnnuali ? (
        <Scheda titolo="Annuali e periodiche" nota="Escono poche volte l'anno · dal salvadanaio" icona="calendar-clock">
          {annuali.length === 0 && unaVolta.length === 0 ? <Vuoto testo="Nessuna spesa annuale con questi filtri." /> : (
            <View style={{ gap: d['spazio-blocco'] }}>
              {filtro !== 'spente' && annuali.length ? (
                <View style={{ gap: d['spazio-elenco'] }}>
                  <TitoloGruppo testo="Quando escono · prossimi 12 mesi" />
                  <CalendarioAnnuali mesi={calendario.map((m, i) => ({ etichetta: meseCorto(m.mese), importo: m.importo, attuale: i === 0, attenzione: scoperti.has(m.mese) }))} />
                  {copertura.conSalvadanaio ? (
                    <Esito tono={copertura.mancano > 0 ? 'attenzione' : 'ok'} testo={copertura.mancano > 0
                      ? `Nel salvadanaio ${euro(copertura.nelSalvadanaio)}: per le uscite fino a ${nomeMeseMinuscolo(copertura.limite.slice(0, 7))} mancano ${euro(copertura.mancano)}.`
                      : `Nel salvadanaio ${euro(copertura.nelSalvadanaio)}: copre tutte le uscite fino a ${nomeMeseMinuscolo(copertura.limite.slice(0, 7))}.`} />
                  ) : null}
                </View>
              ) : null}
              <View>
                <RigaSpesa tipo="intestazione" nome="Spesa" categoria="Categoria" conto="Conto" quando="Prossima uscita" totale="Totale" quota="Dodicesimo" />
                {annuali.map((s) => riga(s, euro((Number(s.mia_quota) * 12) / s.ogni_mesi! / 12)))}
                {unaVolta.length ? <TitoloGruppo testo="Una volta sola" destra={euro(somma(unaVolta))} /> : null}
                {unaVolta.map((s) => riga(s, '—'))}
              </View>
              {annuali.length ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
                  <Testo colore="testo-secondario" style={{ flex: 1 }}>{`In tutto ${euro(annuo)} l'anno: un dodicesimo, da mettere da parte ogni mese, è ${euro(annuo / 12)}.`}</Testo>
                  <Testo stile="corpo-forte">{`${euro(annuo / 12)} al mese`}</Testo>
                </View>
              ) : null}
            </View>
          )}
        </Scheda>
      ) : null}
      <FinestraSpesa spesa={aperta === 'nuova' ? null : aperta} aperta={!!aperta} onChiudi={() => setAperta(null)} />
    </>
  );
}

const OPZIONI_GIORNO = [{ valore: '', testo: '—' }, ...Array.from({ length: 31 }, (_, i) => ({ valore: String(i + 1), testo: String(i + 1) }))];
const OPZIONI_MESE = [{ valore: '', testo: '—' }, ...Array.from({ length: 12 }, (_, i) => ({ valore: String(i + 1), testo: nomeMese(`2000-${String(i + 1).padStart(2, '0')}`, false) }))];
const giorniDel = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi.
// Senza giorno vale tutto il mese: si salva il giorno 1 e il mese in corso è ancora buono.
export function primaOccorrenza(giorno: number | null, mese: number, oggi = oggiIso()): string {
  const [a, m, g] = oggi.split('-').map(Number);
  const iso = (anno: number) => `${anno}-${String(mese).padStart(2, '0')}-${String(Math.min(giorno ?? 1, giorniDel(anno, mese))).padStart(2, '0')}`;
  const passata = giorno === null ? mese < m : mese < m || (mese === m && Math.min(giorno, giorniDel(a, mese)) < g);
  return iso(passata ? a + 1 : a);
}

// SC-03 Aggiungi o modifica una spesa prevista (finestra al centro, variante B).
export function FinestraSpesa({ spesa, aperta, onChiudi }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const persone = useDati<Persona[]>(aperta ? '/persone' : null).dati ?? [];
  const obiettivi = useDati<Obiettivo[]>(aperta ? '/obiettivi' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [meseScad, setMeseScad] = useState('');
  const [divisione, setDivisione] = useState<Divisione>('io');
  const [miaQuota, setMiaQuota] = useState('50');
  const [email, setEmail] = useState('');
  const [frequenza, setFrequenza] = useState<Frequenza>('mese');
  const [ogniN, setOgniN] = useState('6');
  const [tipo, setTipo] = useState<TipoSpesa>('fissa');
  const [conto, setConto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  // Salvadanaio della spesa (decisione 39): si crea nuovo, mai uno esistente. dove/padre null = la proposta in base alla spesa.
  const [salv, setSalv] = useState<'nessuno' | 'crea'>('nessuno');
  const [dove, setDove] = useState<'solo' | 'sotto' | 'contenitore' | null>(null);
  const [padre, setPadre] = useState<string | null>(null);
  const [contenitore, setContenitore] = useState('');
  const [scollega, setScollega] = useState(false);
  const [note, setNote] = useState('');
  const [attiva, setAttiva] = useState(true);

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setImporto(importoInTesto(s?.importo)); setGiornoMese(s?.prossima_scadenza && !s.senza_giorno ? String(Number(s.prossima_scadenza.slice(8, 10))) : '');
    // Il mese si chiede solo se la spesa non esce ogni mese; l'anno non si mostra mai.
    setMeseScad(s?.prossima_scadenza && s.ogni_mesi !== 1 ? String(Number((proxSpesa(s) ?? s.prossima_scadenza).slice(5, 7))) : '');
    setDivisione(!s?.condivisa ? 'io' : s.mia_percentuale === 50 ? 'meta' : 'altra'); setMiaQuota(String(s?.mia_percentuale ?? 50)); setEmail('');
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : s.ogni_mesi === 12 ? 'anno' : s.ogni_mesi === 24 ? 'biennale' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setTipo(s?.tipo ?? 'fissa'); setConto(s?.conto_id ?? null); setCategoria(s?.categoria_id ?? null); setSalv('nessuno'); setDove(null); setPadre(null); setContenitore(''); setScollega(false);
    setNote(s?.note ?? ''); setAttiva(s?.attiva ?? true);
  }, [aperta, spesa]);

  // Salvadanai dove si può mettere quello nuovo: tuoi, non nascosti e non nati da una spesa.
  const opzioniPadri = useMemo(() => {
    const out: { valore: string; testo: string; rientro?: number }[] = [];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((o) => {
      if (!o.mio || o.nascosto) return;
      if (!o.bloccato_da) { out.push({ valore: o.id, testo: o.nome, rientro: l }); visita(o.figli, l + 1); }
    });
    visita(obiettivi, 0); return out;
  }, [obiettivi]);
  const tuttiObiettivi = useMemo(() => {
    const out: Obiettivo[] = [];
    const visita = (xs: Obiettivo[]) => xs.forEach((o) => { out.push(o); visita(o.figli); });
    visita(obiettivi); return out;
  }, [obiettivi]);
  const collegato = spesa?.obiettivo_id ? tuttiObiettivi.find((o) => o.id === spesa.obiettivo_id) ?? null : null;
  const generato = !!collegato?.bloccato_da; // nato da questa spesa
  const annualiId = rif.profilo?.obiettivo_annuali && opzioniPadri.some((o) => o.valore === rif.profilo!.obiettivo_annuali) ? rif.profilo.obiettivo_annuali : null;
  const eAnnualeForm = tipo !== 'budget' && frequenza !== 'mese';
  const doveEff = dove ?? (eAnnualeForm && frequenza !== 'una' && annualiId ? 'sotto' : 'solo');
  const padreEff = padre ?? annualiId;

  // Decisione 37: una spesa nata da un salvadanaio si cambia da lì; restano libere categoria, note, attiva e divisione.
  const bloc = spesa?.bloccato_da ?? null;
  const fisso = (campo: string) => !!bloc?.campi.includes(campo);

  const salva = async () => {
    if (spesa && bloc) {
      const libero = { ...(fisso('conto_id') ? {} : { conto_id: conto }), categoria_id: categoria, note: note.trim() || null, attiva };
      await modifica<Spesa>(`/spese-previste/${spesa.id}`, libero);
      if (!spesa.mia) return;
      await dividi(spesa.id);
      return;
    }
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80');
    const ogni = tipo === 'budget' || frequenza === 'mese' ? 1 : frequenza === 'anno' ? 12 : frequenza === 'biennale' ? 24 : frequenza === 'una' ? null : Number(ogniN);
    // Ogni mese basta il giorno (la serie parte dal mese già salvato, o da questo); altrimenti servono almeno il mese, e l'anno lo sceglie l'app.
    let prima: string | null = null;
    let senzaGiorno = false;
    const g = giornoMese ? Number(giornoMese) : null;
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) throw new Error('Scrivi ogni quanti mesi, es. 6');
    if (tipo === 'budget') prima = null;
    else if (ogni === 1) {
      if (g !== null) {
        const [a, m] = (spesa?.prossima_scadenza ?? oggiIso()).slice(0, 7).split('-').map(Number);
        prima = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(g, giorniDel(a, m))).padStart(2, '0')}`;
      }
    } else if (meseScad) {
      prima = primaOccorrenza(g, Number(meseScad));
      senzaGiorno = g === null;
    } else if (g !== null) throw new Error('Scegli anche il mese: una spesa che non esce ogni mese ha bisogno almeno del mese');
    else if (ogni === null) throw new Error('Una spesa che esce una volta sola ha bisogno almeno del mese');
    else throw new Error('Scegli almeno il mese in cui esce: da lì si ripete');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, tipo, conto_id: conto, categoria_id: categoria,
      ...(scollega ? { obiettivo_id: null } : {}), note: note.trim() || null, attiva };
    if (salv === 'crea' && !spesa?.obiettivo_id) {
      if (doveEff === 'sotto' && !padreEff) throw new Error('Scegli sotto quale salvadanaio metterlo');
      if (doveEff === 'contenitore' && !contenitore.trim()) throw new Error('Scrivi il nome del nuovo contenitore');
      Object.assign(corpo, { nuovo_salvadanaio: doveEff === 'sotto' ? { padre_id: padreEff } : doveEff === 'contenitore' ? { contenitore: contenitore.trim() } : {} });
    }
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    await dividi(salvata.id);
  };

  // Divisione con l'altra persona: condividere, togliere la condivisione, quote.
  const dividi = async (spesaId: string) => {
    const condivisioni = await leggi<Condivisione[]>('/condivisioni');
    const esistente = condivisioni.find((c) => c.voce === 'spesa' && c.voce_id === spesaId && c.mia);
    if (divisione === 'io') { if (esistente) await cancella(`/condivisioni/${esistente.id}`); await sostituisci(`/spese-previste/${spesaId}/quote`, { quote: [] }); return; }
    let altroId = esistente?.condiviso_con_id ?? altra?.id;
    if (!esistente) { const nuova = await crea<{ condiviso_con_id: string }>('/condivisioni', { voce: 'spesa', id: spesaId, email: altra?.email ?? serve(email.trim(), 'Scrivi l’email della persona con cui la dividi') }); altroId = nuova.condiviso_con_id; }
    const mia = divisione === 'meta' ? 50 : Number(miaQuota.replace(',', '.'));
    if (!(mia > 0 && mia < 100)) throw new Error('La tua quota deve essere tra 1 e 99%');
    await sostituisci(`/spese-previste/${spesaId}/quote`, { quote: divisione === 'meta' ? [] : [{ utente_id: rif.profilo!.id, percentuale: String(mia) }, { utente_id: altroId, percentuale: String(100 - mia) }] });
  };

  const valoreQuota = leggiImporto(importo);
  const quotaTesto = divisione === 'io' ? 'Solo tua.' : `La tua quota: ${valoreQuota ? euro((Number(valoreQuota) * (divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : '—'}. L’altra persona la vede e la può modificare; solo tu puoi eliminarla.`;
  const { c } = useTema();
  const compatto = useCompatto();
  const nomeM = meseScad ? nomeMeseMinuscolo(`2000-${meseScad.padStart(2, '0')}`) : '';
  const poi = frequenza === 'anno' ? ', ogni anno' : frequenza === 'biennale' ? ', ogni due anni' : frequenza === 'n' ? `, poi ogni ${ogniN || 'N'} mesi` : '';
  const aiutoScadenza = frequenza === 'mese'
    ? (giornoMese ? `Esce il ${giornoMese} di ogni mese.` : 'Facoltativo: serve a metterla in ordine nella lista del mese.')
    : nomeM && giornoMese ? `Esce il ${giornoMese} ${nomeM}${poi}.`
      : nomeM ? `Esce a ${nomeM}, senza un giorno preciso${poi}.`
        : giornoMese ? 'Scegli anche il mese.' : 'Scegli almeno il mese; il giorno è facoltativo. L’anno lo sceglie l’app.';
  const bloccoScadenza = fisso('prossima_scadenza');
  const periodicaForm = eAnnualeForm;
  const aiutoSalvadanaio = generato ? 'Il salvadanaio nasce da questa spesa: se la elimini resta, ma torna libero.'
    : spesa?.obiettivo_id ? 'Un salvadanaio si collega a una spesa solo creandolo nuovo da qui.'
      : salv === 'crea'
        ? `Verrà creato «${nome.trim() || 'il nome della spesa'}»${periodicaForm ? `, con traguardo ${valoreQuota ? euro((Number(valoreQuota) * (divisione === 'io' ? 100 : divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : 'la tua quota'}` : ', senza traguardo'}${periodicaForm ? (meseScad ? (giornoMese ? `, scadenza il ${giornoMese} ${nomeM}` : `, senza scadenza (esce a ${nomeM}, senza un giorno)`) : ', scadenza alla prossima uscita') : ''} e l’icona della spesa. Una spesa normale con salvadanaio non compare nella lista del mese; un’annuale conta comunque la sua quota mensile.`
        : 'Facoltativo: crea un salvadanaio nuovo per mettere da parte i soldi di questa spesa.';
  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa prevista' : 'Nuova spesa prevista'} icona={spesa?.icona ?? 'calendar-check'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={spesa?.mia && !bloc ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined}
      intestazioneDestra={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'] }}>
          <Testo stile="dettaglio-forte" colore="testo-secondario">{attiva ? 'Attiva' : 'Non attiva'}</Testo>
          <Interruttore acceso={attiva} onCambia={setAttiva} etichetta="Attiva" />
        </View>
      )}>
      <Testo stile="dettaglio-normale" colore="testo-secondario">{attiva ? 'Attiva: compare nella lista da spuntare del mese.' : 'Non attiva: resta salvata ma non conta.'}</Testo>
      {bloc ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`Nasce dal salvadanaio «${bloc.nome}»: per cambiarla apri il salvadanaio, in Salvadanai.`}</Testo>
      ) : null}
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} disattivato={fisso('nome')} />
      <Voce etichetta="Che spesa è" aiuto={tipo === 'budget' ? 'Una cifra da tenere da parte per le spese del mese di questa categoria: si spunta quando l’hai usata.' : tipo === 'investimento' ? 'Soldi che metti da parte o investi ogni volta, es. il piano di accumulo.' : 'Un importo preciso che esce, es. affitto, bollette, abbonamenti.'}>
        <SceltaSegmenti etichetta="Che spesa è" larghezzaPiena valore={tipo} onCambia={fisso('tipo') ? () => {} : setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'budget', testo: 'Budget del mese' }, { valore: 'investimento', testo: 'Investimento' }]} />
      </Voce>
      {tipo !== 'budget' ? (
        <Voce etichetta="Ogni quanto esce">
          <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={frequenza} onCambia={fisso('ogni_mesi') ? () => {} : setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'biennale', testo: 'Ogni 2 anni' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
        </Voce>
      ) : null}
      {tipo === 'budget' ? null : (
        <View style={{ gap: d['spazio-testo'] }}>
          {frequenza === 'n' ? <Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" segnaposto="Es. 6" disattivato={fisso('ogni_mesi')} /> : null}
          <View style={{ flexDirection: 'row', gap: compatto ? d['spazio-icona'] : d['spazio-colonne'], marginTop: frequenza === 'n' ? d['spazio-blocco'] : 0 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TendinaGriglia etichetta="Giorno (facoltativo)" valore={giornoMese} opzioni={OPZIONI_GIORNO} onCambia={setGiornoMese} disattivato={bloccoScadenza} />
            </View>
            {frequenza !== 'mese' ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Tendina etichetta={frequenza === 'una' ? 'Mese in cui esce' : 'Mese'} valore={meseScad} opzioni={OPZIONI_MESE} onCambia={setMeseScad} disattivato={bloccoScadenza} />
              </View>
            ) : null}
          </View>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoScadenza}</Testo>
        </View>
      )}
      <Campo etichetta={tipo === 'budget' ? 'Tetto del mese' : 'Importo totale'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" disattivato={fisso('importo')} />
      <Affiancati>
        <Meta><Tendina etichetta="Da quale conto esce" disattivato={fisso('conto_id')} valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
        <Meta><TendinaGriglia etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" /></Meta>
      </Affiancati>
      {bloc || (spesa && !spesa.mia) ? null : (
        <View style={{ gap: d['spazio-blocco'] }}>
          <Testo stile="corpo-forte" accessibilityRole="header">Salvadanaio per questa spesa (facoltativo)</Testo>
          {generato ? (
            <Testo stile="dettaglio-normale" colore="testo-secondario">{`Salvadanaio: «${collegato!.nome}». Per aprirlo vai in Salvadanai; nome, cifra e scadenza si cambiano da questa spesa.`}</Testo>
          ) : spesa?.obiettivo_id ? (
            <>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{scollega ? 'La spesa verrà scollegata quando salvi.' : `Collegata a «${collegato?.nome ?? 'un salvadanaio'}» (vecchio collegamento).`}</Testo>
              <Pulsante etichetta={scollega ? 'Annulla' : 'Scollega'} onPress={() => setScollega(!scollega)} />
            </>
          ) : (
            <>
              <SceltaSegmenti etichetta="Salvadanaio per questa spesa" larghezzaPiena valore={salv} onCambia={setSalv} opzioni={[{ valore: 'nessuno', testo: 'Nessuno' }, { valore: 'crea', testo: 'Crea un salvadanaio per questa spesa' }]} />
              {salv === 'crea' ? (
                <>
                  <Voce etichetta="Dove lo metto">
                    {compatto ? (
                      <Tendina etichetta="Dove lo metto" valore={doveEff} onCambia={(x) => setDove(x as 'solo' | 'sotto' | 'contenitore')}
                        opzioni={[{ valore: 'solo', testo: 'Da solo' }, { valore: 'sotto', testo: 'Sotto un salvadanaio esistente' }, { valore: 'contenitore', testo: 'In un nuovo contenitore' }]} />
                    ) : (
                      <SceltaSegmenti etichetta="Dove lo metto" larghezzaPiena valore={doveEff} onCambia={setDove}
                        opzioni={[{ valore: 'solo', testo: 'Da solo' }, { valore: 'sotto', testo: 'Sotto un salvadanaio esistente' }, { valore: 'contenitore', testo: 'In un nuovo contenitore' }]} />
                    )}
                  </Voce>
                  {doveEff === 'sotto' ? (
                    opzioniPadri.length ? <Tendina etichetta="Sotto quale salvadanaio" valore={padreEff} opzioni={opzioniPadri} onCambia={setPadre} iconaPrima="piggy-bank" />
                      : <Testo stile="dettaglio-normale" colore="testo-secondario">Non hai ancora salvadanai: scegli «Da solo» o «In un nuovo contenitore».</Testo>
                  ) : null}
                  {doveEff === 'contenitore' ? <Campo etichetta="Nome del contenitore" valore={contenitore} onCambia={setContenitore} segnaposto="Es. Viaggi" /> : null}
                </>
              ) : null}
            </>
          )}
          <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoSalvadanaio}</Testo>
        </View>
      )}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
      <View style={{ gap: d['spazio-blocco'], padding: d['spazio-blocco'], borderWidth: d['misura-bordo'], borderColor: c['bordo-scheda'], borderRadius: d['raggio-scheda'], backgroundColor: c['sfondo-tenue'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Tessera icona="users" misura="piccola" />
          <Testo stile="corpo-forte" accessibilityRole="header" style={{ flex: 1 }}>Con chi la dividi</Testo>
        </View>
        <Testo stile="dettaglio-normale" colore="testo-secondario">Solo se la spesa è in due: indica con chi la dividi e in che percentuale</Testo>
        {!spesa || spesa.mia ? (
          <>
            <Voce etichetta="Con chi la dividi" aiuto={quotaTesto}>
              <SceltaSegmenti etichetta="Con chi la dividi" larghezzaPiena valore={divisione} onCambia={setDivisione} opzioni={[{ valore: 'io', testo: 'Solo io' }, { valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
            </Voce>
            {divisione !== 'io' && !altra && !spesa?.condivisa ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
            {divisione === 'altra' ? <Campo etichetta="La tua quota in %" valore={miaQuota} onCambia={setMiaQuota} inputMode="decimal" /> : null}
          </>
        ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      </View>
    </FinestraModulo>
  );
}
