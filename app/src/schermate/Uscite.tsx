import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Esito, Etichetta, Pulsante, Separatore, Spunta, Tessera } from '../componenti/base.tsx';
import { Campo } from '../componenti/campi.tsx';
import { Intestazione, NumeroChiave, Scheda, SelettorePeriodo } from '../componenti/composti.tsx';
import { cancella, crea, sostituisci, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ElencoSpese, Rata, Saldo, Spesa } from '../dati/tipi.ts';
import { euro, importoInTesto, leggiImporto, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { meseDi, periodoDi } from '../mesePersonale.ts';
import { useCompatto } from '../tema/compatto.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, cadenza, elencoConE, mesiDelCiclo, proxSpesaDaPagare, quotaInTesto, traMesi } from './comuni.tsx';
import { FinestraRata } from './FinestraRata.tsx';
import { FinestraSpesa } from './FinestraSpesa.tsx';
import { FinestraModulo, serve } from './moduli.tsx';

// Uscite (decisione 72, la pagina iniziale): tutte le uscite, al mese e all'anno, con la tua quota. In alto quattro numeri sul saldo unico (scritto a mano;
// spuntare una voce lo fa scendere). Sotto tre riquadri: Mensili, Rate e Annuali (ogni 2 mesi o più, anche una volta sola). Nel mese contano le mensili,
// le rate che cadono quel mese e le annuali che scadono quel mese (importo pieno). La spunta delle mensili vale per il mese che si guarda; quella delle rate per la rata in corso (come le annuali, anche in anticipo: conta nel mese in cui la spunti); quella delle annuali
// c'è in ogni mese e vale per la scadenza in corso (la prima da questo mese in poi): spuntata in anticipo, resta spuntata fino a quando passa quel mese e conta
// come già uscita (non tra «Devono ancora uscire»); nel mese della scadenza conta comunque tra le «Uscite del mese».

type Voce = {
  chiave: string; tipo: 'spesa' | 'rata'; spesa?: Spesa; rata?: Rata; nome: string; dettaglio: string; conto: string | null;
  alMese: number; all_anno: number; residuo?: number; importo: number; nelMese: boolean; contate: number; contatePagate: number; fatta: boolean; spuntabile: boolean; ordine: string; icona: string; colore: string | null;
};

const AL_MESE = 104, ALL_ANNO = 124;

export function Uscite() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const compatto = useCompatto();
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const rate = useDati<Rata[]>(`/rate?mese=${mese}`);
  const saldo = useDati<Saldo>('/saldo');
  const [errore, setErrore] = useState<string | null>(null);
  const [spesa, setSpesa] = useState<Spesa | 'nuova' | null>(null);
  const [rata, setRata] = useState<Rata | 'nuova' | null>(null);
  const [scriviSaldo, setScriviSaldo] = useState(false);
  const { richiesta, chiedi } = rif;
  // Richieste da altre schermate: «Nuova spesa» della barra laterale, «Apri la spesa» di un salvadanaio.
  useEffect(() => {
    if (richiesta.nuovaSpesa) { setSpesa('nuova'); chiedi({}); }
    else if (richiesta.spesa && spese.dati) {
      const s = spese.dati.spese.find((x) => x.id === richiesta.spesa);
      if (s) setSpesa(s);
      chiedi({});
    }
  }, [richiesta, spese.dati]); // eslint-disable-line react-hooks/exhaustive-deps

  const el = spese.dati, profilo = rif.profilo;
  if (!el || !rate.dati || !saldo.dati || !profilo) return <Caricamento errore={spese.errore ?? rate.errore ?? saldo.errore} />;
  const inizio = profilo.inizio_mese;
  const p = el.periodo;
  const oggi = oggiIso();
  const da = oggi >= p.dal && oggi <= p.al ? oggi : p.dal;
  const nomeDelMese = nomeMeseMinuscolo(mese);

  // ---- Le voci ----
  const categoriaDi = (s: Spesa) => (s.categoria ? (s.categoria_padre ? `${s.categoria_padre} › ${s.categoria}` : s.categoria) : null);
  const voceSpesa = (s: Spesa): Voce => {
    const quota = quotaInTesto(s);
    let dettaglio: string;
    let ordine: string;
    if (s.ogni_mesi === 1) {
      dettaglio = [categoriaDi(s), s.giorno_mese ? `il ${s.giorno_mese}` : null, quota].filter(Boolean).join(' · ');
      // Ordine dei mensili: per giorno, a partire dal giorno di inizio mese (con inizio 27: 27…31, 1…26); senza giorno in fondo.
      ordine = s.giorno_mese ? String((s.giorno_mese - inizio + 31) % 31).padStart(2, '0') : '99';
    } else if (s.ogni_mesi === null) {
      const quando = s.prossima_scadenza ? `${nomeMeseMinuscolo(s.prossima_scadenza.slice(0, 7))} ${s.prossima_scadenza.slice(0, 4)}` : '';
      dettaglio = [`una volta, a ${quando}`, quota].filter(Boolean).join(' · ');
      // Annuali e rate: per data (la scadenza in corso); senza giorno vale l'inizio del suo mese personale.
      ordine = s.prossima_scadenza ? (s.senza_giorno ? periodoDi(s.prossima_scadenza.slice(0, 7), inizio).dal : s.prossima_scadenza) : '9999';
    } else {
      const prossima = s.uscita ? proxSpesaDaPagare(s, da, inizio) : s.scadenza ?? proxSpesaDaPagare(s, da, inizio);
      const mesi = s.prossima_scadenza ? mesiDelCiclo(s.ogni_mesi, s.prossima_scadenza, s.senza_giorno, inizio) : [];
      const ciclo = `${cadenza(s.ogni_mesi)}${mesi.length ? `, a ${elencoConE(mesi)}` : ''}`;
      dettaglio = [ciclo, prossima ? traMesi(prossima, inizio) : null, quota].filter(Boolean).join(' · ');
      ordine = prossima ?? '9999';
    }
    return { chiave: s.id, tipo: 'spesa', spesa: s, nome: s.nome, dettaglio, conto: s.conto, alMese: Number(s.al_mese), all_anno: Number(s.all_anno), importo: Number(s.mia_quota),
      nelMese: s.nel_mese, contate: 1, contatePagate: s.uscita ? 1 : 0, fatta: s.uscita, spuntabile: true, ordine, icona: s.icona ?? 'ellipsis', colore: s.colore };
  };
  const voceRata = (x: Rata): Voce => {
    const n = x.numero ?? Math.min(x.numero_rate, x.pagate + 1);
    const fine = `${nomeMeseMinuscolo(x.ultima_scadenza.slice(0, 7))} ${x.ultima_scadenza.slice(0, 4)}`;
    return { chiave: x.id, tipo: 'rata', rata: x, nome: x.oggetto, dettaglio: `rata ${n} di ${x.numero_rate} · finisce a ${fine}`, conto: x.conto,
      alMese: Number(x.al_mese), all_anno: Number(x.all_anno), residuo: Number(x.residuo), importo: Number(x.importo_rata), nelMese: (x.contate ?? 0) > 0, contate: x.contate ?? 0, contatePagate: x.contate_pagate ?? 0, fatta: !!x.pagata,
      // La rata si spunta solo quando la sua scadenza cade entro il mese che si guarda (Manuel): se è nel futuro la casella non c'è; se è già spuntata si può togliere.
      spuntabile: !!x.pagata || (!!x.scadenza && x.scadenza <= p.al), ordine: x.scadenza ?? '9999', icona: 'credit-card', colore: null };
  };
  const attive = el.spese.filter((s) => s.attiva);
  const perOrdine = (a: Voce, b: Voce) => a.ordine.localeCompare(b.ordine) || a.nome.localeCompare(b.nome, 'it');
  const mensili = attive.filter((s) => s.ogni_mesi === 1).map(voceSpesa).sort(perOrdine);
  // Una volta sola: si vede dal mese in cui scade in poi.
  const annuali = attive.filter((s) => s.ogni_mesi === null || s.ogni_mesi >= 2)
    .filter((s) => s.scadenza_in_corso !== null && (s.ogni_mesi !== null || s.nel_mese || (s.prossima_scadenza && meseDi(s.prossima_scadenza, inizio) >= mese))).map(voceSpesa).sort(perOrdine);
  const dellaRata = rate.dati.filter((x) => !x.chiusa && (x.scadenza || (x.contate ?? 0) > 0)).map(voceRata).sort(perOrdine);

  // ---- I quattro numeri ----
  // I quattro numeri (Manuel, 2026-11-03): Saldo | Spese totali | Quanto deve uscire | Rimanenza.
  // Spese totali = la somma delle colonne «Al mese» dei tre riquadri, come nell'Excel: ogni mensile, ogni rata in corso (una rata al mese,
  // qualunque sia il giorno di scadenza) e la quota mensile di ogni annuale.
  // Quanto deve uscire = la parte delle spese totali non ancora spuntata (un'annuale spuntata non conta più la sua quota). Rimanenza = saldo − quanto deve uscire.
  type Peso = { v: Voce; cifra: number; pagata: boolean };
  const pesi: Peso[] = [
    ...mensili.filter((v) => v.nelMese).map((v) => ({ v, cifra: v.importo, pagata: v.fatta })),
    ...dellaRata.map((v) => ({ v, cifra: v.importo, pagata: v.fatta })),
    ...annuali.map((v) => ({ v, cifra: v.alMese, pagata: v.fatta })),
  ];
  const uscite = pesi.reduce((t, p) => t + p.cifra, 0);
  const daSpuntare = pesi.filter((p) => !p.pagata);
  const devono = daSpuntare.reduce((t, p) => t + p.cifra, 0);
  const sal = saldo.dati.effettivo === null ? null : Number(saldo.dati.effettivo);
  const avanzo = sal === null ? null : sal - devono;
  const voci = (n: number) => `${n} ${n === 1 ? 'voce' : 'voci'}`;

  const spunta = async (v: Voce) => {
    setErrore(null);
    try {
      const rotta = v.tipo === 'spesa' ? `/spese-previste/${v.chiave}/spunta` : `/rate/${v.chiave}/spunta`;
      if (v.fatta) await cancella(`${rotta}?mese=${mese}`); else await crea(rotta, { mese });
    } catch (e) { setErrore((e as Error).message); }
  };
  const apri = (v: Voce) => (v.spesa ? setSpesa(v.spesa) : setRata(v.rata!));

  const cella = (pieno: boolean, figlio: ReactNode) => (
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: compatto ? (pieno ? '100%' : '45%') : 0 }}>{figlio}</View>
  );

  return (
    <>
      <Intestazione titolo="Uscite" sottotitolo="Tutte le uscite, al mese e all’anno. Importi: la tua quota."
        azioni={<Pulsante tipo="primario" etichetta="Nuova spesa" icona="plus" onPress={() => setSpesa('nuova')} />} />
      <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      <View style={{ flexDirection: 'row', flexWrap: compatto ? 'wrap' : 'nowrap', alignItems: 'stretch', gap: compatto ? d['spazio-colonne'] : d['spazio-blocco'] }}>
        {cella(true, (
          <NumeroChiave etichetta="Saldo" valore={sal === null ? 'Scrivilo' : euro(sal)} icona="wallet" tono={sal !== null && sal < 0 ? 'errore' : 'normale'}
            onPress={() => setScriviSaldo(true)} etichettaPressione="Riscrivi il saldo" nota="Quanto hai adesso · tocca per riscriverlo" />
        ))}
        {cella(false, <NumeroChiave etichetta="Spese totali" valore={euro(uscite)} icona="list-checks" nota={`Mensili e rate di ${nomeDelMese} e la quota mensile delle annuali`} />)}
        {cella(false, <NumeroChiave etichetta="Quanto deve uscire" valore={euro(devono)} icona="arrow-up-right" nota={daSpuntare.length ? `${voci(daSpuntare.length)} da spuntare` : 'Tutto spuntato'} />)}
        {cella(true, (
          <NumeroChiave etichetta="Rimanenza" valore={avanzo === null ? '—' : euro(avanzo, { segno: true })} icona="scale"
            tono={avanzo === null ? 'normale' : avanzo < -0.005 ? 'errore' : avanzo < 0.005 ? 'attenzione' : 'ok'}
            nota={avanzo === null ? 'Scrivi il saldo' : avanzo < -0.005 ? `Mancano ${euro(-avanzo)} per sostenere le uscite` : 'Il saldo meno quanto deve uscire'} />
        ))}
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <Riquadro titolo="Mensili" nota={`Ogni mese. La spunta vale per ${nomeDelMese}.`} voci={mensili} vuoto="Nessuna spesa mensile. Aggiungi affitto, bollette e abbonamenti." onSpunta={spunta} onApri={apri} />
      <Riquadro titolo="Rate" nota={`Senza categoria. La casella c’è quando la rata scade entro ${nomeDelMese}.`} voci={dellaRata} vuoto="Nessuna rata." rimanenti onSpunta={spunta} onApri={apri}
        azione={<Pulsante tipo="testo" etichetta="Nuova rata" icona="plus" onPress={() => setRata('nuova')} />} />
      <Riquadro titolo="Annuali" nota="Ogni 2 mesi o più, anche una volta sola. La spunta vale per la scadenza in corso." voci={annuali} vuoto="Nessuna spesa annuale." onSpunta={spunta} onApri={apri} />
      <FinestraSpesa spesa={spesa === 'nuova' ? null : spesa} aperta={!!spesa} onChiudi={() => setSpesa(null)} />
      <FinestraRata rata={rata === 'nuova' ? null : rata} aperta={!!rata} onChiudi={() => setRata(null)} />
      <FinestraSaldo saldo={saldo.dati} aperta={scriviSaldo} onChiudi={() => setScriviSaldo(false)} />
    </>
  );
}

// Un riquadro: titolo e nota a sinistra, a destra i totali al mese e all'anno (piccoli: contano meno delle cifre delle voci). Nessuna linea sotto la testata,
// linee tra le righe, nessuna riga di totale.
function Riquadro({ titolo, nota, voci, vuoto, onSpunta, onApri, azione, rimanenti }: { titolo: string; nota: string; voci: Voce[]; vuoto: string; onSpunta: (v: Voce) => void; onApri: (v: Voce) => void; azione?: ReactNode; rimanenti?: boolean }) {
  const compatto = useCompatto();
  // Nel riquadro delle rate la seconda colonna è quanto resta da pagare, non il totale all'anno.
  const alMese = voci.reduce((t, v) => t + v.alMese, 0), allAnno = voci.reduce((t, v) => t + (rimanenti ? v.residuo ?? 0 : v.all_anno), 0);
  const parola = rimanenti ? 'rimanenti' : 'all’anno';
  const testata = compatto ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-colonne'] }}>
      <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
        <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2}>{titolo}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo>
      </View>
      <View style={{ alignItems: 'flex-end', gap: d['spazio-testo'] }}>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`${euro(alMese)} al mese`}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{`${euro(allAnno)} ${parola}`}</Testo>
      </View>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-colonne'], paddingHorizontal: d['margine-voce-h'] }}>
      <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
        <Testo stile="titolo-scheda" accessibilityRole="header" aria-level={2}>{titolo}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-secondario">{nota}</Testo>
      </View>
      <View style={{ width: AL_MESE, alignItems: 'flex-end', gap: d['spazio-testo'] }}>
        <Testo stile="etichetta-gruppo" colore="testo-secondario">AL MESE</Testo>
        <Testo stile="dettaglio-normale" colore="testo-terziario">{euro(alMese)}</Testo>
      </View>
      <View style={{ width: ALL_ANNO, alignItems: 'flex-end', gap: d['spazio-testo'] }}>
        <Testo stile="etichetta-gruppo" colore="testo-secondario">{parola.toUpperCase()}</Testo>
        <Testo stile="dettaglio-normale" colore="testo-terziario">{euro(allAnno)}</Testo>
      </View>
    </View>
  );
  return (
    <Scheda>
      <View style={{ gap: d['spazio-icona'] }}>
        {testata}
        <View>
          {voci.length ? voci.map((v, i) => (
            <View key={v.chiave}>
              {i > 0 ? <Separatore /> : null}
              <Riga voce={v} onSpunta={() => onSpunta(v)} onApri={() => onApri(v)} />
            </View>
          )) : <Testo colore="testo-secondario" style={{ paddingVertical: d['margine-voce-v'], paddingHorizontal: d['margine-voce-h'] }}>{vuoto}</Testo>}
        </View>
        {azione ? <View style={{ alignItems: 'flex-start' }}>{azione}</View> : null}
      </View>
    </Scheda>
  );
}

// Una riga: spunta (mensili e rate: solo nel mese che si guarda; annuali: sempre), icona della categoria, nome e dettaglio, conto, al mese e all'anno.
function Riga({ voce: v, onSpunta, onApri }: { voce: Voce; onSpunta: () => void; onApri: () => void }) {
  const compatto = useCompatto();
  const colNome = v.fatta ? 'testo-terziario' : 'testo-primario';
  // Una rata con la scadenza nel futuro non ha la casella: al suo posto uno spazio vuoto della stessa misura, così le righe restano allineate.
  const bersaglio = compatto ? 44 : d['misura-bersaglio'];
  const spunta = v.spuntabile
    ? <Spunta fatta={v.fatta} tenue onPress={onSpunta} etichetta={`${v.nome}: ${v.fatta ? 'uscita' : 'da pagare'}`} />
    : <View style={{ width: bersaglio, height: bersaglio }} />;
  if (compatto) return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingVertical: d['spazio-testo'] }}>
      {spunta}
      <Pressable accessibilityRole="button" accessibilityLabel={v.nome} onPress={onApri} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], minHeight: 44 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" colore={colNome} numberOfLines={1}>{v.nome}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={3}>{[v.dettaglio, v.conto].filter(Boolean).join(' · ')}</Testo>
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
          <Testo stile="corpo-forte" colore={colNome}>{euro(v.alMese)}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario">{v.residuo !== undefined ? `${euro(v.residuo)} rimanenti` : `${euro(v.all_anno)} /anno`}</Testo>
        </View>
      </Pressable>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'], paddingHorizontal: d['margine-voce-h'], paddingVertical: d['spazio-testo'] }}>
      {spunta}
      <Pressable accessibilityRole="button" accessibilityLabel={v.nome} onPress={onApri} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'], paddingVertical: d['spazio-icona'] }}>
        <Tessera icona={v.icona} misura="piccola" tono={v.colore ? 'accento' : 'neutro'} tinta={v.colore ?? undefined} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Testo stile="corpo-forte" colore={colNome} numberOfLines={1}>{v.nome}</Testo>
          <Testo stile="dettaglio-normale" colore="testo-secondario" numberOfLines={2}>{v.dettaglio}</Testo>
        </View>
        {v.conto ? <Etichetta testo={v.conto} icona="wallet" tono="neutro" /> : null}
        <View style={{ width: AL_MESE, alignItems: 'flex-end' }}><Testo stile="corpo-forte" colore={colNome}>{euro(v.alMese)}</Testo></View>
        <View style={{ width: ALL_ANNO, alignItems: 'flex-end' }}><Testo colore="testo-secondario">{euro(v.residuo ?? v.all_anno)}</Testo></View>
      </Pressable>
    </View>
  );
}

// Riscrive il saldo: una cifra sola.
function FinestraSaldo({ saldo, aperta, onChiudi }: { saldo: Saldo; aperta: boolean; onChiudi: () => void }) {
  const [valore, setValore] = useState('');
  useEffect(() => { if (aperta) setValore(importoInTesto(saldo.effettivo)); }, [aperta]); // eslint-disable-line react-hooks/exhaustive-deps
  const salva = async () => {
    const importo = serve(leggiImporto(valore), 'Scrivi quanto hai adesso, es. 1.250,00 (anche negativo, es. -20,00)', 'saldo');
    await sostituisci('/saldo', { importo });
  };
  return (
    <FinestraModulo titolo="Saldo" aperta={aperta} onChiudi={onChiudi} onSalva={salva} senzaTessera>
      <Campo etichetta="Quanto hai adesso" valore={valore} onCambia={setValore} inputMode="decimal" segnaposto="0,00" autoFocus aiuto="Da qui in poi lo fanno scendere le voci che spunti, e risalire quando le togli." />
    </FinestraModulo>
  );
}
