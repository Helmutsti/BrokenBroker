import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti, type Tono } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina, TendinaGiorni } from '../componenti/campi.tsx';
import { CalendarioAnnuali, Intestazione, NumeroChiave, RigaNumeri, RigaSpesa, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, modifica, crea, sostituisci, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, ElencoSpese, Obiettivo, PersonaSistema, Spesa, TipoSpesa } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { meseDi, primaOccorrenzaPersonale } from '../mesePersonale.ts';
import { Caricamento, calendarioAnnuali, eAnnuale, proxSpesa, prossimeAnnuali, quando, segnoQuota } from './comuni.tsx';
import { ConErrore, FinestraModulo, Riquadro, salvaCondivisione, serve, Voce } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

type Filtro = 'tutte' | 'mese' | 'periodiche' | 'spente';
type Frequenza = 'mese' | 'anno' | 'biennale' | 'n' | 'una';
type Divisione = 'meta' | 'altra';

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

  const inizio = rif.profilo?.inizio_mese ?? 1;
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
  const prossima = (s: Spesa) => proxSpesa(s, oggiIso(), inizio) ?? '9999';
  const annuali = periodiche.filter((s) => s.ogni_mesi !== null).sort((x, y) => prossima(x).localeCompare(prossima(y)));
  const unaVolta = periodiche.filter((s) => s.ogni_mesi === null);
  const copertura = prossimeAnnuali(attive, obiettivi, 3, oggiIso(), inizio);
  const scoperti = new Set(copertura.elenco.filter((x) => x.copertura.tono === 'attenzione').map((x) => meseDi(x.quando, inizio)));
  const calendario = calendarioAnnuali(attive, oggiIso(), inizio);
  const vediMese = filtro !== 'periodiche', vediAnnuali = filtro !== 'mese';
  const riga = (s: Spesa, alMese?: string) => (
    <RigaSpesa key={s.id} nome={s.nome} categoria={s.categoria_padre ? `${s.categoria_padre} › ${s.categoria}` : s.categoria ?? '—'} conto={s.conto ?? '—'}
      quando={quando(s, inizio)} totale={euro(s.importo)} quota={alMese ?? euro(s.mia_quota) + segnoQuota(s)} icona={s.icona ?? 'ellipsis'} avviso={avvisoSpesa(s)} onApri={() => setAperta(s)} />
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
        <Scheda><Vuoto testo="Ancora nessuna spesa prevista: aggiungi affitto, bollette e abbonamenti." /></Scheda>
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

const OPZIONI_MESE = [{ valore: '', testo: '—' }, ...Array.from({ length: 12 }, (_, i) => ({ valore: String(i + 1), testo: nomeMese(`2000-${String(i + 1).padStart(2, '0')}`, false) }))];
const giorniDel = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi,
// contando per mesi personali (il mese personale in corso è ancora buono). Senza giorno vale tutto il mese personale: si salva il giorno 1.
export const primaOccorrenza = primaOccorrenzaPersonale;

// Etichetta di una riga: «Nuova · da {nome}» per una spesa ricevuta non ancora aperta; «Da categorizzare» se la categoria (la tua) manca.
const avvisoSpesa = (s: Spesa): { testo: string; tono: Tono } | undefined =>
  s.nuova ? { testo: `Nuova · da ${s.creata_da ?? 'un’altra persona'}`, tono: 'accento' }
  : !s.categoria_id && s.attiva ? { testo: 'Da categorizzare', tono: 'attenzione' } : undefined;

const NON_SPECIFICATO = 'non-specificato';
// SC-03 Aggiungi o modifica una spesa prevista (finestra al centro, variante B).
export function FinestraSpesa({ spesa, aperta, onChiudi }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const obiettivi = useDati<Obiettivo[]>(aperta ? '/obiettivi' : null).dati ?? [];
  const miaCondivisione = useDati<Condivisione[]>(aperta && spesa ? '/condivisioni' : null).dati?.find((x) => x.voce === 'spesa' && x.voce_id === spesa?.id && x.mia);
  // Con chi è divisa una spesa non condivisa: si legge dalle quote del dettaglio.
  const dettaglio = useDati<Spesa & { quote: { utente_id: string }[] }>(aperta && spesa?.mia ? `/spese-previste/${spesa.id}` : null).dati;
  const persone = useDati<PersonaSistema[]>(aperta ? '/persone/tutte' : null).dati;
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [meseScad, setMeseScad] = useState('');
  const [dataUna, setDataUna] = useState(''); // "una volta sola": la data intera, GG/MM/AAAA
  // Dividere (le quote) e condividere (l'altra persona la vede e la modifica) sono due scelte: la seconda si propone dopo la prima.
  const [diviso, setDiviso] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  const [divisione, setDivisione] = useState<Divisione>('meta');
  const [miaQuota, setMiaQuota] = useState('50');
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

  // Aprire una spesa ricevuta la segna come vista: sparisce l'etichetta «Nuova».
  useEffect(() => {
    if (aperta && spesa?.nuova) crea(`/spese-previste/${spesa.id}/vista`).catch(() => {});
  }, [aperta, spesa?.id]);

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setImporto(importoInTesto(s?.importo)); setGiornoMese(s?.prossima_scadenza && !s.senza_giorno ? String(Number(s.prossima_scadenza.slice(8, 10))) : '');
    // Il mese si chiede solo se la spesa non esce ogni mese; l'anno non si mostra mai.
    setMeseScad(s?.prossima_scadenza && s.ogni_mesi !== 1 ? String(Number((proxSpesa(s, oggiIso(), rif.profilo?.inizio_mese ?? 1) ?? s.prossima_scadenza).slice(5, 7))) : '');
    setDataUna(s && s.ogni_mesi === null ? dataInTesto(s.prossima_scadenza) : '');
    setDiviso(!!s && (s.condivisa || (s.mia && s.mia_percentuale < 100))); setCondiviso(s?.condivisa ?? false); setCon(null); setDivisione(!s || s.mia_percentuale === 50 || s.mia_percentuale === 100 ? 'meta' : 'altra'); setMiaQuota(String(s?.mia_percentuale ?? 50));
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : s.ogni_mesi === 12 ? 'anno' : s.ogni_mesi === 24 ? 'biennale' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setTipo(s?.tipo ?? 'fissa'); setConto(s?.conto_id ?? null); setCategoria(s?.categoria_id ?? null); setSalv('nessuno'); setDove(null); setPadre(null); setContenitore(''); setScollega(false);
    setNote(s?.note ?? ''); setAttiva(s?.attiva ?? true);
  }, [aperta, spesa]);

  // Salvadanai dove si può mettere quello nuovo: tuoi e non nati da una spesa (anche i nascosti, decisione 39).
  const opzioniPadri = useMemo(() => {
    const out: { valore: string; testo: string; rientro?: number }[] = [];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((o) => {
      if (!o.mio) return;
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
  const eAnnualeForm = tipo !== 'budget' && frequenza !== 'mese';
  const doveEff = dove ?? 'solo';
  const padreEff = padre;

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
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80', 'importo');
    const ogni = tipo === 'budget' || frequenza === 'mese' ? 1 : frequenza === 'anno' ? 12 : frequenza === 'biennale' ? 24 : frequenza === 'una' ? null : Number(ogniN);
    // Ogni mese basta il giorno (la serie parte dal mese già salvato, o da questo); altrimenti servono almeno il mese, e l'anno lo sceglie l'app.
    let prima: string | null = null;
    let senzaGiorno = false;
    const g = giornoMese ? Number(giornoMese) : null;
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) serve(null, 'Scrivi ogni quanti mesi, es. 6', 'ogniN');
    if (tipo === 'budget') prima = null;
    else if (ogni === null) prima = serve(leggiData(dataUna), 'Scegli il giorno in cui esce', 'scadenza');
    else if (ogni === 1) {
      if (g !== null) {
        const [a, m] = (spesa?.prossima_scadenza ?? oggiIso()).slice(0, 7).split('-').map(Number);
        prima = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(g, giorniDel(a, m))).padStart(2, '0')}`;
      }
    } else if (meseScad) {
      prima = primaOccorrenza(g, Number(meseScad), oggiIso(), rif.profilo?.inizio_mese ?? 1);
      senzaGiorno = g === null;
    } else if (g !== null) serve(null, 'Scegli anche il mese: una spesa che non esce ogni mese ha bisogno almeno del mese', 'scadenza');
    else serve(null, 'Scegli almeno il mese in cui esce: da lì si ripete', 'scadenza');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, tipo, conto_id: conto, categoria_id: categoria,
      ...(scollega ? { obiettivo_id: null } : {}), note: note.trim() || null, attiva };
    if (salv === 'crea' && !spesa?.obiettivo_id) {
      if (doveEff === 'sotto' && !padreEff) serve(null, 'Scegli sotto quale salvadanaio metterlo', 'padre');
      if (doveEff === 'contenitore' && !contenitore.trim()) serve(null, 'Scrivi il nome del nuovo contenitore', 'contenitore');
      Object.assign(corpo, { nuovo_salvadanaio: doveEff === 'sotto' ? { padre_id: padreEff } : doveEff === 'contenitore' ? { contenitore: contenitore.trim() } : {} });
    }
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    await dividi(salvata.id);
  };

  // Divisione con l'altra persona: condividere, togliere la condivisione, quote.
  const dividi = async (spesaId: string) => {
    if (!diviso) {
      await salvaCondivisione('spesa', spesaId, false, null);
      await sostituisci(`/spese-previste/${spesaId}/quote`, { quote: [] });
      return;
    }
    const nessuno = conEff === NON_SPECIFICATO;
    const altroId = nessuno ? null : serve(conEff, 'Scegli con chi la dividi', 'divisione');
    const mia = divisione === 'meta' ? 50 : Number(miaQuota.replace(',', '.'));
    if (!(mia > 0 && mia < 100)) serve(null, 'La tua quota deve essere tra 1 e 99%', 'quota');
    if (!altroId) {
      // Senza dire con chi: niente condivisione, solo la mia quota.
      await salvaCondivisione('spesa', spesaId, false, null);
      await sostituisci(`/spese-previste/${spesaId}/quote`, { quote: [{ utente_id: rif.profilo!.id, percentuale: String(mia) }] });
      return;
    }
    await salvaCondivisione('spesa', spesaId, condiviso, altroId);
    // Quote sempre scritte: senza condivisione la metà non si deduce da sola.
    await sostituisci(`/spese-previste/${spesaId}/quote`, { quote: [{ utente_id: rif.profilo!.id, percentuale: String(mia) }, { utente_id: altroId, percentuale: String(100 - mia) }] });
  };

  const conEff = con ?? miaCondivisione?.condiviso_con_id ?? dettaglio?.quote.find((q) => q.utente_id !== rif.profilo?.id)?.utente_id ?? (dettaglio?.quote.length === 1 ? NON_SPECIFICATO : null) ?? (persone?.length === 1 ? persone[0].id : persone?.length === 0 ? NON_SPECIFICATO : null);
  const nonSpec = conEff === NON_SPECIFICATO;
  const bloccata = !!spesa?.condivisa && condiviso;
  const nomeAltro = persone?.find((p) => p.id === conEff)?.nome ?? 'l’altra persona';
  const valoreQuota = leggiImporto(importo);
  const quotaTesto = `La tua quota: ${valoreQuota ? euro((Number(valoreQuota) * (divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : '—'}.`;
  const accendiDivisione = (v: boolean) => { setDiviso(v); if (v && !spesa?.condivisa) setCondiviso(true); if (!v) setCondiviso(false); };
  const compatto = useCompatto();
  const isoUna = frequenza === 'una' ? leggiData(dataUna) : null;
  const nomeM = isoUna ? `${nomeMeseMinuscolo(isoUna)} ${isoUna.slice(0, 4)}` : meseScad ? nomeMeseMinuscolo(`2000-${meseScad.padStart(2, '0')}`) : '';
  const poi = frequenza === 'anno' ? ', ogni anno' : frequenza === 'biennale' ? ', ogni due anni' : frequenza === 'n' ? `, poi ogni ${ogniN || 'N'} mesi` : '';
  const aiutoScadenza = frequenza === 'una'
    ? (isoUna ? `Esce il ${Number(isoUna.slice(8, 10))} ${nomeM}, una volta sola.` : 'Scegli il giorno in cui esce.')
    : frequenza === 'mese'
    ? (giornoMese ? `Esce il ${giornoMese} di ogni mese.` : 'Facoltativo: serve a metterla in ordine nella lista del mese.')
    : nomeM && giornoMese ? `Esce il ${giornoMese} ${nomeM}${poi}.`
      : nomeM ? `Esce a ${nomeM}, senza un giorno preciso${poi}.`
        : giornoMese ? 'Scegli anche il mese.' : 'Scegli almeno il mese; il giorno è facoltativo. L’anno lo sceglie l’app.';
  const bloccoScadenza = fisso('prossima_scadenza');
  // Solo le spese che escono ogni 2+ mesi (annuali, biennali, ogni N mesi) compaiono nella lista del mese anche con un salvadanaio:
  // le mensili, i budget e le "una volta sola" collegate a un salvadanaio ne sono escluse (vociDelMese in comuni.tsx).
  const escludeDallaLista = tipo === 'budget' || frequenza === 'mese' || frequenza === 'una' || (frequenza === 'n' && !(Number(ogniN) > 1));
  const periodicaForm = eAnnualeForm;
  const avvisoLista = <Esito tono="attenzione" testo="Con un salvadanaio questa spesa non compare nella lista del mese: la versi da Salvadanai." />;
  const aiutoSalvadanaio = generato ? 'Il salvadanaio nasce da questa spesa: se la elimini resta, ma torna libero.'
    : spesa?.obiettivo_id ? 'Un salvadanaio si collega a una spesa solo creandolo nuovo da qui.'
      : salv === 'crea'
        ? `Creo «${nome.trim() || 'il nome della spesa'}»${periodicaForm ? `, traguardo ${valoreQuota ? euro((Number(valoreQuota) * (!diviso ? 100 : divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : 'la tua quota'}${isoUna ? `, scadenza il ${Number(isoUna.slice(8, 10))} ${nomeM}` : meseScad ? `, scadenza ${giornoMese ? `il ${giornoMese} ` : 'a '}${nomeM}` : ''}` : ', senza traguardo'}.`
        : '';
  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa prevista' : 'Nuova spesa prevista'} icona={spesa?.icona ?? 'calendar-check'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={spesa?.mia && !bloc ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined}
      confermaElimina={spesa ? { nome: `«${spesa.nome}»`, dettaglio: [generato ? `Il salvadanaio «${collegato!.nome}» resta, ma torna libero.` : null, spesa.condivisa ? 'Sparisce anche per l’altra persona.' : null].filter(Boolean).join(' ') || 'Sparisce dalla lista del mese.' } : undefined}
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
      <Riquadro titolo="Che spesa è" nota="Come si chiama, di che tipo è e quanto costa.">
        <ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} disattivato={fisso('nome')} /></ConErrore>
        <Voce etichetta="Tipo" aiuto={tipo === 'budget' ? 'Una cifra da tenere da parte per le spese del mese di questa categoria: si spunta quando l’hai usata.' : 'Un importo preciso che esce, es. affitto, bollette, abbonamenti.'}>
          <SceltaSegmenti etichetta="Tipo di spesa" larghezzaPiena valore={tipo} onCambia={fisso('tipo') ? () => {} : setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'budget', testo: 'Budget del mese' }, ...(spesa?.tipo === 'investimento' ? [{ valore: 'investimento' as const, testo: 'Investimento' }] : [])]} />
        </Voce>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-icona'] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ConErrore campo="importo"><Campo etichetta={tipo === 'budget' ? 'Tetto del mese' : 'Importo totale'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" disattivato={fisso('importo')} /></ConErrore>
          </View>
          <View style={{ flex: 1.5, minWidth: 0 }}>
            <Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" />
            {spesa && !spesa.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è solo tua: ${spesa.creata_da ?? 'chi l’ha creata'} ha la sua.`}</Testo> : null}
          </View>
        </View>
      </Riquadro>
      <Riquadro titolo="Regole di uscita" nota={tipo === 'budget' ? 'Un budget vale per tutto il mese: non serve una data. Scegli solo il conto da cui paghi.' : 'Ogni quanto si ripete, in quale giorno o mese esce e da quale conto.'}>
        {tipo === 'budget' ? null : (
          <>
            <Voce etichetta="Ogni quanto esce">
              <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={frequenza} onCambia={fisso('ogni_mesi') ? () => {} : setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'biennale', testo: 'Ogni 2 anni' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
            </Voce>
            <View style={{ gap: d['spazio-testo'] }}>
              <View style={{ gap: d['spazio-blocco'] }}>
                {frequenza === 'n' ? <ConErrore campo="ogniN"><Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" segnaposto="Es. 6" disattivato={fisso('ogni_mesi')} /></ConErrore> : null}
                <ConErrore campo="scadenza">
                {frequenza === 'una' ? <CampoData etichetta="Giorno in cui esce" valore={dataUna} onCambia={setDataUna} disattivato={bloccoScadenza} /> : (
                <View style={{ flexDirection: 'row', gap: compatto ? d['spazio-icona'] : d['spazio-colonne'] }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TendinaGiorni etichetta="Giorno (facoltativo)" valore={giornoMese} onCambia={setGiornoMese} disattivato={bloccoScadenza} />
                  </View>
                  {frequenza !== 'mese' ? (
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Tendina etichetta="Mese" valore={meseScad} opzioni={OPZIONI_MESE} onCambia={setMeseScad} disattivato={bloccoScadenza} />
                    </View>
                  ) : null}
                </View>
                )}
                </ConErrore>
              </View>
              <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoScadenza}</Testo>
            </View>
          </>
        )}
        <Tendina etichetta="Da quale conto esce" disattivato={fisso('conto_id')} valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} />
      </Riquadro>
      {bloc || (spesa && !spesa.mia) ? null : generato ? (
        <Riquadro titolo="Salvadanaio" nota="Metti da parte i soldi per questa spesa.">
          <Testo stile="dettaglio-normale" colore="testo-secondario">{`Salvadanaio: «${collegato!.nome}». Per aprirlo vai in Salvadanai; nome, cifra e scadenza si cambiano da questa spesa.`}</Testo>
          {aiutoSalvadanaio ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoSalvadanaio}</Testo> : null}
          {escludeDallaLista ? avvisoLista : null}
        </Riquadro>
      ) : spesa?.obiettivo_id ? (
        <Riquadro titolo="Salvadanaio" nota="Metti da parte i soldi per questa spesa.">
          <Testo stile="dettaglio-normale" colore="testo-secondario">{scollega ? 'La spesa verrà scollegata quando salvi.' : `Collegata a «${collegato?.nome ?? 'un salvadanaio'}» (vecchio collegamento).`}</Testo>
          <Pulsante etichetta={scollega ? 'Annulla' : 'Scollega'} onPress={() => setScollega(!scollega)} />
          {aiutoSalvadanaio ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoSalvadanaio}</Testo> : null}
          {escludeDallaLista && !scollega ? avvisoLista : null}
        </Riquadro>
      ) : (
        <Riquadro titolo="Salvadanaio" nota="Metti da parte i soldi per questa spesa." interruttore={<Interruttore acceso={salv === 'crea'} onCambia={(x) => setSalv(x ? 'crea' : 'nessuno')} etichetta="Salvadanaio per questa spesa" />}>
          {salv === 'crea' ? (
            <>
              {escludeDallaLista ? avvisoLista : null}
              <ConErrore campo="padre"><Tendina etichetta="Dove lo metto" valore={doveEff === 'sotto' ? padreEff : doveEff} iconaPrima="piggy-bank"
                onCambia={(x) => { if (x === 'solo' || x === 'contenitore') setDove(x); else { setDove('sotto'); setPadre(x); } }}
                opzioni={[{ valore: 'solo', testo: 'Da solo' }, ...opzioniPadri.map((o) => ({ ...o, testo: `Dentro «${o.testo}»` })), { valore: 'contenitore', testo: '+ Nuovo contenitore…' }]} /></ConErrore>
              {doveEff === 'contenitore' ? <ConErrore campo="contenitore"><Campo etichetta="Nome del contenitore" valore={contenitore} onCambia={setContenitore} segnaposto="Es. Viaggi" /></ConErrore> : null}
              {aiutoSalvadanaio ? <Testo stile="dettaglio-normale" colore="testo-secondario">{aiutoSalvadanaio}</Testo> : null}
            </>
          ) : null}
        </Riquadro>
      )}
      {!spesa || spesa.mia ? (
        <>
          <Riquadro titolo="Dividi la spesa con qualcuno" icona="users" nota={diviso ? 'Scegli con chi e come la dividete: nei tuoi conti conta solo la tua quota.' : 'Accendi se la spesa la paghi in due: conta solo la tua quota.'}
            interruttore={<Interruttore acceso={diviso} onCambia={accendiDivisione} etichetta="Dividi la spesa con qualcuno" />}>
            {diviso ? (
              <>
                <ConErrore campo="divisione"><Tendina etichetta="Con chi" valore={conEff} iconaPrima="user" disattivato={bloccata} onCambia={(v) => { setCon(v); if (v === NON_SPECIFICATO) setCondiviso(false); }} segnaposto="Scegli una persona"
                    opzioni={[{ valore: NON_SPECIFICATO, testo: 'Non specificato' }, ...(persone ?? []).map((p) => ({ valore: p.id, testo: p.nome }))]} />
                  {bloccata ? <Testo stile="dettaglio-normale" colore="testo-secondario">Per cambiare persona spegni prima la condivisione.</Testo> : persone && persone.length === 0 ? <Testo stile="dettaglio-normale" colore="testo-secondario">Nessun altro utente nel sistema: puoi dividerla senza dire con chi.</Testo> : null}</ConErrore>
                <Voce etichetta="Come la dividete" aiuto={quotaTesto}>
                  <SceltaSegmenti etichetta="Come la dividete" larghezzaPiena valore={divisione} onCambia={setDivisione} opzioni={[{ valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
                </Voce>
                {divisione === 'altra' ? <ConErrore campo="quota"><Campo etichetta="La tua quota in %" valore={miaQuota} onCambia={setMiaQuota} inputMode="decimal" /></ConErrore> : null}
                {nonSpec ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                  <View style={{ flex: 1, gap: d['spazio-testo'] }}>
                    <Testo stile="corpo-forte">{`Condividi anche con ${nomeAltro}`}</Testo>
                    <Testo stile="dettaglio-normale" colore="testo-secondario">{condiviso ? `${nomeAltro.charAt(0).toUpperCase()}${nomeAltro.slice(1)} la vede e la può modificare; solo tu puoi eliminarla.` : 'Spento: la spesa la vedi solo tu.'}</Testo>
                  </View>
                  <Interruttore acceso={condiviso} onCambia={setCondiviso} etichetta={`Condividi anche con ${nomeAltro}`} />
                </View>}
              </>
            ) : null}
          </Riquadro>
        </>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
    </FinestraModulo>
  );
}
