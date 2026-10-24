-- Via i movimenti (decisione di Manuel del 2026-10-24): l'app non tiene le entrate e
-- le uscite, serve ad annotare le spese e a organizzare i soldi. I conti restano come
-- elenco (nome e icona), senza tipo e senza saldo. Gli obiettivi (salvadanai) possono
-- avere un'icona e si possono nascondere.

-- Prima di tutto la tabella: con lei spariscono le sue regole di accesso (che dipendono
-- dalle colonne movimento_id delle altre tabelle) e i collegamenti verso di lei.
drop policy quote_tutte on quote;
drop table movimenti cascade;

-- Quote: restano solo quelle delle spese previste.
delete from quote where movimento_id is not null;
alter table quote drop constraint quote_check;
drop index quote_movimento_uk;
alter table quote drop column movimento_id;
alter table quote alter column spesa_prevista_id set not null;
create policy quote_tutte on quote for all
  using (coalesce(fp_vede_spesa(spesa_prevista_id), false))
  with check (coalesce(fp_vede_spesa(spesa_prevista_id), false));

-- Condivisioni: si condividono conti, spese e obiettivi.
delete from condivisioni where movimento_id is not null;
drop policy condivisioni_crea on condivisioni;
drop index condivisioni_uk;
alter table condivisioni drop constraint condivisioni_check;
alter table condivisioni drop column movimento_id;
alter table condivisioni add check (num_nonnulls(conto_id, spesa_prevista_id, obiettivo_id) = 1);
create unique index condivisioni_uk on condivisioni
  (condiviso_con_id, coalesce(conto_id, spesa_prevista_id, obiettivo_id));
drop function fp_possiede_voce(uuid, uuid, uuid, uuid);
create function fp_possiede_voce(p_conto uuid, p_spesa uuid, p_obiettivo uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when p_conto     is not null then exists (select 1 from conti where id = p_conto and proprietario_id = fp_me())
      when p_spesa     is not null then exists (select 1 from spese_previste where id = p_spesa and proprietario_id = fp_me())
      when p_obiettivo is not null then exists (select 1 from obiettivi where id = p_obiettivo and proprietario_id = fp_me())
      else false
    end
  $$;
create policy condivisioni_crea on condivisioni for insert
  with check (proprietario_id = fp_me() and fp_possiede_voce(conto_id, spesa_prevista_id, obiettivo_id));

-- Versamenti: non c'è più il movimento da cui nascevano.
alter table versamenti drop column movimento_id;

drop function fp_vede_movimento(uuid);

-- Conti: nome e icona, niente tipo né saldo.
alter table conti drop column tipo, drop column saldo_iniziale, drop column data_saldo_iniziale;
alter table conti add column icona text not null default 'landmark';
grant update (icona) on conti to fp_app;

-- Obiettivi: icona scelta dall'utente e possibilità di nasconderli (anche il
-- contenitore delle spese annuali, che si può usare o no).
alter table obiettivi add column icona text;
alter table obiettivi add column nascosto boolean not null default false;
grant update (icona, nascosto) on obiettivi to fp_app;

-- Il salvadanaio contenitore delle spese annuali si può usare o no (e mostrare o nascondere,
-- con "nascosto" qui sopra): decide l'utente.
alter table utenti add column annuali_usate boolean not null default true;
grant select (annuali_usate), update (annuali_usate) on utenti to fp_app;
