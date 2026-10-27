-- Movimenti scritti a mano e conto eliminato senza toccare gli altri (decisione 53).
--
-- 1) Nuova causa 'a_mano': entrata (Niente -> conto), uscita (conto -> Niente, con categoria facoltativa che conta nel budget di quella
--    categoria come le uscite di budget) e giroconto (conto -> conto). Chi li ha scritti li può cambiare e togliere (RLS: solo l'autore).
-- 2) Eliminando un conto spariscono i dati di quel conto, ma il conto «dall'altra parte» non cambia: i movimenti conto <-> Niente
--    spariscono; nei giroconti con un altro conto il lato del conto eliminato diventa «Niente» (A -> B diventa Niente -> B, B -> A diventa
--    B -> Niente), così il saldo dell'altro conto resta identico. Lo fa un trigger `before delete` (security definer: l'altro conto può
--    essere di un'altra persona e le regole di visibilità non lo mostrerebbero a chi elimina).
--    Il resto che punta al conto non cambia (chiavi esterne già in uso): spese, rate, budget, preset dei budget, salvadanai e beni restano
--    con il conto vuoto (`on delete set null`); i vecchi movimenti della tabella `movimenti` e le condivisioni del conto spariscono (cascade).

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Movimenti a mano
alter table movimenti_conto drop constraint movimenti_conto_causa_check;
alter table movimenti_conto add constraint movimenti_conto_causa_check check (causa in ('spesa', 'rata', 'versamento', 'giroconto', 'budget', 'a_mano'));
-- Un movimento a mano ha sempre i due capi (Niente -> Niente lo vieta già `movimenti_conto_da_diverso_da_a`).
alter table movimenti_conto add constraint movimenti_conto_a_mano_con_capi check (causa <> 'a_mano' or da_conto_id is not null);

grant update (da_conto_id, a_conto_id, importo, momento, descrizione, categoria_id) on movimenti_conto to fp_app;

-- Cambiarli: solo l'autore, e solo con conti che vede (Niente sempre ammesso).
create policy movimenti_conto_cambia on movimenti_conto for update
  using (causa = 'a_mano' and utente_id = fp_me())
  with check (causa = 'a_mano' and utente_id = fp_me()
    and (da_conto_id = fp_niente() or fp_vede_conto(da_conto_id))
    and (a_conto_id = fp_niente() or fp_vede_conto(a_conto_id)));

-- Toglierli: i movimenti a mano solo l'autore; il resto come prima (uscite di budget).
drop policy movimenti_conto_togli on movimenti_conto;
create policy movimenti_conto_togli on movimenti_conto for delete using (
  (causa = 'budget' and (
    utente_id = fp_me()
    or (da_conto_id is not null and fp_vede_conto(da_conto_id))
    or (budget_id is not null and fp_vede_budget(budget_id))))
  or (causa = 'a_mano' and utente_id = fp_me()));

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Conto eliminato: il conto dall'altra parte non cambia
create function fp_conto_eliminato() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    -- Movimenti che riguardano solo questo conto (conto <-> Niente): spariscono.
    delete from movimenti_conto
     where (da_conto_id = old.id and a_conto_id = fp_niente()) or (a_conto_id = old.id and da_conto_id = fp_niente());
    -- Giroconti con un altro conto: il lato di questo conto diventa «Niente»; il saldo dell'altro conto resta com'è.
    update movimenti_conto set da_conto_id = fp_niente() where da_conto_id = old.id;
    update movimenti_conto set a_conto_id = fp_niente() where a_conto_id = old.id;
    return old;
  end
  $$;

create trigger conti_prima_di_eliminare before delete on conti
  for each row when (old.id <> '00000000-0000-0000-0000-000000000001') execute function fp_conto_eliminato();
