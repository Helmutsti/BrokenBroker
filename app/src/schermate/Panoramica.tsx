import { useState } from 'react';
import { View } from 'react-native';
import { Esito, Pulsante, Separatore } from '../componenti/base.tsx';
import { Intestazione, NumeroChiave, RigaAvanzamento, RigaRata, Scheda, SelettorePeriodo, TitoloGruppo, VoceBudget, VoceDaSpuntare, Vuoto } from '../componenti/composti.tsx';
import { cancella, crea, useDati } from '../dati/api.ts';
import { useRiferimenti } from '../dati/contesto.tsx';
import type { ControlloRate, ElencoSpese, Proiezione, Rata, RiepilogoMese, Spesa } from '../dati/tipi.ts';
import { data, euro, euroTondi, nomeMese, nomeMeseMinuscolo, oggiIso } from '../formato.ts';
import { d, Testo } from '../tema/tema.tsx';
import { Caricamento, prossimaScadenza, scadenzaRataNel } from './comuni.tsx';
import { FinestraSpesa } from './SpesePreviste.tsx';

// SC-01 Panoramica: la lista del mese da spuntare (decisione 19), i budget che
// si riempiono, quanto resta davvero e cosa succede se nulla cambia.
export function Panoramica() {
  const rif = useRiferimenti();
  const { mese, setMese } = rif;
  const riepilogo = useDati<RiepilogoMese>(`/analisi/mese?mese=${mese}`);
  const spese = useDati<ElencoSpese>(`/spese-previste?mese=${mese}`);
  const rate = useDati<Rata[]>('/rate').dati ?? [];
  const proiezione = useDati<Proiezione>('/analisi/proiezione').dati;
  const controllo = useDati<ControlloRate>('/analisi/rate').dati;
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<Spesa | null>(null);

  const r = riepilogo.dati, el = spese.dati;
  if (!r || !el) return <Caricamento errore={riepilogo.errore ?? spese.errore} />;
  const p = el.periodo;
  const delMese = el.spese.filter((s) => s.nel_mese && !s.obiettivo_id);
  const fisse = delMese.filter((s) => s.tipo === 'fissa');
  const budget = delMese.filter((s) => s.tipo === 'budget');
  const investimenti = delMese.filter((s) => s.tipo === 'investimento');
  const rateMese = rate.map((x) => ({ r: x, quando: scadenzaRataNel(x, p.dal, p.al) })).filter((x) => x.quando);

  const spunta = async (s: Spesa) => {
    setErrore(null);
    try {
      if (s.uscita) await cancella(`/spese-previste/${s.id}/spunta?mese=${mese}`);
      else await crea(`/spese-previste/${s.id}/spunta`, { mese });
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

  // Prossime scadenze delle spese che non escono ogni mese.
  const annuali = el.spese.filter((s) => s.attiva && s.tipo === 'fissa' && s.ogni_mesi !== 1)
    .map((s) => ({ s, quando: prossimaScadenza(s.prossima_scadenza, s.ogni_mesi) })).filter((x) => x.quando)
    .sort((a, b) => a.quando!.localeCompare(b.quando!)).slice(0, 4);

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
      <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
        <NumeroChiave etichetta="Entrate" valore={euro(Number(r.reali.entrate) || r.stipendio)} nota={Number(r.reali.entrate) ? 'Arrivate sui conti' : 'Stipendio del profilo'} icona="arrow-down-left" />
        <NumeroChiave etichetta="Uscite del mese" valore={euro(r.reali.uscite)} nota={`Da pagare ancora ${euro(r.da_pagare.totale)}`} icona="arrow-up-right" />
        <NumeroChiave etichetta="Quota spese annuali" valore={euro(r.voci.periodiche_mensilizzate)} nota="Le spese ogni N mesi divise per mese" icona="calendar" />
        <NumeroChiave etichetta="Resta davvero" valore={euro(resta, { segno: true })} icona="scale" tono={tonoResta}
          nota={resta < 0 ? 'Si spende più di quanto entra' : r.risparmio_percentuale !== null ? `Risparmi il ${String(r.risparmio_percentuale).replace('.', ',')}% dello stipendio` : 'Scrivi lo stipendio nelle impostazioni'} />
      </View>
      {errore ? <Esito tono="errore" testo={errore} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: d['spazio-blocco'] }}>
        <Scheda titolo="Da pagare questo mese" nota="Spunta quando esce" icona="list-checks" style={{ flex: 1 }}>
          <View style={{ gap: d['spazio-elenco'] }}>
            {delMese.length === 0 && rateMese.length === 0 ? <Vuoto testo="Nessuna spesa prevista in questo mese. Aggiungile dalla sezione Spese previste." /> : null}
            {fisse.length ? <TitoloGruppo testo="Fisse" /> : null}
            {fisse.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.conto ?? '—'} importo={euro(s.mia_quota)} icona={s.icona ?? 'ellipsis'} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setAperta(s)} />)}
            {budget.length ? <TitoloGruppo testo="Budget del mese · si riempiono con le spese" /> : null}
            {budget.map((s) => (
              <VoceBudget key={s.id} nome={s.nome} nota={notaBudget(s)} conto={s.conto ?? '—'} importo={`${euroTondi(s.speso ?? 0).replace(' €', '')} / ${euroTondi(s.importo)}`}
                icona={s.icona ?? 'ellipsis'} valore={(Number(s.speso ?? 0) / Number(s.importo)) * 100} stato={budgetStato(s)} onApri={() => setAperta(s)} />
            ))}
            {rateMese.length ? <TitoloGruppo testo="Rate" /> : null}
            {rateMese.map(({ r: x, quando }) => <VoceDaSpuntare key={x.id} nome={x.oggetto} conto={`il ${Number(quando!.slice(8, 10))} · ${x.finanziaria ?? ''}`} importo={euro(x.importo_rata)} icona="credit-card" fatta={quando! <= oggiIso()} />)}
            {investimenti.length ? <TitoloGruppo testo="Investimenti" /> : null}
            {investimenti.map((s) => <VoceDaSpuntare key={s.id} nome={s.nome} conto={s.conto ?? '—'} importo={euro(s.mia_quota)} icona={s.icona ?? 'trending-up'} fatta={s.uscita} onSpunta={() => spunta(s)} onApri={() => setAperta(s)} />)}
            <Separatore />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: d['spazio-icona'] }}>
              <Testo colore="testo-secondario">{`${r.da_pagare.numero} da pagare · ${euro(r.da_pagare.totale)}`}</Testo>
              <Testo stile="corpo-forte" colore={Number(r.budget_residuo) > 0 ? 'testo-secondario' : 'testo-attenzione'}>{`Budget ancora da spendere ${euro(r.budget_residuo)}`}</Testo>
            </View>
          </View>
        </Scheda>
        <View style={{ width: 400, gap: d['spazio-blocco'] }}>
          <Scheda titolo="Dove vanno i soldi" icona="chart-pie">
            <View style={{ gap: d['spazio-elenco'] }}>
              {dove.length === 0 ? <Vuoto testo="Ancora niente in questo mese." /> : null}
              {dove.map((x) => <RigaAvanzamento key={x.nome} compatta nome={x.nome} importo={euro(x.totale)} valore={(x.totale / massimo) * 100} icona={x.icona} />)}
            </View>
          </Scheda>
          <Scheda titolo="Prossime scadenze" icona="calendar-clock">
            {annuali.length === 0 ? <Vuoto testo="Nessuna spesa annuale o una tantum in arrivo." /> : (
              <View>{annuali.map(({ s, quando }) => <RigaRata key={s.id} compatta icona={s.icona ?? 'calendar'} nome={s.nome} fine={nomeMeseMinuscolo(quando!.slice(0, 7))} rata={euro(s.mia_quota)} onApri={() => setAperta(s)} />)}</View>
            )}
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
        </View>
      </View>
      {proiezione ? (
        <Scheda titolo="Se nulla cambia" nota="Patrimonio con l'avanzo di ogni mese, contando la fine delle rate" icona="trending-up">
          <View style={{ flexDirection: 'row', gap: d['spazio-blocco'] }}>
            {[1, 12, 60].map((m) => {
              const punto = proiezione.punti.find((x) => x.mesi === m);
              const v = Number(punto?.patrimonio ?? 0);
              return <NumeroChiave key={m} etichetta={m === 1 ? 'Fra 1 mese' : m === 12 ? 'Fra 1 anno' : 'Fra 5 anni'} valore={euroTondi(v)} icona="trending-up" tono={v >= Number(proiezione.partenza) ? 'ok' : 'errore'} />;
            })}
          </View>
        </Scheda>
      ) : null}
      <FinestraSpesa spesa={aperta} aperta={!!aperta} onChiudi={() => setAperta(null)} />
      <View style={{ alignItems: 'flex-start' }}><Pulsante tipo="testo" etichetta="Aggiungi una spesa fuori lista" icona="plus" onPress={rif.nuovoMovimento} /></View>
    </>
  );
}
