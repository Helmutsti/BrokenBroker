import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Esito, Pulsante } from '../componenti/base.tsx';
import { Campo } from '../componenti/campi.tsx';
import { Intestazione, Scheda, Vuoto } from '../componenti/composti.tsx';
import { cancella, modifica, sostituisci, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, Persona, Regole } from '../dati/tipi.ts';
import { euro, importoInTesto, leggiImporto, nomeMeseMinuscolo } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Affiancati, Meta } from './moduli.tsx';

const NOME_VOCE = { conto: 'Conto', spesa: 'Spesa prevista', movimento: 'Movimento', obiettivo: 'Obiettivo' } as const;

// Salvataggio di una scheda: messaggio di esito sotto il pulsante.
function useSalva() {
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const salva = (fn: () => Promise<unknown>) => async () => {
    setEsito(null);
    try { await fn(); setEsito({ ok: true, testo: 'Salvato.' }); } catch (e) { setEsito({ ok: false, testo: (e as Error).message }); }
  };
  return { esito, salva };
}

// SC-09 Impostazioni.
export function Impostazioni() {
  const rif = useRiferimenti();
  const navigazione = useNavigation();
  const p = rif.profilo;
  const regole = useDati<Regole>('/regole').dati;
  const persone = useDati<Persona[]>('/persone').dati ?? [];
  const condivisioni = useDati<Condivisione[]>('/condivisioni').dati ?? [];
  const [nome, setNome] = useState('');
  const [stipendio, setStipendio] = useState('');
  const [paga, setPaga] = useState('');
  const [inizio, setInizio] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [tetto, setTetto] = useState('');
  const [debito, setDebito] = useState('');
  useEffect(() => { if (p) { setNome(p.nome); setStipendio(importoInTesto(p.stipendio_netto)); setPaga(p.giorno_paga ? String(p.giorno_paga) : ''); setInizio(String(p.inizio_mese)); } }, [p]);
  useEffect(() => { if (regole) { setMaxRate(regole.max_rate_contemporanee?.toString() ?? ''); setTetto(regole.tetto_rate_percentuale?.toString().replace('.', ',') ?? ''); setDebito(regole.max_mensilita_debito?.toString().replace('.', ',') ?? ''); } }, [regole]);
  const profilo = useSalva(), mese = useSalva(), reg = useSalva();

  const giorno = (v: string, min: number, max: number, cosa: string) => {
    if (!v.trim()) return null;
    const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${cosa}: un giorno tra ${min} e ${max}`); return n;
  };
  const numeroRegola = (v: string) => (v.trim() ? leggiImporto(v) ?? (() => { throw new Error('Scrivi un numero, es. 15'); })() : null);
  const stip = Number(leggiImporto(stipendio) ?? 0);
  const inizioN = Number(inizio) || 1;
  const altra = persone.find((x) => !x.io);

  if (!p) return null;
  return (
    <>
      <Intestazione titolo="Impostazioni" sottotitolo="Il tuo profilo, come si calcola il mese, le tue regole e cosa condividi." />
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'], alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Profilo" icona="user">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
              <Avatar nome={p.nome} grande />
              <View style={{ gap: d['spazio-testo'] }}><Testo stile="titolo-scheda">{p.nome}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{`Iscritto da ${nomeMeseMinuscolo(p.creato_il.slice(0, 7))} ${p.creato_il.slice(0, 4)}`}</Testo></View>
            </View>
            <Campo etichetta="Nome" valore={nome} onCambia={setNome} />
            <Campo etichetta="Email" valore={p.email} onCambia={() => {}} iconaPrima="mail" disattivato aiuto="L'email serve per accedere e non si cambia da qui" />
            {profilo.esito ? <Esito tono={profilo.esito.ok ? 'ok' : 'errore'} testo={profilo.esito.testo} /> : null}
            <Pulsante etichetta="Salva il profilo" onPress={profilo.salva(() => modifica('/profilo', { nome: nome.trim() }))} />
          </Scheda>
          <Scheda titolo="Stipendio e mese" nota="Servono per calcolare quanto resta davvero" icona="banknote">
            <Affiancati>
              <Meta><Campo etichetta="Stipendio netto" valore={stipendio} onCambia={setStipendio} inputMode="decimal" /></Meta>
              <Meta><Campo etichetta="Giorno di paga" valore={paga} onCambia={setPaga} inputMode="numeric" /></Meta>
            </Affiancati>
            <Campo etichetta="Il mese dell'app parte il giorno" valore={inizio} onCambia={setInizio} inputMode="numeric"
              aiuto={inizioN > 1 ? `Il mese va dal ${inizioN} al ${inizioN - 1} del mese dopo: totali, budget e lista da spuntare seguono questo periodo.` : 'Il mese va dal 1 all’ultimo giorno.'} />
            {mese.esito ? <Esito tono={mese.esito.ok ? 'ok' : 'errore'} testo={mese.esito.testo} /> : null}
            <Pulsante etichetta="Salva" onPress={mese.salva(() => modifica('/profilo', {
              stipendio_netto: stipendio.trim() ? leggiImporto(stipendio) ?? (() => { throw new Error('Scrivi lo stipendio, es. 1.800,00'); })() : null,
              giorno_paga: giorno(paga, 1, 31, 'Giorno di paga'), inizio_mese: giorno(inizio, 1, 28, 'Inizio del mese') ?? 1,
            }))} />
          </Scheda>
        </View>
        <View style={{ flex: 1, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Le tue regole" nota={'Le usa "Posso permettermelo?" e il controllo delle rate'} icona="sliders-horizontal">
            <Campo etichetta="Rate aperte al massimo" valore={maxRate} onCambia={setMaxRate} inputMode="numeric" segnaposto="Nessun limite" />
            <Campo etichetta="Tetto delle rate al mese, in % dello stipendio" valore={tetto} onCambia={setTetto} inputMode="decimal" segnaposto="Nessun limite"
              aiuto={tetto && stip ? `${tetto}% dello stipendio · ${euro((stip * Number(tetto.replace(',', '.'))) / 100)}` : undefined} />
            <Campo etichetta="Debito massimo, in mensilità di stipendio" valore={debito} onCambia={setDebito} inputMode="decimal" segnaposto="Nessun limite"
              aiuto={debito && stip ? `${debito} mensilità · ${euro(stip * Number(debito.replace(',', '.')))}` : undefined} />
            {reg.esito ? <Esito tono={reg.esito.ok ? 'ok' : 'errore'} testo={reg.esito.testo} /> : null}
            <Pulsante etichetta="Salva le regole" onPress={reg.salva(() => sostituisci('/regole', { max_rate_contemporanee: numeroRegola(maxRate), tetto_rate_percentuale: numeroRegola(tetto), max_mensilita_debito: numeroRegola(debito) }))} />
          </Scheda>
          <Scheda titolo="Condivisione" nota="L'altra persona vede e modifica solo ciò che condividi" icona="users">
            {altra ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                <Avatar nome={altra.nome} />
                <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{`${altra.nome} · ${altra.email}`}</Testo>
                  <Testo stile="dettaglio-normale" colore="testo-secondario">{`${condivisioni.filter((c) => c.mia).length} voci condivise da te · ${condivisioni.filter((c) => !c.mia).length} condivise con te`}</Testo></View>
              </View>
            ) : <Vuoto testo="Ancora nessuna condivisione. Per condividere un conto, una spesa o un obiettivo aprilo e attiva Condiviso: ti chiederà l'email dell'altra persona." />}
            {condivisioni.length ? (
              <View>
                {condivisioni.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] }}>
                    <Testo style={{ flex: 1 }} numberOfLines={1}>{`${NOME_VOCE[c.voce]} · ${c.nome ?? '—'}`}</Testo>
                    <Testo stile="dettaglio-normale" colore="testo-secondario">{c.mia ? `con ${c.condiviso_con}` : `da ${c.proprietario}`}</Testo>
                    {c.mia ? <Pulsante tipo="testo" etichetta="Smetti" onPress={() => cancella(`/condivisioni/${c.id}`)} /> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Scheda>
          <Scheda titolo="Altro" icona="ellipsis" nota="Pagine che non servono ogni giorno">
            <View style={{ gap: d['spazio-elenco'] }}>
              {([['conti', 'Conti', 'wallet', 'I tuoi conti, condivisi e archiviati'], ['movimenti', 'Movimenti', 'arrow-left-right', 'Le spese fuori lista che hai aggiunto'],
                ['analisi', 'Analisi', 'chart-pie', 'Mese per mese, patrimonio e proiezioni']] as const).map(([chiave, testo, icona, nota]) => (
                <View key={chiave} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                  <View style={{ flex: 1 }}><Testo stile="corpo-forte">{testo}</Testo><Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo></View>
                  <Pulsante etichetta="Apri" icona={icona} onPress={() => navigazione.navigate(chiave as never)} />
                </View>
              ))}
            </View>
          </Scheda>
        </View>
      </View>
    </>
  );
}
