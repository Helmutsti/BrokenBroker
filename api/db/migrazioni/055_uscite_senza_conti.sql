-- Uscite senza conti, saldo unico, salvadanai liberi (decisione 72, ramo «ultimissimo»).
-- Conti: solo etichette (nome, icona, archiviato), senza saldo; i giroconti non esistono più. Saldo: uno solo, `utenti.sul_conto`, scritto a mano.
-- Salvadanai (la tabella resta `ceste`): non stanno più in un conto, li vede solo chi li ha creati, hanno una scadenza facoltativa.
-- Una spesa annuale (o una tantum) si può «mettere da parte»: ha un salvadanaio collegato (`ceste.spesa_id`) dentro «Spese annuali».

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Il saldo dei conti sparisce: via il meccanismo che correggeva il saldo scritto con le spunte, e le colonne.
drop trigger movimenti_spunta_saldo on movimenti;
drop function fp_movimenti_spunta_saldo();
drop function fp_spunta_nel_saldo_scritto(uuid, uuid, numeric, timestamptz, int);
drop function fp_voci_su_conto(uuid);
alter table conti drop column saldo_scritto, drop column saldo_scritto_il;

-- Eliminando un conto le spese e le rate che lo usavano restano senza etichetta (le chiavi lo fanno già), e i movimenti con quel solo conto
-- diventano movimenti senza conto: serve scrivere `verso`, perché la regola dei movimenti lo chiede quando non c'è nessun conto.
create function fp_conto_in_eliminazione() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    update movimenti set da_conto_id = null, verso = 'uscita' where da_conto_id = old.id and a_conto_id is null;
    update movimenti set a_conto_id = null, verso = 'entrata' where a_conto_id = old.id and da_conto_id is null;
    return old;
  end $$;
create trigger conti_in_eliminazione before delete on conti for each row execute function fp_conto_in_eliminazione();

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Niente giroconti: le spese che spostavano soldi da un conto all'altro tornano spese normali (restano attive), con il conto di partenza
-- (`conto_id`) come etichetta; il conto di arrivo sparisce.
alter table spese_previste drop column a_conto_id;

-- Una spunta di una spesa annuale (o una tantum) o di una rata può essere fatta in anticipo: `per_mese` è il mese personale (giorno 1) della scadenza che paga.
-- Vuoto per mensili e vecchie spunte (valgono per il mese in cui cadono).
alter table spunte add column per_mese date;

-- I conti non si condividono più: le due vecchie condivisioni (se ci sono) restano nei dati ma non si vedono, e non se ne possono fare di nuove.
alter table condivisioni add constraint condivisioni_senza_conti check (conto_id is null) not valid;

-- Le rate non hanno categoria (decisione 72).
alter table rate drop column categoria_id;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Saldo unico: con i dati veri parte vuoto, lo riscrive la persona. `sul_conto_al` diventa un momento preciso (le spunte fatte dopo
-- quel momento lo abbassano).
update utenti set sul_conto = null, sul_conto_al = null;
alter table utenti alter column sul_conto_al type timestamptz using sul_conto_al::timestamptz;
alter table utenti add constraint utenti_saldo_con_momento check ((sul_conto is null) = (sul_conto_al is null));

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Salvadanai liberi.
drop trigger ceste_coerenti on ceste;
drop policy ceste_vedi on ceste;
drop policy ceste_crea on ceste;
drop policy ceste_modifica on ceste;
drop policy ceste_cancella on ceste;
drop policy spostamenti_ceste_vedi on spostamenti_ceste;
drop policy spostamenti_ceste_crea on spostamenti_ceste;
drop policy traguardi_tutti on traguardi_copertura;
drop function fp_vede_cesta(uuid);
drop function fp_ceste_coerenti();

alter table ceste add column scadenza date;

-- Un salvadanaio collegato a una spesa che non può esserlo (una mensile) perde il collegamento: i soldi restano dov'è.
update ceste k set spesa_id = null from spese_previste s where s.id = k.spesa_id and s.ogni_mesi = 1;

-- «Spese annuali»: per ogni persona che ha salvadanai collegati a spese, un salvadanaio in cima con questo nome (si riusa quello che c'è,
-- il più vecchio); i salvadanai collegati ci vanno dentro. I soldi non si toccano.
insert into ceste (proprietario_id, nome, icona)
select distinct k.proprietario_id, 'Spese annuali', 'calendar-clock'
  from ceste k
 where k.spesa_id is not null
   and not exists (select 1 from ceste a where a.proprietario_id = k.proprietario_id and a.padre_id is null and a.nome = 'Spese annuali');
update ceste k set padre_id = (select a.id from ceste a where a.proprietario_id = k.proprietario_id and a.padre_id is null and a.nome = 'Spese annuali'
                               order by a.creata_il, a.id limit 1)
 where k.spesa_id is not null;

alter table ceste drop column conto_id;

-- Dentro un salvadanaio ci sono solo salvadanai della stessa persona, senza cicli; uno collegato a una spesa non ne contiene altri.
create function fp_ceste_coerenti() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.padre_id is not null then
    if not exists (select 1 from ceste p where p.id = new.padre_id and p.proprietario_id = new.proprietario_id) then
      raise exception 'Un salvadanaio sta dentro un salvadanaio della stessa persona';
    end if;
    if exists (select 1 from ceste p where p.id = new.padre_id and p.spesa_id is not null) then
      raise exception 'Un salvadanaio collegato a una spesa non può contenere altri salvadanai';
    end if;
    if exists (with recursive su as (select id, padre_id from ceste where id = new.padre_id
                                     union all select k.id, k.padre_id from ceste k join su on k.id = su.padre_id)
               select 1 from su where id = new.id) then
      raise exception 'Un salvadanaio non può stare dentro un suo sotto-salvadanaio';
    end if;
  end if;
  if new.spesa_id is not null and exists (select 1 from ceste f where f.padre_id = new.id) then
    raise exception 'Un salvadanaio che ne contiene altri non può essere collegato a una spesa';
  end if;
  return new;
end $$;
create trigger ceste_coerenti before insert or update of padre_id, spesa_id on ceste for each row execute function fp_ceste_coerenti();

-- Li vede e li modifica solo chi li ha creati.
create function fp_vede_cesta(p_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (select 1 from ceste k where k.id = p_id and k.proprietario_id = fp_me())
  $$;
grant execute on function fp_vede_cesta(uuid) to fp_app;

create policy ceste_proprie on ceste for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
create policy spostamenti_ceste_vedi on spostamenti_ceste for select using (fp_vede_cesta(coalesce(da_cesta_id, a_cesta_id)));
create policy spostamenti_ceste_crea on spostamenti_ceste for insert
  with check (utente_id = fp_me() and fp_vede_cesta(coalesce(da_cesta_id, a_cesta_id)) and (a_cesta_id is null or da_cesta_id is null or fp_vede_cesta(a_cesta_id)));
create policy traguardi_tutti on traguardi_copertura for all using (fp_vede_cesta(cesta_id)) with check (fp_vede_cesta(cesta_id));

-- ---------------------------------------------------------------------------------------------------------------
-- 5) Via i budget del tutto: le cifre del mese si scrivono come spese mensili normali. Le uscite registrate restano (con la loro categoria),
-- perdono solo il legame con il budget. Le regole dei movimenti non guardano più al budget.
drop policy movimenti_vedi on movimenti;
drop policy movimenti_crea on movimenti;
create policy movimenti_vedi on movimenti for select
  using (utente_id = fp_me()
         or (da_conto_id is not null and fp_vede_conto(da_conto_id))
         or (a_conto_id is not null and fp_vede_conto(a_conto_id)));
create policy movimenti_crea on movimenti for insert
  with check (utente_id = fp_me()
              and (da_conto_id is null or fp_vede_conto(da_conto_id))
              and (a_conto_id is null or fp_vede_conto(a_conto_id)));

drop index movimenti_budget_ix;
alter table movimenti drop column budget_id;   -- porta via anche la chiave verso `budget`
drop table budget;                             -- porta via le sue regole (policy)
drop function fp_vede_budget(uuid);
