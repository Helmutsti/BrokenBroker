-- Proposta v5 (le 3 sezioni dei 3 fogli dell'Excel), approvata da Manuel.

-- "Sul conto oggi": il saldo del conto principale scritto a mano, come la cella
-- dell'Excel; serve per l'Avanzo (sul conto − devono uscire).
-- "obiettivo_annuali": il salvadanaio da cui si pagano le spese annuali.
alter table utenti
  add column sul_conto          numeric(12,2),
  add column sul_conto_al       date,
  add column obiettivo_annuali  uuid references obiettivi (id) on delete set null;
grant select (sul_conto, sul_conto_al, obiettivo_annuali) on utenti to fp_app;
grant update (sul_conto, sul_conto_al, obiettivo_annuali) on utenti to fp_app;

-- La spunta è solo un segno: dice che una spesa prevista o una rata è uscita in
-- un mese, senza creare un movimento sul conto. Le spunte fatte prima con i
-- movimenti continuano a valere.
create table spunte (
  id                 uuid primary key default gen_random_uuid(),
  utente_id          uuid not null references utenti (id) on delete cascade,
  spesa_prevista_id  uuid references spese_previste (id) on delete cascade,
  rata_id            uuid references rate (id) on delete cascade,
  data               date not null,
  creata_il          timestamptz not null default now(),
  check (num_nonnulls(spesa_prevista_id, rata_id) = 1)
);
create index spunte_spesa_ix on spunte (spesa_prevista_id, data);
create index spunte_rata_ix on spunte (rata_id, data);

-- Una spunta si vede e si toglie insieme alla sua spesa (anche condivisa) o rata.
grant select, insert, delete on spunte to fp_app;
alter table spunte enable row level security;
create policy spunte_vedi on spunte for select using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id)));
create policy spunte_crea on spunte for insert with check (utente_id = fp_me() and (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id))));
create policy spunte_cancella on spunte for delete using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id)));

-- Una spesa pagata da un salvadanaio, spuntata, preleva dal salvadanaio: il
-- prelievo è legato alla spunta e sparisce con lei.
alter table versamenti add column spunta_id uuid references spunte (id) on delete cascade;
