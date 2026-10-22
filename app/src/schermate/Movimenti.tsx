import { useState } from 'react';
import { View } from 'react-native';
import { Pulsante } from '../componenti/base.tsx';
import { Campo, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaMovimento, Scheda, SelettorePeriodo, TitoloGruppo, Vuoto } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Movimento } from '../dati/tipi.ts';
import { data, euro, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d } from '../tema/tema.tsx';
import { Caricamento, periodoDi } from './comuni.tsx';
import { FinestraMovimento } from './FinestraMovimento.tsx';

type Verso = 'tutti' | 'uscite' | 'entrate';

// SC-05 Movimenti: le spese fuori lista e quelle dei budget, giorno per giorno.
export function Movimenti() {
  const rif = useRiferimenti();
  const [conto, setConto] = useState('tutti');
  const [categoria, setCategoria] = useState('tutte');
  const [verso, setVerso] = useState<Verso>('tutti');
  const [cerca, setCerca] = useState('');
  const [limite, setLimite] = useState(200);
  const [aperto, setAperto] = useState<Movimento | null>(null);
  const p = periodoDi(rif.mese, rif.profilo?.inizio_mese ?? 1);
  const filtri = new URLSearchParams({ dal: p.dal, al: p.al, limite: String(limite) });
  if (conto !== 'tutti') filtri.set('conto_id', conto);
  if (categoria !== 'tutte') filtri.set('categoria_id', categoria);
  if (cerca.trim()) filtri.set('cerca', cerca.trim());
  const { dati, errore } = useDati<Movimento[]>(`/movimenti?${filtri}`);

  const elenco = (dati ?? []).filter((m) => verso === 'tutti' || (verso === 'uscite' ? Number(m.importo) < 0 : Number(m.importo) > 0));
  // Un trasferimento si mostra una volta sola, dalla metà che esce.
  const righe = elenco.filter((m) => !m.trasferimento_id || Number(m.importo) < 0);
  const veri = elenco.filter((m) => !m.trasferimento_id);
  const uscite = veri.filter((m) => Number(m.importo) < 0).reduce((t, m) => t + Number(m.importo), 0);
  const entrate = veri.filter((m) => Number(m.importo) > 0).reduce((t, m) => t + Number(m.importo), 0);
  const giorni = new Map<string, Movimento[]>();
  for (const m of righe) giorni.set(m.data, [...(giorni.get(m.data) ?? []), m]);
  const oggi = oggiIso();
  const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nomeGiorno = (g: string) => (g === oggi ? `Oggi · ${data(g, 'giorno')}` : g === ieri ? `Ieri · ${data(g, 'giorno')}` : data(g, 'giorno'));

  return (
    <>
      <Intestazione titolo="Movimenti" sottotitolo="Le spese fuori lista e quelle dei budget. Quando spunti una spesa prevista, il suo movimento compare qui da solo."
        azioni={<Pulsante tipo="primario" etichetta="Aggiungi spesa" icona="plus" onPress={rif.nuovoMovimento} />} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], flexWrap: 'wrap' }}>
        <SelettorePeriodo mese={rif.mese} meseOggi={rif.meseOggi} onCambia={rif.setMese} />
        <Tendina larghezza={190} valore={conto} onCambia={setConto} iconaPrima="wallet"
          opzioni={[{ valore: 'tutti', testo: 'Tutti i conti' }, ...rif.conti.map((c) => ({ valore: c.id, testo: c.nome }))]} />
        <Tendina larghezza={210} valore={categoria} onCambia={setCategoria} iconaPrima="tags"
          opzioni={[{ valore: 'tutte', testo: 'Tutte le categorie', rientro: 0 }, ...opzioniCategorie(rif.categorie)]} />
        <Tendina larghezza={190} valore={verso} onCambia={setVerso}
          opzioni={[{ valore: 'tutti', testo: 'Uscite ed entrate' }, { valore: 'uscite', testo: 'Solo uscite' }, { valore: 'entrate', testo: 'Solo entrate' }]} />
        <View style={{ flex: 1, minWidth: 220 }}><Campo valore={cerca} onCambia={setCerca} segnaposto="Cerca esercente o nota…" iconaPrima="search" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Uscite" valore={euro(uscite)} icona="arrow-up" />
        <NumeroChiave etichetta="Entrate" valore={euro(entrate, { segno: true })} icona="arrow-down" tono="ok" />
        <NumeroChiave etichetta="Differenza" valore={euro(entrate + uscite, { segno: true })} icona="arrow-left-right" tono={entrate + uscite < 0 ? 'errore' : 'normale'} />
      </View>
      <Scheda>
        {!dati ? <Caricamento errore={errore} /> : righe.length === 0 ? <Vuoto testo={`Nessun movimento in ${nomeMeseMinuscolo(rif.mese)} con questi filtri.`} azione={<Pulsante etichetta="Aggiungi spesa" icona="plus" onPress={rif.nuovoMovimento} />} /> : (
          <View>
            {[...giorni].map(([g, ms]) => {
              const u = ms.filter((m) => !m.trasferimento_id && Number(m.importo) < 0).reduce((t, m) => t + Number(m.importo), 0);
              const e = ms.filter((m) => !m.trasferimento_id && Number(m.importo) > 0).reduce((t, m) => t + Number(m.importo), 0);
              return (
                <View key={g}>
                  <TitoloGruppo testo={nomeGiorno(g)} destra={[u ? euro(u) : null, e ? euro(e, { segno: true }) : null].filter(Boolean).join(' · ')} />
                  {ms.map((m) => {
                    const c = rif.conto(m.conto_id);
                    if (m.trasferimento_id) {
                      const altra = (dati ?? []).find((x) => x.trasferimento_id === m.trasferimento_id && x.id !== m.id);
                      const a = rif.conto(altra?.conto_id);
                      return <RigaMovimento key={m.id} tipo="trasferimento" esercente={`Da ${c?.nome ?? '—'} a ${a?.nome ?? '—'}`} categoria={m.descrizione ?? 'Spostamento tra conti'}
                        conto={`${c?.nome ?? '—'} → ${a?.nome ?? '—'}`} importo={euro(-Number(m.importo))} icona="arrow-left-right" onApri={() => setAperto(m)} />;
                    }
                    const etichetta = m.spesa_prevista_id ? { testo: 'Spesa prevista', icona: 'calendar-check' } : c?.condiviso ? { testo: 'Condiviso', icona: 'users' } : undefined;
                    return <RigaMovimento key={m.id} tipo={Number(m.importo) > 0 ? 'entrata' : 'uscita'} esercente={m.esercente ?? m.descrizione ?? 'Movimento'} categoria={rif.percorsoCategoria(m.categoria_id)}
                      conto={c?.nome ?? '—'} importo={euro(m.importo, { segno: true })} icona={rif.iconaCategoria(m.categoria_id)} etichetta={etichetta} onApri={() => setAperto(m)} />;
                  })}
                </View>
              );
            })}
            {(dati?.length ?? 0) >= limite ? <View style={{ alignItems: 'center', paddingTop: d['spazio-blocco'] }}><Pulsante tipo="testo" etichetta={`Mostra altri movimenti di ${nomeMeseMinuscolo(rif.mese)}`} onPress={() => setLimite(limite + 200)} /></View> : null}
          </View>
        )}
      </Scheda>
      <FinestraMovimento aperta={!!aperto} movimento={aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}
