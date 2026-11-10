-- I gruppi delle spese (decisione 74): cartelle contenitore con nome e icona, solo etichetta (come il conto, decisione 72): nessun numero cambia.
-- Sono di chi li crea e non si condividono. Eliminando un gruppo le sue spese restano, senza gruppo.
create table gruppi (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  nome             text not null,
  icona            text not null default 'folder',
  creato_il        timestamptz not null default now()
);
create index gruppi_proprietario_ix on gruppi (proprietario_id);

grant select, insert, delete on gruppi to fp_app;
grant update (nome, icona) on gruppi to fp_app;
alter table gruppi enable row level security;
create policy gruppi_vedi      on gruppi for select using (proprietario_id = fp_me());
create policy gruppi_crea      on gruppi for insert with check (proprietario_id = fp_me());
create policy gruppi_modifica  on gruppi for update using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
create policy gruppi_cancella  on gruppi for delete using (proprietario_id = fp_me());

alter table spese_previste add column gruppo_id uuid references gruppi (id) on delete set null;
grant update (gruppo_id) on spese_previste to fp_app;
