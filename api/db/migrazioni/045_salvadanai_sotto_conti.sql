-- I salvadanai diventano sotto-conti (decisione 61, terza tappa). Un salvadanaio è un conto dentro un altro conto (il fondo di emergenza e le
-- ceste delle annuali stanno nel deposito), con traguardo, scadenza, traguardi di copertura, icona, «nascosto» e «crea la spesa al
-- traguardo». I soldi non entrano più con dei versamenti a parte: si spostano con le transazioni, come per ogni altro conto.
-- Gli id restano gli stessi, così promemoria, traguardi e condivisioni continuano a puntare alla stessa cosa.

-- ---------------------------------------------------------------------------------------------------------------
-- 0) I versamenti non hanno un equivalente sicuro (da quale conto venivano?): se ce ne sono la migrazione si ferma, così si decide a mano.
do $$
begin
  if exists (select 1 from versamenti) then
    raise exception 'Ci sono versamenti nei salvadanai: vanno convertiti a mano in transazioni prima di questa migrazione';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) I campi del salvadanaio sul conto.
alter table conti
  add column traguardo numeric(12,2) check (traguardo is null or traguardo > 0),
  add column scadenza date,
  add column nascosto boolean not null default false,
  add column crea_spesa boolean not null default false,
  add column spesa_creata_id uuid references spese_previste(id) on delete set null;
grant select (traguardo, scadenza, nascosto, crea_spesa, spesa_creata_id),
      update (traguardo, scadenza, nascosto, crea_spesa, spesa_creata_id) on conti to fp_app;

-- I salvadanai diventano conti con lo stesso id, dentro il salvadanaio superiore o, per quelli in cima, dentro il loro conto.
-- Un salvadanaio senza superiore né conto diventa un conto a sé. Prima i superiori, poi i sotto (per la chiave verso il padre).
insert into conti (id, proprietario_id, nome, icona, padre_id, traguardo, scadenza, nascosto, crea_spesa, spesa_creata_id)
with recursive livelli as (
  select o.*, 0 as livello from obiettivi o where o.padre_id is null
  union all
  select o.*, l.livello + 1 from obiettivi o join livelli l on o.padre_id = l.id)
select id, proprietario_id, nome, coalesce(icona, 'piggy-bank'), coalesce(padre_id, conto_id), traguardo, scadenza, nascosto, crea_spesa, spesa_creata_id
  from livelli order by livello;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Traguardi di copertura, condivisioni e promemoria puntano ai conti.
drop policy traguardi_tutti on traguardi_copertura;
alter table traguardi_copertura add column conto_id uuid references conti(id) on delete cascade;
update traguardi_copertura set conto_id = obiettivo_id;
alter table traguardi_copertura drop column obiettivo_id, alter column conto_id set not null;
grant select, insert, update, delete on traguardi_copertura to fp_app;
create policy traguardi_tutti on traguardi_copertura for all using (fp_vede_conto(conto_id)) with check (fp_vede_conto(conto_id));

update condivisioni set conto_id = obiettivo_id, obiettivo_id = null where obiettivo_id is not null;
drop policy condivisioni_crea on condivisioni;
alter table condivisioni drop constraint condivisioni_check;
alter table condivisioni drop column obiettivo_id;
alter table condivisioni add constraint condivisioni_check check (num_nonnulls(conto_id, spesa_prevista_id, budget_id) = 1);
drop function fp_possiede_voce(uuid, uuid, uuid, uuid);
create function fp_possiede_voce(p_conto uuid, p_spesa uuid, p_budget uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select case
      when p_conto  is not null then exists (select 1 from conti where id = p_conto and proprietario_id = fp_me())
      when p_spesa  is not null then exists (select 1 from spese_previste where id = p_spesa and proprietario_id = fp_me())
      when p_budget is not null then exists (select 1 from budget where id = p_budget and proprietario_id = fp_me())
      else false
    end
  $$;
grant execute on function fp_possiede_voce(uuid, uuid, uuid) to fp_app;
create policy condivisioni_crea on condivisioni for insert with check (proprietario_id = fp_me() and fp_possiede_voce(conto_id, spesa_prevista_id, budget_id));

alter table spese_previste drop constraint spese_previste_alimenta_obiettivo_id_fkey;
alter table spese_previste add constraint spese_previste_alimenta_obiettivo_id_fkey foreign key (alimenta_obiettivo_id) references conti(id) on delete cascade;
-- Il promemoria di un salvadanaio porta i soldi DENTRO il salvadanaio.
update spese_previste set a_conto_id = alimenta_obiettivo_id where alimenta_obiettivo_id is not null;
create or replace function fp_controlla_obiettivo_spesa() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if new.alimenta_obiettivo_id is not null and not fp_vede_conto(new.alimenta_obiettivo_id) then
      raise exception 'Salvadanaio non trovato' using errcode = '23503';
    end if;
    return new;
  end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Via salvadanai e versamenti come cose a parte.
alter table utenti drop constraint utenti_obiettivo_annuali_fkey;
drop table versamenti;
drop table obiettivi;
drop function fp_vede_obiettivo(uuid);
drop function fp_obiettivi_senza_cicli();
