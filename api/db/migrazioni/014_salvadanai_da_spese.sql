-- Un obiettivo si riempie con una spesa del mese (decisione di Manuel del 2026-10-23):
-- "Mettici da parte ogni mese / ogni anno" crea una spesa prevista che compare
-- nell'elenco Spese; spuntarla versa la cifra nel salvadanaio. Le spese annuali
-- diventano un salvadanaio unico con un sotto-obiettivo per ogni spesa.

-- La spesa che riempie un obiettivo (al massimo una per obiettivo). Diverso da
-- obiettivo_id, che è l'obiettivo che *paga* la spesa.
alter table spese_previste add column alimenta_obiettivo_id uuid references obiettivi (id) on delete cascade;
create unique index spese_previste_alimenta_uk on spese_previste (alimenta_obiettivo_id) where alimenta_obiettivo_id is not null;

-- L'obiettivo collegato deve essere visibile a chi scrive la spesa (come per obiettivo_id).
create or replace function fp_controlla_obiettivo_spesa() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if new.obiettivo_id is not null and not fp_vede_obiettivo(new.obiettivo_id) then
    raise exception 'Obiettivo non trovato' using errcode = '23503';
  end if;
  if new.alimenta_obiettivo_id is not null and not fp_vede_obiettivo(new.alimenta_obiettivo_id) then
    raise exception 'Obiettivo non trovato' using errcode = '23503';
  end if;
  return new;
end
$$;
drop trigger spese_previste_obiettivo on spese_previste;
create trigger spese_previste_obiettivo before insert or update of obiettivo_id, alimenta_obiettivo_id on spese_previste
  for each row execute function fp_controlla_obiettivo_spesa();

grant update (alimenta_obiettivo_id) on spese_previste to fp_app;
