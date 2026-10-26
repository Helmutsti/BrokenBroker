-- Categoria per persona sulle spese condivise (decisione 43): le categorie non si condividono.
-- Chi ha creato la spesa usa spese_previste.categoria_id; ogni persona che la riceve ha la SUA
-- categoria in questa tabella, e sa se la spesa è «nuova» (non ancora aperta né categorizzata).

-- Serve alla chiave composta: una categoria può essere scelta solo dalla persona a cui appartiene.
alter table categorie add constraint categorie_id_proprietario_uk unique (id, proprietario_id);

create table spese_dati_utente (
  spesa_prevista_id uuid not null references spese_previste (id) on delete cascade,
  utente_id         uuid not null references utenti (id) on delete cascade,
  categoria_id      uuid,
  vista_il          timestamptz,
  primary key (spesa_prevista_id, utente_id),
  -- se la categoria viene eliminata torna «Da categorizzare»
  foreign key (categoria_id, utente_id) references categorie (id, proprietario_id) on delete set null (categoria_id)
);
create index spese_dati_utente_categoria_ix on spese_dati_utente (categoria_id);
comment on table spese_dati_utente is 'Dati personali di chi RICEVE una spesa condivisa: la sua categoria e quando l''ha vista. Il creatore usa spese_previste.categoria_id';

grant select, insert, update (categoria_id, vista_il) on spese_dati_utente to fp_app;
alter table spese_dati_utente enable row level security;
create policy dati_spesa_vedi     on spese_dati_utente for select using (utente_id = fp_me());
create policy dati_spesa_crea     on spese_dati_utente for insert with check (utente_id = fp_me() and fp_vede_spesa(spesa_prevista_id));
create policy dati_spesa_modifica on spese_dati_utente for update using (utente_id = fp_me()) with check (utente_id = fp_me());

-- Proposta di categoria per chi riceve la spesa: la sua categoria con lo stesso percorso di nomi
-- (senza maiuscole) di quella del creatore, altrimenti con lo stesso nome della categoria finale
-- (di base dello stesso tipo, la meno annidata), altrimenti nessuna («Da categorizzare»).
create or replace function fp_proponi_categoria(p_spesa uuid, p_utente uuid) returns uuid
  language sql stable security definer set search_path = public
  as $$
    with recursive
      sp as (select categoria_id, proprietario_id from spese_previste where id = p_spesa),
      perc as (
        select c.id, c.proprietario_id, c.tipo, c.ordine, c.nome, array[lower(c.nome)] as percorso
          from categorie c, sp
         where c.padre_id is null and c.proprietario_id in (sp.proprietario_id, p_utente)
        union all
        select c.id, c.proprietario_id, c.tipo, c.ordine, c.nome, p.percorso || lower(c.nome)
          from categorie c join perc p on c.padre_id = p.id),
      origine as (select p.* from perc p join sp on p.id = sp.categoria_id),
      mie as (select * from perc where proprietario_id = p_utente)
    select coalesce(
      (select m.id from mie m, origine o where m.percorso = o.percorso order by m.id limit 1),
      (select m.id from mie m, origine o
        where lower(m.nome) = lower(o.nome)
        order by (m.tipo = o.tipo) desc, array_length(m.percorso, 1), m.ordine, m.id limit 1))
  $$;
revoke execute on function fp_proponi_categoria(uuid, uuid) from public;

-- Quando nasce una condivisione di una spesa, chi la riceve ottiene la sua riga con la categoria proposta;
-- quando finisce, la riga sparisce.
create or replace function fp_condivisione_spesa() returns trigger
  language plpgsql security definer set search_path = public
  as $$
  begin
    if tg_op = 'INSERT' then
      if new.spesa_prevista_id is not null then
        insert into spese_dati_utente (spesa_prevista_id, utente_id, categoria_id)
        values (new.spesa_prevista_id, new.condiviso_con_id, fp_proponi_categoria(new.spesa_prevista_id, new.condiviso_con_id))
        on conflict do nothing;
      end if;
    elsif old.spesa_prevista_id is not null then
      delete from spese_dati_utente where spesa_prevista_id = old.spesa_prevista_id and utente_id = old.condiviso_con_id;
    end if;
    return null;
  end $$;
revoke execute on function fp_condivisione_spesa() from public;
create trigger condivisioni_dati_spesa after insert or delete on condivisioni
  for each row execute function fp_condivisione_spesa();

-- Condivisioni già esistenti: stessa regola di proposta; «vista» adesso, così non risultano tutte nuove.
insert into spese_dati_utente (spesa_prevista_id, utente_id, categoria_id, vista_il)
select c.spesa_prevista_id, c.condiviso_con_id, fp_proponi_categoria(c.spesa_prevista_id, c.condiviso_con_id), now()
  from condivisioni c
 where c.spesa_prevista_id is not null
on conflict do nothing;
