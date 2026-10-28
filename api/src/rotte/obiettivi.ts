import { Router } from 'express';
import type { PoolClient } from 'pg';
import { conUtente } from '../db.ts';
import { ErroreApi, nonTrovato } from '../errori.ts';
import { alberoObiettivi, cent, haTempo, type Nodo, trova } from '../albero.ts';
import { inizioMese, meseDi, mesiFino, oggi, periodoRichiesto } from '../periodo.ts';
import { speseDelMese } from '../spese.ts';
import { transazioneDaSpunta } from '../transazioni.ts';
import * as v from '../valida.ts';

// Salvadanai = sotto-conti (decisione 61, terza tappa), con traguardo, scadenza, traguardi di copertura e «crea la spesa al traguardo»
// (decisioni 20 e 21). L'indirizzo resta /obiettivi. Mettere via o prelevare è uno SPOSTAMENTO tra il salvadanaio e il conto che lo
// contiene: il totale del contenitore non cambia, cambia solo quanto è «non assegnato». I soldi da un altro conto arrivano con il promemoria.

export const rotteObiettivi = Router();

// Quanto serve ogni mese a un salvadanaio per arrivare al traguardo in tempo (con una durata: il traguardo diviso la durata, al massimo
// quanto manca; senza scadenza né durata: tutto quello che manca, come peso).
function bisogno(n: Nodo, da: string, inizio: number): number {
  const manca = n.traguardo_effettivo === null ? 0 : Math.max(0, Number(n.traguardo_effettivo) - Number(n.saldo));
  if (n.durata_mesi && n.traguardo_effettivo !== null) return Math.min(manca, Number(n.traguardo_effettivo) / n.durata_mesi);
  return n.scadenza && meseDi(n.scadenza, inizio) >= meseDi(da, inizio) ? manca / mesiFino(n.scadenza, da, inizio) : manca;
}

// Un versamento in un salvadanaio con sotto-salvadanai si divide tra loro in proporzione a quanto serve a ciascuno ogni mese, senza superare
// quanto gli manca; il resto resta nel salvadanaio. Senza sotto-salvadanai va tutto lì.
export async function dividiVersamento(db: PoolClient, id: string, importo: number): Promise<{ obiettivo_id: string; importo: string }[]> {
  const n = trova(await alberoObiettivi(db), id);
  if (!n || !n.figli.length || importo <= 0) return [{ obiettivo_id: id, importo: cent(importo) }];
  const da = oggi(), inizio = await inizioMese(db);
  const pesi = n.figli.map((f) => ({ f, peso: bisogno(f, da, inizio), manca: f.traguardo_effettivo === null ? 0 : Math.max(0, Number(f.traguardo_effettivo) - Number(f.saldo)) }));
  const totale = pesi.reduce((t, x) => t + x.peso, 0);
  const parti: { obiettivo_id: string; importo: string }[] = [];
  let resto = Math.round(importo * 100);
  if (totale > 0) for (const x of pesi) {
    const centesimi = Math.min(resto, Math.round(x.manca * 100), Math.round((importo * x.peso / totale) * 100));
    if (centesimi > 0) { parti.push({ obiettivo_id: x.f.id, importo: (centesimi / 100).toFixed(2) }); resto -= centesimi; }
  }
  if (resto > 0) parti.push({ obiettivo_id: id, importo: (resto / 100).toFixed(2) });
  return parti;
}

// Dopo un movimento: i salvadanai (e i superiori) che arrivano al traguardo con «crea spesa» generano la loro spesa una tantum, una volta
// sola; la spesa esce dal salvadanaio stesso. Un sotto-salvadanaio senza traguardo conta come non completo.
export async function creaSpeseRaggiunte(db: PoolClient, id: string) {
  const radici = await alberoObiettivi(db);
  for (let n = trova(radici, id); n; n = n.padre_id ? trova(radici, n.padre_id) : undefined) {
    if (!n.crea_spesa || n.spesa_creata_id || !n.traguardo_effettivo) continue;
    if (Number(n.saldo) < Number(n.traguardo_effettivo)) continue;
    if (n.traguardo === null && n.figli.some((f) => (f.percentuale ?? 0) < 100)) continue;
    const { rows } = await db.query<{ id: string }>(
      `insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, conto_id)
       select fp_me(), nome, $2, null, $3, id from conti where id = $1 returning id`,
      [n.id, n.traguardo_effettivo, n.scadenza && n.scadenza > oggi() ? n.scadenza : oggi()]);
    if (rows[0]) await db.query('update conti set spesa_creata_id = $2 where id = $1', [n.id, rows[0].id]);
  }
}

rotteObiettivi.get('/', async (_req, res) => {
  res.json(await conUtente(res.locals.utenteId, alberoObiettivi));
});

// Il dettaglio con i movimenti del salvadanaio («versamenti»): + entrano, − escono; `spostamento_con` è l'altro conto (o null = fuori).
rotteObiettivi.get('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoObiettivi(db), id);
    if (!n) return undefined;
    const versamenti = (await db.query(
      `select m.id, m.momento::date as data, (case when m.a_conto_id = $1 then m.importo else -m.importo end)::text as importo,
              m.utente_id, u.nome as utente, k.nome as spostamento_con, (k.id = (select padre_id from conti where id = $1)) as spostamento_con_padre,
              m.spunta_id is not null as da_spunta, m.descrizione
         from movimenti m join utenti u on u.id = m.utente_id
         left join conti k on k.id = case when m.a_conto_id = $1 then m.da_conto_id else m.a_conto_id end
        where m.a_conto_id = $1 or m.da_conto_id = $1 order by m.momento desc, m.id desc`, [id])).rows;
    return { ...n, versamenti };
  });
  if (!obiettivo) throw nonTrovato('Obiettivo');
  res.json(obiettivo);
});

// Scadenza e durata non stanno insieme (decisione 63): chi ne scrive una e non nomina l'altra toglie l'altra.
function leggi(c: Record<string, unknown>, nuovo: boolean) {
  const traguardo = v.annullabile(c, 'traguardo', () => v.importo(c, 'traguardo'));
  if (traguardo && Number(traguardo) <= 0) throw new ErroreApi(400, 'Il traguardo deve essere positivo');
  if (c.scadenza != null && c.durata_mesi != null) throw new ErroreApi(400, 'Un salvadanaio ha una scadenza oppure una durata che si ripete, non tutte e due');
  return {
    nome: v.testo(c, 'nome', nuovo, 120),
    traguardo,
    scadenza: v.annullabile(c, 'scadenza', () => v.data(c, 'scadenza')),
    durata_mesi: v.annullabile(c, 'durata_mesi', () => v.intero(c, 'durata_mesi', 1, 120)),
    crea_spesa: v.booleano(c, 'crea_spesa'),
    icona: v.annullabile(c, 'icona', () => v.testo(c, 'icona', false, 60)),
    nascosto: v.booleano(c, 'nascosto'),
  };
}
const unaSola = <T extends { scadenza?: string | null; durata_mesi?: number | null }>(x: T): T =>
  x.scadenza && x.durata_mesi === undefined ? { ...x, durata_mesi: null } : x.durata_mesi && x.scadenza === undefined ? { ...x, scadenza: null } : x;

// Dove sta il salvadanaio: dentro un salvadanaio superiore (`padre_id`) o, in cima, dentro un conto (`conto_id`). Uno dei due serve.
async function contenitore(db: PoolClient, c: Record<string, unknown>): Promise<string | null | undefined> {
  if (!('padre_id' in c) && !('conto_id' in c)) return undefined;
  const scelto = v.annullabile(c, 'padre_id', () => v.id(c, 'padre_id')) ?? v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id')) ?? null;
  if (!scelto) throw new ErroreApi(400, 'Scegli in quale conto sta il salvadanaio');
  if (!(await db.query('select 1 from conti where id = $1', [scelto])).rowCount) throw nonTrovato('Conto');
  return scelto;
}

rotteObiettivi.post('/', async (req, res) => {
  const c = v.corpo(req.body);
  const campi = unaSola(leggi(c, true));
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const padre = await contenitore(db, c);
    if (!padre) throw new ErroreApi(400, 'Scegli in quale conto sta il salvadanaio');
    const voci = Object.entries({ ...campi, icona: campi.icona ?? 'piggy-bank', padre_id: padre }).filter(([, x]) => x !== undefined);
    const { rows } = await db.query<{ id: string }>(
      `insert into conti (proprietario_id, ${voci.map(([k]) => k).join(', ')})
       values (fp_me(), ${voci.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, voci.map(([, x]) => x));
    return trova(await alberoObiettivi(db), rows[0].id);
  });
  res.status(201).json(obiettivo);
});

rotteObiettivi.patch('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const campi = unaSola(leggi(c, false));
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const padre = await contenitore(db, c);
    const set = v.setParziale({ ...campi, padre_id: padre }, 2);
    try {
      if (!(await db.query(`update conti set ${set.sql} where id = $1 and padre_id is not null`, [id, ...set.valori])).rowCount) return undefined;
    } catch (e) {
      if ((e as Error).message.includes('sotto-conto')) throw new ErroreApi(400, 'Un salvadanaio non può stare dentro un suo sotto-salvadanaio');
      throw e;
    }
    await creaSpeseRaggiunte(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  if (!obiettivo) throw nonTrovato('Obiettivo');
  res.json(obiettivo);
});

// Solo il proprietario cancella; un salvadanaio con dei soldi o con sotto-salvadanai no (prima si svuota o si spostano i sotto).
rotteObiettivi.delete('/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoObiettivi(db), id);
    if (!n) throw nonTrovato('Obiettivo');
    if (n.figli.length) throw new ErroreApi(409, 'Il salvadanaio contiene dei sotto-salvadanai: spostali o eliminali prima');
    if (Math.abs(Number(n.saldo)) >= 0.005) throw new ErroreApi(409, 'Nel salvadanaio ci sono ancora dei soldi: rimettili nel conto prima di eliminarlo');
    await db.query('delete from spese_previste where alimenta_obiettivo_id = $1', [id]);
    if (!(await db.query('delete from conti where id = $1', [id])).rowCount) throw new ErroreApi(403, "Solo chi ha creato il salvadanaio può cancellarlo");
  });
  res.status(204).end();
});

// Il promemoria del salvadanaio, «Mostra nelle spese come promemoria»: una spesa ogni mese DA un conto (`conto_id`, di base il conto
// principale) DENTRO il salvadanaio; la spunta fa lo spostamento (decisione 61). Con una scadenza o una durata e un traguardo (suoi o dei
// sotto-salvadanai) la quota la calcola l'API (quotaPromemoria); altrimenti serve la cifra fissa (`importo`).
rotteObiettivi.put('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const fisso = v.importo(c, 'importo');
  if (fisso !== undefined && Number(fisso) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const contoScelto = v.annullabile(c, 'conto_id', () => v.id(c, 'conto_id'));
  const spesa = await conUtente(res.locals.utenteId, async (db) => {
    const n = trova(await alberoObiettivi(db), id);
    if (!n) throw nonTrovato('Obiettivo');
    const conTempo = (x: Nodo): boolean => x.figli.some((f) => haTempo(f) || conTempo(f));
    const automatica = haTempo(n) || conTempo(n);
    const esistente = (await db.query<{ id: string; importo: string; conto_id: string | null }>('select id, importo::text, conto_id from spese_previste where alimenta_obiettivo_id = $1 limit 1', [id])).rows[0];
    if (!automatica && fisso === undefined && !(esistente && Number(esistente.importo) > 0)) {
      throw new ErroreApi(400, 'Il salvadanaio non ha un traguardo con una scadenza o una durata: scrivi la cifra fissa da ricordare ogni mese');
    }
    if (contoScelto && !(await db.query('select 1 from conti where id = $1', [contoScelto])).rowCount) throw nonTrovato('Conto');
    if (contoScelto === id) throw new ErroreApi(400, 'I soldi devono venire da un altro conto');
    const principale = (await db.query<{ id: string | null }>('select conto_principale_id as id from utenti where id = fp_me()')).rows[0]?.id ?? null;
    const conto = contoScelto !== undefined ? contoScelto : esistente ? esistente.conto_id : principale;
    const importo = fisso ?? esistente?.importo ?? '0';
    // La quota è mensile (ogni mese, senza giorno): vale per tutto il mese personale (decisione 41).
    const spesaId = esistente
      ? (await db.query<{ id: string }>(`update spese_previste set nome = $2, importo = $3, ogni_mesi = 1, conto_id = $4, a_conto_id = $5, tipo = 'investimento',
            giorno_mese = null, prossima_scadenza = null, senza_giorno = false where id = $1 returning id`,
          [esistente.id, n.nome, importo, conto, id])).rows[0].id
      : (await db.query<{ id: string }>(`insert into spese_previste (proprietario_id, nome, importo, ogni_mesi, prossima_scadenza, senza_giorno, tipo, alimenta_obiettivo_id, conto_id, a_conto_id)
          values (fp_me(), $1, $2, 1, null, false, 'investimento', $3, $4, $3) returning id`, [n.nome, importo, id, conto])).rows[0].id;
    return (await speseDelMese(db, await periodoRichiesto(db, undefined), spesaId))[0];
  });
  res.json(spesa);
});

rotteObiettivi.delete('/:id/promemoria', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    await db.query('delete from spese_previste where alimenta_obiettivo_id = $1', [id]);
  });
  res.status(204).end();
});

// Mettere via (importo positivo) o prelevare (negativo): uno spostamento tra il salvadanaio e il conto che lo contiene. Con dividi = true un
// versamento positivo si divide tra i sotto-salvadanai. Con promemoria = true («Aggiungi quota mensile») si spunta invece il promemoria del
// mese, che fa lui lo spostamento dal suo conto (se c'è e non è già spuntato). `da_liberi` non serve più: i soldi vengono sempre dal contenitore.
rotteObiettivi.post('/:id/versamenti', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) === 0) throw new ErroreApi(400, "L'importo non può essere zero");
  const obiettivo = await conUtente(res.locals.utenteId, async (db) => {
    const n = (await db.query<{ padre_id: string | null; nome: string }>('select padre_id, nome from conti where id = $1', [id])).rows[0];
    if (!n?.padre_id) throw nonTrovato('Obiettivo');
    if (v.booleano(c, 'promemoria')) {
      const voce = (await db.query<{ id: string }>('select id from spese_previste where alimenta_obiettivo_id = $1 and attiva', [id])).rows[0];
      const p = await periodoRichiesto(db, undefined);
      const s = voce && (await speseDelMese(db, p, voce.id))[0];
      if (s && s.nel_mese && !s.uscita) {
        const giorno = oggi() >= p.dal && oggi() <= p.al ? oggi() : s.scadenza ?? p.dal;
        const spunta = (await db.query<{ id: string; data: string }>('insert into spunte (utente_id, spesa_prevista_id, data) values (fp_me(), $1, $2) returning id, data', [voce.id, giorno])).rows[0];
        await transazioneDaSpunta(db, { spunta, da: s.conto_id, a: s.a_conto_id, intero: Number(s.importo), mia: Number(s.mia_quota), descrizione: s.nome, categoria: null });
        await creaSpeseRaggiunte(db, id);
        return trova(await alberoObiettivi(db), id);
      }
    }
    const momento = v.data(c, 'data') ?? null;
    const sposta = async (da: string, a: string, x: number, descrizione: string) => db.query(
      `insert into movimenti (utente_id, da_conto_id, a_conto_id, importo, momento, descrizione)
       values (fp_me(), $1, $2, $3, case when $4::date is null or $4::date = current_date then now() else ($4::date + time '12:00')::timestamptz end, $5)`,
      [da, a, cent(x), momento, descrizione]);
    if (Number(importo) > 0) {
      const parti = v.booleano(c, 'dividi') ? await dividiVersamento(db, id, Number(importo)) : [{ obiettivo_id: id, importo }];
      for (const x of parti) await sposta(n.padre_id, x.obiettivo_id, Number(x.importo), `Messo via in ${n.nome}`);
    } else await sposta(id, n.padre_id, -Number(importo), `Tolto da ${n.nome}`);
    await creaSpeseRaggiunte(db, id);
    return trova(await alberoObiettivi(db), id);
  });
  res.status(201).json(obiettivo);
});

// Toglie un movimento del salvadanaio: se nasce da una spunta toglie la spunta (e con lei il movimento), altrimenti solo chi l'ha fatto.
rotteObiettivi.delete('/versamenti/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  await conUtente(res.locals.utenteId, async (db) => {
    const m = (await db.query<{ spunta_id: string | null; mio: boolean }>('select spunta_id, utente_id = fp_me() as mio from movimenti where id = $1', [id])).rows[0];
    if (!m) throw nonTrovato('Versamento');
    if (m.spunta_id) { await db.query('delete from spunte where id = $1', [m.spunta_id]); return; }
    if (!m.mio) throw new ErroreApi(403, "Può cancellarlo solo chi l'ha fatto");
    await db.query('delete from movimenti where id = $1', [id]);
  });
  res.status(204).end();
});

// Traguardi di copertura.
rotteObiettivi.post('/:id/traguardi', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo', true)!;
  if (Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `insert into traguardi_copertura (conto_id, nome, importo, ordine)
     values ($1, $2, $3, coalesce($4, (select count(*) from traguardi_copertura where conto_id = $1)))
     returning id, conto_id as obiettivo_id, nome, importo::text as importo, ordine`,
    [id, v.testo(c, 'nome', true, 120), importo, v.intero(c, 'ordine', 0, 1000) ?? null])).rows[0]);
  res.status(201).json(traguardo);
});

rotteObiettivi.patch('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const c = v.corpo(req.body);
  const importo = v.importo(c, 'importo');
  if (importo !== undefined && Number(importo) <= 0) throw new ErroreApi(400, "L'importo deve essere positivo");
  const set = v.setParziale({ nome: v.testo(c, 'nome', false, 120), importo, ordine: v.intero(c, 'ordine', 0, 1000) }, 2);
  const traguardo = await conUtente(res.locals.utenteId, async (db) => (await db.query(
    `update traguardi_copertura set ${set.sql} where id = $1
     returning id, conto_id as obiettivo_id, nome, importo::text as importo, ordine`, [id, ...set.valori])).rows[0]);
  if (!traguardo) throw nonTrovato('Traguardo');
  res.json(traguardo);
});

rotteObiettivi.delete('/traguardi/:id', async (req, res) => {
  const id = v.idPercorso(req.params.id);
  const cancellati = await conUtente(res.locals.utenteId, async (db) =>
    (await db.query('delete from traguardi_copertura where id = $1', [id])).rowCount);
  if (!cancellati) throw nonTrovato('Traguardo');
  res.status(204).end();
});
