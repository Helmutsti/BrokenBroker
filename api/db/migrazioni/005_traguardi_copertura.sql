-- Traguardi di copertura di un obiettivo (decisione 20).
-- Un importo senza soldi propri: mostra che percentuale ne copre l'obiettivo
-- padre, confrontato con tutto il padre, al massimo 100%. La percentuale si
-- calcola leggendo, non si salva.
-- Il traguardo del padre è quello scritto o, se manca, la somma dei sotto-obiettivi.

create table traguardi_copertura (
  id            uuid primary key default gen_random_uuid(),
  obiettivo_id  uuid not null references obiettivi (id) on delete cascade,
  nome          text not null,
  importo       numeric(12,2) not null check (importo > 0),
  ordine        integer not null default 0
);
create index traguardi_copertura_obiettivo_ix on traguardi_copertura (obiettivo_id, ordine);

-- Seguono l'obiettivo: chi lo vede li vede e li modifica.
grant select, insert, delete on traguardi_copertura to fp_app;
grant update (nome, importo, ordine) on traguardi_copertura to fp_app;
alter table traguardi_copertura enable row level security;
create policy traguardi_tutti on traguardi_copertura for all
  using (fp_vede_obiettivo(obiettivo_id))
  with check (fp_vede_obiettivo(obiettivo_id));
