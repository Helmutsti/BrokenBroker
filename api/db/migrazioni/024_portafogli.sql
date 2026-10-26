-- Portafogli separati dai conti (decisione 42). Un portafoglio è un contenitore
-- privato di investimenti: lotti di titoli quotati e beni. Prima il «portafoglio»
-- era il conto (conti.id) usato in operazioni.conto_id e beni.conto_id: per ogni
-- coppia (proprietario, conto) usata si crea un portafoglio con lo stesso nome del
-- conto; le righe senza conto vanno in «Principale» (creato solo dove serve).
-- Le operazioni diventano LOTTI: un lotto è un acquisto, con data e ora.

create table portafogli (
  id                    uuid primary key default gen_random_uuid(),
  proprietario_id       uuid not null references utenti (id) on delete cascade,
  nome                  text not null check (length(btrim(nome)) > 0),
  icona                 text not null default 'briefcase',
  conta_nel_patrimonio  boolean not null default true,
  archiviato            boolean not null default false,
  creato_il             timestamptz not null default now(),
  unique (id, proprietario_id)
);
create index portafogli_proprietario_ix on portafogli (proprietario_id);
comment on column portafogli.conta_nel_patrimonio is 'Falso = portafoglio di prova: escluso dai totali generali (patrimonio, andamento, esposizione)';

grant select, insert, update, delete on portafogli to fp_app;
alter table portafogli enable row level security;
create policy portafogli_propri on portafogli for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());

alter table operazioni add column portafoglio_id uuid;
alter table beni add column portafoglio_id uuid;

-- Un portafoglio per ogni (proprietario, conto) usato.
create temporary table usi on commit drop as
  select proprietario_id, conto_id from operazioni where conto_id is not null
  union
  select proprietario_id, conto_id from beni where conto_id is not null;

create temporary table mappa on commit drop as
  select u.proprietario_id, u.conto_id, gen_random_uuid() as portafoglio_id, c.nome, c.icona
    from usi u join conti c on c.id = u.conto_id;

insert into portafogli (id, proprietario_id, nome, icona)
  select portafoglio_id, proprietario_id, nome, icona from mappa;

update operazioni o set portafoglio_id = m.portafoglio_id from mappa m
  where m.proprietario_id = o.proprietario_id and m.conto_id = o.conto_id;
update beni b set portafoglio_id = m.portafoglio_id from mappa m
  where m.proprietario_id = b.proprietario_id and m.conto_id = b.conto_id;

-- «Principale» solo per chi ha righe senza conto.
create temporary table senza on commit drop as
  select proprietario_id from operazioni where portafoglio_id is null
  union
  select proprietario_id from beni where portafoglio_id is null;
create temporary table principali on commit drop as
  select proprietario_id, gen_random_uuid() as portafoglio_id from senza;
insert into portafogli (id, proprietario_id, nome, icona)
  select portafoglio_id, proprietario_id, 'Principale', 'briefcase' from principali;
update operazioni o set portafoglio_id = p.portafoglio_id from principali p
  where p.proprietario_id = o.proprietario_id and o.portafoglio_id is null;
update beni b set portafoglio_id = p.portafoglio_id from principali p
  where p.proprietario_id = b.proprietario_id and b.portafoglio_id is null;

alter table operazioni alter column portafoglio_id set not null;
alter table beni alter column portafoglio_id set not null;
-- Il portafoglio deve essere dello stesso proprietario (le chiavi esterne non passano dalla RLS).
alter table operazioni add constraint operazioni_portafoglio_fk
  foreign key (portafoglio_id, proprietario_id) references portafogli (id, proprietario_id);
alter table beni add constraint beni_portafoglio_fk
  foreign key (portafoglio_id, proprietario_id) references portafogli (id, proprietario_id);

-- Il conto non si usa più negli investimenti.
alter table operazioni drop column conto_id;
alter table beni drop column conto_id;

-- Operazioni → lotti ----------------------------------------------------------
alter table operazioni rename to lotti;
alter table lotti rename constraint operazioni_portafoglio_fk to lotti_portafoglio_fk;
alter policy operazioni_proprie on lotti rename to lotti_propri;
alter index operazioni_proprietario_ix rename to lotti_proprietario_ix;
create index lotti_portafoglio_ix on lotti (portafoglio_id, titolo_id);

-- La data diventa data e ora (le date esistenti valgono mezzogiorno nel fuso dell'app).
alter table lotti rename column data to acquistato_il;
alter table lotti alter column acquistato_il type timestamptz
  using ((acquistato_il::timestamp + interval '12 hours') at time zone 'Europe/Rome');
alter table lotti alter column acquistato_il set default now();

-- Solo acquisti. Le vendite già presenti restano (nessun dato cancellato) ma
-- l'API le ignora; il vincolo vale solo per le righe nuove.
alter table lotti add constraint lotti_solo_acquisti check (verso = 'acquisto') not valid;
comment on table lotti is 'Un lotto è un acquisto di un titolo in un portafoglio. Stesso titolo + stesso portafoglio = una posizione. Righe con verso = vendita: vecchie, ignorate.';
comment on column lotti.commissioni is 'Non più usata';
