import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { CalendarioAnnuali, Intestazione, NumeroChiave, RigaSpesa, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, sostituisci, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, ElencoSpese, Obiettivo, Persona, Spesa, TipoSpesa } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto, meseCorto, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, calendarioAnnuali, eAnnuale, prossimaScadenza, prossimeAnnuali, quando, segnoQuota } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

type Filtro = 'tutte' | 'mese' | 'periodiche' | 'spente';
type Frequenza = 'mese' | 'anno' | 'n' | 'una';
type Divisione = 'io' | 'meta' | 'altra';

// SC-02 Spese previste (proposta v2): le spese di ogni mese e le annuali in due
// schede separate; le annuali con il calendario dei prossimi 12 mesi e la quota da
// mettere via ogni mese.
export function SpesePreviste() {
  const rif = useRiferimenti();
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
  const giorno = (s: Spesa) => (s.prossima_scadenza ? Number(s.prossima_scadenza.slice(8, 10)) : 99);
  const ogniMese = visibili.filter((s) => s.ogni_mesi === 1).sort((a, b) => giorno(a) - giorno(b) || a.nome.localeCompare(b.nome));
  const periodiche = visibili.filter((s) => s.ogni_mesi !== 1);
  const gruppiMese: [string, Spesa[]][] = [
    ['Fisse · ogni mese', ogniMese.filter((s) => s.tipo === 'fissa')],
    ['Budget variabili · ogni mese', ogniMese.filter((s) => s.tipo === 'budget')],
    ['Investimenti · ogni mese', ogniMese.filter((s) => s.tipo === 'investimento')],
  ];
  // Annuali in ordine di prossima uscita; le "una volta sola" in fondo.
  const prossima = (s: Spesa) => prossimaScadenza(s.prossima_scadenza, s.ogni_mesi) ?? '9999';
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
      <Intestazione titolo="Spese previste" sottotitolo="Le spese di ogni mese finiscono nella lista da spuntare; le annuali si preparano un po' ogni mese nel salvadanaio." azioni={nuova} />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Ogni mese, la tua quota" valore={euro(somma(mensili))} icona="repeat" nota={`Fisse ${euro(perTipo('fissa'))} · budget ${euro(perTipo('budget'))} · investimenti ${euro(perTipo('investimento'))}`} />
        <NumeroChiave etichetta="Annuali, la tua quota" valore={`${euro(annuo)} l'anno`} icona="calendar" nota={`Da mettere via: ${euro(annuo / 12)} al mese`} />
        <NumeroChiave etichetta="Totale al mese" valore={euro(somma(mensili) + annuo / 12)} icona="wallet" nota="Mensili + annuali divise per 12 · rate escluse" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
        <SceltaSegmenti etichetta="Quali spese" valore={filtro} onCambia={setFiltro}
          opzioni={[{ valore: 'tutte', testo: 'Tutte' }, { valore: 'mese', testo: 'Ogni mese' }, { valore: 'periodiche', testo: 'Annuali' }, { valore: 'spente', testo: 'Non attive' }]} />
        <View style={{ width: 300 }}><Campo valore={cerca} onCambia={setCerca} segnaposto="Cerca una spesa…" iconaPrima="search" /></View>
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

// SC-03 Aggiungi o modifica una spesa prevista (finestra al centro, variante B).
export function FinestraSpesa({ spesa, aperta, onChiudi }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const persone = useDati<Persona[]>(aperta ? '/persone' : null).dati ?? [];
  const obiettivi = useDati<Obiettivo[]>(aperta ? '/obiettivi' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [importo, setImporto] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [divisione, setDivisione] = useState<Divisione>('io');
  const [miaQuota, setMiaQuota] = useState('50');
  const [email, setEmail] = useState('');
  const [frequenza, setFrequenza] = useState<Frequenza>('mese');
  const [ogniN, setOgniN] = useState('6');
  const [tipo, setTipo] = useState<TipoSpesa>('fissa');
  const [conto, setConto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [obiettivo, setObiettivo] = useState<string>('nessuno');
  const [note, setNote] = useState('');
  const [attiva, setAttiva] = useState(true);

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setImporto(importoInTesto(s?.importo)); setScadenza(dataInTesto(s?.prossima_scadenza));
    setGiornoMese(s?.prossima_scadenza ? String(Number(s.prossima_scadenza.slice(8, 10))) : '');
    setDivisione(!s?.condivisa ? 'io' : s.mia_percentuale === 50 ? 'meta' : 'altra'); setMiaQuota(String(s?.mia_percentuale ?? 50)); setEmail('');
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : s.ogni_mesi === 12 ? 'anno' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setTipo(s?.tipo ?? 'fissa'); setConto(s?.conto_id ?? null); setCategoria(s?.categoria_id ?? null); setObiettivo(s?.obiettivo_id ?? 'nessuno');
    setNote(s?.note ?? ''); setAttiva(s?.attiva ?? true);
  }, [aperta, spesa]);

  const opzioniObiettivi = useMemo(() => {
    const out: { valore: string; testo: string; rientro?: number }[] = [{ valore: 'nessuno', testo: 'Nessuno: la pago dal mese' }];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((o) => { out.push({ valore: o.id, testo: o.nome, rientro: l }); visita(o.figli, l + 1); });
    visita(obiettivi, 0); return out;
  }, [obiettivi]);

  const salva = async () => {
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80');
    const ogni = tipo === 'budget' || frequenza === 'mese' ? 1 : frequenza === 'anno' ? 12 : frequenza === 'una' ? null : Number(ogniN);
    // Ogni mese basta il giorno: la serie parte dal mese già salvato, o da questo.
    let prima: string | null = null;
    if (tipo === 'budget') prima = null;
    else if (ogni === 1) {
      if (giornoMese.trim()) {
        const g = Number(giornoMese.trim());
        if (!Number.isInteger(g) || g < 1 || g > 31) throw new Error('Scrivi il giorno del mese, da 1 a 31');
        const [a, m] = (spesa?.prossima_scadenza ?? oggiIso()).slice(0, 7).split('-').map(Number);
        const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
        prima = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`;
      }
    } else if (scadenza.trim()) prima = serve(leggiData(scadenza), 'Scrivi la data come GG/MM/AAAA, es. 15/11/2026');
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) throw new Error('Scrivi ogni quanti mesi, es. 6');
    if (ogni === null && !prima) throw new Error('Una spesa che esce una volta sola ha bisogno della data');
    if (ogni !== null && ogni > 1 && !prima) throw new Error('Scrivi la prossima uscita: da lì si ripete');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, tipo, conto_id: conto, categoria_id: categoria,
      obiettivo_id: obiettivo === 'nessuno' ? null : obiettivo, note: note.trim() || null, attiva };
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    // Divisione con l'altra persona: condividere, togliere la condivisione, quote.
    const condivisioni = await leggi<Condivisione[]>('/condivisioni');
    const esistente = condivisioni.find((c) => c.voce === 'spesa' && c.voce_id === salvata.id && c.mia);
    if (divisione === 'io') { if (esistente) await cancella(`/condivisioni/${esistente.id}`); await sostituisci(`/spese-previste/${salvata.id}/quote`, { quote: [] }); return; }
    let altroId = esistente?.condiviso_con_id ?? altra?.id;
    if (!esistente) { const nuova = await crea<{ condiviso_con_id: string }>('/condivisioni', { voce: 'spesa', id: salvata.id, email: altra?.email ?? serve(email.trim(), 'Scrivi l’email della persona con cui la dividi') }); altroId = nuova.condiviso_con_id; }
    const mia = divisione === 'meta' ? 50 : Number(miaQuota.replace(',', '.'));
    if (!(mia > 0 && mia < 100)) throw new Error('La tua quota deve essere tra 1 e 99%');
    await sostituisci(`/spese-previste/${salvata.id}/quote`, { quote: divisione === 'meta' ? [] : [{ utente_id: rif.profilo!.id, percentuale: String(mia) }, { utente_id: altroId, percentuale: String(100 - mia) }] });
  };

  const valoreQuota = leggiImporto(importo);
  const quotaTesto = divisione === 'io' ? 'Solo tua.' : `La tua quota: ${valoreQuota ? euro((Number(valoreQuota) * (divisione === 'meta' ? 50 : Number(miaQuota) || 0)) / 100) : '—'}. L’altra persona la vede e la può modificare; solo tu puoi eliminarla.`;
  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa prevista' : 'Nuova spesa prevista'} icona={spesa?.icona ?? 'calendar-check'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={spesa?.mia ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined}>
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} />
      <Voce etichetta="Che spesa è" aiuto={tipo === 'budget' ? 'Un tetto da spendere nel mese: si riempie con i movimenti della categoria.' : tipo === 'investimento' ? 'Soldi che metti da parte o investi ogni volta, es. il piano di accumulo.' : 'Un importo preciso che esce, es. affitto, bollette, abbonamenti.'}>
        <SceltaSegmenti etichetta="Che spesa è" larghezzaPiena valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'budget', testo: 'Budget del mese' }, { valore: 'investimento', testo: 'Investimento' }]} />
      </Voce>
      {tipo !== 'budget' ? (
        <Voce etichetta="Ogni quanto esce">
          <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={frequenza} onCambia={setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
        </Voce>
      ) : null}
      {tipo === 'budget' ? null : frequenza === 'mese' ? (
        <Campo etichetta="Giorno del mese in cui esce" valore={giornoMese} onCambia={setGiornoMese} inputMode="numeric" segnaposto="Es. 5"
          aiuto={giornoMese.trim() ? `Esce il ${giornoMese.trim()} di ogni mese.` : 'Facoltativo: serve a metterla in ordine nella lista del mese.'} />
      ) : (
        <Affiancati>
          {frequenza === 'n' ? <Meta><Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" segnaposto="Es. 6" /></Meta> : null}
          <Meta><CampoData etichetta={frequenza === 'una' ? 'Quando esce' : 'Prossima uscita'} valore={scadenza} onCambia={setScadenza}
            aiuto={frequenza === 'anno' ? 'Poi ogni anno lo stesso giorno.' : frequenza === 'n' ? `Poi ogni ${ogniN || 'N'} mesi.` : undefined} /></Meta>
        </Affiancati>
      )}
      <Campo etichetta={tipo === 'budget' ? 'Tetto del mese' : 'Importo totale'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" />
      {!spesa || spesa.mia ? (
        <Voce etichetta="Con chi la dividi" aiuto={quotaTesto}>
          <SceltaSegmenti etichetta="Con chi la dividi" larghezzaPiena valore={divisione} onCambia={setDivisione} opzioni={[{ valore: 'io', testo: 'Solo io' }, { valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
        </Voce>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      {divisione !== 'io' && !altra && !spesa?.condivisa ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
      {divisione === 'altra' && (!spesa || spesa.mia) ? <Campo etichetta="La tua quota in %" valore={miaQuota} onCambia={setMiaQuota} inputMode="decimal" /> : null}
      <Affiancati>
        <Meta><Tendina etichetta="Da quale conto esce" valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
        <Meta><Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" /></Meta>
      </Affiancati>
      <Tendina etichetta="La paga un obiettivo (facoltativo)" valore={obiettivo} opzioni={opzioniObiettivi} onCambia={setObiettivo} iconaPrima="target" />
      <Campo etichetta="Note (facoltative)" valore={note} onCambia={setNote} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Interruttore acceso={attiva} onCambia={setAttiva} etichetta="Attiva" />
        <Testo>{attiva ? 'Attiva: compare nella lista da spuntare del mese' : 'Non attiva: resta salvata ma non conta'}</Testo>
      </View>
    </FinestraModulo>
  );
}
