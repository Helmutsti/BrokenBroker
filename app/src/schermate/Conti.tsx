import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore, Pulsante } from '../componenti/base.tsx';
import { Campo, CampoData, SceltaIcona, Tendina } from '../componenti/campi.tsx';
import { Intestazione, Scheda, SchedaConto, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, modifica, sostituisci, useDati } from '../dati/api.ts';
import { alberoConti, contoCondiviso, opzioniConti } from '../dati/contesto.tsx';
import type { Condivisione, Conto, ElencoSpese, Rata } from '../dati/tipi.ts';
import { dataOra, euro, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento } from './comuni.tsx';
import { Affiancati, ConErrore, ErroreCampo, FinestraModulo, Meta, Riquadro, RiquadroCondivisione, salvaCondivisione, serve } from './moduli.tsx';

// SC-06 Conti (decisione 61): un albero di conti (conto → sotto-conti), ognuno con il suo saldo. Il saldo si scrive come lo vedi in banca,
// con il momento in cui vale, e poi lo muovono le transazioni (spunte e movimenti). Il saldo di un contenitore comprende i sotto-conti:
// «Non assegnato» è la parte che non sta in nessun sotto-conto. Un conto si condivide con i suoi sotto-conti.

// Con chi è condiviso un conto (lui o un conto che lo contiene): «con Anna» se l'hai condiviso tu, «da Anna» se te l'ha condiviso lei.
function conChi(conti: Conto[], condivisioni: Condivisione[], id: string): string | null {
  for (let c = conti.find((x) => x.id === id); c; c = conti.find((x) => x.id === c!.padre_id)) {
    const s = condivisioni.find((x) => x.voce === 'conto' && x.voce_id === c!.id);
    if (s) return s.mia ? `con ${s.condiviso_con}` : `da ${s.proprietario}`;
    if (!c.padre_id) break;
  }
  return null;
}

export function Conti() {
  const compatto = useCompatto();
  const [archiviati, setArchiviati] = useState(false);
  const { dati, errore } = useDati<Conto[]>(`/conti?archiviati=${archiviati}`);
  const condivisioni = useDati<Condivisione[]>('/condivisioni').dati ?? [];
  const [aperto, setAperto] = useState<Conto | 'nuovo' | 'sotto' | null>(null);
  if (!dati) return <Caricamento errore={errore} />;

  const attivi = dati.filter((c) => !c.archiviato);
  const vecchi = dati.filter((c) => c.archiviato);
  const scheda = (c: Conto, sotto: number) => {
    const chi = contoCondiviso(dati, c.id) ? conChi(dati, condivisioni, c.id) : null;
    const dentro = [sotto ? `${sotto} ${sotto === 1 ? 'sotto-conto' : 'sotto-conti'}` : null, c.non_assegnato !== null ? `non assegnato ${euro(c.non_assegnato)}` : null].filter(Boolean).join(' · ');
    return (
      <SchedaConto key={c.id} nome={c.nome} icona={c.icona} onApri={() => setAperto(c)}
        saldo={c.saldo !== null ? euro(c.saldo) : undefined} saldoNegativo={c.saldo !== null && Number(c.saldo) < 0}
        nota={[c.saldo_scritto_il ? `Scritto il ${dataOra(c.saldo_scritto_il)}` : c.saldo !== null ? 'Saldo mai scritto: solo transazioni' : 'Saldo da scrivere', chi].filter(Boolean).join(' · ')}
        dettaglio={dentro ? dentro.charAt(0).toUpperCase() + dentro.slice(1) : undefined} dettaglioNegativo={c.non_assegnato !== null && Number(c.non_assegnato) < 0}
        condiviso={contoCondiviso(dati, c.id)} />
    );
  };
  // Solo i conti in cima: i sotto-conti (salvadanai e ceste) si vedono nella pagina Salvadanai; qui si dice quanti sono.
  const albero = (conti: Conto[]) => {
    const righe = alberoConti(conti);
    const quanti = (id: string) => conti.filter((x) => x.padre_id === id).length;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        {righe.filter((r) => r.livello === 0).map(({ conto }) => (
          <View key={conto.id} style={{ width: compatto ? '100%' : 352 }}>{scheda(conto, quanti(conto.id))}</View>
        ))}
      </View>
    );
  };

  return (
    <>
      <Intestazione titolo="Conti" sottotitolo="I tuoi conti, con il saldo. Scrivi il saldo come lo vedi in banca: poi lo muovono le spunte e i movimenti. I sotto-conti sono nella pagina Salvadanai."
        azioni={(
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: d['spazio-colonne'] }}>
            <Pulsante tipo="primario" etichetta="Nuovo conto" icona="plus" onPress={() => setAperto('nuovo')} />
          </View>
        )} />
      {attivi.length === 0 ? <Scheda><Vuoto testo="Nessun conto. Aggiungi il tuo conto corrente." /></Scheda> : albero(attivi)}
      {archiviati && vecchi.length ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <Testo stile="titolo-scheda">Archiviati</Testo>
          {albero(vecchi)}
        </View>
      ) : null}
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" icona="archive" etichetta={archiviati ? 'Nascondi i conti archiviati' : 'Mostra i conti archiviati'} onPress={() => setArchiviati(!archiviati)} /></View>
      <FinestraConto conto={typeof aperto === 'object' ? aperto : null} sotto={aperto === 'sotto'} conti={dati} condivisioni={condivisioni} aperta={!!aperto} onChiudi={() => setAperto(null)} />
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
  conto.non_assegnato !== null ? `Comprende i sotto-conti: non assegnato ${euro(conto.non_assegnato)}.` : null,
].filter(Boolean).join(' ');

// «Sul conto» della pagina Spese: riscrive il saldo del conto principale.
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

// Un conto e i conti che contiene, a ogni livello: non può finire dentro uno di questi.
const discendenti = (conti: Conto[], id: string): string[] => conti.filter((c) => c.padre_id === id).flatMap((c) => [c.id, ...discendenti(conti, c.id)]);

function FinestraConto({ conto, sotto, conti, condivisioni, aperta, onChiudi }: { conto: Conto | null; sotto: boolean; conti: Conto[]; condivisioni: Condivisione[]; aperta: boolean; onChiudi: () => void }) {
  // Quante spese e rate usano il conto: con il conto eliminato restano senza conto.
  const spese = useDati<ElencoSpese>(aperta && conto ? '/spese-previste' : null).dati;
  const rate = useDati<Rata[]>(aperta && conto ? '/rate' : null).dati;
  const nSpese = conto ? (spese?.spese.filter((s) => s.conto_id === conto.id || s.a_conto_id === conto.id).length ?? 0) : 0;
  const nRate = conto ? (rate?.filter((x) => x.conto_id === conto.id).length ?? 0) : 0;
  const collegate = [nSpese ? `${nSpese} ${nSpese === 1 ? 'spesa' : 'spese'}` : null, nRate ? `${nRate} ${nRate === 1 ? 'rata' : 'rate'}` : null].filter(Boolean).join(' e ');
  const miaCondivisione = conto ? condivisioni.find((x) => x.voce === 'conto' && x.voce_id === conto.id && x.mia) : undefined;
  const [nome, setNome] = useState('');
  const [icona, setIcona] = useState('landmark');
  const [padre, setPadre] = useState('');
  const [archiviato, setArchiviato] = useState(false);
  const [condiviso, setCondiviso] = useState(false);
  const [con, setCon] = useState<string | null>(null);
  const [saldo, setSaldo] = useState('');
  const [giorno, setGiorno] = useState('');
  const [ora, setOra] = useState('');
  useEffect(() => {
    if (!aperta) return;
    setNome(conto?.nome ?? ''); setIcona(conto?.icona ?? (sotto ? 'piggy-bank' : 'landmark')); setPadre(conto?.padre_id ?? '');
    setArchiviato(conto?.archiviato ?? false); setCondiviso(conto?.condiviso ?? false); setCon(null);
    setSaldo(importoInTesto(conto?.saldo)); setGiorno(''); setOra('');
  }, [aperta, conto, sotto]);

  const fuori = conto ? [conto.id, ...discendenti(conti, conto.id)] : [];
  const sottoConto = sotto || !!padre;
  const salva = async () => {
    const corpo: Record<string, unknown> = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), icona };
    if (sotto && !padre) throw new ErroreCampo('padre', 'Scegli il conto che lo contiene');
    if (!conto || (conto.padre_id ?? '') !== padre) corpo.padre_id = padre || null;
    if (conto) corpo.archiviato = archiviato;
    const salvato = conto ? await modifica<Conto>(`/conti/${conto.id}`, corpo) : await crea<Conto>('/conti', corpo);
    await scriviSaldo(salvato, saldo, giorno, ora);
    // Si condivide solo un conto in cima, e solo chi l'ha creato: i sotto-conti seguono il contenitore.
    if (salvato.mio && !salvato.padre_id) await salvaCondivisione('conto', salvato.id, condiviso, con ?? miaCondivisione?.condiviso_con_id ?? null);
  };
  const chi = conto ? conChi(conti, condivisioni, conto.id) : null;
  return (
    <FinestraModulo titolo={conto ? conto.nome : sotto ? 'Nuovo sotto-conto' : 'Nuovo conto'} icona={icona} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={conto?.mio ? () => cancella(`/conti/${conto.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina conto"
      confermaElimina={conto ? { nome: `«${conto.nome}»`, dettaglio: `${collegate ? `${collegate} restano senza conto.` : 'Nessuna spesa o rata usa questo conto.'} Le transazioni restano, senza questo conto.` } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: d['spazio-colonne'] }}>
        <SceltaIcona valore={icona} onCambia={setIcona} />
        <View style={{ flex: 1, minWidth: 0 }}><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto={sottoConto ? 'Es. Fondo emergenza' : 'Es. BPER'} autoFocus={!conto} /></ConErrore></View>
      </View>
      <ConErrore campo="padre">
        <Tendina etichetta={sotto ? 'Dentro quale conto' : 'Dentro quale conto (facoltativo)'} valore={padre} iconaPrima="landmark" onCambia={setPadre} segnaposto="Scegli il conto che lo contiene"
          opzioni={[...(sotto ? [] : [{ valore: '', testo: 'Nessuno: è un conto a sé' }]), ...opzioniConti(conti, { tenere: [padre], escludi: fuori })]} />
        <Testo stile="dettaglio-normale" colore="testo-secondario">
          {sottoConto ? 'Un sotto-conto è una parte del conto che lo contiene: il saldo del contenitore lo comprende.' : 'Un conto a sé, come quello della banca. Può contenere dei sotto-conti.'}</Testo>
      </ConErrore>
      <Riquadro titolo="Saldo" icona="wallet" nota="Scrivilo quando vuoi, con il momento in cui vale: dopo lo muovono le transazioni.">
        <CampiSaldo saldo={saldo} setSaldo={setSaldo} giorno={giorno} setGiorno={setGiorno} ora={ora} setOra={setOra}
          aiuto={conto ? aiutoSaldo(conto) : 'Facoltativo. Da qui in poi lo muovono le spunte e i movimenti.'} />
      </Riquadro>
      {conto && !conto.mio ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`Conto condiviso con te${chi ? ` ${chi}` : ''}: vedete lo stesso saldo. Puoi modificarlo; solo chi l'ha creato può eliminarlo.`}</Testo>
      ) : padre ? (
        <Testo stile="dettaglio-normale" colore="testo-secondario">{chi ? `Condiviso ${chi}, insieme al conto che lo contiene.` : 'Un sotto-conto si condivide insieme al conto che lo contiene.'}</Testo>
      ) : (
        <ConErrore campo="condivisione"><RiquadroCondivisione aperta={aperta} nome="questo conto" condiviso={condiviso} onCambia={setCondiviso} con={con ?? miaCondivisione?.condiviso_con_id ?? null} onCon={setCon}
          giaCondivisa={!!conto?.condiviso} testoCondividi="Condividi questo conto e i suoi sotto-conti" testoAttivo="Lo vedete tutti e due, con lo stesso saldo, sotto-conti compresi." /></ConErrore>
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
