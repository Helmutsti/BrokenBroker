import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaSpesa, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, sostituisci, useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, ElencoSpese, Obiettivo, Persona, Spesa, TipoSpesa } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, quando, segnoQuota } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

type Filtro = 'tutte' | 'mese' | 'periodiche' | 'spente';
type Frequenza = 'mese' | 'anno' | 'n' | 'una';
type Divisione = 'io' | 'meta' | 'altra';

// SC-02 Spese previste: tutto ciò che esce ogni mese o ogni N mesi.
export function SpesePreviste() {
  const rif = useRiferimenti();
  const { dati, errore } = useDati<ElencoSpese>(`/spese-previste?mese=${rif.mese}`);
  const [filtro, setFiltro] = useState<Filtro>('tutte');
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<Spesa | 'nuova' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attive = dati.spese.filter((s) => s.attiva);
  const mensili = attive.filter((s) => s.ogni_mesi === 1);
  const periodiche = attive.filter((s) => s.ogni_mesi !== 1);
  const somma = (xs: Spesa[]) => xs.reduce((t, s) => t + Number(s.mia_quota), 0);
  const annuo = periodiche.filter((s) => s.ogni_mesi).reduce((t, s) => t + (Number(s.mia_quota) * 12) / s.ogni_mesi!, 0);
  const perTipo = (t: TipoSpesa) => somma(mensili.filter((s) => s.tipo === t));

  const testo = cerca.trim().toLowerCase();
  const visibili = dati.spese.filter((s) => (filtro === 'spente' ? !s.attiva : s.attiva) && (filtro !== 'mese' || s.ogni_mesi === 1) && (filtro !== 'periodiche' || s.ogni_mesi !== 1)
    && (!testo || s.nome.toLowerCase().includes(testo) || (s.categoria ?? '').toLowerCase().includes(testo)));
  const gruppi: [string, Spesa[]][] = [
    ['Fisse · ogni mese', visibili.filter((s) => s.tipo === 'fissa' && s.ogni_mesi === 1)],
    ['Budget variabili · ogni mese', visibili.filter((s) => s.tipo === 'budget')],
    ['Investimenti · ogni mese', visibili.filter((s) => s.tipo === 'investimento' && s.ogni_mesi === 1)],
    ['Spese ogni N mesi', visibili.filter((s) => s.tipo !== 'budget' && s.ogni_mesi !== null && s.ogni_mesi > 1)],
    ['Una volta sola', visibili.filter((s) => s.ogni_mesi === null)],
  ];

  return (
    <>
      <Intestazione titolo="Spese previste" sottotitolo="Quello che esce ogni mese o ogni N mesi. Ogni mese queste voci finiscono nella lista da spuntare della Panoramica."
        azioni={<Pulsante tipo="primario" etichetta="Nuova spesa prevista" icona="plus" onPress={() => setAperta('nuova')} />} />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Ogni mese, la tua quota" valore={euro(somma(mensili))} icona="repeat" nota={`Fisse ${euro(perTipo('fissa'))} · budget ${euro(perTipo('budget'))} · investimenti ${euro(perTipo('investimento'))}`} />
        <NumeroChiave etichetta="Spese ogni N mesi, in un anno" valore={euro(annuo)} icona="calendar" nota={`Pari a ${euro(annuo / 12)} al mese`} />
        <NumeroChiave etichetta="Totale al mese" valore={euro(somma(mensili) + annuo / 12)} icona="wallet" nota="Rate escluse: si gestiscono a parte" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
        <SceltaSegmenti etichetta="Quali spese" valore={filtro} onCambia={setFiltro}
          opzioni={[{ valore: 'tutte', testo: 'Tutte' }, { valore: 'mese', testo: 'Ogni mese' }, { valore: 'periodiche', testo: 'Ogni N mesi' }, { valore: 'spente', testo: 'Non attive' }]} />
        <View style={{ width: 300 }}><Campo valore={cerca} onCambia={setCerca} segnaposto="Cerca una spesa…" iconaPrima="search" /></View>
      </View>
      <Scheda>
        {visibili.length === 0 ? <Vuoto testo={dati.spese.length ? 'Nessuna spesa con questi filtri.' : 'Ancora nessuna spesa prevista: aggiungi affitto, bollette e abbonamenti.'}
          azione={!dati.spese.length ? <Pulsante tipo="primario" etichetta="Nuova spesa prevista" icona="plus" onPress={() => setAperta('nuova')} /> : undefined} /> : (
          <View>
            <RigaSpesa tipo="intestazione" nome="Spesa" categoria="Categoria" conto="Conto" quando="Quando" totale="Totale" quota="Tua quota" />
            {gruppi.filter(([, xs]) => xs.length).map(([titolo, xs]) => (
              <View key={titolo}>
                <TitoloGruppo testo={titolo} destra={euro(somma(xs))} />
                {xs.map((s) => <RigaSpesa key={s.id} nome={s.nome} categoria={s.categoria_padre ? `${s.categoria_padre} › ${s.categoria}` : s.categoria ?? '—'} conto={s.conto ?? '—'}
                  quando={quando(s)} totale={euro(s.importo)} quota={euro(s.mia_quota) + segnoQuota(s)} icona={s.icona ?? 'ellipsis'} onApri={() => setAperta(s)} />)}
              </View>
            ))}
          </View>
        )}
      </Scheda>
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
    const prima = scadenza.trim() ? serve(leggiData(scadenza), 'Scrivi la data come GG/MM/AAAA') : null;
    const ogni = tipo === 'budget' || frequenza === 'mese' ? 1 : frequenza === 'anno' ? 12 : frequenza === 'una' ? null : Number(ogniN);
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) throw new Error('Scrivi ogni quanti mesi, es. 6');
    if (ogni === null && !prima) throw new Error('Una spesa che esce una volta sola ha bisogno della data');
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
      <Affiancati>
        <Meta><Campo etichetta={tipo === 'budget' ? 'Tetto del mese' : 'Importo totale'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" /></Meta>
        <Meta><Campo etichetta={frequenza === 'una' ? 'Quando' : 'Prima scadenza'} valore={scadenza} onCambia={setScadenza} segnaposto="GG/MM/AAAA" iconaPrima="calendar" aiuto={tipo === 'budget' ? 'Facoltativa per i budget' : undefined} /></Meta>
      </Affiancati>
      {!spesa || spesa.mia ? (
        <Voce etichetta="Con chi la dividi" aiuto={quotaTesto}>
          <SceltaSegmenti etichetta="Con chi la dividi" larghezzaPiena valore={divisione} onCambia={setDivisione} opzioni={[{ valore: 'io', testo: 'Solo io' }, { valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
        </Voce>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      {divisione !== 'io' && !altra && !spesa?.condivisa ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
      {divisione === 'altra' && (!spesa || spesa.mia) ? <Campo etichetta="La tua quota in %" valore={miaQuota} onCambia={setMiaQuota} inputMode="decimal" /> : null}
      <Voce etichetta="Tipo" aiuto="Fissa: un importo che esce. Budget: un tetto da spendere nel mese, si riempie con i movimenti della categoria.">
        <SceltaSegmenti etichetta="Tipo" larghezzaPiena valore={tipo} onCambia={setTipo} opzioni={[{ valore: 'fissa', testo: 'Fissa' }, { valore: 'budget', testo: 'Budget variabile' }, { valore: 'investimento', testo: 'Investimento' }]} />
      </Voce>
      {tipo !== 'budget' ? (
        <Voce etichetta="Ogni quanto">
          <SceltaSegmenti etichetta="Ogni quanto" larghezzaPiena valore={frequenza} onCambia={setFrequenza} opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'anno', testo: 'Ogni anno' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta sola' }]} />
        </Voce>
      ) : null}
      {tipo !== 'budget' && frequenza === 'n' ? <Campo etichetta="Ogni quanti mesi" valore={ogniN} onCambia={setOgniN} inputMode="numeric" /> : null}
      <Affiancati>
        <Meta><Tendina etichetta="Conto" valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
        <Meta><Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" /></Meta>
      </Affiancati>
      <Tendina etichetta="La paga un obiettivo" valore={obiettivo} opzioni={opzioniObiettivi} onCambia={setObiettivo} iconaPrima="target" />
      <Campo etichetta="Note" valore={note} onCambia={setNote} aiuto="Facoltativo" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Interruttore acceso={attiva} onCambia={setAttiva} etichetta="Attiva" />
        <Testo>{attiva ? 'Attiva: compare nella lista da spuntare del mese' : 'Non attiva: resta salvata ma non conta'}</Testo>
      </View>
    </FinestraModulo>
  );
}
