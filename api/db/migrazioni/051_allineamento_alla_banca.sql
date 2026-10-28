-- Allineamento di un titolo alla banca (decisione 68, al posto della correzione a quota della 67). La banca non ha mai gli stessi
-- prezzi di Yahoo: l'utente scrive il PCM e il prezzo di mercato come li vede in banca, e l'app salva di quanto differiscono, in
-- proporzione, da quelli calcolati con Yahoo in quel momento. I prezzi di acquisto (l'investito) si moltiplicano per `fattore_pcm`,
-- tutti i prezzi di mercato del titolo (il valore, anche nel passato del grafico) per `fattore_prezzo`, finché non si preme «Sincronizza».

drop table correzioni_pcm;

create table allineamenti_banca (
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  titolo_id        uuid not null references titoli (id) on delete cascade,
  portafoglio_id   uuid not null,
  fattore_pcm      numeric(18,10) check (fattore_pcm > 0),
  fattore_prezzo   numeric(18,10) check (fattore_prezzo > 0),
  salvato_il       timestamptz not null default now(),
  primary key (proprietario_id, titolo_id, portafoglio_id),
  foreign key (portafoglio_id, proprietario_id) references portafogli (id, proprietario_id) on delete cascade
);
comment on table allineamenti_banca is 'PCM e prezzo di mercato della banca, come rapporto con quelli di Yahoo nel momento del salvataggio';
alter table allineamenti_banca enable row level security;
create policy allineamenti_banca_propri on allineamenti_banca using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
grant select, insert, update, delete on allineamenti_banca to fp_app;
