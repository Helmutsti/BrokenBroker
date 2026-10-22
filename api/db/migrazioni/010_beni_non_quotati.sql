-- Investimenti senza prezzo di mercato e oro fisico (SC-12, proposta v2 approvata da Manuel).
-- Un bene non quotato ha un costo e un valore attuale scritti a mano. L'oro fisico
-- è un tipo di bene: si possiede direttamente, quindi non sta in nessun portafoglio.

create table beni (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  nome             text not null,
  tipo             text not null check (tipo in ('fondo_pensione', 'crowdfunding', 'societa', 'immobile', 'oro', 'altro')),
  costo            numeric(12,2) not null check (costo >= 0),
  valore           numeric(12,2) not null check (valore >= 0),
  valore_al        date not null default current_date,
  data_acquisto    date,
  conto_id         uuid references conti (id) on delete set null,
  -- Solo per l'oro fisico.
  forma            text check (forma in ('lingotto', 'moneta')),
  purezza          numeric(5,1) check (purezza > 0 and purezza <= 1000),
  peso_grammi      numeric(10,3) check (peso_grammi > 0),
  dove             text,
  creato_il        timestamptz not null default now(),
  check (tipo <> 'oro' or conto_id is null),
  check (tipo = 'oro' or (forma is null and purezza is null and peso_grammi is null)),
  check (tipo <> 'oro' or peso_grammi is not null)
);
create index beni_proprietario_ix on beni (proprietario_id);
comment on column beni.purezza is 'Millesimi di oro fino, es. 999.9';
comment on column beni.valore_al is 'Giorno a cui si riferisce il valore attuale';

grant select, insert, update, delete on beni to fp_app;
alter table beni enable row level security;
create policy beni_propri on beni for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
