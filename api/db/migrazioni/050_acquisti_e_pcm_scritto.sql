-- Ogni acquisto a sé, con il prezzo di borsa del suo giorno, più una correzione del PCM (decisione 67, rivede la 42 «una riga per
-- posizione»). Il grafico del guadagno mostra l'effetto di ogni acquisto: servono data, quote e prezzo di ciascuno. Il prezzo non lo
-- scrive l'utente: è la chiusura di quel giorno presa dalla fonte. Le righe di `lotti` che ci sono restano come un acquisto ciascuna.
-- Il PCM del titolo (per titolo e portafoglio) è la media pesata degli acquisti; se l'utente scrive il PCM della sua banca, l'app salva
-- la differenza a quota (`correzione`) rispetto a quello calcolato in quel momento, e la applica a ogni quota di quel titolo (anche
-- agli acquisti dopo) finché non preme «Sincronizza».

drop index lotti_una_posizione_ux;
comment on table lotti is 'Un acquisto di un titolo in un portafoglio: quantità, prezzo di borsa del giorno, data e ora. Nome storico («lotti»). Righe con verso = vendita: vecchie, ignorate.';
comment on column lotti.prezzo is 'Prezzo di una quota in questo acquisto: la chiusura di borsa del giorno';
comment on column lotti.acquistato_il is 'Data e ora dell''acquisto';

create table correzioni_pcm (
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  titolo_id        uuid not null references titoli (id) on delete cascade,
  portafoglio_id   uuid not null,
  correzione       numeric(18,8) not null,
  salvata_il       timestamptz not null default now(),
  primary key (proprietario_id, titolo_id, portafoglio_id),
  foreign key (portafoglio_id, proprietario_id) references portafogli (id, proprietario_id) on delete cascade
);
comment on table correzioni_pcm is 'PCM scritto a mano: differenza a quota rispetto al PCM calcolato dai prezzi di borsa nel momento del salvataggio';
alter table correzioni_pcm enable row level security;
create policy correzioni_pcm_proprie on correzioni_pcm using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
grant select, insert, update, delete on correzioni_pcm to fp_app;
