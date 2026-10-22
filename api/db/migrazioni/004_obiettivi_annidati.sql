-- Obiettivi annidabili e non legati a un conto (decisione 20).
-- Un obiettivo può contenere altri obiettivi; il raggruppamento sostituisce il
-- tipo. Traguardo e scadenza sono facoltativi (un padre può valere la somma dei
-- figli, il fondo di emergenza può non avere scadenza).
-- Condividere un obiettivo condivide anche tutti quelli che contiene.

alter table obiettivi
  drop column conto_id,
  drop column tipo,
  add column padre_id uuid references obiettivi (id) on delete cascade,
  alter column traguardo drop not null;
create index obiettivi_padre_ix on obiettivi (padre_id);

-- Vede un obiettivo chi possiede, o ha ricevuto in condivisione, l'obiettivo
-- stesso o uno qualsiasi dei suoi antenati.
create or replace function fp_vede_obiettivo(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    with recursive catena as (
      select id, padre_id, proprietario_id from obiettivi where id = p_id
      union all
      select o.id, o.padre_id, o.proprietario_id from obiettivi o join catena c on o.id = c.padre_id
    ) cycle id set in_ciclo using percorso
    select exists (
      select 1 from catena c
       where c.proprietario_id = fp_me()
          or exists (select 1 from condivisioni s where s.obiettivo_id = c.id and s.condiviso_con_id = fp_me()))
  $$;

-- Un obiettivo non può stare dentro sé stesso o un suo discendente.
create or replace function fp_obiettivi_senza_cicli() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if new.padre_id is not null and exists (
    with recursive discendenti as (
      select new.id as id
      union all
      select o.id from obiettivi o join discendenti d on o.padre_id = d.id
    ) cycle id set in_ciclo using percorso
    select 1 from discendenti where id = new.padre_id
  ) then
    raise exception 'Un obiettivo non può stare dentro sé stesso o un suo sotto-obiettivo' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger obiettivi_senza_cicli before insert or update of padre_id on obiettivi
  for each row execute function fp_obiettivi_senza_cicli();
revoke execute on function fp_obiettivi_senza_cicli() from public;

revoke update on obiettivi from fp_app;
grant update (nome, traguardo, scadenza, padre_id) on obiettivi to fp_app;

drop policy obiettivi_vedi on obiettivi;
drop policy obiettivi_crea on obiettivi;
drop policy obiettivi_modifica on obiettivi;
-- La riga appena creata si riconosce dal proprietario (vedi nota in 002).
create policy obiettivi_vedi on obiettivi for select
  using (proprietario_id = fp_me() or fp_vede_obiettivo(id));
create policy obiettivi_crea on obiettivi for insert
  with check (proprietario_id = fp_me() and (padre_id is null or fp_vede_obiettivo(padre_id)));
create policy obiettivi_modifica on obiettivi for update
  using (fp_vede_obiettivo(id))
  with check (padre_id is null or fp_vede_obiettivo(padre_id));
