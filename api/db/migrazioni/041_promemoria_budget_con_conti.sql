-- Il promemoria di un budget esiste solo con un conto di partenza e uno di destinazione effettivi, diversi (decisione 55).
-- Conti effettivi = quelli del budget, altrimenti le impostazioni dei budget di chi possiede il budget.
--  1) I promemoria accesi senza conti effettivi (o con i due conti uguali) vengono spenti; ogni caso è nel log (NOTICE).
--  2) Eliminando un conto (le chiavi esterne lo tolgono da budget e impostazioni, `on delete set null`) i promemoria che restano senza
--     conti effettivi si spengono da soli: lo fa un trigger `after delete` su `conti` (security definer: il budget può essere di un'altra persona).

do $$
declare r record;
begin
  for r in
    select c.nome, u.nome as persona
      from budget b join categorie c on c.id = b.categoria_id join utenti u on u.id = b.proprietario_id
     where b.promemoria
       and (coalesce(b.conto_partenza_id, u.budget_partenza_id) is null
            or coalesce(b.conto_id, u.budget_arrivo_id) is null
            or coalesce(b.conto_partenza_id, u.budget_partenza_id) = coalesce(b.conto_id, u.budget_arrivo_id))
     order by u.nome, c.nome loop
    raise notice 'Budget «%» di %: promemoria spento (mancano i conti di partenza o destinazione)', r.nome, r.persona;
  end loop;
end $$;

update budget b set promemoria = false
  from utenti u
 where u.id = b.proprietario_id and b.promemoria
   and (coalesce(b.conto_partenza_id, u.budget_partenza_id) is null
        or coalesce(b.conto_id, u.budget_arrivo_id) is null
        or coalesce(b.conto_partenza_id, u.budget_partenza_id) = coalesce(b.conto_id, u.budget_arrivo_id));

create function fp_budget_senza_conti() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    update budget b set promemoria = false
      from utenti u
     where u.id = b.proprietario_id and b.promemoria
       and (coalesce(b.conto_partenza_id, u.budget_partenza_id) is null or coalesce(b.conto_id, u.budget_arrivo_id) is null);
    return old;
  end
  $$;

create trigger conti_dopo_eliminare_budget after delete on conti
  for each row when (old.id <> '00000000-0000-0000-0000-000000000001') execute function fp_budget_senza_conti();
