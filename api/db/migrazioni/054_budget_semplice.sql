-- Budget semplice (decisione 71): un budget è solo un limite di spesa su una categoria (categoria, cifra del mese, attivo).
-- Via la divisione, la condivisione e le note del budget. Prima della migrazione nel database reale nessun budget era condiviso né
-- aveva note (controllato, backup `prima-di-budget-semplice`). Resta `movimenti.budget_id` (nessuna uscita lo usa più, il calcolo va per categoria).

-- Chi vede un budget: solo chi lo possiede.
create or replace function fp_vede_budget(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from budget where id = p_id and proprietario_id = fp_me())
  $$;

drop policy budget_vedi on budget;
create policy budget_vedi on budget for select using (proprietario_id = fp_me());

-- Le quote ora sono solo delle spese.
drop policy quote_tutte on quote;
alter table quote drop constraint quote_check;
alter table quote drop column budget_id;
alter table quote alter column spesa_prevista_id set not null;
create policy quote_tutte on quote
  using (coalesce(fp_vede_spesa(spesa_prevista_id), false))
  with check (coalesce(fp_vede_spesa(spesa_prevista_id), false));

-- Le condivisioni ora sono solo di conti e spese.
drop policy condivisioni_crea on condivisioni;
alter table condivisioni drop constraint condivisioni_check;
alter table condivisioni drop column budget_id;
alter table condivisioni add constraint condivisioni_check check (num_nonnulls(conto_id, spesa_prevista_id) = 1);
create function fp_possiede_voce(p_conto uuid, p_spesa uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select case
      when p_conto is not null then exists (select 1 from conti where id = p_conto and proprietario_id = fp_me())
      when p_spesa is not null then exists (select 1 from spese_previste where id = p_spesa and proprietario_id = fp_me())
      else false
    end
  $$;
create policy condivisioni_crea on condivisioni for insert
  with check (proprietario_id = fp_me() and fp_possiede_voce(conto_id, spesa_prevista_id));
drop function fp_possiede_voce(uuid, uuid, uuid);

alter table budget drop column note;

-- Quante spese e rate partono da un conto o arrivano su di esso, di chiunque (serve a impedire di eliminare un conto che ne ha: ogni spesa
-- deve avere il suo conto). Security definer perché una spesa di un'altra persona su un conto condiviso a chi elimina non si vede.
create function fp_voci_su_conto(p_conto uuid) returns integer
  language sql stable security definer set search_path = public as $$
    select (select count(*) from spese_previste where conto_id = p_conto or a_conto_id = p_conto)::int
         + (select count(*) from rate where conto_id = p_conto)::int
  $$;
grant execute on function fp_voci_su_conto(uuid) to fp_app;

-- Eliminando una categoria le sue uscite (anche quelle nate da una spunta, che con la sicurezza a livello di riga non si possono cambiare)
-- passano alla categoria scelta: altrimenti perderebbero la categoria e uscirebbero dal budget.
create function fp_sposta_uscite_categoria(p_da uuid, p_a uuid) returns void
  language sql security definer set search_path = public as $$
    update movimenti set categoria_id = p_a
     where categoria_id = p_da and utente_id = fp_me()
       and exists (select 1 from categorie where id = p_a and proprietario_id = fp_me())
  $$;
grant execute on function fp_sposta_uscite_categoria(uuid, uuid) to fp_app;
