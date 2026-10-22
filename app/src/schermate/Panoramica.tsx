import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { View } from 'react-native';
import { Barra, Esito, Pulsante, Separatore } from '../componenti/base.tsx';
import { Intestazione, NumeroChiave, RigaAvanzamento, RigaRata, RigaScadenzaAnnuale, Scheda, SelettorePeriodo, TitoloGruppo, VoceBudget, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, ElencoSpese, Obiettivo, Proiezione, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, euro, euroTondi, meseCorto, nomeMese, nomeMeseMinuscolo, oggiIso, percento } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, eAnnuale, fraMesi, prossimeAnnuali, ritmoObiettivo, scadenzaRataNel } from './comuni.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';

// SC-01 Panoramica (proposta v2): le spese del mese da spuntare (decisione 19)
// separate dalle annuali, che si preparano col salvadanaio; a destra obiettivi
// per scadenza, dove vanno i soldi, rate e cosa succede se nulla cambia.
export function Panoramica() {
  const rif = useRiferimenti();
  const navigazione = useNavigation();
  const { mese, setMese } = rif;
  const riepilogo = useDati<RiepilogoMese>(`/analisi/mese?mese=${mese}`);
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const rate = useDati<Rata[]>(`/rate?mese=${mese}`).dati ?? [];
  const obiettivi = useDati<Obiettivo[]>('/obiettivi').dati ?? [];
  const proiezione = useDati<Proiezione>('/analisi/proiezione').dati;
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<Spesa | null>(null);

  const r = riepilogo.dati, el = spese.dati;
  if (!r || !el) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  const p = el.periodo;
  // In ordine di uscita: prima le spese del giorno 1, poi quelle senza giorno; a parità, per nome.
  const perUscita = (a: Spesa, b: Spesa) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999') || a.nome.localeCompare(b.nome);
  const conGiorno = (s: Spesa) => [s.scadenza ? `il ${Number(s.scadenza.slice(8, 10))}` : null, s.conto].filter(Boolean).join(' · ') || '—';
  const delMese = el.spese.filter((s) => s.nel_mese && !s.obiettivo_id && !eAnnuale(s)).sort(perUscita);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const budget = delMese.filter((s) => s.tipo === 'budget');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento');
  const rateMese = rate.map((x) => ({ r: x, quando: x.scadenza ?? scadenzaRataNel(x, p.dal, p.al) })).filter((x) => x.quando).sort((a, b) => a.quando!.localeCompare(b.quando!));

  const spunta = async (s: Spesa) => {
    setErrore(null);
    try {
      if (s.uscita) await cancella(`/spese-previste/${s.id}/spunta?mese=${mese}`);
      else await crea(`/spese-previste/${s.id}/spunta`, { mese });
    } catch (e) { setErrore((e as Error).message); }
  };
  const spuntaRata = async (x: Rata) => {
    setErrore(null);
    try {
      if (x.movimento_id) await cancella(`/rate/${x.id}/spunta?mese=${mese}`);
      else await crea(`/rate/${x.id}/spunta`, { mese });
    } catch (e) { setErrore((e as Error).message); }
  };

  // Dove vanno i soldi: la propria quota per categoria principale, rate a parte.
  const perCategoria = new Map<string, { nome: string; icona: string; totale: number }>();
  for (const s of delMese) {
    const nome = s.tipo === 'investimento' ? 'Investimenti' : s.categoria_padre ?? s.categoria ?? 'Senza categoria';
    const v = perCategoria.get(nome) ?? { nome, icona: s.tipo === 'investimento' ? 'trending-up' : rif.iconaCategoria(rif.categoria(s.categoria_id)?.padre_id ?? s.categoria_id), totale: 0 };
    v.totale += s.tipo === 'budget' ? Math.max(Number(s.importo), Number(s.speso ?? 0)) * s.mia_percentuale / 100 : Number(s.mia_quota);
    perCategoria.set(nome, v);
  }
  if (rateMese.length) perCategoria.set('Rate', { nome: 'Rate', icona: 'credit-card', totale: rateMese.reduce((t, x) => t + Number(x.r.importo_rata), 0) });
  const dove = [...perCategoria.values()].sort((a, b) => b.totale - a.totale).slice(0, 6);
  const massimo = Math.max(1, ...dove.map((x) => x.totale));

  // Spese annuali: quelle che escono in questo mese si spuntano; le prossime
  // dicono se il salvadanaio le copre.
  const annualiDelMese = el.spese.filter((s) => s.nel_mese && eAnnuale(s)).sort(perUscita);
  const annuali = prossimeAnnuali(el.spese, obiettivi);
  const prossime = annuali.elenco.filter((x) => !annualiDelMese.some((s) => s.id === x.s.id));
  const mostrate = prossime.slice(0, 5), altre = prossime.slice(5);
  const annuo = el.spese.filter(eAnnuale).reduce((t, s) => t + (Number(s.mia_quota) * 12) / s.ogni_mesi!, 0);
  const meseDi = (iso: string) => `${nomeMeseMinuscolo(iso.slice(0, 7))}${iso.slice(0, 4) !== oggiIso().slice(0, 4) ? ` ${iso.slice(0, 4)}` : ''}`;

  // Obiettivi con scadenza, dal più vicino: quanto versare al mese per arrivarci.
  const conScadenza = obiettivi.filter((o) => o.scadenza && o.scadenza >= oggiIso() && (o.percentuale ?? 0) < 100).sort((a, b) => a.scadenza!.localeCompare(b.scadenza!));
  const serveAlMese = conScadenza.reduce((t, o) => t + (ritmoObiettivo(o).alMese ?? 0), 0);

  // Il conto del mese: entrate − spese del mese − quota delle annuali = resta davvero.
  const speseMese = Number(r.voci.fisse) + Number(r.voci.budget) + Number(r.voci.investimenti) + Number(r.voci.rate);
  const giaUscite = Math.max(0, speseMese - Number(r.da_pagare.totale) - Math.max(0, Number(r.budget_residuo)));
  const resta = Number(r.resta);
  const tonoResta = resta < 0 ? 'errore' : r.semaforo === 'ok' ? 'ok' : r.semaforo === 'attenzione' ? 'attenzione' : 'normale';
  const budgetStato = (s: Spesa) => { const pct = (Number(s.speso ?? 0) / Number(s.importo)) * 100; return pct > 100 ? 'superato' : pct >= 80 ? 'attenzione' : 'normale'; };
  const giorniRestanti = Math.max(1, Math.round((Date.parse(p.al) - Date.parse(oggiIso() > p.al ? p.al : oggiIso() < p.dal ? p.dal : oggiIso())) / 86400000) + 1);
  const notaBudget = (s: Spesa) => {
    const resto = Number(s.importo) - Number(s.speso ?? 0);
    return resto < 0 ? `Sforato di ${euro(-resto)}` : `Ne restano ${euro(resto)} · ${euro(resto / giorniRestanti)} al giorno per ${giorniRestanti} giorni`;
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: 1 }}>
          <Intestazione titolo={nomeMese(mese)} sottotitolo={`${r.stipendio !== '0.00' ? `Stipendio ${euro(r.stipendio)} · ` : ''}il mese va dal ${data(p.dal, 'corta')} al ${data(p.al, 'corta')}`} />
        </View>
        <SelettorePeriodo mese={mese} meseOggi={rif.meseOggi} onCambia={setMese} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Entrate" valore={euro(r.stipendio)} nota={Number(r.reali.entrate) ? `Arrivate sui conti ${euro(r.reali.entrate)}` : 'Stipendio del profilo'} icona="arrow-down-left" />
        <Testo stile="numero-grande" colore="testo-terziario" aria-hidden>−</Testo>
        <NumeroChiave etichetta="Spese del mese" valore={euro(speseMese)} nota={`Già uscite ${euro(giaUscite)} · da pagare ${euro(r.da_pagare.totale)}`} icona="arrow-up-right" />
        <Testo stile="numero-grande" colore="testo-terziario" aria-hidden>−</Testo>
        <NumeroChiave etichetta="Per le annuali" valore={euro(r.voci.periodiche_mensilizzate)} nota="Da mettere via ogni mese" icona="calendar" />
        <Testo stile="numero-grande" colore="testo-terziario" aria-hidden>=</Testo>
        <NumeroChiave etichetta="Resta davvero" valore={euro(resta, { segno: true })} icona="scale" tono={tonoResta}
          nota={resta < 0 ? 'Si spende più di quanto entra' : r.risparmio_percentuale !== null ? `Risparmi il ${String(r.risparmio_percentuale).replace('.', ',')}% dello stipendio` : 'Scrivi lo stipendio nelle impostazioni'} />
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <View style={{ flex: 1, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Spese del mese" nota="Ogni mese · spunta quando esce" icona="list-checks">
            <View style={{ gap: d['spazio-elenco'] }}>
              <View style={{ gap: d['spazio-testo'], paddingHorizontal: d['margine-voce-h'] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: d['spazio-colonne'] }}>
                  <Testo stile="corpo-forte">{`Già uscite ${euro(giaUscite)} di ${euro(speseMese)}`}</Testo>
                  <Testo stile="corpo-forte" colore={Number(r.da_pagare.totale) > 0 ? 'testo-attenzione' : 'testo-ok'}>{Number(r.da_pagare.totale) > 0 ? `Da pagare ${euro(r.da_pagare.totale)}` : 'Tutto pagato'}</Testo>
                </View>
                <Barra valore={speseMese > 0 ? (giaUscite / speseMese) * 100 : 0} />
                <Testo stile="dettaglio-normale" colore="testo-secondario">Le spese annuali non sono qui: hanno il loro riquadro sotto.</Testo>
              </View>
              <Separatore />
              {delMese.length === 0 && rateMese.length === 0 ? <Vuoto testo="Nessuna spesa prevista in questo mese. Aggiungile dalla sezione Spese previste." /> : null}
              {fisse.length ? <TitoloGruppo testo="Fisse" /> : null}
              {fisse.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} importo={euro(s.mia_quota)} icona={s.icona ?? 'ellipsis'} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setAperta(s)} />)}
              {budget.length ? <TitoloGruppo testo="Budget del mese · si riempiono con le spese" /> : null}
              {budget.map((s) => (
                <VoceBudget key={s.id} nome={s.nome} nota={notaBudget(s)} conto={s.conto ?? '—'} importo={`${euroTondi(s.speso ?? 0).replace(' €', '')} / ${euroTondi(s.importo)}`}
                  icona={s.icona ?? 'ellipsis'} valore={(Number(s.speso ?? 0) / Number(s.importo)) * 100} stato={budgetStato(s)} onApri={() => setAperta(s)} />
              ))}
              {rateMese.length ? <TitoloGruppo testo="Rate" /> : null}
              {rateMese.map(({ r: x, quando }) => <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={`il ${Number(quando!.slice(8, 10))} · ${x.finanziaria ?? ''}`} importo={euro(x.importo_rata)} icona="credit-card" fatta={!!x.movimento_id} onSpunta={() => spuntaRata(x)} />)}
              {investimenti.length ? <TitoloGruppo testo="Investimenti" /> : null}
              {investimenti.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} importo={euro(s.mia_quota)} icona={s.icona ?? 'trending-up'} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setAperta(s)} />)}
              <Separatore />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: d['spazio-icona'], paddingHorizontal: d['margine-voce-h'] }}>
                <Testo colore="testo-secondario">{`${r.da_pagare.numero} da pagare · ${euro(r.da_pagare.totale)}`}</Testo>
                <Testo stile="corpo-forte" colore={Number(r.budget_residuo) > 0 ? 'testo-secondario' : 'testo-attenzione'}>{`Budget ancora da spendere ${euro(r.budget_residuo)}`}</Testo>
              </View>
            </View>
          </Scheda>
          <Scheda titolo="Spese annuali" nota="Ogni anno o ogni N mesi · dal salvadanaio" icona="calendar-clock">
            {annuali.elenco.length === 0 && annualiDelMese.length === 0 ? <Vuoto testo="Nessuna spesa annuale. Aggiungile da Spese previste scegliendo «Ogni anno» o «Ogni N mesi»." /> : (
              <View style={{ gap: d['spazio-elenco'] }}>
                {annuali.conSalvadanaio ? (
                  <RigaAvanzamento nome="Salvadanaio" icona="piggy-bank" importo={`${euro(annuali.nelSalvadanaio)} / ${euro(annuali.serve)}`}
                    valore={annuali.serve > 0 ? (annuali.nelSalvadanaio / annuali.serve) * 100 : 100}
                    percentuale={annuali.serve > 0 ? percento(Math.min(100, Math.round((annuali.nelSalvadanaio / annuali.serve) * 100))) : '100%'}
                    stato={annuali.mancano > 0 ? 'attenzione' : 'completo'} />
                ) : null}
                {annualiDelMese.length ? <TitoloGruppo testo="Escono in questo mese" /> : null}
                {annualiDelMese.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={conGiorno(s)} sottoImporto={`1/12: ${euro(Number(s.mia_quota) / s.ogni_mesi!)}`} importo={euro(s.mia_quota)} icona={s.icona ?? 'calendar'} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setAperta(s)} />)}
                {mostrate.length ? (
                  <View>
                    <TitoloGruppo testo="Prossime uscite" />
                    {mostrate.map((x) => <RigaScadenzaAnnuale key={x.s.id} nome={x.s.nome} quando={`${meseDi(x.quando)} · ${fraMesi(x.quando)}`} importo={euro(x.s.mia_quota)}
                      dodicesimo={euro(Number(x.s.mia_quota) / x.s.ogni_mesi!)} icona={x.s.icona ?? 'calendar'} copertura={x.copertura} onApri={() => setAperta(x.s)} />)}
                  </View>
                ) : null}
                {altre.length ? <Testo stile="dettaglio-normale" colore="testo-secondario" style={{ paddingHorizontal: d['margine-voce-h'] }}>{`Altre ${altre.length} ${altre.length === 1 ? 'voce' : 'voci'} nel resto dell'anno · ${euro(altre.reduce((t, x) => t + Number(x.s.mia_quota), 0))}`}</Testo> : null}
                <Esito tono="informazione" testo={[
                  Number(r.voci.periodiche_mensilizzate) > 0 ? `Ogni mese metti da parte ${euro(r.voci.periodiche_mensilizzate)} per le annuali che paghi dal mese: sono già tolti da «Resta davvero».` : null,
                  annuali.conSalvadanaio ? 'Quelle pagate dal salvadanaio escono dall\'obiettivo e non pesano sul mese.' : null,
                  `In un anno: ${euro(annuo)}.`].filter(Boolean).join(' ')} />
              </View>
            )}
          </Scheda>
        </View>
        <View style={{ width: 400, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Obiettivi" nota="Per scadenza" icona="target">
            <View style={{ gap: d['spazio-elenco'] }}>
              {conScadenza.length === 0 ? <Vuoto testo={obiettivi.length ? 'Nessun obiettivo con una scadenza da rispettare.' : 'Nessun obiettivo ancora.'} /> : null}
              {conScadenza.slice(0, 4).map((o) => {
                const { alMese } = ritmoObiettivo(o);
                return <RigaAvanzamento key={o.id} compatta nome={o.nome} icona="target" valore={o.percentuale ?? 0} percentuale={percento(o.percentuale)}
                  importo={`${meseCorto(o.scadenza!.slice(0, 7))} ${o.scadenza!.slice(0, 4)}${alMese !== null ? ` · ${euroTondi(alMese)}/mese` : ''}`} />;
              })}
              {conScadenza.length ? <Testo stile="dettaglio-normale" colore="testo-secondario">{`In tutto servono ${euroTondi(serveAlMese)} al mese per arrivare in tempo.`}</Testo> : null}
              <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Vedi tutti gli obiettivi" onPress={() => navigazione.navigate('obiettivi' as never)} /></View>
            </View>
          </Scheda>
          <Scheda titolo="Dove vanno i soldi" icona="chart-pie">
            <View style={{ gap: d['spazio-elenco'] }}>
              {dove.length === 0 ? <Vuoto testo="Ancora niente in questo mese." /> : null}
              {dove.map((x) => <RigaAvanzamento key={x.nome} compatta nome={x.nome} importo={euro(x.totale)} valore={(x.totale / massimo) * 100} icona={x.icona} />)}
            </View>
          </Scheda>
          <Scheda titolo="Rate" icona="credit-card" nota={controllo ? `${controllo.rate_attive} aperte · ${euro(controllo.rata_mensile)} al mese` : undefined}>
            {!controllo || controllo.controlli.length === 0 ? <Vuoto testo={controllo?.rate_attive ? 'Imposta le tue regole nelle impostazioni per controllarle.' : 'Nessuna rata aperta.'} /> : (
              <View style={{ gap: d['spazio-elenco'] }}>
                {controllo.controlli.every((x) => x.rispettata)
                  ? <Esito tono="ok" testo="Le rate rispettano le tue regole." />
                  : controllo.controlli.filter((x) => !x.rispettata).map((x) => <Esito key={x.regola} tono="errore" testo={x.testo} />)}
              </View>
            )}
          </Scheda>
          {proiezione ? (
            <Scheda titolo="Se nulla cambia" icona="trending-up">
              <View>
                <Testo stile="dettaglio-normale" colore="testo-secondario">Patrimonio con l'avanzo di ogni mese, contando la fine delle rate</Testo>
                {[1, 12, 60].map((m) => {
                  const punto = proiezione.punti.find((x) => x.mesi === m);
                  return <RigaRata key={m} compatta icona="trending-up" nome={m === 1 ? 'Fra 1 mese' : m === 12 ? 'Fra 1 anno' : 'Fra 5 anni'} fine="" rata={euroTondi(Number(punto?.patrimonio ?? 0))} />;
                })}
              </View>
            </Scheda>
          ) : null}
        </View>
      </View>
      <FinestraSpesa spesa={aperta} aperta={!!aperta} onChiudi={() => setAperta(null)} />
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Aggiungi una spesa fuori lista" icona="plus" onPress={rif.nuovoMovimento} /></View>
    </>
  );
}
