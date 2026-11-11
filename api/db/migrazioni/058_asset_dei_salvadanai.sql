-- Gli investimenti collegati a un salvadanaio (decisione 75): solo etichetta (come il conto, decisione 72, e il gruppo, decisione 74):
-- nessun numero del salvadanaio cambia. Un salvadanaio può avere più asset e un asset può stare in più salvadanai.
-- L'asset è una posizione (titolo + portafoglio: non ha una riga sua, è la somma dei suoi acquisti) oppure un bene.
-- Il collegamento è di chi lo crea, cioè del proprietario dell'asset (gli investimenti sono privati, decisione 6): chi vede un salvadanaio
-- condiviso non vede gli asset altrui. Sparisce con il salvadanaio, con il portafoglio, con il titolo o con il bene.
create table collegamenti_asset (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  cesta_id         uuid not null references ceste (id) on delete cascade,
  titolo_id        uuid references titoli (id) on delete cascade,
  portafoglio_id   uuid references portafogli (id) on delete cascade,
  bene_id          uuid references beni (id) on delete cascade,
  creato_il        timestamptz not null default now(),
  constraint collegamenti_asset_uno check (
    (titolo_id is not null and portafoglio_id is not null and bene_id is null)
    or (titolo_id is null and portafoglio_id is null and bene_id is not null))
);
create unique index collegamenti_asset_posizione_uk on collegamenti_asset (cesta_id, titolo_id, portafoglio_id) where bene_id is null;
create unique index collegamenti_asset_bene_uk on collegamenti_asset (cesta_id, bene_id) where bene_id is not null;
create index collegamenti_asset_proprietario_ix on collegamenti_asset (proprietario_id);
create index collegamenti_asset_posizione_ix on collegamenti_asset (titolo_id, portafoglio_id) where titolo_id is not null;
create index collegamenti_asset_bene_ix on collegamenti_asset (bene_id) where bene_id is not null;

grant select, insert, delete on collegamenti_asset to fp_app;
alter table collegamenti_asset enable row level security;
create policy collegamenti_asset_vedi    on collegamenti_asset for select using (proprietario_id = fp_me());
create policy collegamenti_asset_crea    on collegamenti_asset for insert with check (proprietario_id = fp_me());
create policy collegamenti_asset_cancella on collegamenti_asset for delete using (proprietario_id = fp_me());

-- Una posizione non ha una riga sua: sparisce quando si toglie il suo ultimo acquisto, e con lei i suoi collegamenti.
create function collegamenti_asset_senza_posizione() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from lotti where titolo_id = old.titolo_id and portafoglio_id = old.portafoglio_id) then
    delete from collegamenti_asset where titolo_id = old.titolo_id and portafoglio_id = old.portafoglio_id;
  end if;
  return null;
end $$;
create trigger lotti_tolgono_collegamenti after delete on lotti for each row execute function collegamenti_asset_senza_posizione();
