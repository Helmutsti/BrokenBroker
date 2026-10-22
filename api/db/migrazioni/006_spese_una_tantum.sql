-- Spese una tantum e obiettivi che le pagano (decisione 21).
-- - Una spesa prevista senza frequenza (ogni_mesi nullo) esce una volta sola,
--   alla prossima scadenza.
-- - Una spesa prevista può essere pagata da un obiettivo: quando la si spunta,
--   i soldi escono dall'obiettivo e non pesano sul margine del mese.
-- - Un obiettivo con "crea spesa al raggiungimento" genera, quando arriva al
--   traguardo, la sua spesa prevista una tantum (la crea l'API, una volta sola).

alter table spese_previste
  alter column ogni_mesi drop not null,
  add column obiettivo_id uuid references obiettivi (id) on delete set null;
create index spese_previste_obiettivo_ix on spese_previste (obiettivo_id) where obiettivo_id is not null;

alter table obiettivi
  add column crea_spesa boolean not null default false,
  add column spesa_creata_id uuid references spese_previste (id) on delete set null;

-- L'obiettivo collegato deve essere visibile a chi scrive la spesa.
create or replace function fp_controlla_obiettivo_spesa() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if new.obiettivo_id is not null and not fp_vede_obiettivo(new.obiettivo_id) then
    raise exception 'Obiettivo non trovato' using errcode = '23503';
  end if;
  return new;
end
$$;
create trigger spese_previste_obiettivo before insert or update of obiettivo_id on spese_previste
  for each row execute function fp_controlla_obiettivo_spesa();
revoke execute on function fp_controlla_obiettivo_spesa() from public;

-- Permessi: la spunta si modifica come gli altri campi; spesa_creata_id la
-- scrive solo l'API quando crea la spesa (stessa connessione, stesse regole).
revoke update on spese_previste from fp_app;
grant update (nome, importo, ogni_mesi, prossima_scadenza, conto_id, categoria_id, tipo, attiva, note, obiettivo_id) on spese_previste to fp_app;
revoke update on obiettivi from fp_app;
grant update (nome, traguardo, scadenza, padre_id, crea_spesa, spesa_creata_id) on obiettivi to fp_app;
