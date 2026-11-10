import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Interruttore, Pulsante, SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina, TendinaGiorni } from '../componenti/campi.tsx';
import { cancella, crea, modifica } from '../dati/api.ts';
import { opzioniCategorie, opzioniConti, opzioniGruppi, useRiferimenti } from '../dati/contesto.tsx';
import type { Spesa } from '../dati/tipi.ts';
import { dataInTesto, euro, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { primaOccorrenzaPersonale } from '../mesePersonale.ts';
import { d, Testo } from '../tema/tema.tsx';
import { poiDate, proxSpesaDaPagare } from './comuni.tsx';
import { Affiancati, ConErrore, FinestraModulo, Meta, serve, useDivisione, Voce } from './moduli.tsx';

type Frequenza = 'mese' | 'n' | 'una';

// La data intera che si salva (l'anno non si chiede e non si mostra): la prima occorrenza di giorno e mese da oggi in poi,
// contando per mesi personali (il mese personale in corso è ancora buono). Senza giorno vale tutto il mese personale: si salva il giorno 1.
export const primaOccorrenza = primaOccorrenzaPersonale;

// Aggiungi o modifica una spesa (decisione 72): nome e categoria, quando si ripete, importo e conto (solo etichetta), divisione e, per le non mensili già salvate, la «Cesta» (quanto hai raccolto: sale con la quota del mese spuntata, scende con la spesa pagata, si corregge a mano; decisione 73).
export function FinestraSpesa({ spesa, aperta, onChiudi, mese }: { spesa: Spesa | null; aperta: boolean; onChiudi: () => void; mese?: string }) {
  const rif = useRiferimenti();
  const inizio = rif.profilo?.inizio_mese ?? 1;
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [frequenza, setFrequenza] = useState<Frequenza>('mese');
  const [ogniN, setOgniN] = useState('6');
  const [dataScad, setDataScad] = useState(''); // GG/MM/AAAA: la prossima scadenza (o l'unica)
  const [dataIniziale, setDataIniziale] = useState('');
  const [giornoMese, setGiornoMese] = useState('');
  const [importo, setImporto] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  const [gruppo, setGruppo] = useState<string | null>(null);
  const [raccolto, setRaccolto] = useState('');
  const div = useDivisione({ aperta, voce: 'spesa', rotta: '/spese-previste', origine: spesa ? { id: spesa.id, mia: spesa.mia, condiviso: spesa.condivisa, miaPercentuale: spesa.mia_percentuale } : null });

  // Aprire una spesa ricevuta la segna come vista: sparisce l'etichetta «Nuova».
  useEffect(() => {
    if (aperta && spesa?.nuova) crea(`/spese-previste/${spesa.id}/vista`).catch(() => {});
  }, [aperta, spesa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aperta) return;
    const s = spesa;
    setNome(s?.nome ?? ''); setCategoria(s?.categoria_id ?? null); setImporto(importoInTesto(s?.importo)); setConto(s?.conto_id ?? null); setGruppo(s?.gruppo_id ?? null);
    setFrequenza(!s || s.ogni_mesi === 1 ? 'mese' : s.ogni_mesi === null ? 'una' : 'n'); setOgniN(String(s?.ogni_mesi && s.ogni_mesi > 1 ? s.ogni_mesi : 6));
    setGiornoMese(s?.ogni_mesi === 1 && s.giorno_mese ? String(s.giorno_mese) : '');
    const prossima = s && s.ogni_mesi !== 1 ? (s.ogni_mesi === null ? s.prossima_scadenza : proxSpesaDaPagare(s, oggiIso(), inizio) ?? s.prossima_scadenza) : null;
    setDataScad(dataInTesto(prossima)); setDataIniziale(dataInTesto(prossima));
    setRaccolto(importoInTesto(s?.raccolto));
  }, [aperta, spesa]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = async () => {
    if (!spesa || spesa.mia) div.controlla();
    const valore = serve(leggiImporto(importo), 'Scrivi l’importo, es. 117,80', 'importo');
    const ogni = frequenza === 'mese' ? 1 : frequenza === 'una' ? null : Number(ogniN);
    if (ogni !== null && (!Number.isInteger(ogni) || ogni < 1)) serve(null, 'Scrivi ogni quanti mesi, es. 6', 'ogniN');
    let prima: string | null = null;
    let senzaGiorno = false;
    if (ogni !== 1) {
      const iso = serve(leggiData(dataScad), ogni === null ? 'Scegli il giorno in cui esce' : 'Scegli la prossima scadenza', 'scadenza');
      // Se la data non è stata toccata resta quella salvata (anche «senza giorno»).
      if (spesa && dataScad === dataIniziale && spesa.prossima_scadenza && spesa.ogni_mesi !== 1) { prima = spesa.prossima_scadenza; senzaGiorno = spesa.senza_giorno; } else prima = iso;
    }
    const g = giornoMese ? Number(giornoMese) : null;
    const corpo = { nome: serve(nome.trim(), 'Scrivi il nome', 'nome'), importo: valore, ogni_mesi: ogni, prossima_scadenza: prima, senza_giorno: senzaGiorno, giorno_mese: ogni === 1 ? g : null,
      conto_id: conto, gruppo_id: gruppo, categoria_id: categoria, ...(ogni !== 1 && spesa && spesa.ogni_mesi !== 1 && raccolto !== importoInTesto(spesa.raccolto)
        ? { raccolto: serve(leggiImporto(raccolto), 'Scrivi quanto hai raccolto, es. 150 (anche negativo)', 'raccolto') } : {}) };
    const salvata = spesa ? await modifica<Spesa>(`/spese-previste/${spesa.id}`, corpo) : await crea<Spesa>('/spese-previste', corpo);
    if (spesa && !spesa.mia) return; // la divisione la decide chi l'ha creata
    await div.salva(salvata.id);
  };

  // «Segna pagata»: la spunta d'uscita della scadenza in corso (per_mese = il mese che si guarda nella pagina Uscite); se è già pagata, la toglie.
  const segnaPagata = async () => {
    if (!spesa) return;
    const rotta = `/spese-previste/${spesa.id}/spunta`;
    if (spesa.uscita) await cancella(`${rotta}?mese=${mese}`); else await crea(rotta, { mese });
  };
  const pagabile = !!spesa && spesa.ogni_mesi !== 1 && !!mese;

  const percentuale = div.divisione === 'no' ? 100 : div.divisione === 'meta' ? 50 : Number(div.miaQuota.replace(',', '.')) || 0;
  const cifra = leggiImporto(importo);
  const aiutoImporto = cifra ? `La tua quota: ${euro((Number(cifra) * percentuale) / 100)}` : undefined;
  const isoScad = leggiData(dataScad);
  const nN = Number(ogniN);
  const aiutoScadenza = frequenza === 'n' && isoScad && Number.isInteger(nN) && nN >= 1 ? `Poi ${poiDate(isoScad, nN)}` : undefined;
  const altro = div.nomeAltro ?? 'l’altra persona';
  const nessuno = !!div.persone && div.persone.length === 0;
  const mostraQuota = div.condiviso || div.divisione !== 'no';

  // Come l'API: ognuno ha la sua quota calcolata da sola e arrotondata al centesimo (api/src/spese.ts).
  let avvisoCentesimi: string | null = null;
  if (div.condiviso && div.divisione !== 'no' && cifra && percentuale > 0 && percentuale < 100) {
    const tondo = (n: number) => Math.round(n * 100) / 100;
    const importoNum = Number(cifra);
    const esatta = (importoNum * percentuale) / 100;
    const mia = tondo(esatta);
    const sua = tondo((importoNum * (100 - percentuale)) / 100);
    const differenza = Math.round((importoNum - mia - sua) * 100);
    if (Math.abs(esatta * 100 - Math.round(esatta * 100)) > 1e-6 || differenza !== 0) {
      const dettaglio = differenza > 0 ? `manca ${euro(differenza / 100)}` : differenza < 0 ? `avanza ${euro(-differenza / 100)}` : 'la somma torna';
      avvisoCentesimi = `${euro(importoNum)} non si divide ${div.divisione === 'meta' ? 'a metà ' : ''}al centesimo: la tua quota sarà ${euro(mia)} e quella di ${altro} ${euro(sua)} (${dettaglio}). Se vuoi che torni, scegli «Altra quota» e scrivi le cifre.`;
    }
  }

  // La cesta: quanto hai raccolto sulla tua quota della scadenza (un numero sulla spesa: il saldo lo muove la quota spuntata, non lui).
  const quotaCesta = spesa ? Number(spesa.mia_quota) : 0;
  const raccoltoNum = Number(leggiImporto(raccolto) ?? spesa?.raccolto ?? 0);
  const percRaccolto = quotaCesta > 0 ? Math.round((Math.max(0, raccoltoNum) / quotaCesta) * 100) : 0;

  return (
    <FinestraModulo titolo={spesa ? 'Modifica spesa' : 'Nuova spesa'} aperta={aperta} onChiudi={onChiudi} onSalva={salva} testaTelefono senzaTessera
      azioniExtra={pagabile ? ({ esegui, lavoro }) => <Pulsante tipo="secondario" etichetta={spesa!.uscita ? 'Togli pagamento' : 'Segna pagata'} icona={spesa!.uscita ? 'undo-2' : 'circle-check'} onPress={esegui(segnaPagata)} disattivato={lavoro} /> : undefined}
      onElimina={spesa?.mia ? () => cancella(`/spese-previste/${spesa.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina spesa"
      confermaElimina={spesa ? { nome: `«${spesa.nome}»`, dettaglio: spesa.condivisa ? 'Sparisce anche per l’altra persona.' : 'Sparisce dalla lista.' } : undefined}>
      <Affiancati>
        <Meta><ConErrore campo="nome"><Campo etichetta="Nome" valore={nome} onCambia={setNome} segnaposto="Es. Luce, gas, TIM" autoFocus={!spesa} /></ConErrore></Meta>
        <Meta>
          <View style={{ gap: d['spazio-testo'] }}>
            <Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, 'uscita')} onCambia={setCategoria} iconaPrima="tags" segnaposto="Scegli la categoria" />
            {spesa && !spesa.mia ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`La categoria è solo tua: ${spesa.creata_da ?? 'chi l’ha creata'} ha la sua.`}</Testo> : null}
          </View>
        </Meta>
      </Affiancati>
      <Voce etichetta="Quando si ripete">
        <SceltaSegmenti etichetta="Quando si ripete" larghezzaPiena valore={frequenza} onCambia={setFrequenza}
          opzioni={[{ valore: 'mese', testo: 'Ogni mese' }, { valore: 'n', testo: 'Ogni N mesi' }, { valore: 'una', testo: 'Una volta' }]} />
      </Voce>
      {frequenza === 'n' ? (
        <Affiancati>
          <Meta><ConErrore campo="ogniN"><Campo etichetta="Si ripete ogni (mesi)" valore={ogniN} onCambia={(t) => setOgniN(t.replace(/\D/g, ''))} inputMode="numeric" segnaposto="Es. 6" aiuto="12 mesi = una volta l’anno" /></ConErrore></Meta>
          <Meta><ConErrore campo="scadenza"><CampoData etichetta="Prossima scadenza" valore={dataScad} onCambia={setDataScad} aiuto={aiutoScadenza} /></ConErrore></Meta>
        </Affiancati>
      ) : frequenza === 'una' ? (
        <ConErrore campo="scadenza"><CampoData etichetta="Scadenza" valore={dataScad} onCambia={setDataScad} /></ConErrore>
      ) : (
        <TendinaGiorni etichetta="Giorno del mese (facoltativo)" valore={giornoMese} onCambia={setGiornoMese} />
      )}
      <Affiancati>
        <Meta><ConErrore campo="importo"><Campo etichetta="Importo a ogni scadenza" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" aiuto={aiutoImporto} /></ConErrore></Meta>
        <Meta><Tendina etichetta="Conto (solo etichetta)" valore={conto ?? ''} opzioni={[{ valore: '', testo: 'Nessun conto' }, ...opzioniConti(rif.conti, { tenere: [conto] })]} onCambia={(v) => setConto(v || null)} iconaPrima="wallet" /></Meta>
      </Affiancati>
      <Tendina etichetta="Gruppo" valore={gruppo ?? ''} opzioni={[{ valore: '', testo: 'Nessun gruppo' }, ...opzioniGruppi(rif.gruppi)]} onCambia={(v) => setGruppo(v || null)} iconaPrima="folder" />
      {!spesa || spesa.mia ? (
        <View style={{ gap: d['spazio-blocco'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <View style={{ flex: 1, minWidth: 0, gap: d['spazio-testo'] }}>
              <Testo stile="dettaglio-forte">{`Divisa con ${altro}`}</Testo>
              {nessuno ? <Testo stile="dettaglio-normale" colore="testo-secondario">Non c’è ancora nessun altro utente nel sistema.</Testo> : null}
            </View>
            <Interruttore acceso={div.condiviso} onCambia={(v) => { div.setCondiviso(v); if (!v) div.setDivisione('no'); else if (div.divisione === 'no') div.setDivisione('meta'); }} etichetta={`Divisa con ${altro}`} disattivato={nessuno && !div.condiviso} />
          </View>
          {div.persone && div.persone.length > 1 && div.condiviso ? (
            <ConErrore campo="condivisione">
              <Tendina etichetta="Con chi" valore={div.conEff} iconaPrima="user" disattivato={div.bloccata} onCambia={div.setCon} segnaposto="Scegli una persona" opzioni={div.persone.map((p) => ({ valore: p.id, testo: p.nome }))} />
            </ConErrore>
          ) : null}
          {mostraQuota ? (
            <>
              <SceltaSegmenti etichetta="Come la dividete" larghezzaPiena valore={div.divisione} onCambia={div.setDivisione}
                opzioni={[{ valore: 'no', testo: 'Solo io' }, { valore: 'meta', testo: 'A metà' }, { valore: 'altra', testo: 'Altra quota' }]} />
              {div.divisione === 'altra' ? <ConErrore campo="quota"><Campo etichetta="La tua quota in %" valore={div.miaQuota} onCambia={div.setMiaQuota} inputMode="decimal" /></ConErrore> : null}
              {avvisoCentesimi ? <Esito tono="attenzione" testo={avvisoCentesimi} /> : null}
            </>
          ) : null}
        </View>
      ) : <Testo stile="dettaglio-normale" colore="testo-secondario">{`Condivisa con te: la tua quota è ${spesa.mia_percentuale}%. Può cambiarla solo chi l'ha creata.`}</Testo>}
      {spesa && spesa.ogni_mesi !== 1 && frequenza !== 'mese' ? (
        <View style={{ gap: d['spazio-icona'] }}>
          <Testo stile="dettaglio-forte">Cesta</Testo>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-colonne'] }}>
            <Testo colore={raccoltoNum < 0 ? 'testo-errore' : 'testo-primario'}>{`Raccolti ${euro(raccoltoNum)} di ${euro(quotaCesta)}`}</Testo>
            <Barra valore={percRaccolto} tono={raccoltoNum < 0 ? 'errore' : percRaccolto >= 100 ? 'ok' : 'accento'} />
          </View>
          <ConErrore campo="raccolto">
            <Campo etichetta="Raccolto (correggilo a mano)" valore={raccolto} onCambia={setRaccolto} inputMode="decimal" segnaposto="0,00"
              aiuto="Sale con la spunta della quota del mese, scende quando segni la spesa pagata e la correggi a mano quando vuoi." />
          </ConErrore>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
