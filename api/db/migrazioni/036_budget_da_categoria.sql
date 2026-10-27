-- Budget da categoria (decisione 49, precisa la 48). Un budget non è più una spesa prevista: è una tabella a sé,
-- legata 1 a 1 a una categoria (le categorie sono per persona, decisione 43: il budget è di chi possiede la categoria).
--  - modo 'sposto': promemoria che sposta soldi (giroconto) dal conto di partenza al «conto del budget» quando si spunta;
--  - modo 'conto': un tetto del mese; lo speso è tutto ciò che esce con la categoria del budget, da qualunque conto.
-- Lo speso non dipende dai conti del budget: i conti servono solo al giroconto del modo 'sposto'.

create table budget (
  id                 uuid primary key default gen_random_uuid(),
  proprietario_id    uuid not null references utenti (id) on delete cascade,
  categoria_id       uuid not null,
  importo            numeric(12,2) not null check (importo >= 0),
  modo               text not null default 'sposto' check (modo in ('sposto', 'conto')),
  conto_id           uuid references conti (id) on delete set null,
  conto_partenza_id  uuid references conti (id) on delete set null,
  mostra_in_spese    boolean not null default true,
  attivo             boolean not null default true,
  note               text,
  creato_il          timestamptz not null default now(),
  constraint budget_una_per_categoria unique (categoria_id),
  foreign key (categoria_id, proprietario_id) references categorie (id, proprietario_id) on delete cascade,
  constraint budget_conti_solo_sposto check (modo = 'sposto' or (conto_id is null and conto_partenza_id is null)),
  constraint budget_conti_diversi check (conto_partenza_id is distinct from conto_id or conto_partenza_id is null)
);
create index budget_proprietario_ix on budget (proprietario_id);
comment on column budget.conto_id is 'Conto su cui il promemoria sposta i soldi; vuoto = quello delle impostazioni dei budget di chi possiede il budget';
comment on column budget.conto_partenza_id is 'Conto da cui il promemoria prende i soldi; vuoto = quello delle impostazioni dei budget di chi possiede il budget';

-- Impostazioni dei budget (per persona): dove vanno i soldi di base. Un budget «sposto» senza conti suoi usa queste.
-- I promemoria spostano i soldi da conto a conto (giroconto, non sono speso); le spese li fanno uscire dal conto verso «fuori».
alter table utenti
  add column budget_partenza_id uuid references conti (id) on delete set null,
  add column budget_arrivo_id   uuid references conti (id) on delete set null;
grant select (budget_partenza_id, budget_arrivo_id), update (budget_partenza_id, budget_arrivo_id) on utenti to fp_app;

-- ---------------------------------------------------------------------------------------------------------------
-- Conversione dei budget esistenti (spese_previste con tipo 'budget').
-- I conti dei vecchi budget restano come conti propri del budget (le impostazioni partono vuote).
-- Il nuovo budget riprende lo STESSO id della spesa: spunte, quote, condivisioni e uscite si ricollegano da sole.
-- Categoria: quella della spesa se è del proprietario; altrimenti una categoria di primo livello con lo stesso nome del
-- budget (la si crea se manca). Due budget dello stesso proprietario con la stessa categoria si UNISCONO: tetti sommati,
-- modo e conti di quello che resta (prima gli attivi, poi per nome); spunte, uscite, quote e condivisioni passano a lui.
create temp table budget_vecchi as
  select s.id, s.proprietario_id, s.nome, s.importo, s.attiva, s.note,
         coalesce(s.budget_modo, 'sposto') as modo, s.conto_partenza_id, s.conto_arrivo_id,
         case when exists (select 1 from categorie c where c.id = s.categoria_id and c.proprietario_id = s.proprietario_id)
              then s.categoria_id end as categoria_id,
         null::uuid as sopravvissuto
    from spese_previste s
   where s.tipo = 'budget';

do $$
declare r record; c uuid;
begin
  for r in select id, proprietario_id, nome from budget_vecchi where categoria_id is null order by nome, id loop
    select k.id into c from categorie k
     where k.proprietario_id = r.proprietario_id and k.padre_id is null and lower(k.nome) = lower(trim(r.nome))
     order by k.ordine, k.id limit 1;
    if c is null then
      insert into categorie (proprietario_id, nome, tipo) values (r.proprietario_id, trim(r.nome), 'uscita') returning id into c;
      raise notice 'Budget «%»: senza categoria, creata la categoria «%»', r.nome, trim(r.nome);
    else
      raise notice 'Budget «%»: senza categoria, collegato alla categoria esistente con lo stesso nome', r.nome;
    end if;
    update budget_vecchi set categoria_id = c where id = r.id;
  end loop;

  for r in select proprietario_id, categoria_id, count(*) as quanti, string_agg(nome, ', ') as nomi
             from budget_vecchi group by proprietario_id, categoria_id having count(*) > 1 loop
    raise notice 'Budget uniti (stessa categoria %): % -> tetti sommati', r.categoria_id, r.nomi;
  end loop;
end $$;

update budget_vecchi b set sopravvissuto = x.primo
  from (select id, first_value(id) over (partition by proprietario_id, categoria_id order by attiva desc, nome, id::text) as primo
          from budget_vecchi) x
 where x.id = b.id;

insert into budget (id, proprietario_id, categoria_id, importo, modo, conto_id, conto_partenza_id, attivo, note)
select v.id, v.proprietario_id, v.categoria_id,
       (select sum(g.importo) from budget_vecchi g where g.sopravvissuto = v.id),
       v.modo,
       case when v.modo = 'sposto' then v.conto_arrivo_id end,
       case when v.modo = 'sposto' then v.conto_partenza_id end,
       (select bool_or(g.attiva) from budget_vecchi g where g.sopravvissuto = v.id),
       v.note
  from budget_vecchi v
 where v.sopravvissuto = v.id;

-- ---------------------------------------------------------------------------------------------------------------
-- Funzioni e regole di visibilità.
alter table condivisioni add column budget_id uuid references budget (id) on delete cascade;
create function fp_vede_budget(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from budget where id = p_id and proprietario_id = fp_me())
        or exists (select 1 from condivisioni where budget_id = p_id and condiviso_con_id = fp_me())
  $$;

grant select, insert, delete on budget to fp_app;
grant update (importo, modo, conto_id, conto_partenza_id, mostra_in_spese, attivo, note) on budget to fp_app;
alter table budget enable row level security;
create policy budget_vedi     on budget for select
  using (proprietario_id = fp_me() or exists (select 1 from condivisioni s where s.budget_id = budget.id and s.condiviso_con_id = fp_me()));
create policy budget_crea     on budget for insert with check (proprietario_id = fp_me());
create policy budget_modifica on budget for update using (fp_vede_budget(id)) with check (fp_vede_budget(id));
create policy budget_cancella on budget for delete using (proprietario_id = fp_me());

-- ---------------------------------------------------------------------------------------------------------------
-- Condivisioni e quote: anche i budget si condividono e si dividono.
do $$
declare k record;
begin
  for k in select conrelid::regclass as t, conname from pg_constraint
            where contype = 'c' and conrelid in ('condivisioni'::regclass, 'quote'::regclass, 'spunte'::regclass)
              and pg_get_constraintdef(oid) like '%num_nonnulls%' loop
    execute format('alter table %s drop constraint %I', k.t, k.conname);
  end loop;
end $$;
drop policy condivisioni_crea on condivisioni;
drop index condivisioni_uk;
alter table condivisioni add check (num_nonnulls(conto_id, spesa_prevista_id, obiettivo_id, budget_id) = 1);

alter table quote add column budget_id uuid references budget (id) on delete cascade;
alter table quote alter column spesa_prevista_id drop not null;
alter table quote add check (num_nonnulls(spesa_prevista_id, budget_id) = 1);

alter table spunte add column budget_id uuid references budget (id) on delete cascade;
alter table spunte add check (num_nonnulls(spesa_prevista_id, rata_id, budget_id) = 1);
create index spunte_budget_ix on spunte (budget_id, data) where budget_id is not null;

-- Ricollegamento (anche dei budget uniti: puntano a quello che resta).
update spunte set budget_id = v.sopravvissuto, spesa_prevista_id = null
  from budget_vecchi v where spunte.spesa_prevista_id = v.id;
update quote set budget_id = v.sopravvissuto, spesa_prevista_id = null
  from budget_vecchi v where quote.spesa_prevista_id = v.id;
update condivisioni set budget_id = v.sopravvissuto, spesa_prevista_id = null
  from budget_vecchi v where condivisioni.spesa_prevista_id = v.id;
-- Nei budget uniti una persona può comparire due volte: resta una riga sola.
delete from quote a using quote b where a.budget_id = b.budget_id and a.utente_id = b.utente_id and a.id::text > b.id::text;
delete from condivisioni a using condivisioni b where a.budget_id = b.budget_id and a.condiviso_con_id = b.condiviso_con_id and a.id::text > b.id::text;
create unique index quote_budget_uk on quote (budget_id, utente_id) where budget_id is not null;
create unique index condivisioni_uk on condivisioni (condiviso_con_id, coalesce(conto_id, spesa_prevista_id, obiettivo_id, budget_id));

drop policy quote_tutte on quote;
create policy quote_tutte on quote for all
  using (coalesce(fp_vede_spesa(spesa_prevista_id), false) or coalesce(fp_vede_budget(budget_id), false))
  with check (coalesce(fp_vede_spesa(spesa_prevista_id), false) or coalesce(fp_vede_budget(budget_id), false));

drop function fp_possiede_voce(uuid, uuid, uuid);
create function fp_possiede_voce(p_conto uuid, p_spesa uuid, p_obiettivo uuid, p_budget uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when p_conto     is not null then exists (select 1 from conti where id = p_conto and proprietario_id = fp_me())
      when p_spesa     is not null then exists (select 1 from spese_previste where id = p_spesa and proprietario_id = fp_me())
      when p_obiettivo is not null then exists (select 1 from obiettivi where id = p_obiettivo and proprietario_id = fp_me())
      when p_budget    is not null then exists (select 1 from budget where id = p_budget and proprietario_id = fp_me())
      else false
    end
  $$;
create policy condivisioni_crea on condivisioni for insert
  with check (proprietario_id = fp_me() and fp_possiede_voce(conto_id, spesa_prevista_id, obiettivo_id, budget_id));

-- Spunte: si vedono, si fanno e si tolgono insieme al loro budget.
drop policy spunte_vedi on spunte;
drop policy spunte_crea on spunte;
drop policy spunte_cancella on spunte;
create policy spunte_vedi on spunte for select using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id))
  or (budget_id is not null and exists (select 1 from budget b where b.id = budget_id)));
create policy spunte_crea on spunte for insert with check (utente_id = fp_me() and (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id))
  or (budget_id is not null and exists (select 1 from budget b where b.id = budget_id))));
create policy spunte_cancella on spunte for delete using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id))
  or (budget_id is not null and exists (select 1 from budget b where b.id = budget_id)));

-- ---------------------------------------------------------------------------------------------------------------
-- Registro dei movimenti: le uscite a mano hanno una categoria (contano nel budget di quella categoria, da qualunque conto);
-- il budget_id resta come legame con il budget da cui sono state registrate e punta alla nuova tabella.
alter table movimenti_conto drop constraint movimenti_conto_budget_id_fkey;
update movimenti_conto set budget_id = v.sopravvissuto from budget_vecchi v where movimenti_conto.budget_id = v.id;
alter table movimenti_conto add constraint movimenti_conto_budget_id_fkey foreign key (budget_id) references budget (id) on delete set null;
alter table movimenti_conto add column categoria_id uuid references categorie (id) on delete set null;
-- Le uscite già registrate prendono la categoria del loro budget.
update movimenti_conto m set categoria_id = b.categoria_id from budget b where m.budget_id = b.id and m.causa = 'budget';
create index movimenti_conto_categoria_ix on movimenti_conto (categoria_id, momento) where categoria_id is not null;

drop policy movimenti_conto_vedi on movimenti_conto;
drop policy movimenti_conto_crea on movimenti_conto;
drop policy movimenti_conto_togli on movimenti_conto;
create policy movimenti_conto_vedi on movimenti_conto for select using (
  (conto_id is not null and fp_vede_conto(conto_id))
  or (causa = 'budget' and (utente_id = fp_me() or (budget_id is not null and fp_vede_budget(budget_id)))));
create policy movimenti_conto_crea on movimenti_conto for insert with check (
  utente_id = fp_me() and (
    (conto_id is not null and fp_vede_conto(conto_id))
    or (conto_id is null and causa = 'budget' and budget_id is not null and fp_vede_budget(budget_id))));
create policy movimenti_conto_togli on movimenti_conto for delete using (
  causa = 'budget' and (
    utente_id = fp_me()
    or (conto_id is not null and fp_vede_conto(conto_id))
    or (budget_id is not null and fp_vede_budget(budget_id))));

create or replace function fp_conto_condiviso(p_conto uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from condivisioni where conto_id = p_conto)
       and (fp_vede_conto(p_conto)
            or exists (select 1 from spese_previste e where e.conto_id = p_conto and fp_vede_spesa(e.id)))
  $$;

create or replace function fp_annulla_spunta(p_spunta uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    if not exists (select 1 from spunte s where s.id = p_spunta
                    and ((s.spesa_prevista_id is not null and fp_vede_spesa(s.spesa_prevista_id))
                      or (s.budget_id is not null and fp_vede_budget(s.budget_id))
                      or (s.rata_id is not null and exists (select 1 from rate r where r.id = s.rata_id and r.proprietario_id = fp_me())))) then
      return;
    end if;
    delete from versamenti where quota_spunta_id = p_spunta;       -- porta via anche il suo movimento
    delete from movimenti_conto where spunta_id = p_spunta;
  end
  $$;

-- La spunta di un budget «sposto»: il giroconto dal conto di partenza al conto del budget (due movimenti collegati, stessa
-- spunta), anche se i conti non sono visibili a chi spunta (budget condiviso). Non conta come speso.
create or replace function fp_spunta_giroconto(p_spunta uuid, p_importo numeric) returns void
  language plpgsql security definer set search_path = public
  as $$
  declare s record; g uuid := gen_random_uuid(); da text; a text;
  begin
    -- Conti effettivi: quelli del budget, altrimenti le impostazioni dei budget di chi possiede il budget.
    select sp.utente_id, b.id as budget, b.modo, coalesce(b.conto_partenza_id, u.budget_partenza_id) as partenza,
           coalesce(b.conto_id, u.budget_arrivo_id) as arrivo, b.importo, c.nome as categoria into s
      from spunte sp join budget b on b.id = sp.budget_id join categorie c on c.id = b.categoria_id
      join utenti u on u.id = b.proprietario_id where sp.id = p_spunta;
    if not found or s.utente_id <> fp_me() or not fp_vede_budget(s.budget) then
      raise exception 'Spunta non valida' using errcode = '42501';
    end if;
    if s.modo <> 'sposto' or s.partenza is null or s.arrivo is null or s.partenza = s.arrivo
       or p_importo <= 0 or p_importo > s.importo + 0.005 then
      raise exception 'Giroconto non valido' using errcode = '22023';
    end if;
    select conti.nome into da from conti where id = s.partenza;
    select conti.nome into a from conti where id = s.arrivo;
    insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id, budget_id, giroconto_id)
      values (s.partenza, -p_importo, fp_me(), 'giroconto', 'Giroconto ' || s.categoria || ' verso ' || a, p_spunta, s.budget, g),
             (s.arrivo,    p_importo, fp_me(), 'giroconto', 'Giroconto ' || s.categoria || ' da ' || da, p_spunta, s.budget, g);
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Via i budget dalle spese previste.
delete from spese_previste where tipo = 'budget';
alter table spese_previste drop constraint if exists spese_budget_senza_conto;
alter table spese_previste drop column budget_modo, drop column conto_partenza_id, drop column conto_arrivo_id;
do $$
declare k record;
begin
  for k in select conname from pg_constraint
            where contype = 'c' and conrelid = 'spese_previste'::regclass and pg_get_constraintdef(oid) like '%''budget''%' loop
    execute format('alter table spese_previste drop constraint %I', k.conname);
  end loop;
end $$;
alter table spese_previste add constraint spese_previste_tipo_check check (tipo in ('fissa', 'investimento'));

drop table budget_vecchi;
