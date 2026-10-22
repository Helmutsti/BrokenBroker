import { useEffect, useState } from 'react';
import { SceltaSegmenti } from '../componenti/base.tsx';
import { Campo, CampoData, Tendina } from '../componenti/campi.tsx';
import { cancella, crea, leggi, modifica } from '../dati/api.ts';
import { opzioniCategorie, useRiferimenti } from '../dati/contesto.tsx';
import type { Movimento } from '../dati/tipi.ts';
import { dataInTesto, importoInTesto, leggiData, leggiImporto, oggiIso } from '../formato.ts';
import { Affiancati, FinestraModulo, Meta, serve, Voce } from './moduli.tsx';

type Tipo = 'uscita' | 'entrata' | 'trasferimento';

// Aggiungi o modifica un movimento (F8-F10). Inserimento veloce: basta importo
// ed esercente; conto e categoria si propongono dall'ultima volta.
export function FinestraMovimento({ aperta, onChiudi, movimento }: { aperta: boolean; onChiudi: () => void; movimento?: Movimento | null }) {
  const rif = useRiferimenti();
  const [tipo, setTipo] = useState<Tipo>('uscita');
  const [importo, setImporto] = useState('');
  const [esercente, setEsercente] = useState('');
  const [data, setData] = useState(dataInTesto(oggiIso()));
  const [conto, setConto] = useState<string | null>(null);
  const [aConto, setAConto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [descrizione, setDescrizione] = useState('');

  useEffect(() => {
    if (!aperta) return;
    const m = movimento;
    setTipo(m ? (m.trasferimento_id ? 'trasferimento' : Number(m.importo) > 0 ? 'entrata' : 'uscita') : 'uscita');
    setImporto(m ? importoInTesto(Math.abs(Number(m.importo))) : '');
    setEsercente(m?.esercente ?? ''); setDescrizione(m?.descrizione ?? '');
    setData(dataInTesto(m?.data ?? oggiIso()));
    setConto(m?.conto_id ?? rif.conti.find((c) => c.mio)?.id ?? null); setAConto(null);
    setCategoria(m?.categoria_id ?? null);
  }, [aperta, movimento]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dall'esercente si propongono conto e categoria dell'ultima volta.
  const suggerisci = async () => {
    if (movimento || !esercente.trim() || categoria) return;
    try {
      const s = await leggi<{ categoria_id: string | null; conto_id: string | null }>(`/movimenti/suggerimento?esercente=${encodeURIComponent(esercente.trim())}`);
      if (s.categoria_id) setCategoria(s.categoria_id);
      if (s.conto_id) setConto(s.conto_id);
    } catch { /* nessun suggerimento */ }
  };

  const salva = async () => {
    const valore = serve(leggiImporto(importo), 'Scrivi un importo, es. 12,50');
    if (Number(valore) <= 0) throw new Error("L'importo deve essere maggiore di zero");
    const giorno = serve(leggiData(data), 'Scrivi la data come GG/MM/AAAA');
    if (tipo === 'trasferimento') {
      if (movimento) { await modifica(`/movimenti/${movimento.id}`, { data: giorno, descrizione: descrizione || null }); return; }
      await crea('/movimenti/trasferimento', { da_conto_id: serve(conto, 'Scegli il conto di partenza'), a_conto_id: serve(aConto, 'Scegli il conto di arrivo'), importo: valore, data: giorno, descrizione: descrizione || undefined });
      return;
    }
    const corpo = { importo: tipo === 'uscita' ? `-${valore}` : valore, esercente: esercente || null, data: giorno, conto_id: serve(conto, 'Scegli il conto'), categoria_id: categoria, descrizione: descrizione || null };
    if (movimento) await modifica(`/movimenti/${movimento.id}`, corpo);
    else await crea('/movimenti', corpo);
  };

  const opzioniConti = rif.conti.filter((c) => !c.archiviato).map((c) => ({ valore: c.id, testo: c.nome }));
  return (
    <FinestraModulo titolo={movimento ? 'Modifica movimento' : 'Aggiungi spesa'} icona={tipo === 'trasferimento' ? 'arrow-left-right' : 'plus'} aperta={aperta} onChiudi={onChiudi} onSalva={salva}
      onElimina={movimento ? () => cancella(`/movimenti/${movimento.id}`).then(() => undefined) : undefined}>
      {!movimento ? (
        <SceltaSegmenti etichetta="Tipo di movimento" larghezzaPiena valore={tipo} onCambia={setTipo}
          opzioni={[{ valore: 'uscita', testo: 'Uscita' }, { valore: 'entrata', testo: 'Entrata' }, { valore: 'trasferimento', testo: 'Sposta tra conti' }]} />
      ) : null}
      <Affiancati>
        <Meta><Campo etichetta="Importo" valore={importo} onCambia={setImporto} segnaposto="0,00" inputMode="decimal" autoFocus={!movimento} disattivato={!!movimento?.trasferimento_id} /></Meta>
        <Meta><CampoData etichetta="Data" valore={data} onCambia={setData} /></Meta>
      </Affiancati>
      {tipo === 'trasferimento' ? (
        <Affiancati>
          <Meta><Tendina etichetta="Da" valore={conto} opzioni={opzioniConti} onCambia={setConto} disattivato={!!movimento} /></Meta>
          <Meta><Tendina etichetta="A" valore={aConto} opzioni={opzioniConti.filter((o) => o.valore !== conto)} onCambia={setAConto} disattivato={!!movimento} segnaposto={movimento ? 'Già impostato' : 'Scegli…'} /></Meta>
        </Affiancati>
      ) : (
        <>
          <Campo etichetta={tipo === 'entrata' ? 'Da chi' : 'Esercente'} valore={esercente} onCambia={setEsercente} segnaposto={tipo === 'entrata' ? 'Es. stipendio ottobre' : 'Es. Esselunga'}
            onUscita={suggerisci} aiuto={!movimento ? 'Conto e categoria si propongono da soli dall’ultima volta' : undefined} />
          <Affiancati>
            <Meta><Tendina etichetta="Conto" valore={conto} opzioni={opzioniConti} onCambia={setConto} /></Meta>
            <Meta><Tendina etichetta="Categoria" valore={categoria} opzioni={opzioniCategorie(rif.categorie, tipo)} onCambia={setCategoria} iconaPrima="tags" /></Meta>
          </Affiancati>
        </>
      )}
      <Voce etichetta="Nota">
        <Campo valore={descrizione} onCambia={setDescrizione} segnaposto="Facoltativa" />
      </Voce>
    </FinestraModulo>
  );
}
