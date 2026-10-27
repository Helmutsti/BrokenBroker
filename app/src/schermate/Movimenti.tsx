import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icona } from '../componenti/Icona.tsx';
import { Tessera } from '../componenti/base.tsx';
import { MenuScelta, Tendina } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, RigaNumeri, Scheda, Vuoto } from '../componenti/composti.tsx';
import { useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { CausaMovimento, ElencoMovimenti } from '../dati/tipi.ts';
import { dataOra, euro, nomeMese } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';

// Movimenti (decisione 48): tutto ciò che ha mosso i conti che vedi, dal più recente: spunte di spese e rate, versamenti e
// prelievi dei salvadanai, giroconti e uscite dei budget. Chi ha fatto cosa, e in grigio «già nel saldo» ciò che è stato
// registrato prima del saldo di partenza del conto (e quindi nel saldo scritto a mano c'è già).

// Il filtro scelto resta finché non si ricarica la pagina ('tutti', 'senza' o l'id di un conto; 'tutti' o AAAA-MM per il mese).
let ultimoConto = 'tutti';
let ultimoMese = 'tutti';
// Da Conti: «Tutti i movimenti» apre la pagina già sul conto.
export const filtraMovimentiPerConto = (id: string) => { ultimoConto = id; ultimoMese = 'tutti'; };

const ICONE: Record<CausaMovimento, string> = { spesa: 'calendar-check', rata: 'credit-card', versamento: 'piggy-bank', giroconto: 'arrow-left-right', budget: 'wallet' };
const CAUSE: Record<CausaMovimento, string> = { spesa: 'Spesa', rata: 'Rata', versamento: 'Salvadanaio', giroconto: 'Giroconto', budget: 'Budget' };

export function Movimenti() {
  const rif = useRiferimenti();
  const compatto = useCompatto();
  const [contoScelto, setContoScelto] = useState(ultimoConto);
  const [meseScelto, setMeseScelto] = useState(ultimoMese);
  const scegliConto = (v: string) => { ultimoConto = v; ultimoMese = 'tutti'; setContoScelto(v); setMeseScelto('tutti'); };
  const scegliMese = (v: string) => { ultimoMese = v; setMeseScelto(v); };
  const conti = rif.conti;
  const conto = conti.find((x) => x.id === contoScelto) ?? null;
  const filtroConto = contoScelto === 'senza' ? 'senza' : conto ? conto.id : 'tutti';
  const parametri = [filtroConto !== 'tutti' ? `conto=${filtroConto}` : '', meseScelto !== 'tutti' ? `mese=${meseScelto}` : '', 'limite=300'].filter(Boolean).join('&');
  const { dati, errore } = useDati<ElencoMovimenti>(`/movimenti?${parametri}`);
  if (!dati) return <Caricamento errore={errore} />;

  const titolo = filtroConto === 'senza' ? 'Senza conto' : conto ? conto.nome : 'Tutti i conti';
  // Il saldo attuale: quello del conto scelto, o la somma dei saldi dei conti non archiviati che ne hanno uno.
  const visibili = conti.filter((x) => !x.archiviato && x.saldo !== null);
  const saldo = filtroConto === 'senza' ? null : conto ? (conto.saldo === null ? null : Number(conto.saldo)) : visibili.length ? visibili.reduce((t, x) => t + Number(x.saldo), 0) : null;
  const mesi = dati.mesi;
  const meseValido = meseScelto === 'tutti' || mesi.includes(meseScelto) ? meseScelto : 'tutti';
  // Con «Tutti i conti» le due metà di un giroconto si annullano: non sono né entrate né uscite.
  const contano = dati.movimenti.filter((x) => x.conta && !(filtroConto === 'tutti' && x.causa === 'giroconto'));
  const uscite = contano.filter((x) => Number(x.importo) < 0).reduce((t, x) => t + Number(x.importo), 0);
  const entrate = contano.filter((x) => Number(x.importo) > 0).reduce((t, x) => t + Number(x.importo), 0);

  return (
    <>
      <Intestazione titolo="Movimenti" sottotitolo="Tutto ciò che ha mosso i tuoi conti: spunte, salvadanai, giroconti e uscite dei budget. In grigio quello che nel saldo scritto a mano c'è già." />
      <RigaNumeri>
        <NumeroChiave etichetta={titolo} valore={saldo === null ? '—' : euro(saldo)} icona="wallet" nota={saldo === null && filtroConto !== 'senza' ? 'Nessun saldo scritto: lo scrivi in Conti' : `${dati.movimenti.length} ${dati.movimenti.length === 1 ? 'movimento' : 'movimenti'}${dati.movimenti.length >= 300 ? ' (i più recenti)' : ''}`}
          titolo={(
            <MenuScelta valore={filtroConto} onCambia={scegliConto} larghezzaMinima={240}
              opzioni={[{ valore: 'tutti', testo: 'Tutti i conti', icona: 'wallet' }, ...conti.map((x) => ({ valore: x.id, testo: x.nome, icona: x.icona })), { valore: 'senza', testo: 'Senza conto', icona: 'circle-x' }]}>
              {({ ref, apri, aperto }) => (
                <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`Scegli il conto: ${titolo}`} aria-expanded={aperto} onPress={apri}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-testo'], minHeight: compatto ? 44 : undefined }}>
                  <Testo stile={compatto ? 'corpo-forte' : 'titolo-scheda'} colore="testo-secondario" style={{ flexShrink: 1, minWidth: 0 }}>{titolo}</Testo>
                  <Icona nome="chevron-down" misura={16} />
                </Pressable>
              )}
            </MenuScelta>
          )} />
        <NumeroChiave etichetta="Usciti" valore={euro(-uscite)} icona="arrow-up-right" nota={meseValido === 'tutti' ? 'Dentro il saldo, in tutto l\'elenco' : `Dentro il saldo, ${nomeMese(meseValido).toLowerCase()}`} />
        <NumeroChiave etichetta="Entrati" valore={euro(entrate)} icona="arrow-down-left" nota={meseValido === 'tutti' ? 'Dentro il saldo, in tutto l\'elenco' : `Dentro il saldo, ${nomeMese(meseValido).toLowerCase()}`} />
      </RigaNumeri>
      <View style={{ width: compatto ? undefined : 300 }}>
        <Tendina etichetta="Mese" valore={meseValido} iconaPrima="calendar" onCambia={scegliMese}
          opzioni={[{ valore: 'tutti', testo: 'Tutti i mesi' }, ...mesi.map((m) => ({ valore: m, testo: m === dati.mese_in_corso ? `${nomeMese(m)} · in corso` : nomeMese(m) }))]} />
      </View>
      <Scheda>
        {dati.movimenti.length === 0 ? <Vuoto testo="Nessun movimento con questi filtri." /> : (
          <View>
            {dati.movimenti.map((x) => {
              const negativo = Number(x.importo) < 0;
              const grigio = !x.conta;
              return (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['margine-riga-v'], paddingHorizontal: d['margine-voce-h'], minHeight: compatto ? 56 : undefined }}>
                  <Tessera icona={ICONE[x.causa]} misura="piccola" tono="neutro" />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Testo stile="corpo-forte" colore={grigio ? 'testo-terziario' : 'testo-primario'} numberOfLines={compatto ? 2 : 1}>{x.descrizione}</Testo>
                    <Testo stile="dettaglio-normale" colore={grigio ? 'testo-terziario' : 'testo-secondario'} numberOfLines={compatto ? 3 : 1}>
                      {[dataOra(x.momento), CAUSE[x.causa], x.conto ?? 'senza conto', x.utente ? `di ${x.utente}` : null, grigio ? 'già nel saldo' : null].filter(Boolean).join(' · ')}</Testo>
                  </View>
                  <Testo stile="corpo-forte" colore={grigio ? 'testo-terziario' : negativo ? 'testo-errore' : 'testo-ok'}>{euro(x.importo, { segno: true })}</Testo>
                </View>
              );
            })}
          </View>
        )}
      </Scheda>
    </>
  );
}
