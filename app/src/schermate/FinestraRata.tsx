import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Interruttore } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { cancella, crea, modifica } from '../dati/api.ts';
import { opzioniConti, useRiferimenti } from '../dati/contesto.tsx';
import type { Rata } from '../dati/tipi.ts';
import { dataInTesto, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { aggiungiMesi } from '../mesePersonale.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Affiancati, ConErrore, FinestraModulo, Meta, serve } from './moduli.tsx';

// Una rata (decisione 72): nome, conto (solo etichetta), importo, quante rate e quando parte; l'ultima scadenza si calcola. Le rate non hanno categoria.
export function FinestraRata({ rata, aperta, onChiudi }: { rata: Rata | null; aperta: boolean; onChiudi: () => void }) {
  const rif = useRiferimenti();
  const [oggetto, setOggetto] = useState('');
  const [importo, setImporto] = useState('');
  const [numero, setNumero] = useState('');
  const [prima, setPrima] = useState('');
  const [conto, setConto] = useState<string | null>(null);
  const [chiusa, setChiusa] = useState(false);
  useEffect(() => {
    if (!aperta) return;
    setOggetto(rata?.oggetto ?? ''); setImporto(importoInTesto(rata?.importo_rata)); setNumero(rata ? String(rata.numero_rate) : '');
    setPrima(dataInTesto(rata?.prima_scadenza ?? oggiIso())); setConto(rata?.conto_id ?? null); setChiusa(rata?.chiusa ?? false);
  }, [aperta, rata]);
  const salva = async () => {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 1) serve(null, 'Scrivi quante rate sono, es. 12', 'numero');
    const corpo = { oggetto: serve(oggetto.trim(), 'Scrivi cosa stai pagando a rate', 'oggetto'), importo_rata: serve(leggiImporto(importo), 'Scrivi quanto è la rata, es. 83,60', 'importo'),
      numero_rate: n, prima_scadenza: serve(leggiData(prima), 'Scegli il giorno della prima rata', 'prima'), conto_id: conto, ...(rata ? { chiusa } : {}) };
    if (rata) await modifica(`/rate/${rata.id}`, corpo); else await crea('/rate', corpo);
  };
  const primaIso = leggiData(prima), n = Number(numero);
  const ultima = primaIso && Number.isInteger(n) && n >= 1 ? dataInTesto(aggiungiMesi(primaIso, n - 1)) : '';
  return (
    <FinestraModulo titolo={rata ? 'Modifica rata' : 'Nuova rata'} aperta={aperta} onChiudi={onChiudi} onSalva={salva} testaTelefono senzaTessera
      onElimina={rata ? () => cancella(`/rate/${rata.id}`).then(() => undefined) : undefined} etichettaElimina="Elimina rata"
      confermaElimina={rata ? { nome: `«${rata.oggetto}»`, dettaglio: 'La rata sparisce dal mese e dall’elenco delle rate, comprese quelle già pagate.' } : undefined}>
      <Affiancati>
        <Meta><ConErrore campo="oggetto"><Campo etichetta="Nome" valore={oggetto} onCambia={setOggetto} segnaposto="Es. Pinguino" autoFocus={!rata} /></ConErrore></Meta>
        <Meta><Tendina etichetta="Conto (solo etichetta)" valore={conto ?? ''} opzioni={[{ valore: '', testo: 'Nessun conto' }, ...opzioniConti(rif.conti, { tenere: [conto] })]} onCambia={(v) => setConto(v || null)} iconaPrima="wallet" /></Meta>
      </Affiancati>
      <Affiancati>
        <Meta><ConErrore campo="importo"><Campo etichetta="Importo della rata" valore={importo} onCambia={setImporto} inputMode="decimal" segnaposto="0,00" /></ConErrore></Meta>
        <Meta><ConErrore campo="numero"><Campo etichetta="Numero di rate" valore={numero} onCambia={setNumero} inputMode="numeric" segnaposto="Es. 12" /></ConErrore></Meta>
      </Affiancati>
      <Affiancati>
        <Meta><ConErrore campo="prima"><CampoData etichetta="Prima scadenza" valore={prima} onCambia={setPrima} /></ConErrore></Meta>
        <Meta><Campo etichetta="Ultima scadenza" valore={ultima} onCambia={() => {}} disattivato iconaPrima="calendar" aiuto="Si calcola dalla prima scadenza e dal numero di rate." /></Meta>
      </Affiancati>
      {rata ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-icona'] }}>
          <Interruttore acceso={chiusa} onCambia={setChiusa} etichetta="Chiusa" />
          <Testo style={{ flex: 1 }}>{chiusa ? 'Chiusa: estinta prima della fine, non esce più' : 'Aperta'}</Testo>
        </View>
      ) : null}
    </FinestraModulo>
  );
}
