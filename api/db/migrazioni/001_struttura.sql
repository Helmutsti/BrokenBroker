-- Struttura completa del database.
-- Importi in euro con due decimali. Le uscite sono negative, le entrate positive.

create extension if not exists pgcrypto;

-- Persone ---------------------------------------------------------------

create table utenti (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  nome             text not null,
  password_hash    text not null,
  stipendio_netto  numeric(12,2),
  giorno_paga      smallint check (giorno_paga between 1 and 31),
  creato_il        timestamptz not null default now()
);
create unique index utenti_email_uk on utenti (lower(email));

create table sessioni (
  token_hash  bytea primary key,
  utente_id   uuid not null references utenti (id) on delete cascade,
  creata_il   timestamptz not null default now(),
  scade_il    timestamptz not null
);
create index sessioni_utente_ix on sessioni (utente_id);

-- Soldi di tutti i giorni -----------------------------------------------

create table conti (
  id                   uuid primary key default gen_random_uuid(),
  proprietario_id      uuid not null references utenti (id) on delete cascade,
  nome                 text not null,
  tipo                 text not null check (tipo in ('corrente', 'carta', 'risparmio', 'investimenti', 'contanti', 'digitale')),
  saldo_iniziale       numeric(12,2) not null default 0,
  data_saldo_iniziale  date not null default current_date,
  archiviato           boolean not null default false,
  creato_il            timestamptz not null default now()
);
create index conti_proprietario_ix on conti (proprietario_id);

create table categorie (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  padre_id         uuid references categorie (id) on delete restrict,
  nome             text not null,
  tipo             text not null default 'uscita' check (tipo in ('uscita', 'entrata')),
  colore           text check (colore ~ '^#[0-9A-Fa-f]{6}$'),
  icona            text,
  ordine           integer not null default 0
);
create unique index categorie_nome_uk on categorie (proprietario_id, coalesce(padre_id, '00000000-0000-0000-0000-000000000000'), lower(nome));
create index categorie_padre_ix on categorie (padre_id);

create table spese_previste (
  id                 uuid primary key default gen_random_uuid(),
  proprietario_id    uuid not null references utenti (id) on delete cascade,
  nome               text not null,
  importo            numeric(12,2) not null,
  ogni_mesi          smallint not null default 1 check (ogni_mesi > 0),
  prossima_scadenza  date,
  conto_id           uuid references conti (id) on delete set null,
  categoria_id       uuid references categorie (id) on delete set null,
  tipo               text not null default 'fissa' check (tipo in ('fissa', 'budget', 'investimento')),
  attiva             boolean not null default true,
  note               text
);
create index spese_previste_proprietario_ix on spese_previste (proprietario_id);

-- Impegni e risparmi ----------------------------------------------------

create table rate (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  oggetto          text not null,
  finanziaria      text,
  importo_totale   numeric(12,2),
  importo_rata     numeric(12,2) not null,
  numero_rate      smallint not null check (numero_rate > 0),
  prima_scadenza   date not null,
  conto_id         uuid references conti (id) on delete set null,
  categoria_id     uuid references categorie (id) on delete set null,
  chiusa           boolean not null default false
);
create index rate_proprietario_ix on rate (proprietario_id);

create table obiettivi (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  nome             text not null,
  tipo             text not null default 'obiettivo' check (tipo in ('annuali', 'emergenza', 'obiettivo')),
  traguardo        numeric(12,2) not null check (traguardo > 0),
  scadenza         date,
  conto_id         uuid references conti (id) on delete set null
);
create index obiettivi_proprietario_ix on obiettivi (proprietario_id);

create table movimenti (
  id                 uuid primary key default gen_random_uuid(),
  conto_id           uuid not null references conti (id) on delete cascade,
  data               date not null default current_date,
  importo            numeric(12,2) not null check (importo <> 0),
  esercente          text,
  descrizione        text,
  categoria_id       uuid references categorie (id) on delete set null,
  inserito_da        uuid not null references utenti (id),
  origine            text not null default 'manuale' check (origine in ('manuale', 'import')),
  spesa_prevista_id  uuid references spese_previste (id) on delete set null,
  rata_id            uuid references rate (id) on delete set null,
  obiettivo_id       uuid references obiettivi (id) on delete set null,
  trasferimento_id   uuid,
  creato_il          timestamptz not null default now(),
  modificato_il      timestamptz not null default now()
);
create index movimenti_conto_data_ix on movimenti (conto_id, data desc);
create index movimenti_categoria_ix on movimenti (categoria_id);
create index movimenti_esercente_ix on movimenti (inserito_da, lower(esercente));
create index movimenti_trasferimento_ix on movimenti (trasferimento_id) where trasferimento_id is not null;

create table versamenti (
  id            uuid primary key default gen_random_uuid(),
  obiettivo_id  uuid not null references obiettivi (id) on delete cascade,
  utente_id     uuid not null references utenti (id),
  data          date not null default current_date,
  importo       numeric(12,2) not null check (importo <> 0),
  movimento_id  uuid references movimenti (id) on delete set null
);
create index versamenti_obiettivo_ix on versamenti (obiettivo_id);

-- Come si divide una spesa ricorrente o un movimento tra le persone.
create table quote (
  id                 uuid primary key default gen_random_uuid(),
  spesa_prevista_id  uuid references spese_previste (id) on delete cascade,
  movimento_id       uuid references movimenti (id) on delete cascade,
  utente_id          uuid not null references utenti (id) on delete cascade,
  percentuale        numeric(5,2) not null check (percentuale > 0 and percentuale <= 100),
  check (num_nonnulls(spesa_prevista_id, movimento_id) = 1)
);
create unique index quote_spesa_uk on quote (spesa_prevista_id, utente_id) where spesa_prevista_id is not null;
create unique index quote_movimento_uk on quote (movimento_id, utente_id) where movimento_id is not null;

-- Una riga = la voce è in collaborazione con quella persona.
create table condivisioni (
  id                 uuid primary key default gen_random_uuid(),
  proprietario_id    uuid not null references utenti (id) on delete cascade,
  condiviso_con_id   uuid not null references utenti (id) on delete cascade,
  conto_id           uuid references conti (id) on delete cascade,
  spesa_prevista_id  uuid references spese_previste (id) on delete cascade,
  movimento_id       uuid references movimenti (id) on delete cascade,
  obiettivo_id       uuid references obiettivi (id) on delete cascade,
  creata_il          timestamptz not null default now(),
  check (num_nonnulls(conto_id, spesa_prevista_id, movimento_id, obiettivo_id) = 1),
  check (proprietario_id <> condiviso_con_id)
);
create unique index condivisioni_uk on condivisioni
  (condiviso_con_id, coalesce(conto_id, spesa_prevista_id, movimento_id, obiettivo_id));
create index condivisioni_proprietario_ix on condivisioni (proprietario_id);

-- Investimenti ----------------------------------------------------------

-- Anagrafica comune: un ETF è lo stesso per tutti.
create table titoli (
  id      uuid primary key default gen_random_uuid(),
  isin    text not null unique,
  ticker  text,
  nome    text not null,
  tipo    text not null default 'etf' check (tipo in ('etf', 'azione', 'obbligazione', 'crypto', 'altro'))
);

create table operazioni (
  id               uuid primary key default gen_random_uuid(),
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  titolo_id        uuid not null references titoli (id),
  conto_id         uuid references conti (id) on delete set null,
  data             date not null,
  verso            text not null check (verso in ('acquisto', 'vendita')),
  quantita         numeric(18,6) not null check (quantita > 0),
  prezzo           numeric(14,4) not null check (prezzo >= 0),
  commissioni      numeric(12,2) not null default 0
);
create index operazioni_proprietario_ix on operazioni (proprietario_id, titolo_id);

create table prezzi (
  titolo_id  uuid not null references titoli (id) on delete cascade,
  data       date not null,
  prezzo     numeric(14,4) not null,
  primary key (titolo_id, data)
);

create table esposizioni (
  titolo_id   uuid not null references titoli (id) on delete cascade,
  dimensione  text not null check (dimensione in ('classe', 'area', 'settore')),
  voce        text not null,
  peso        numeric(7,4) not null check (peso >= 0 and peso <= 1),
  primary key (titolo_id, dimensione, voce)
);

-- Regole e analisi ------------------------------------------------------

create table regole (
  proprietario_id  uuid not null references utenti (id) on delete cascade,
  tipo             text not null check (tipo in ('max_rate_contemporanee', 'tetto_rate_percentuale', 'max_mensilita_debito')),
  valore           numeric(12,2) not null,
  primary key (proprietario_id, tipo)
);

create table prove_acquisto (
  id                uuid primary key default gen_random_uuid(),
  proprietario_id   uuid not null references utenti (id) on delete cascade,
  oggetto           text not null,
  prezzo            numeric(12,2) not null check (prezzo > 0),
  a_rate            boolean not null default false,
  numero_rate       smallint check (numero_rate > 0),
  vita_utile_mesi   smallint check (vita_utile_mesi > 0),
  criteri           text[] not null default '{}',
  esito             text,
  creata_il         timestamptz not null default now()
);

create table chiusure_mensili (
  utente_id   uuid not null references utenti (id) on delete cascade,
  mese        date not null check (extract(day from mese) = 1),
  entrate     numeric(12,2) not null,
  uscite      numeric(12,2) not null,
  risparmio   numeric(12,2) not null,
  patrimonio  numeric(14,2),
  primary key (utente_id, mese)
);
