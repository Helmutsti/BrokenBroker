import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Esito, Interruttore, Pulsante, SceltaSegmenti, type Tono } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaAvanzamento, RigaObiettivo, Scheda, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, leggi, modifica, useDati } from '../dati/api.ts';
import type { Condivisione, ElencoSpese, Obiettivo, Persona, Traguardo } from '../dati/tipi.ts';
import { data, dataInTesto, euro, euroTondi, importoInTesto, leggiData, leggiImporto, nomeMese, oggiIso, percento } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, fraMesi, prossimeAnnuali, ritmoObiettivo } from './comuni.tsx';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

// SC-04 Obiettivi (decisione 20): obiettivi annidabili con sotto-obiettivi
// (ceste con soldi propri) e traguardi di copertura (quanto copre il padre).

const tuttiGliObiettivi = (xs: Obiettivo[]): Obiettivo[] => xs.flatMap((o) => [o, ...tuttiGliObiettivi(o.figli)]);
const statoDi = (pct: number | null) => (pct === null ? 'in-corso' : pct >= 100 ? 'completo' : 'in-corso');
const valore = (o: Obiettivo) => (o.traguardo_effettivo ? `${euroTondi(o.saldo).replace(' €', '')} / ${euroTondi(o.traguardo_effettivo)}` : euro(o.saldo));

// Gruppi per mese di scadenza, dal più vicino; in fondo quelli senza scadenza.
function gruppiPerScadenza(xs: Obiettivo[]) {
  const ordinati = [...xs].sort((a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999'));
  const gruppi: { titolo: string; obiettivi: Obiettivo[] }[] = [];
  for (const o of ordinati) {
    const titolo = !o.scadenza ? 'Senza scadenza' : `${nomeMese(o.scadenza.slice(0, 7))} · ${fraMesi(o.scadenza)}`;
    const g = gruppi.find((x) => x.titolo === titolo);
    if (g) g.obiettivi.push(o); else gruppi.push({ titolo, obiettivi: [o] });
  }
  return gruppi;
}

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

// SC-04 Obiettivi (proposta v2): un solo elenco in ordine di scadenza. Per ognuno
// quanto c'è, quanto manca e quanto versare al mese per arrivarci in tempo;
// sotto-obiettivi aperti sotto il padre, traguardi di copertura in un riepilogo.
export function Obiettivi() {
  const { dati, errore } = useDati<Obiettivo[]>('/obiettivi');
  const spese = useDati<ElencoSpese>('/spese-previste').dati;
  const [modifica_, setModifica] = useState<{ obiettivo: Obiettivo | null; padre?: string } | null>(null);
  const [versa, setVersa] = useState<Obiettivo | null>(null);
  const [traguardo, setTraguardo] = useState<{ obiettivo: Obiettivo; traguardo: Traguardo | null } | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  if (!dati) return <Caricamento errore={errore} />;

  const totale = dati.reduce((t, o) => t + Number(o.saldo), 0);
  const mancanoTutto = dati.reduce((t, o) => t + (ritmoObiettivo(o).mancano ?? 0), 0);
  const alMeseTutto = dati.reduce((t, o) => t + (ritmoObiettivo(o).alMese ?? 0), 0);
  // Salvadanai delle spese annuali: quanto manca per le uscite dei prossimi mesi.
  const annuali = spese ? prossimeAnnuali(spese.spese, dati) : null;
  const mancaPer = (o: Obiettivo) => annuali?.elenco.filter((x) => x.s.obiettivo_id === o.id && x.copertura.tono === 'attenzione')
    .reduce((t, x) => t + Number(x.copertura.testo.replace(/[^\d,]/g, '').replace(',', '.')), 0) || 0;
  const apriChiudi = (id: string) => setAperti((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const riga = (o: Obiettivo) => {
    const { traguardo: t, mancano, alMese } = ritmoObiettivo(o);
    const stato = statoObiettivo(o, mancaPer(o));
    const scad = [o.scadenza ? `Entro ${data(o.scadenza)}` : 'Senza scadenza', o.figli.length ? `${o.figli.length} sotto-obiettivi` : null,
      o.traguardi.length ? `${o.traguardi.length} traguardi di copertura` : null, o.crea_spesa ? 'crea la spesa al traguardo' : null].filter(Boolean).join(' · ');
    return (
      <RigaObiettivo key={o.id} nome={o.nome} scadenza={scad} icona={o.traguardi.length ? 'shield-check' : 'target'} condiviso={o.condiviso}
        messo={t !== null ? `${euro(o.saldo)} / ${euro(t)} · ${percento(o.percentuale)}` : euro(o.saldo)} avanzamento={o.percentuale ?? 0}
        tonoBarra={stato.tono === 'attenzione' ? 'attenzione' : stato.tono === 'ok' ? 'ok' : 'accento'}
        mancano={mancano === null ? '—' : euro(mancano)} alMese={alMese === null ? '—' : euro(alMese)} stato={stato}
        onVersa={() => setVersa(o)} onApri={() => setModifica({ obiettivo: o })} />
    );
  };

  return (
    <>
      <Intestazione titolo="Obiettivi" sottotitolo="In ordine di scadenza: per ognuno quanto manca e quanto versare al mese per arrivarci in tempo."
        azioni={<Pulsante tipo="primario" etichetta="Nuovo obiettivo" icona="plus" onPress={() => setModifica({ obiettivo: null })} />} />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Messo da parte" valore={euro(totale)} icona="piggy-bank" nota={`In ${dati.length} ${dati.length === 1 ? 'obiettivo' : 'obiettivi'}`} />
        <NumeroChiave etichetta="Mancano in tutto" valore={euro(mancanoTutto)} icona="target" nota="Ai traguardi di tutti gli obiettivi" />
        <NumeroChiave etichetta="Da versare ogni mese" valore={euro(alMeseTutto)} icona="calendar-clock" nota="Per arrivare in tempo a tutte le scadenze" />
      </View>
      <Scheda>
        {dati.length === 0 ? <Vuoto testo="Nessun obiettivo. Comincia dal fondo di emergenza: un obiettivo senza scadenza, con i traguardi che vuoi coprire." /> : (
          <View style={{ gap: d['spazio-blocco'] }}>
            {gruppiPerScadenza(dati).map((g) => (
              <View key={g.titolo} style={{ gap: d['spazio-testo'] }}>
                <TitoloGruppo testo={g.titolo} />
                {g.obiettivi.map((o) => {
                  const primo = o.traguardi.find((t) => t.percentuale < 100);
                  const coperti = o.traguardi.filter((t) => t.percentuale >= 100).length;
                  return (
                    <View key={o.id} style={{ gap: d['spazio-testo'] }}>
                      {riga(o)}
                      {o.figli.length ? (
                        <View style={{ paddingLeft: 56, gap: d['spazio-testo'] }}>
                          {o.figli.map((f) => <RigaAvanzamento key={f.id} nome={f.nome} importo={valore(f)} valore={f.percentuale ?? 0} percentuale={f.percentuale !== null && f.percentuale >= 100 ? '100% ✓' : percento(f.percentuale)}
                            stato={statoDi(f.percentuale)} icona="target" onApri={() => setVersa(f)} />)}
                          <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Aggiungi sotto-obiettivo" icona="plus" onPress={() => setModifica({ obiettivo: null, padre: o.id })} /></View>
                        </View>
                      ) : null}
                      {o.traguardi.length ? (
                        <View style={{ paddingLeft: 56, gap: d['spazio-testo'] }}>
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
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </Scheda>
      <FinestraObiettivo stato={modifica_} obiettivi={dati} onChiudi={() => setModifica(null)} onTraguardo={(o) => { setModifica(null); setTraguardo({ obiettivo: o, traguardo: null }); }} />
      <FinestraVersa obiettivo={versa} onChiudi={() => setVersa(null)} />
      <FinestraTraguardo stato={traguardo} onChiudi={() => setTraguardo(null)} />
    </>
  );
}

function FinestraObiettivo({ stato, obiettivi, onChiudi, onTraguardo }: { stato: { obiettivo: Obiettivo | null; padre?: string } | null; obiettivi: Obiettivo[]; onChiudi: () => void; onTraguardo: (o: Obiettivo) => void }) {
  const o = stato?.obiettivo ?? null;
  const persone = useDati<Persona[]>(stato ? '/persone' : null).dati ?? [];
  const altra = persone.find((p) => !p.io);
  const [nome, setNome] = useState('');
  const [padre, setPadre] = useState('nessuno');
  const [traguardo, setTraguardo] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [creaSpesa, setCreaSpesa] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!stato) return;
    setNome(o?.nome ?? ''); setPadre(o?.padre_id ?? stato.padre ?? 'nessuno'); setTraguardo(importoInTesto(o?.traguardo));
    setScadenza(dataInTesto(o?.scadenza)); setCreaSpesa(o?.crea_spesa ?? false); setCondiviso(o?.condiviso ?? false); setEmail('');
  }, [stato]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const salvato = o ? await modifica<Obiettivo>(`/obiettivi/${o.id}`, corpo) : await crea<Obiettivo>('/obiettivi', corpo);
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
      <Affiancati>
        <Meta><Campo etichetta="Traguardo" valore={traguardo} onCambia={setTraguardo} segnaposto="Facoltativo" inputMode="decimal" aiuto={o?.figli.length ? 'Vuoto: la somma dei sotto-obiettivi' : undefined} /></Meta>
        <Meta><CampoData facoltativa etichetta="Scadenza" valore={scadenza} onCambia={setScadenza} /></Meta>
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
      {o && !o.traguardi.length ? <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Aggiungi traguardo di copertura" icona="plus" onPress={() => onTraguardo(o)} /></View> : null}
    </FinestraModulo>
  );
}

function FinestraVersa({ obiettivo, onChiudi }: { obiettivo: Obiettivo | null; onChiudi: () => void }) {
  const [verso, setVerso] = useState<'versa' | 'preleva'>('versa');
  const [importo, setImporto] = useState('');
  const [giorno, setGiorno] = useState('');
  const dettaglio = useDati<Obiettivo>(obiettivo ? `/obiettivi/${obiettivo.id}` : null).dati;
  useEffect(() => { if (obiettivo) { setVerso('versa'); setImporto(''); setGiorno(dataInTesto(new Date().toISOString().slice(0, 10))); } }, [obiettivo]);
  const salva = async () => {
    const v = serve(leggiImporto(importo), 'Scrivi l’importo');
    if (Number(v) <= 0) throw new Error("L'importo deve essere maggiore di zero");
    await crea(`/obiettivi/${obiettivo!.id}/versamenti`, { importo: verso === 'versa' ? v : `-${v}`, data: serve(leggiData(giorno), 'Scrivi la data come GG/MM/AAAA') });
  };
  return (
    <FinestraModulo titolo={obiettivo ? `${obiettivo.nome}: ${valore(obiettivo)}` : ''} icona="piggy-bank" aperta={!!obiettivo} onChiudi={onChiudi} onSalva={salva} etichettaSalva={verso === 'versa' ? 'Versa' : 'Preleva'}>
      <SceltaSegmenti etichetta="Versa o preleva" larghezzaPiena valore={verso} onCambia={setVerso} opzioni={[{ valore: 'versa', testo: 'Metto via' }, { valore: 'preleva', testo: 'Prelevo' }]} />
      <Affiancati>
        <Meta><Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus /></Meta>
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
