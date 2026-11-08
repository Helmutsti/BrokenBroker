-- Le ceste nelle spese (decisione 73): ogni spesa non mensile (ogni 2 o più mesi, o una volta sola) ha la sua cesta, che è solo un numero sulla spesa
-- (`raccolto`): non è un salvadanaio, non compare nella pagina Salvadanai. I salvadanai restano obiettivi liberi.
-- Il raccolto sale con la spunta della quota del mese (`quote_annuali`) e scende quando segni la spesa pagata (la sua spunta porta
-- `raccolto_scalato`, la tua quota della scadenza); si corregge anche a mano. Lo fanno due trigger, così togliere una spunta ripristina sempre il raccolto.
-- La quota spuntata fa scendere il saldo (saldi.ts), il pagamento della scadenza no: i soldi sono già usciti mese per mese.
-- Spariscono l'interruttore «Metti da parte ogni mese» e il legame tra spesa e salvadanaio (`ceste.spesa_id`): i salvadanai collegati si convertono
-- in raccolto della spesa e vengono eliminati.

-- ---------------------------------------------------------------------------------------------------------------
-- 0) Casi che non si convertono in modo chiaro: ci si ferma, si decide a mano.
do $$
begin
  if exists (select 1 from ceste k where k.spesa_id is not null and exists (select 1 from ceste f where f.padre_id = k.id and f.spesa_id is null)) then
    raise exception 'Ci sono salvadanai collegati a una spesa che contengono sotto-salvadanai non collegati: da sistemare a mano prima di questa migrazione';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Il raccolto sulla spesa e quanto scala la spunta di uscita.
alter table spese_previste add column raccolto numeric(12,2) not null default 0;
grant update (raccolto) on spese_previste to fp_app;

-- Quanto la spunta di uscita ha tolto dal raccolto (la tua quota della scadenza; 0 per mensili e rate).
alter table spunte add column raccolto_scalato numeric(12,2) not null default 0;

create function fp_raccolto_spunta() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if tg_op = 'INSERT' then
      if new.spesa_prevista_id is not null and new.raccolto_scalato <> 0 then
        update spese_previste set raccolto = raccolto - new.raccolto_scalato where id = new.spesa_prevista_id;
      end if;
    elsif old.spesa_prevista_id is not null and old.raccolto_scalato <> 0 then
      update spese_previste set raccolto = raccolto + old.raccolto_scalato where id = old.spesa_prevista_id;
    end if;
    return null;
  end $$;
create trigger spunte_raccolto after insert or delete on spunte for each row execute function fp_raccolto_spunta();

-- La quota del mese di una spesa non mensile, spuntata: una per spesa, persona e mese personale (`per_mese` = giorno 1 di quel mese). Salva l'importo
-- spuntato (la tua quota «Al mese»): togliendola si toglie esattamente quello, anche se poi l'importo della spesa cambia. Privata di chi la spunta.
create table quote_annuali (
  id                uuid primary key default gen_random_uuid(),
  spesa_prevista_id uuid not null references spese_previste (id) on delete cascade,
  utente_id         uuid not null references utenti (id) on delete cascade,
  per_mese          date not null,
  importo           numeric(12,2) not null,
  creata_il         timestamptz not null default now(),
  unique (spesa_prevista_id, utente_id, per_mese)
);
grant select, insert, delete on quote_annuali to fp_app;
alter table quote_annuali enable row level security;
create policy quote_annuali_vedi on quote_annuali for select using (utente_id = fp_me());
create policy quote_annuali_crea on quote_annuali for insert with check (utente_id = fp_me()
  and exists (select 1 from spese_previste s where s.id = spesa_prevista_id));
create policy quote_annuali_cancella on quote_annuali for delete using (utente_id = fp_me());

create function fp_raccolto_quota() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if tg_op = 'INSERT' then
      update spese_previste set raccolto = raccolto + new.importo where id = new.spesa_prevista_id;
    else
      update spese_previste set raccolto = raccolto - old.importo where id = old.spesa_prevista_id;
    end if;
    return null;
  end $$;
create trigger quote_annuali_raccolto after insert or delete on quote_annuali for each row execute function fp_raccolto_quota();

-- ---------------------------------------------------------------------------------------------------------------
-- 2) I salvadanai collegati a una spesa diventano il raccolto della spesa (versato proprio: non possono contenere altro), poi spariscono.
-- Saldo e spunte non si toccano (i salvadanai non muovono il saldo; le spunte non dipendono dagli spostamenti). Gli spostamenti tra un collegato e un
-- altro salvadanaio restano all'altro come entrate/uscite «da fuori», così la sua cifra non cambia.
update spese_previste s set raccolto = coalesce((
  select sum(case when m.a_cesta_id = k.id then m.importo else -m.importo end)
    from ceste k join spostamenti_ceste m on m.a_cesta_id = k.id or m.da_cesta_id = k.id
   where k.spesa_id = s.id), 0)
 where exists (select 1 from ceste k where k.spesa_id = s.id);

update spostamenti_ceste m set da_cesta_id = null
 where da_cesta_id in (select id from ceste where spesa_id is not null) and a_cesta_id is not null
   and a_cesta_id not in (select id from ceste where spesa_id is not null);
update spostamenti_ceste m set a_cesta_id = null
 where a_cesta_id in (select id from ceste where spesa_id is not null) and da_cesta_id is not null
   and da_cesta_id not in (select id from ceste where spesa_id is not null);

-- Con i salvadanai spariscono anche i loro spostamenti e i traguardi di copertura.
delete from ceste where spesa_id is not null;

-- «Spese annuali» (nome senza spazi ai lati e senza distinzione di maiuscole) rimasto vuoto: senza sotto-salvadanai, senza soldi propri, senza
-- traguardo e senza traguardi di copertura. Altrimenti resta.
delete from ceste k
 where lower(btrim(k.nome)) = 'spese annuali'
   and not exists (select 1 from ceste f where f.padre_id = k.id)
   and coalesce((select sum(case when m.a_cesta_id = k.id then m.importo else -m.importo end)
                   from spostamenti_ceste m where m.a_cesta_id = k.id or m.da_cesta_id = k.id), 0) = 0
   and k.traguardo is null
   and not exists (select 1 from traguardi_copertura t where t.cesta_id = k.id);

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Via il legame: la colonna, le regole che lo guardavano e gli spostamenti legati alle spunte.
drop trigger ceste_coerenti on ceste;
drop function fp_ceste_coerenti();
alter table ceste drop column spesa_id;                 -- porta via anche l'indice ceste_spesa_uk
alter table spostamenti_ceste drop column spunta_id;    -- serviva solo a scalare il salvadanaio collegato; porta via il suo indice

-- Dentro un salvadanaio ci sono solo salvadanai della stessa persona, senza cicli.
create function fp_ceste_coerenti() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.padre_id is not null then
    if not exists (select 1 from ceste p where p.id = new.padre_id and p.proprietario_id = new.proprietario_id) then
      raise exception 'Un salvadanaio sta dentro un salvadanaio della stessa persona';
    end if;
    if exists (with recursive su as (select id, padre_id from ceste where id = new.padre_id
                                     union all select k.id, k.padre_id from ceste k join su on k.id = su.padre_id)
               select 1 from su where id = new.id) then
      raise exception 'Un salvadanaio non può stare dentro un suo sotto-salvadanaio';
    end if;
  end if;
  return new;
end $$;
create trigger ceste_coerenti before insert or update of padre_id on ceste for each row execute function fp_ceste_coerenti();
