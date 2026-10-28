-- Conti al centro (decisione 61, prima tappa: database). I conti tornano ad avere un saldo e diventano un albero (conto → sotto-conti);
-- le transazioni vanno da un conto a un altro o da/verso «fuori» (colonna vuota); una spesa è il promemoria di una transazione e la sua
-- spunta la crea. La quota mensile delle annuali è un promemoria calcolato dall'app. I conti si condividono di nuovo, sotto-conti compresi.

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Conti: albero e saldo scritto.
alter table conti
  add column padre_id uuid references conti(id) on delete restrict,
  add column saldo_scritto numeric(12,2),
  add column saldo_scritto_il timestamptz,
  add constraint conti_saldo_con_momento check ((saldo_scritto is null) = (saldo_scritto_il is null)),
  add constraint conti_non_padre_di_se check (padre_id is distinct from id);
create index conti_padre_ix on conti (padre_id) where padre_id is not null;
grant update (padre_id, saldo_scritto, saldo_scritto_il) on conti to fp_app;

-- Niente cicli nell'albero dei conti.
create function fp_conti_senza_cicli() returns trigger language plpgsql as $$
begin
  if new.padre_id is not null and exists (
       with recursive su as (select id, padre_id from conti where id = new.padre_id
                             union all select c.id, c.padre_id from conti c join su on c.id = su.padre_id)
       select 1 from su where id = new.id) then
    raise exception 'Un conto non può stare dentro un suo sotto-conto';
  end if;
  return new;
end $$;
create trigger conti_senza_cicli before insert or update of padre_id on conti for each row execute function fp_conti_senza_cicli();

-- Si vede un conto se è tuo o se è condiviso con te lui o uno dei conti che lo contengono.
create or replace function fp_vede_conto(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    with recursive su as (select id, padre_id, proprietario_id from conti where id = p_id
                          union all select c.id, c.padre_id, c.proprietario_id from conti c join su on c.id = su.padre_id)
    select exists (select 1 from su where proprietario_id = fp_me())
        or exists (select 1 from condivisioni s join su on s.conto_id = su.id where s.condiviso_con_id = fp_me())
  $$;

drop policy conti_vedi on conti;
-- Il proprietario prima di tutto: una riga appena inserita non la vede ancora la funzione (stessa istantanea), serve per «returning».
create policy conti_vedi on conti for select using (proprietario_id = fp_me() or fp_vede_conto(id));
drop policy conti_crea on conti;
create policy conti_crea on conti for insert with check (proprietario_id = fp_me() and (padre_id is null or fp_vede_conto(padre_id)));

-- Conto condiviso (lui o un conto che lo contiene): la spunta fa uscire l'importo intero, altrimenti la quota di chi spunta (47 C).
create function fp_conto_condiviso(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    with recursive su as (select id, padre_id from conti where id = p_id
                          union all select c.id, c.padre_id from conti c join su on c.id = su.padre_id)
    select exists (select 1 from condivisioni s join su on s.conto_id = su.id)
  $$;
grant execute on function fp_conto_condiviso(uuid) to fp_app;

-- I conti si condividono di nuovo.
alter table condivisioni drop constraint condivisioni_niente_conti;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Transazioni: da un conto a un altro, o da/verso fuori (null). Le categorie contano solo per ciò che esce (a = fuori) o entra (da = fuori).
alter table movimenti
  add column da_conto_id uuid references conti(id) on delete set null,
  add column a_conto_id uuid references conti(id) on delete set null,
  add column spunta_id uuid references spunte(id) on delete cascade;
update movimenti set da_conto_id = conto_id where tipo = 'uscita';
update movimenti set a_conto_id = conto_id where tipo = 'entrata';
-- Un'entrata o un'uscita senza conto resta tale: il verso lo dice `verso` finché un conto non c'è.
alter table movimenti add column verso text;
update movimenti set verso = tipo where da_conto_id is null and a_conto_id is null;

drop policy movimenti_vedi on movimenti;
drop policy movimenti_crea on movimenti;
drop policy movimenti_cambia on movimenti;
alter table movimenti drop constraint movimenti_check;
alter table movimenti drop column tipo, drop column conto_id;
alter table movimenti
  add constraint movimenti_da_diverso_da_a check (da_conto_id is distinct from a_conto_id or da_conto_id is null),
  -- Senza nessun conto serve sapere se era un'entrata o un'uscita.
  add constraint movimenti_verso check ((da_conto_id is null and a_conto_id is null) = (verso is not null) and (verso is null or verso in ('entrata', 'uscita'))),
  -- La categoria solo su ciò che esce o entra, mai su uno spostamento tra due conti.
  add constraint movimenti_categoria check (categoria_id is null or da_conto_id is null or a_conto_id is null);
create index movimenti_da_ix on movimenti (da_conto_id, momento desc) where da_conto_id is not null;
create index movimenti_a_ix on movimenti (a_conto_id, momento desc) where a_conto_id is not null;
create index movimenti_spunta_ix on movimenti (spunta_id) where spunta_id is not null;

create policy movimenti_vedi on movimenti for select using (
  utente_id = fp_me() or (da_conto_id is not null and fp_vede_conto(da_conto_id)) or (a_conto_id is not null and fp_vede_conto(a_conto_id))
  or (budget_id is not null and fp_vede_budget(budget_id)));
create policy movimenti_crea on movimenti for insert with check (
  utente_id = fp_me() and (da_conto_id is null or fp_vede_conto(da_conto_id)) and (a_conto_id is null or fp_vede_conto(a_conto_id))
  and (budget_id is null or fp_vede_budget(budget_id)));
create policy movimenti_cambia on movimenti for update using (utente_id = fp_me() and spunta_id is null)
  with check (utente_id = fp_me() and (da_conto_id is null or fp_vede_conto(da_conto_id)) and (a_conto_id is null or fp_vede_conto(a_conto_id)));

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Spese = promemoria di transazioni: conto di arrivo (vuoto = esce) e la quota delle annuali calcolata dall'app.
alter table spese_previste
  add column a_conto_id uuid references conti(id) on delete set null,
  add column quota_annuali boolean not null default false;
create unique index spese_quota_annuali_ux on spese_previste (proprietario_id) where quota_annuali;
grant update (a_conto_id) on spese_previste to fp_app;

-- Conto principale (la pagina Spese) e conto delle annuali (dove va la quota del mese), scelti in Impostazioni.
alter table utenti
  add column conto_principale_id uuid references conti(id) on delete set null,
  add column conto_annuali_id uuid references conti(id) on delete set null;
grant select (conto_principale_id, conto_annuali_id), update (conto_principale_id, conto_annuali_id) on utenti to fp_app;
