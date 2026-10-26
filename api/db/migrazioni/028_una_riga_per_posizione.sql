-- Una riga per posizione (decisione 42, revisione del 2026-10-26): come in un broker vero,
-- per ogni (proprietario, titolo, portafoglio) c'è UNA sola riga con la quantità totale e il
-- prezzo medio di carico (PCM); un nuovo acquisto la aggiorna invece di aggiungere un lotto.
-- Regola di unione: quantità = somma; PCM = media pesata sulle quantità (somma q*p / somma q);
-- data e ora = quelle dell'ultimo acquisto. I singoli acquisti non si conservano.
-- La tabella resta chiamata `lotti` (nome storico: rinominarla toccherebbe RLS, indici, vincoli
-- e il codice senza alcun vantaggio); da qui in poi ogni riga è una posizione. `prezzo` è il PCM.
-- Le vendite vecchie (verso = 'vendita') restano com'erano e sono ignorate: il vincolo le esclude.

-- Il PCM di una media pesata ha più decimali del prezzo di un singolo acquisto: più precisione,
-- così quantità × PCM resta uguale al costo (l'API lo mostra comunque a 4 decimali).
alter table lotti alter column prezzo type numeric(18,8);

create temporary table unite on commit drop as
  select proprietario_id, titolo_id, portafoglio_id,
         (array_agg(id order by acquistato_il desc, id desc))[1] as tenuta,
         sum(quantita) as quantita,
         sum(quantita * prezzo) / sum(quantita) as prezzo,
         max(acquistato_il) as acquistato_il
    from lotti
   where verso = 'acquisto'
   group by proprietario_id, titolo_id, portafoglio_id
  having count(*) > 1;

delete from lotti l using unite u
 where l.verso = 'acquisto' and l.proprietario_id = u.proprietario_id and l.titolo_id = u.titolo_id
   and l.portafoglio_id = u.portafoglio_id and l.id <> u.tenuta;
update lotti l set quantita = u.quantita, prezzo = u.prezzo, acquistato_il = u.acquistato_il
  from unite u where l.id = u.tenuta;

create unique index lotti_una_posizione_ux on lotti (proprietario_id, titolo_id, portafoglio_id) where verso = 'acquisto';
comment on table lotti is 'Una riga per posizione: titolo + portafoglio, con quantità totale e PCM (prezzo = prezzo medio di carico). acquistato_il = ultimo acquisto. Nome storico («lotti»). Righe con verso = vendita: vecchie, ignorate.';
comment on column lotti.prezzo is 'Prezzo medio di carico (PCM) della posizione';
comment on column lotti.acquistato_il is 'Data e ora dell''ultimo acquisto';
