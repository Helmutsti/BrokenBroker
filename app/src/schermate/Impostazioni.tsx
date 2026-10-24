import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Esito, Pulsante } from '../componenti/base.tsx';
import { Campo } from '../componenti/campi.tsx';
import { Intestazione, Scheda, Vuoto } from '../componenti/composti.tsx';
import { cancella, modifica, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { Condivisione, Persona } from '../dati/tipi.ts';
import { euro, importoInTesto, leggiImporto, nomeMeseMinuscolo } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Affiancati, Meta } from './moduli.tsx';
import { useCompatto } from '../tema/compatto.ts';

const NOME_VOCE = { conto: 'Conto', spesa: 'Spesa prevista', obiettivo: 'Salvadanaio' } as const;

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
  const compatto = useCompatto();
  const rif = useRiferimenti();
  const p = rif.profilo;
  const persone = useDati<Persona[]>('/persone').dati ?? [];
  const condivisioni = useDati<Condivisione[]>('/condivisioni').dati ?? [];
  const [nome, setNome] = useState('');
  const [stipendio, setStipendio] = useState('');
  const [paga, setPaga] = useState('');
  const [inizio, setInizio] = useState('');
  useEffect(() => { if (p) { setNome(p.nome); setStipendio(importoInTesto(p.stipendio_netto)); setPaga(p.giorno_paga ? String(p.giorno_paga) : ''); setInizio(String(p.inizio_mese)); } }, [p]);
  const profilo = useSalva(), mese = useSalva();

  const giorno = (v: string, min: number, max: number, cosa: string) => {
    if (!v.trim()) return null;
    const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${cosa}: un giorno tra ${min} e ${max}`); return n;
  };
  const inizioN = Number(inizio) || 1;
  const altra = persone.find((x) => !x.io);

  if (!p) return null;
  return (
    <>
      <Intestazione titolo="Impostazioni" sottotitolo="Il tuo profilo, come si calcola il mese, e cosa condividi." />
      <View style={{ flexDirection: compatto ? 'column' : 'row', gap: d['spazio-blocco'], alignItems: compatto ? 'stretch' : 'flex-start' }}>
        <View style={{ flex: compatto ? undefined : 1, gap: d['spazio-blocco'] }}>
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
        <View style={{ flex: compatto ? undefined : 1, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Condivisione" nota="L'altra persona vede e modifica solo ciò che condividi" icona="users">
            {altra ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
                <Avatar nome={altra.nome} />
                <View style={{ flex: 1, gap: d['spazio-testo'] }}><Testo stile="corpo-forte">{`${altra.nome} · ${altra.email}`}</Testo>
                  <Testo stile="dettaglio-normale" colore="testo-secondario">{`${condivisioni.filter((c) => c.mia).length} voci condivise da te · ${condivisioni.filter((c) => !c.mia).length} condivise con te`}</Testo></View>
              </View>
            ) : <Vuoto testo="Ancora nessuna condivisione. Per condividere un conto, una spesa o un salvadanaio aprilo e attiva Condiviso: ti chiederà l'email dell'altra persona." />}
            {condivisioni.length ? (
              <View>
                {condivisioni.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: compatto ? 'wrap' : 'nowrap', gap: d['spazio-colonne'], paddingVertical: d['margine-voce-v'] }}>
                    <Testo style={{ flex: 1, minWidth: compatto ? 140 : undefined }} numberOfLines={compatto ? 2 : 1}>{`${NOME_VOCE[c.voce]} · ${c.nome ?? '—'}`}</Testo>
                    <Testo stile="dettaglio-normale" colore="testo-secondario">{c.mia ? `con ${c.condiviso_con}` : `da ${c.proprietario}`}</Testo>
                    {c.mia ? <Pulsante tipo="testo" etichetta="Smetti" onPress={() => cancella(`/condivisioni/${c.id}`)} /> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Scheda>
        </View>
      </View>
    </>
  );
}
