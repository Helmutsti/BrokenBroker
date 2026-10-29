import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { contoCondiviso } from '../dati/contesto.tsx';
import type { Condivisione, Conto, ElencoSpese, Rata } from '../dati/tipi.ts';
import { dataOra, euro, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, Riquadro, RiquadroCondivisione, salvaCondivisione, serve } from './moduli.tsx';

// SC-06 Conti (decisioni 61 e 71): i conti, ognuno con il suo saldo. Il saldo si scrive come lo vedi in banca, con il momento in cui vale, e poi lo
// muovono le transazioni (spunte e movimenti). Dentro un conto stanno le ceste (pagina Salvadanai): qui si vede quanto c'è nelle ceste e quanto resta libero.

// Con chi è condiviso un conto: «con Anna» se l'hai condiviso tu, «da Anna» se te l'ha condiviso lei.
function conChi(condivisioni: Condivisione[], id: string): string | null {
  const s = condivisioni.find((x) => x.voce === 'conto' && x.voce_id === id);
  return s ? (s.mia ? `con ${s.condiviso_con}` : `da ${s.proprietario}`) : null;
}

export function Conti() {
  const compatto = useCompatto();
  const [archiviati, setArchiviati] = useState(false);
  const { dati, errore } = useDati<Conto[]>(`/conti?archiviati=${archiviati}`);
  const condivisioni = useDati<Condivisione[]>('/condivisioni').dati ?? [];
  const [aperto, setAperto] = useState<Conto | 'nuovo' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.filter((c) => !c.archiviato);
  const vecchi = dati.filter((c) => c.archiviato);
  const scheda = (c: Conto) => {
    const chi = contoCondiviso(dati, c.id) ? conChi(condivisioni, c.id) : null;
    const dentro = Number(c.nelle_ceste) > 0.005 ? `Nelle ceste ${euro(c.nelle_ceste)} · liberi ${euro(c.liberi)}` : undefined;
    return (
      <SchedaConto key={c.id} nome={c.nome} icona={c.icona} onApri={() => setAperto(c)}
        saldo={c.saldo !== null ? euro(c.saldo) : undefined} saldoNegativo={c.saldo !== null && Number(c.saldo) < 0}
        nota={[c.saldo_scritto_il ? `Scritto il ${dataOra(c.saldo_scritto_il)}` : c.saldo !== null ? 'Saldo mai scritto: solo transazioni' : 'Saldo da scrivere', chi].filter(Boolean).join(' · ')}
        dettaglio={dentro} dettaglioNegativo={c.liberi !== null && Number(c.liberi) < 0}
        condiviso={contoCondiviso(dati, c.id)} />
    );
  };
  const elenco = (conti: Conto[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
      {conti.map((c) => <View key={c.id} style={{ width: compatto ? '100%' : 352 }}>{scheda(c)}</View>)}
    </View>
  );

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="I tuoi conti, con il saldo. Scrivi il saldo come lo vedi in banca: poi lo muovono le spunte e i movimenti. Le ceste sono nella pagina Salvadanai."
        azioni={(
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
            <Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />
          </View>
        )} />
      {attivi.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungi il tuo conto corrente." /></Scheda> : elenco(attivi)}
      {archiviati && vecchi.length ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <Testo stile="titolo-scheda">Archiviati</Testo>
          {elenco(vecchi)}
        </View>
      ) : null}
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="archive" etichetta={archiviati ? 'Nascondi i conti archiviati' : 'Mostra i conti archiviati'} onPress={() => setArchiviati(!archiviati)} /></View>
      <FinestraConto conto={typeof aperto === 'object' ? aperto : null} condivisioni={condivisioni} aperta={!!aperto} onChiudi={() => setAperto(null)} />
    </>
  );
}

// ---- Il saldo scritto a mano e il momento in cui vale ----
const leggiOra = (testo: string): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(testo.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
// Il momento del saldo: vuoto = adesso; un giorno senza ora = adesso se è oggi, la fine della giornata se è un giorno passato. Mai nel futuro.
function momentoSaldo(giorno: string, ora: string): string | undefined {
  if (!giorno.trim() && !ora.trim()) return undefined;
  const g = giorno.trim() ? serve(leggiData(giorno), 'Scegli il giorno', 'saldo-giorno') : oggiIso();
  const o = ora.trim() ? serve(leggiOra(ora), 'Scrivi l\'ora, es. 14:35', 'saldo-ora') : null;
  if (!o && g === oggiIso()) return undefined;
  const t = new Date(`${g}T${o ?? '23:59'}:00`);
  if (t.getTime() > Date.now() + 60_000) throw new ErroreCampo(o ? 'saldo-ora' : 'saldo-giorno', 'Il saldo non può valere nel futuro');
  return t.toISOString();
}

// Importo, giorno e ora del saldo (giorno e ora facoltativi: vuoti = adesso).
function CampiSaldo({ saldo, setSaldo, giorno, setGiorno, ora, setOra, aiuto, autoFocus }: {
  saldo: string; setSaldo: (v: string) => void; giorno: string; setGiorno: (v: string) => void; ora: string; setOra: (v: string) => void; aiuto: string; autoFocus?: boolean;
}) {
  return (
    <>
      <ConErrore campo="saldo"><Campo etichetta="Saldo come lo vedi in banca" valore={saldo} onCambia={setSaldo} inputMode="decimal" segnaposto="0,00" autoFocus={autoFocus} aiuto={aiuto} /></ConErrore>
      <Affiancati>
        <Meta><ConErrore campo="saldo-giorno"><CampoData etichetta="Vale dal giorno (facoltativo)" valore={giorno} onCambia={setGiorno} facoltativa segnaposto="Adesso" /></ConErrore></Meta>
        <Meta><ConErrore campo="saldo-ora"><Campo etichetta="Ora (facoltativa)" valore={ora} onCambia={setOra} segnaposto="14:35" inputMode="numeric" iconaPrima="calendar-clock" /></ConErrore></Meta>
      </Affiancati>
    </>
  );
}

// Riscrive il saldo se è cambiato o se è stato scelto il momento. Vuoto = non si tocca.
async function scriviSaldo(conto: Conto, testo: string, giorno: string, ora: string) {
  if (!testo.trim()) return;
  const importo = serve(leggiImporto(testo), 'Scrivi il saldo, es. 450,79 (anche negativo, es. -20,00)', 'saldo');
  const momento = momentoSaldo(giorno, ora);
  if (momento === undefined && conto.saldo !== null && Math.abs(Number(importo) - Number(conto.saldo)) < 0.005) return;
  await sostituisci(`/conti/${conto.id}/saldo`, { importo, ...(momento ? { momento } : {}) });
}

const aiutoSaldo = (conto: Conto) => [
  conto.saldo !== null ? `Ora è ${euro(conto.saldo)}${conto.saldo_scritto_il ? `: scritto il ${dataOra(conto.saldo_scritto_il)}, poi mosso dalle transazioni` : ', solo dalle transazioni: il saldo non è mai stato scritto'}.` : 'Da qui in poi lo muovono le spunte e i movimenti.',
  conto.liberi !== null && Number(conto.nelle_ceste) > 0.005 ? `Nelle ceste ${euro(conto.nelle_ceste)}, liberi ${euro(conto.liberi)}.` : null,
].filter(Boolean).join(' ');

// «Sul conto» della pagina Spese: riscrive il saldo di un conto.
export function FinestraSaldo({ conto, aperta, onChiudi }: { conto: Conto | null; aperta: boolean; onChiudi: () => void }) {
  const [saldo, setSaldo] = useState('');
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  useEffect(() => { if (aperta) { setSaldo(importoInTesto(conto?.saldo)); setGiorno(''); setOra(''); } }, [aperta, conto]);
  const salva = async () => { if (conto) await scriviSaldo(conto, serve(saldo.trim(), 'Scrivi il saldo, es. 450,79', 'saldo'), giorno, ora); };
  return (
    <FinestraModulo titolo={conto ? `Saldo di ${conto.nome}` : 'Saldo'} icona="wallet" aperta={aperta} onChiudi={onChiudi} onSalva={salva}>
      {conto ? <CampiSaldo saldo={saldo} setSaldo={setSaldo} giorno={giorno} setGiorno={setGiorno} ora={ora} setOra={setOra} aiuto={aiutoSaldo(conto)} autoFocus /> : null}
    </FinestraModulo>
  );
}

function FinestraConto({ conto, condivisioni, aperta, onChiudi }: { conto: Conto | null; condivisioni: Condivisione[]; aperta: boolean; onChiudi: () => void }) {
  // Quante spese e rate partono dal conto (o ci arrivano): finché ce ne sono il conto non si elimina (ogni spesa ha il suo conto di partenza).
  const spese = useDati<ElencoSpese>(aperta && conto ? '/spese-previste' : null).dati;
  const rate = useDati<Rata[]>(aperta && conto ? '/rate' : null).dati;
  const nSpese = conto ? (spese?.spese.filter((s) => s.conto_id === conto.id || s.a_conto_id === conto.id).length ?? 0) : 0;
  const nRate = conto ? (rate?.filter((x) => x.conto_id === conto.id).length ?? 0) : 0;
  const collegate = [nSpese ? `${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}` : null, nRate ? `${nRate} ${nRate === 1 ? 'rata' : 'rate'}` : null].filter(Boolean).join(' e ');
  const miaCondivisione = conto ? condivisioni.find((x) => x.voce === 'conto' && x.voce_id === conto.id && x.mia) : undefined;
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('landmark');
  const [archiviato, setArchiviato] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  const [saldo, setSaldo] = useState('');
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setIcona(conto?.icona ?? 'landmark');
    setArchiviato(conto?.archiviato ?? false); setCondiviso(conto?.condiviso ?? false); setCon(null);
    setSaldo(importoInTesto(conto?.saldo)); setGiorno(''); setOra('');
  }, [aperta, conto]);

  const salva = async () => {
    const corpo: Record<string, unknown> = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona };
    if (conto) corpo.archiviato = archiviato;
    const salvato = conto ? await modifica<Conto>(`/conti/${conto.id}`, corpo) : await crea<Conto>('/conti', corpo);
    await scriviSaldo(salvato, saldo, giorno, ora);
    // Si condivide solo chi l'ha creato: le ceste seguono il conto.
    if (salvato.mio) await salvaCondivisione('conto', salvato.id, condiviso, con ?? miaCondivisione?.condiviso_con_id ?? null);
  };
  const chi = conto ? conChi(condivisioni, conto.id) : null;
  return (
    <FinestraModulo titolo={conto ? conto.nome : 'Nuovo conto'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={conto?.mio ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina conto"
      confermaElimina={conto ? { nome: `«${conto.nome}»`, dettaglio: collegate ? `Non si può: ${collegate} ${nSpese + nRate === 1 ? 'parte' : 'partono'} da questo conto. Sposta prima le spese su un altro conto.` : 'Le ceste del conto spariscono con lui; le transazioni restano, senza questo conto.' } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. BPER" autoFocus={!conto} /></ConErrore></View>
      </View>
      <Riquadro titolo="Saldo" icona="wallet" nota="Scrivilo quando vuoi, con il momento in cui vale: dopo lo muovono le transazioni.">
        <CampiSaldo saldo={saldo} setSaldo={setSaldo} giorno={giorno} setGiorno={setGiorno} ora={ora} setOra={setOra}
          aiuto={conto ? aiutoSaldo(conto) : 'Facoltativo. Da qui in poi lo muovono le spunte e i movimenti.'} />
      </Riquadro>
      {conto && !conto.mio ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`Conto condiviso con te${chi ? ` ${chi}` : ''}: vedete lo stesso saldo. Puoi modificarlo; solo chi l'ha creato può eliminarlo.`}</Testo>
      ) : (
        <ConErrore campo="condivisione"><RiquadroCondivisione aperta={aperta} nome="questo conto" condiviso={condiviso} onCambia={setCondiviso} con={con ?? miaCondivisione?.condiviso_con_id ?? null} onCon={setCon}
          giaCondivisa={!!conto?.condiviso} testoCondividi="Condividi questo conto e le sue ceste" testoAttivo="Lo vedete tutti e due, con lo stesso saldo e le stesse ceste." /></ConErrore>
      )}
      {conto ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={archiviato} onCambia={setArchiviato} etichetta="Archiviato" />
          <Testo style={{ flex: 1 }}>Archiviato: non compare più tra i conti</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
