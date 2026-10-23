import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti, type Tono } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { CifraModificabile, RigaAvanzamento, Scheda } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, useDati } from '../dati/api.ts';
import type { Condivisione, ElencoSpese, Obiettivo, Persona, Traguardo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, nomeMese, oggiIso, percento } from '../formato.ts';
import { d, Testo, useTema } from '../tema/tema.tsx';
import { useRiferimenti } from '../dati/contesto.tsx';
import { Caricamento, fraMesi, proposta, prossimeAnnuali, ritmoObiettivo } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

// SC-04 Obiettivi (decisione 20): obiettivi annidabili con sotto-obiettivi
// (ceste con soldi propri) e traguardi di copertura (quanto copre il padre).

const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);
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
// c'è, i traguardi di copertura e i sotto-obiettivi annidati, in ordine di scadenza.
// `escludi`: il salvadanaio delle annuali, che ha il suo riquadro con la tabella.
export function Obiettivi({ escludi }: { escludi?: string | null }) {
  const tutti = useDati<Obiettivo[]>('/obiettivi');
  const dati = tutti.dati?.filter((o) => o.id !== escludi) ?? null, errore = tutti.errore;
  const spese = useDati<ElencoSpese>('/spese-previste').dati;
  const [modifica_, setModifica] = useState<{ obiettivo: Obiettivo | null; padre?: string } | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  const [traguardo, setTraguardo] = useState<{ obiettivo: Obiettivo; traguardo: Traguardo | null } | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const { c } = useTema();
  if (!dati) return <Caricamento errore={errore} />;

  // Salvadanai delle spese annuali: quanto manca per le uscite dei prossimi mesi.
  const annuali = spese ? prossimeAnnuali(spese.spese, dati) : null;
  const mancaPer = (o: Obiettivo) => annuali?.elenco.filter((x) => x.s.obiettivo_id === o.id && x.copertura.tono === 'attenzione')
    .reduce((t, x) => t + Number(x.copertura.testo.replace(/[^\d,]/g, '').replace(',', '.')), 0) || 0;
  const apriChiudi = (id: string) => setAperti((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Sotto-obiettivi annidati: ogni livello ha un rientro con una linea a sinistra e il suo "Aggiungi dentro".
  const albero = (figli: Obiettivo[], livello = 0): ReactNode => (
    <View style={{ gap: d['spazio-testo'] }}>
      {figli.map((f) => (
        <View key={f.id} style={{ gap: d['spazio-testo'] }}>
          <RigaAvanzamento nome={f.paga_spesa ? `${f.nome} · esce a ${nomeMese(f.paga_spesa.prossima.slice(0, 7)).toLowerCase()}` : f.nome} importo={valore(f)} valore={f.percentuale ?? 0} percentuale={f.percentuale !== null && f.percentuale >= 100 ? '100% ✓' : percento(f.percentuale)}
            stato={statoDi(f.percentuale)} icona="target" compatta={livello > 0} onApri={() => setVersa(f)} />
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

  // Ogni salvadanaio ha il suo riquadro: quanto c'è, soglie e sotto-obiettivi.
  const scheda = (o: Obiettivo) => {
    const { traguardo: t, alMese } = ritmoObiettivo(o);
    const stato = statoObiettivo(o, mancaPer(o));
    const primo = o.traguardi.find((x) => x.percentuale < 100);
    const coperti = o.traguardi.filter((x) => x.percentuale >= 100).length;
    const nota = [t !== null ? `C'è ${euro(o.saldo)} su ${euro(t)}` : `C'è ${euro(o.saldo)}`, o.scadenza ? `entro ${data(o.scadenza)}` : null,
      o.alimentato_da ? `in Spese ${euro(o.alimentato_da.importo)} ${o.alimentato_da.ogni_mesi === 12 ? "all'anno" : 'al mese'}` : alMese ? `${euro(alMese)} al mese per arrivarci` : null].filter(Boolean).join(' · ');
    return (
      <Scheda key={o.id} titolo={o.nome} nota={nota} icona={o.traguardi.length ? 'shield-check' : 'target'}
        azione={<View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
          <Pulsante tipo="testo" etichetta="Modifica" icona="pencil" onPress={() => setModifica({ obiettivo: o })} />
          <CifraModificabile cifra={euro(o.saldo)} etichetta={`Cambia la cifra di ${o.nome}: ${euro(o.saldo)}`} onPress={() => setVersa(o)} />
        </View>}>
        <View style={{ gap: d['spazio-blocco'] }}>
          {o.figli.length ? albero(o.figli) : (
            <RigaAvanzamento nome={stato.testo} importo={valore(o)} valore={o.percentuale ?? 0} percentuale={o.percentuale !== null && o.percentuale >= 100 ? '100% ✓' : percento(o.percentuale)}
              stato={stato.tono === 'attenzione' ? 'attenzione' : statoDi(o.percentuale)} icona={o.traguardi.length ? 'shield-check' : 'target'} onApri={() => setVersa(o)} />
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
            <Pulsante tipo="testo" etichetta="Aggiungi sotto-obiettivo" icona="plus" onPress={() => setModifica({ obiettivo: null, padre: o.id })} />
            {!o.traguardi.length ? <Pulsante tipo="testo" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => setTraguardo({ obiettivo: o, traguardo: null })} /> : null}
          </View>
        </View>
      </Scheda>
    );
  };

  // In ordine di scadenza, poi quelli senza scadenza per nome.
  const ordinati = [...dati].sort((a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome, 'it'));
  return (
    <>
      {ordinati.map(scheda)}
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Nuovo salvadanaio" icona="plus" onPress={() => setModifica({ obiettivo: null })} /></View>
      <FinestraObiettivo stato={modifica_} obiettivi={dati} onChiudi={() => setModifica(null)} onTraguardo={(o) => { setModifica(null); setTraguardo({ obiettivo: o, traguardo: null }); }}
        onSotto={(o) => setModifica({ obiettivo: null, padre: o.id })} />
      <FinestraVersa obiettivo={versa} onChiudi={() => setVersa(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
    </>
  );
}

function FinestraObiettivo({ stato, obiettivi, onChiudi, onTraguardo, onSotto }: {
  stato: { obiettivo: Obiettivo | null; padre?: string } | null; obiettivi: Obiettivo[]; onChiudi: () => void; onTraguardo: (o: Obiettivo) => void; onSotto: (o: Obiettivo) => void;
}) {
  const o = stato?.obiettivo ?? null;
  const rif = useRiferimenti();
  const persone = useDati<Persona[]>(stato ? '/persone' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('nessuno');
  const [traguardo, setTraguardo] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [creaSpesa, setCreaSpesa] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [email, setEmail] = useState('');
  // "Mettici da parte": una spesa ogni mese o ogni anno che, spuntata, riempie l'obiettivo.
  const [daParte, setDaParte] = useState(false);
  const [ogni, setOgni] = useState<'1' | '12'>('1');
  const [quota, setQuota] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  // "È una spesa che si ripete": l'obiettivo genera una spesa di Spese che paga lui
  // (cifra = traguardo, prima uscita = scadenza); la spesa si gestisce poi anche da Spese.
  const [eSpesa, setESpesa] = useState(false);
  const [ogniSpesa, setOgniSpesa] = useState<'1' | '3' | '6' | '12'>('12');
  useEffect(() => {
    if (!stato) return;
    setESpesa(!!o?.paga_spesa); setOgniSpesa(String(o?.paga_spesa?.ogni_mesi ?? 12) as '1' | '3' | '6' | '12');
    setNome(o?.nome ?? ''); setPadre(o?.padre_id ?? stato.padre ?? 'nessuno'); setTraguardo(importoInTesto(o?.traguardo));
    setScadenza(dataInTesto(o?.scadenza)); setCreaSpesa(o?.crea_spesa ?? false); setCondiviso(o?.condiviso ?? false); setEmail('');
    const a = o?.alimentato_da;
    setDaParte(!!a); setOgni(a?.ogni_mesi === 12 ? '12' : '1'); setQuota(importoInTesto(a?.importo)); setConto(a?.conto_id ?? null);
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps

  // La proposta segue quello che è scritto nella finestra (traguardo e scadenza).
  const t = leggiImporto(traguardo), sc = leggiData(scadenza);
  const perProposta: Obiettivo | null = o ? { ...o, traguardo: t ?? o.traguardo, traguardo_effettivo: t ?? o.traguardo_effettivo, scadenza: o.paga_spesa ? o.scadenza : sc }
    : t ? { traguardo: t, traguardo_effettivo: t, scadenza: sc, saldo: '0', figli: [] } as unknown as Obiettivo : null;
  const consigliata = perProposta ? proposta(perProposta, ogni === '1' ? 1 : 12) : null;
  const accendi = (v: boolean) => { setDaParte(v); if (v && !quota && consigliata) setQuota(importoInTesto(consigliata.toFixed(2))); };
  const cambiaOgni = (v: '1' | '12') => {
    setOgni(v);
    const nuova = perProposta ? proposta(perProposta, v === '1' ? 1 : 12) : null;
    if (nuova) setQuota(importoInTesto(nuova.toFixed(2)));
  };

  const padri = useMemo(() => {
    const vietati = new Set(o ? tuttiGliObiettivi([o]).map((x) => x.id) : []);
    const out: { valore: string; testo: string; rientro?: number }[] = [{ valore: 'nessuno', testo: 'Nessuno: è un obiettivo principale' }];
    const visita = (xs: Obiettivo[], l: number) => xs.forEach((x) => { if (!vietati.has(x.id)) { out.push({ valore: x.id, testo: x.nome, rientro: l }); visita(x.figli, l + 1); } });
    visita(obiettivi, 0); return out;
  }, [o, obiettivi]);

  const salva = async () => {
    const t = traguardo.trim() ? serve(leggiImporto(traguardo), 'Scrivi il traguardo, es. 2.000') : null;
    const s = scadenza.trim() ? serve(leggiData(scadenza), 'Scrivi la scadenza come GG/MM/AAAA') : null;
    if (creaSpesa && !t && !o?.figli.length) throw new Error('Per creare la spesa serve un traguardo');
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome'), padre_id: padre === 'nessuno' ? null : padre, traguardo: t, scadenza: s, crea_spesa: creaSpesa };
    if (eSpesa && (!t || !s)) throw new Error('Per una spesa che si ripete servono quanto costa e la prossima uscita');
    const salvato = o ? await modifica<Obiettivo>(`/obiettivi/${o.id}`, corpo) : await crea<Obiettivo>('/obiettivi', corpo);
    const pagata = o?.paga_spesa ?? null;
    if (eSpesa) {
      const spesa = { nome: corpo.nome, importo: t, ogni_mesi: Number(ogniSpesa), prossima_scadenza: s, obiettivo_id: salvato.id };
      if (pagata) await modifica(`/spese-previste/${pagata.id}`, spesa); else await crea('/spese-previste', { ...spesa, tipo: 'fissa' });
    } else if (pagata) await cancella(`/spese-previste/${pagata.id}`);
    // La spesa "mettici da parte": nasce, cambia o sparisce con l'interruttore.
    const alimento = o?.alimentato_da ?? null;
    if (daParte) {
      const spesa = { nome: corpo.nome, importo: serve(leggiImporto(quota), 'Scrivi quanto mettere da parte, es. 150'), ogni_mesi: Number(ogni), tipo: 'investimento',
        alimenta_obiettivo_id: salvato.id, conto_id: conto, ...(alimento ? {} : { prossima_scadenza: ogni === '12' ? oggiIso() : null }) };
      if (alimento) await modifica(`/spese-previste/${alimento.id}`, spesa); else await crea('/spese-previste', spesa);
    } else if (alimento) await cancella(`/spese-previste/${alimento.id}`);
    if (o && !o.mio) return;
    const condivisioni = await leggi<Condivisione[]>('/condivisioni');
    const esistente = condivisioni.find((c) => c.voce === 'obiettivo' && c.voce_id === salvato.id && c.mia);
    if (condiviso && !esistente) await crea('/condivisioni', { voce: 'obiettivo', id: salvato.id, email: altra?.email ?? serve(email.trim(), 'Scrivi l’email della persona con cui condividerlo') });
    if (!condiviso && esistente) await cancella(`/condivisioni/${esistente.id}`);
  };

  return (
    <FinestraModulo titolo={o ? 'Modifica obiettivo' : 'Nuovo obiettivo'} icona="target" aperta={!!stato} onChiudi={onChiudi} onSalva={salva}
      onElimina={o?.mio ? () => cancella(`/obiettivi/${o.id}`).then(() => undefined) : undefined} etichettaElimina={o?.figli.length ? 'Elimina con i sotto-obiettivi' : 'Elimina'}>
      <Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Fondo emergenza" autoFocus={!o} />
      <Tendina etichetta="Dentro un altro obiettivo" valore={padre} opzioni={padri} onCambia={setPadre} iconaPrima="layers" />
      <View style={{ gap: d['spazio-testo'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={eSpesa} onCambia={setESpesa} etichetta="È una spesa che si ripete" />
          <View style={{ flex: 1 }}>
            <Testo>È una spesa che si ripete</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario">{eSpesa
              ? 'Compare in Spese, nel gruppo Annuali se esce ogni più di un mese, e la paga questo salvadanaio. Si apre e si modifica anche da lì.'
              : 'Per esempio la Tari o l’assicurazione: ogni volta che esce la paga questo salvadanaio.'}</Testo>
          </View>
        </View>
        {eSpesa ? <SceltaSegmenti etichetta="Ogni quanto esce" larghezzaPiena valore={ogniSpesa} onCambia={setOgniSpesa}
          opzioni={[{ valore: '1', testo: 'Ogni mese' }, { valore: '3', testo: 'Ogni 3 mesi' }, { valore: '6', testo: 'Ogni 6 mesi' }, { valore: '12', testo: 'Ogni anno' }]} /> : null}
      </View>
      <Affiancati>
        <Meta><Campo etichetta={eSpesa ? 'Quanto costa' : 'Traguardo'} valore={traguardo} onCambia={setTraguardo} segnaposto={eSpesa ? '0,00' : 'Facoltativo'} inputMode="decimal" aiuto={!eSpesa && o?.figli.length ? 'Vuoto: la somma dei sotto-obiettivi' : undefined} /></Meta>
        <Meta><CampoData facoltativa={!eSpesa} etichetta={eSpesa ? 'Prossima uscita' : 'Scadenza'} valore={scadenza} onCambia={setScadenza} /></Meta>
      </Affiancati>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
        <Interruttore acceso={creaSpesa} onCambia={setCreaSpesa} etichetta="Crea spesa al raggiungimento" />
        <View style={{ flex: 1 }}>
          <Testo>Crea spesa al raggiungimento</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario">Quando arriva al traguardo nasce una spesa prevista "una volta sola", pagata da questo obiettivo: non pesa sul mese.</Testo>
        </View>
      </View>
      {!o || o.mio ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
            <Interruttore acceso={condiviso} onCambia={setCondiviso} etichetta="Condiviso" />
            <Testo style={{ flex: 1 }}>{condiviso ? `Condiviso${altra ? ` con ${altra.nome}` : ''}: vede e modifica anche i sotto-obiettivi` : 'Privato'}</Testo>
          </View>
          {condiviso && !altra && !o?.condiviso ? <Campo etichetta="Email dell'altra persona" valore={email} onCambia={setEmail} iconaPrima="mail" inputMode="email" /> : null}
        </>
      ) : null}
      <View style={{ gap: d['spazio-testo'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={daParte} onCambia={accendi} etichetta="Mettici da parte" />
          <View style={{ flex: 1 }}>
            <Testo>Mettici da parte</Testo>
            <Testo stile="dettaglio-normale" colore="testo-secondario">Diventa una voce dell'elenco Spese: quando la spunti, la cifra entra in questo salvadanaio{o?.figli.length ? ', divisa tra i sotto-obiettivi' : ''}.</Testo>
          </View>
        </View>
        {daParte ? (
          <>
            <SceltaSegmenti etichetta="Ogni quanto" larghezzaPiena valore={ogni} onCambia={cambiaOgni} opzioni={[{ valore: '1', testo: 'Ogni mese' }, { valore: '12', testo: 'Ogni anno' }]} />
            <Affiancati>
              <Meta><Campo etichetta={ogni === '1' ? 'Quanto al mese' : "Quanto all'anno"} valore={quota} onCambia={setQuota} inputMode="decimal" segnaposto="0,00"
                aiuto={consigliata !== null ? `Per arrivare in tempo: ${euro(consigliata)} ${ogni === '1' ? 'al mese' : "all'anno"}` : 'Con traguardo e scadenza l’app ti propone la cifra'} /></Meta>
              <Meta><Tendina etichetta="Da quale conto (facoltativo)" valore={conto} opzioni={rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }))} onCambia={setConto} /></Meta>
            </Affiancati>
          </>
        ) : null}
      </View>
      {o ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
          <Pulsante tipo="testo" etichetta="Aggiungi sotto-obiettivo" icona="plus" onPress={() => onSotto(o)} />
          <Pulsante tipo="testo" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => onTraguardo(o)} />
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
  const [giorno, setGiorno] = useState('');
  const dettaglio = useDati<Obiettivo>(obiettivo ? `/obiettivi/${obiettivo.id}` : null).dati;
  // Con sotto-obiettivi la cifra è la somma: si cambia solo la parte messa nel padre.
  const attuale = Number(obiettivo?.saldo ?? 0), propria = Number(obiettivo?.versato ?? 0);
  useEffect(() => { if (obiettivo) { setModo('cifra'); setImporto(importoInTesto(obiettivo.saldo)); setGiorno(dataInTesto(oggiIso())); } }, [obiettivo]);
  const cambiaModo = (m: ModoCifra) => { setModo(m); setImporto(m === 'cifra' ? importoInTesto(attuale) : ''); };
  const v = leggiImporto(importo);
  const differenza = v === null ? null : modo === 'cifra' ? Number(v) - attuale : modo === 'aggiungi' ? Number(v) : -Number(v);
  const salva = async () => {
    serve(v, 'Scrivi l’importo');
    if (modo !== 'cifra' && Number(v) <= 0) throw new Error("L'importo deve essere maggiore di zero");
    if (modo === 'cifra' && Number(v) < 0) throw new Error('La cifra non può essere sotto zero');
    if (Math.abs(differenza!) < 0.005) return;
    if (propria + differenza! < -0.005) throw new Error(`Puoi togliere al massimo ${euro(propria)}: il resto è nei sotto-obiettivi`);
    await crea(`/obiettivi/${obiettivo!.id}/versamenti`, { importo: differenza!.toFixed(2), data: serve(leggiData(giorno), 'Scegli la data'), dividi: !!obiettivo?.figli.length });
  };
  return (
    <FinestraModulo titolo={obiettivo ? obiettivo.nome : ''} icona="piggy-bank" aperta={!!obiettivo} onChiudi={onChiudi} onSalva={salva}>
      <Testo colore="testo-secondario">{`Oggi ci sono ${euro(attuale)}${obiettivo?.traguardo_effettivo ? ` su ${euro(obiettivo.traguardo_effettivo)}` : ''}.${obiettivo?.figli.length ? ' Quello che aggiungi si divide tra i sotto-obiettivi, secondo quanto serve a ciascuno; puoi togliere solo la parte che non è nei sotto-obiettivi.' : ''}`}</Testo>
      <SceltaSegmenti etichetta="Come cambiare la cifra" larghezzaPiena valore={modo} onCambia={cambiaModo}
        opzioni={[{ valore: 'cifra', testo: 'Scrivi la cifra' }, { valore: 'aggiungi', testo: 'Aggiungi' }, { valore: 'togli', testo: 'Togli' }]} />
      <Affiancati>
        <Meta><Campo etichetta={modo === 'cifra' ? 'Cifra di oggi' : modo === 'aggiungi' ? 'Quanto aggiungi' : 'Quanto togli'} valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus
          aiuto={differenza !== null && modo === 'cifra' && Math.abs(differenza) >= 0.005 ? `${differenza > 0 ? 'Aggiungi' : 'Togli'} ${euro(Math.abs(differenza))}` : modo !== 'cifra' && differenza !== null ? `Diventano ${euro(attuale + differenza)}` : undefined} /></Meta>
        <Meta><CampoData etichetta="Data" valore={giorno} onCambia={setGiorno} /></Meta>
      </Affiancati>
      {dettaglio?.versamenti?.length ? (
        <Voce etichetta="Ultimi movimenti dell'obiettivo">
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
      onElimina={t ? () => cancella(`/obiettivi/traguardi/${t.id}`).then(() => undefined) : undefined}>
      <Testo colore="testo-secondario">{`Un importo senza soldi propri: mostra se "${stato?.obiettivo.nome ?? ''}" basta a coprirlo per intero.`}</Testo>
      <Campo etichetta="Cosa deve coprire" valore={nome} onCambia={setNome} segnaposto="Es. Riparazione auto" autoFocus />
      <Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" />
    </FinestraModulo>
  );
}
