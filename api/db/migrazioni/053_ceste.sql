-- Le ceste (decisione 71): i salvadanai non sono più conti dentro i conti (sotto-conti), ma «ceste» dentro i conti. Una cesta è una parte del saldo di
-- un conto, non muove il saldo del conto: liberi del conto = saldo del conto - somma delle ceste. I soldi si spostano a mano dai liberi a una
-- cesta, da una cesta ai liberi, tra ceste dello stesso conto. Restano sotto-ceste (il padre ne fa la somma), traguardi di copertura e il traguardo
-- della cesta. Una cesta può puntare a una spesa prevista (spesa_id): prende cifra e data dalla spesa e, quando la spesa si spunta, scende della
-- stessa cifra (lo fa l'API, con una riga di spostamenti_ceste legata alla spunta).
-- Spariscono: i sotto-conti (conti.padre_id), scadenza / durata / «crea spesa» / «nascosto» dei salvadanai, il promemoria dei salvadanai
-- (spese_previste.alimenta_obiettivo_id) e il conto principale degli utenti (serviva solo ai promemoria).
-- Il saldo di ogni conto in cima resta uguale: i movimenti da/verso un sotto-conto passano al conto in cima che lo contiene.

-- ---------------------------------------------------------------------------------------------------------------
-- 0) Casi che non si convertono in modo chiaro: ci si ferma, si decide a mano.
do $$
begin
  if exists (select 1 from condivisioni s join conti c on c.id = s.conto_id where c.padre_id is not null) then
    raise exception 'Ci sono sotto-conti condivisi a parte: una cesta segue la condivisione del suo conto, da decidere a mano prima di questa migrazione';
  end if;
  if exists (select 1 from conti where padre_id is not null and saldo_scritto is not null) then
    raise exception 'Ci sono sotto-conti con un saldo scritto: da convertire a mano prima di questa migrazione';
  end if;
end $$;

-- Per ogni conto: il conto in cima che lo contiene (lui stesso se è in cima) e a che livello sta (0 = in cima).
create temp table _radice on commit drop as
  with recursive su(id, radice, livello) as (
    select id, id, 0 from conti where padre_id is null
    union all select c.id, su.radice, su.livello + 1 from conti c join su on c.padre_id = su.id)
  select id, radice, livello from su;

-- La migrazione toglie e sposta movimenti già scritti: il saldo scritto dei conti non deve cambiare (trigger della decisione 64).
alter table movimenti disable trigger movimenti_spunta_saldo;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Le tabelle delle ceste.
create table ceste (
  id uuid primary key default gen_random_uuid(),
  proprietario_id uuid not null references utenti(id) on delete cascade,
  conto_id uuid not null references conti(id) on delete cascade,
  padre_id uuid references ceste(id) on delete cascade,
  nome text not null,
  icona text not null default 'piggy-bank',
  traguardo numeric(12,2) check (traguardo is null or traguardo > 0),
  spesa_id uuid references spese_previste(id) on delete set null,
  creata_il timestamptz not null default now(),
  constraint ceste_non_padre_di_se check (padre_id is distinct from id)
);
create unique index ceste_spesa_uk on ceste (spesa_id) where spesa_id is not null;
create index ceste_conto_ix on ceste (conto_id);
create index ceste_padre_ix on ceste (padre_id) where padre_id is not null;

-- Quanto c'è nel conto o in una cesta lo dicono gli spostamenti: da una cesta ai liberi del conto (a vuoto), dai liberi a una cesta (da vuoto),
-- o tra due ceste dello stesso conto. Quello che c'è in una cesta (solo la sua parte, senza le sotto-ceste) è quanto entra meno quanto esce.
-- Gli spostamenti nati dalla spunta di una spesa collegata portano `spunta_id`: togliendo la spunta spariscono.
create table spostamenti_ceste (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utenti(id) on delete cascade,
  da_cesta_id uuid references ceste(id) on delete cascade,
  a_cesta_id uuid references ceste(id) on delete cascade,
  importo numeric(12,2) not null check (importo > 0),
  momento timestamptz not null default now(),
  descrizione text not null default '',
  spunta_id uuid references spunte(id) on delete cascade,
  constraint spostamenti_ceste_almeno_una check (num_nonnulls(da_cesta_id, a_cesta_id) >= 1),
  constraint spostamenti_ceste_da_diverso_da_a check (da_cesta_id is distinct from a_cesta_id)
);
create index spostamenti_ceste_da_ix on spostamenti_ceste (da_cesta_id) where da_cesta_id is not null;
create index spostamenti_ceste_a_ix on spostamenti_ceste (a_cesta_id) where a_cesta_id is not null;
create index spostamenti_ceste_spunta_ix on spostamenti_ceste (spunta_id) where spunta_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Ogni sotto-conto (salvadanaio, obiettivo, cesta) diventa una cesta del conto in cima che lo contiene, con lo stesso id e con i soldi che
-- ha adesso (vedi gli spostamenti più sotto). Le ceste in un sotto-conto restano sotto-ceste.
insert into ceste (id, proprietario_id, conto_id, padre_id, nome, icona, traguardo)
select c.id, c.proprietario_id, r.radice, case when r.livello > 1 then c.padre_id end, c.nome, c.icona, c.traguardo
  from conti c join _radice r on r.id = c.id where r.livello >= 1;

-- Una cesta che aveva scadenza o durata (le annuali) punta alla spesa prevista che ha lo stesso nome, lo stesso importo e la stessa data,
-- solo se la corrispondenza è una sola e chiara; altrimenti resta senza collegamento (scadenza e durata non esistono più).
with coppie as (
  select k.id as cesta, s.id as spesa,
         count(*) over (partition by k.id) as per_cesta, count(*) over (partition by s.id) as per_spesa
    from ceste k join conti c on c.id = k.id
    join spese_previste s on s.proprietario_id = k.proprietario_id and lower(s.nome) = lower(k.nome) and s.importo = k.traguardo
     and s.ogni_mesi is distinct from 1 and s.alimenta_obiettivo_id is null
     and (c.scadenza is null or s.prossima_scadenza is null or s.prossima_scadenza = c.scadenza)
   where (c.scadenza is not null or c.durata_mesi is not null)
     and not exists (select 1 from ceste f where f.padre_id = k.id))
update ceste k set spesa_id = p.spesa from coppie p where p.cesta = k.id and p.per_cesta = 1 and p.per_spesa = 1;

-- I traguardi di copertura puntano alle ceste.
drop policy traguardi_tutti on traguardi_copertura;
alter table traguardi_copertura add column cesta_id uuid references ceste(id) on delete cascade;
update traguardi_copertura set cesta_id = conto_id;
alter table traguardi_copertura drop column conto_id, alter column cesta_id set not null;

-- Gli spostamenti: un movimento che entra o esce da un sotto-conto diventa un movimento della cesta (stessa data, descrizione e spunta, a
-- meno che la spunta sia di un promemoria di salvadanaio: quelli si staccano più sotto). Tra due ceste dello stesso conto una riga sola;
-- da/verso fuori dal conto, o verso un'altra cesta di un altro conto, una riga per ogni cesta.
create temp table _promemoria_spunte on commit drop as
  select sp.id from spunte sp join spese_previste s on s.id = sp.spesa_prevista_id where s.alimenta_obiettivo_id is not null;

insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, momento, descrizione, spunta_id)
select m.utente_id, dk.id, ak.id, m.importo, m.momento, m.descrizione, case when m.spunta_id in (select id from _promemoria_spunte) then null else m.spunta_id end
  from movimenti m left join ceste dk on dk.id = m.da_conto_id left join ceste ak on ak.id = m.a_conto_id
 where (dk.id is not null or ak.id is not null) and (dk.id is null or ak.id is null or dk.conto_id = ak.conto_id);
insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, momento, descrizione, spunta_id)
select m.utente_id, dk.id, null, m.importo, m.momento, m.descrizione, case when m.spunta_id in (select id from _promemoria_spunte) then null else m.spunta_id end
  from movimenti m join ceste dk on dk.id = m.da_conto_id join ceste ak on ak.id = m.a_conto_id where dk.conto_id <> ak.conto_id;
insert into spostamenti_ceste (utente_id, da_cesta_id, a_cesta_id, importo, momento, descrizione, spunta_id)
select m.utente_id, null, ak.id, m.importo, m.momento, m.descrizione, null
  from movimenti m join ceste dk on dk.id = m.da_conto_id join ceste ak on ak.id = m.a_conto_id where dk.conto_id <> ak.conto_id;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Niente promemoria dei salvadanai. I movimenti che la loro spunta aveva creato restano, come movimenti normali (il saldo non cambia).
update movimenti set spunta_id = null where spunta_id in (select id from _promemoria_spunte);
delete from spese_previste where alimenta_obiettivo_id is not null;
drop trigger spese_previste_obiettivo on spese_previste;
drop function fp_controlla_obiettivo_spesa();
alter table spese_previste drop column alimenta_obiettivo_id;
alter table utenti drop column conto_principale_id;

-- ---------------------------------------------------------------------------------------------------------------
-- 4) I conti tornano piatti: i movimenti, le spese e le rate che puntavano a un sotto-conto puntano al conto in cima. Quello che si spostava
-- tra un conto e un suo sotto-conto non sposta più niente (è già negli spostamenti delle ceste), e il saldo del conto non cambia.
delete from movimenti m
 where m.da_conto_id is not null and m.a_conto_id is not null and m.da_conto_id <> m.a_conto_id
   and (select radice from _radice where id = m.da_conto_id) = (select radice from _radice where id = m.a_conto_id);
update movimenti m set da_conto_id = (select radice from _radice where id = m.da_conto_id)
 where m.da_conto_id in (select id from _radice where livello >= 1);
update movimenti m set a_conto_id = (select radice from _radice where id = m.a_conto_id)
 where m.a_conto_id in (select id from _radice where livello >= 1);

update spese_previste s set conto_id = (select radice from _radice where id = s.conto_id) where s.conto_id in (select id from _radice where livello >= 1);
update spese_previste s set a_conto_id = (select radice from _radice where id = s.a_conto_id) where s.a_conto_id in (select id from _radice where livello >= 1);
-- Una spesa da un conto a una sua cesta non è più uno spostamento tra conti: sparisce.
delete from spese_previste where conto_id is not null and conto_id = a_conto_id;
update rate r set conto_id = (select radice from _radice where id = r.conto_id) where r.conto_id in (select id from _radice where livello >= 1);

-- Via i sotto-conti (le ceste hanno già i loro dati) e tutto ciò che serviva ai salvadanai.
alter table conti drop constraint conti_padre_id_fkey;
delete from conti where padre_id is not null;
drop policy conti_crea on conti;
drop trigger conti_senza_cicli on conti;
drop function fp_conti_senza_cicli();
drop function fp_conto_condiviso(uuid);
alter table conti
  drop column padre_id, drop column traguardo, drop column scadenza, drop column nascosto,
  drop column crea_spesa, drop column spesa_creata_id, drop column durata_mesi;
create policy conti_crea on conti for insert with check (proprietario_id = fp_me());

-- Si vede un conto se è tuo o se è condiviso con te.
create or replace function fp_vede_conto(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from conti where id = p_id and proprietario_id = fp_me())
        or exists (select 1 from condivisioni s where s.conto_id = p_id and s.condiviso_con_id = fp_me())
  $$;

-- La spunta fa uscire i soldi anche prima del momento del saldo scritto (decisione 64): si corregge il saldo scritto dei due conti.
create or replace function fp_spunta_nel_saldo_scritto(p_da uuid, p_a uuid, p_importo numeric, p_momento timestamptz, p_segno int) returns void
  language sql security definer set search_path = public as $$
    update conti c set saldo_scritto = c.saldo_scritto
        + p_segno * ((case when c.id = p_a then 1 else 0 end) - (case when c.id = p_da then 1 else 0 end)) * p_importo
     where c.id in (p_da, p_a) and c.saldo_scritto is not null and c.saldo_scritto_il >= p_momento
  $$;
alter table movimenti enable trigger movimenti_spunta_saldo;

-- ---------------------------------------------------------------------------------------------------------------
-- 5) Visibilità: una cesta la vede chi vede il suo conto (e quindi, per un conto condiviso, tutti e due).
create function fp_vede_cesta(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from ceste k where k.id = p_id and fp_vede_conto(k.conto_id))
  $$;
grant execute on function fp_vede_cesta(uuid) to fp_app;

-- Una cesta sta dentro il conto della cesta superiore, non crea cicli, e una cesta collegata a una spesa non ne contiene altre.
create function fp_ceste_coerenti() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.padre_id is not null then
    if not exists (select 1 from ceste p where p.id = new.padre_id and p.conto_id = new.conto_id) then
      raise exception 'Una sotto-cesta sta nello stesso conto della cesta che la contiene';
    end if;
    if exists (select 1 from ceste p where p.id = new.padre_id and p.spesa_id is not null) then
      raise exception 'Una cesta collegata a una spesa non può contenere altre ceste';
    end if;
    if exists (with recursive su as (select id, padre_id from ceste where id = new.padre_id
                                     union all select k.id, k.padre_id from ceste k join su on k.id = su.padre_id)
               select 1 from su where id = new.id) then
      raise exception 'Una cesta non può stare dentro una sua sotto-cesta';
    end if;
  end if;
  if new.spesa_id is not null and exists (select 1 from ceste f where f.padre_id = new.id) then
    raise exception 'Una cesta che contiene altre ceste non può essere collegata a una spesa';
  end if;
  return new;
end $$;
create trigger ceste_coerenti before insert or update of padre_id, conto_id, spesa_id on ceste for each row execute function fp_ceste_coerenti();

alter table ceste enable row level security;
alter table spostamenti_ceste enable row level security;
grant select, insert, update, delete on ceste to fp_app;
grant select, insert on spostamenti_ceste to fp_app;
create policy ceste_vedi on ceste for select using (proprietario_id = fp_me() or fp_vede_conto(conto_id));
create policy ceste_crea on ceste for insert with check (proprietario_id = fp_me() and fp_vede_conto(conto_id));
create policy ceste_modifica on ceste for update using (fp_vede_conto(conto_id)) with check (fp_vede_conto(conto_id));
create policy ceste_cancella on ceste for delete using (proprietario_id = fp_me());
create policy spostamenti_ceste_vedi on spostamenti_ceste for select using (fp_vede_cesta(coalesce(da_cesta_id, a_cesta_id)));
create policy spostamenti_ceste_crea on spostamenti_ceste for insert
  with check (utente_id = fp_me() and fp_vede_cesta(coalesce(da_cesta_id, a_cesta_id)) and (a_cesta_id is null or da_cesta_id is null or fp_vede_cesta(a_cesta_id)));
create policy traguardi_tutti on traguardi_copertura for all using (fp_vede_cesta(cesta_id)) with check (fp_vede_cesta(cesta_id));
