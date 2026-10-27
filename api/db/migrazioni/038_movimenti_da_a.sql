-- Movimenti con sorgente e destinazione, budget senza modi (decisione 51, supera parti di 48 e 49).
--
-- 1) «Niente»: un conto speciale e nascosto, UNO solo per tutti (id fisso), che raccoglie le uscite e da cui arrivano le entrate.
--    È una riga di `conti` senza proprietario: nessuna regola di visibilità la mostra a nessuno (né elenchi, né tendine, né totali),
--    ma le chiavi esterne dei movimenti la raggiungono. Le regole sui movimenti la accettano come sorgente/destinazione.
-- 2) `movimenti_conto`: ogni movimento ha una sorgente (`da_conto_id`) e una destinazione (`a_conto_id`) e un importo POSITIVO.
--      spesa, rata, uscita di budget, versamento «Dal conto»  = conto -> Niente
--      entrata, versamento che torna sul conto                  = Niente -> conto
--      giroconto (anche il promemoria del budget)               = conto -> conto, UNA riga sola
--    Un'uscita senza conto (solo causa 'budget') ha la sorgente vuota: Niente -> Niente non ha senso.
--    Saldo di un conto = saldo di partenza + entrate verso di lui - uscite da lui (dopo il momento del saldo di partenza).
-- 3) Budget senza modi: ogni budget è una cifra da tenere sotto controllo (anche se si sfora si conta tutto); in più un
--    promemoria facoltativo che ricorda di spostare la cifra da un conto a un altro.

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Il conto «Niente»
create function fp_niente() returns uuid language sql immutable parallel safe as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

alter table conti alter column proprietario_id drop not null;
alter table conti add constraint conti_proprietario_o_niente check (proprietario_id is not null or id = '00000000-0000-0000-0000-000000000001');
insert into conti (id, proprietario_id, nome, icona) values (fp_niente(), null, 'Niente', 'circle-x');

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Movimenti da -> a

-- Foto dei saldi di prima (per controllare, in fondo, che non cambi nulla).
create temp table saldi_prima as
  select c.id, c.saldo_partenza + coalesce((select sum(m.importo) from movimenti_conto m where m.conto_id = c.id and m.momento > c.saldo_partenza_il), 0) as saldo
    from conti c where c.saldo_partenza is not null and c.id <> fp_niente();

drop policy movimenti_conto_vedi on movimenti_conto;
drop policy movimenti_conto_crea on movimenti_conto;
drop policy movimenti_conto_togli on movimenti_conto;

alter table movimenti_conto
  add column da_conto_id uuid references conti (id) on delete cascade,
  add column a_conto_id  uuid references conti (id) on delete cascade;

-- Giroconti: la gamba negativa diventa il movimento (da = suo conto, a = conto dell'altra gamba), quella positiva sparisce.
update movimenti_conto n
   set da_conto_id = n.conto_id, a_conto_id = p.conto_id
  from movimenti_conto p
 where n.giroconto_id is not null and p.giroconto_id = n.giroconto_id and n.importo < 0 and p.importo > 0;
delete from movimenti_conto p
 where p.importo > 0 and p.giroconto_id is not null
   and exists (select 1 from movimenti_conto n where n.giroconto_id = p.giroconto_id and n.importo < 0 and n.a_conto_id is not null);

-- Tutto il resto (anche una gamba di giroconto rimasta sola): uscita = conto -> Niente, entrata = Niente -> conto.
update movimenti_conto set da_conto_id = conto_id, a_conto_id = fp_niente() where a_conto_id is null and importo < 0;
update movimenti_conto set da_conto_id = fp_niente(), a_conto_id = conto_id where a_conto_id is null and importo > 0;
update movimenti_conto set importo = abs(importo);

alter table movimenti_conto drop column conto_id;   -- porta via anche indice e vincoli che lo usavano
alter table movimenti_conto drop constraint if exists movimenti_conto_importo_check;
alter table movimenti_conto alter column a_conto_id set not null;
alter table movimenti_conto
  add constraint movimenti_conto_importo_check check (importo > 0),
  add constraint movimenti_conto_da_diverso_da_a check (da_conto_id is distinct from a_conto_id),
  add constraint movimenti_conto_senza_sorgente check (da_conto_id is not null or (causa = 'budget' and a_conto_id = '00000000-0000-0000-0000-000000000001'));
create index movimenti_conto_da_ix on movimenti_conto (da_conto_id, momento desc) where da_conto_id is not null;
create index movimenti_conto_a_ix  on movimenti_conto (a_conto_id, momento desc);

-- Chi vede un movimento: chi vede uno dei suoi due conti; in più un'uscita di budget la vede chi l'ha scritta e chi vede il budget.
create policy movimenti_conto_vedi on movimenti_conto for select using (
  (da_conto_id is not null and fp_vede_conto(da_conto_id))
  or fp_vede_conto(a_conto_id)
  or (causa = 'budget' and (utente_id = fp_me() or (budget_id is not null and fp_vede_budget(budget_id)))));
-- Chi lo scrive vede i conti veri che usa («Niente» è sempre ammesso); un'uscita senza conto serve un budget che si vede.
create policy movimenti_conto_crea on movimenti_conto for insert with check (
  utente_id = fp_me()
  and (da_conto_id is null or da_conto_id = fp_niente() or fp_vede_conto(da_conto_id))
  and (a_conto_id = fp_niente() or fp_vede_conto(a_conto_id))
  and (da_conto_id is not null or (budget_id is not null and fp_vede_budget(budget_id))));
create policy movimenti_conto_togli on movimenti_conto for delete using (
  causa = 'budget' and (
    utente_id = fp_me()
    or (da_conto_id is not null and fp_vede_conto(da_conto_id))
    or (budget_id is not null and fp_vede_budget(budget_id))));

-- Togliere la spunta annulla il suo movimento sul conto e, per il promemoria di un salvadanaio, il versamento fatto con
-- la spunta (che porta via anche il suo movimento). Anche se a spuntare era l'altra persona e il conto non si vede.
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
    delete from versamenti where promemoria_spunta_id = p_spunta;   -- porta via il suo movimento (cascata)
    delete from movimenti_conto where spunta_id = p_spunta;
  end
  $$;

-- La spunta di una spesa: l'importo che ESCE dal conto della spesa (positivo), anche se il conto lo vede solo chi ha creato la spesa.
create or replace function fp_spunta_muovi(p_spunta uuid, p_importo_conto numeric, p_descrizione text)
  returns void
  language plpgsql security definer set search_path = public
  as $$
  declare s record;
  begin
    select sp.utente_id, sp.spesa_prevista_id, e.conto_id, e.importo into s
      from spunte sp join spese_previste e on e.id = sp.spesa_prevista_id where sp.id = p_spunta;
    if not found or s.utente_id <> fp_me() or not fp_vede_spesa(s.spesa_prevista_id) then
      raise exception 'Spunta non valida' using errcode = '42501';
    end if;
    if p_importo_conto is null or p_importo_conto <= 0 or p_importo_conto > s.importo + 0.005 then
      raise exception 'Importo non valido' using errcode = '22023';
    end if;
    if s.conto_id is null then raise exception 'La spesa non ha un conto' using errcode = '22023'; end if;
    insert into movimenti_conto (da_conto_id, a_conto_id, importo, utente_id, causa, descrizione, spunta_id)
      values (s.conto_id, fp_niente(), p_importo_conto, fp_me(), 'spesa', p_descrizione, p_spunta);
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Budget senza modi: `promemoria` (spostare la cifra da un conto a un altro) sostituisce `modo` e `mostra_in_spese`.
alter table budget add column promemoria boolean not null default false;
-- Conversione: «sposto» con i due conti (del budget o delle impostazioni di chi lo possiede, diversi) -> promemoria attivo; il resto spento.
update budget b set promemoria = true
  from utenti u
 where u.id = b.proprietario_id and b.modo = 'sposto'
   and coalesce(b.conto_partenza_id, u.budget_partenza_id) is not null
   and coalesce(b.conto_id, u.budget_arrivo_id) is not null
   and coalesce(b.conto_partenza_id, u.budget_partenza_id) <> coalesce(b.conto_id, u.budget_arrivo_id);
do $$
declare r record;
begin
  for r in select b.id, b.modo, b.mostra_in_spese, b.promemoria from budget b where b.modo = 'conto' or b.promemoria loop
    raise notice 'Budget %: modo % -> promemoria %', r.id, r.modo, case when r.promemoria then 'attivo' else 'spento' end;
  end loop;
end $$;

alter table budget drop constraint budget_conti_solo_sposto;
alter table budget drop column modo, drop column mostra_in_spese;
comment on column budget.promemoria is 'Se acceso compare in Spese un promemoria che ricorda di spostare la cifra del budget dal conto di partenza al conto del budget (giroconto)';
grant update (promemoria) on budget to fp_app;

-- Il giroconto del promemoria (una riga sola, conto -> conto), anche se i conti non si vedono (budget condiviso).
create or replace function fp_spunta_giroconto(p_spunta uuid, p_importo numeric) returns void
  language plpgsql security definer set search_path = public
  as $$
  declare s record; da text; a text;
  begin
    select sp.utente_id, b.id as budget, b.promemoria, coalesce(b.conto_partenza_id, u.budget_partenza_id) as partenza,
           coalesce(b.conto_id, u.budget_arrivo_id) as arrivo, b.importo, c.nome as categoria into s
      from spunte sp join budget b on b.id = sp.budget_id join categorie c on c.id = b.categoria_id
      join utenti u on u.id = b.proprietario_id where sp.id = p_spunta;
    if not found or s.utente_id <> fp_me() or not fp_vede_budget(s.budget) then
      raise exception 'Spunta non valida' using errcode = '42501';
    end if;
    if not s.promemoria or s.partenza is null or s.arrivo is null or s.partenza = s.arrivo
       or p_importo <= 0 or p_importo > s.importo + 0.005 then
      raise exception 'Giroconto non valido' using errcode = '22023';
    end if;
    select conti.nome into da from conti where id = s.partenza;
    select conti.nome into a from conti where id = s.arrivo;
    insert into movimenti_conto (da_conto_id, a_conto_id, importo, utente_id, causa, descrizione, spunta_id, budget_id)
      values (s.partenza, s.arrivo, p_importo, fp_me(), 'giroconto', 'Giroconto ' || s.categoria || ': ' || da || ' verso ' || a, p_spunta, s.budget);
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Il promemoria di un salvadanaio ricorda la quota del mese ogni mese: ogni_mesi diventa 1 e l'importo la quota mensile
--    (la cifra fissa, se il salvadanaio non ha scadenza; con una scadenza la quota la calcola l'API).
update spese_previste
   set importo = round(importo / ogni_mesi, 2), ogni_mesi = 1, prossima_scadenza = null, senza_giorno = false, giorno_mese = null
 where alimenta_obiettivo_id is not null and ogni_mesi > 1;

-- ---------------------------------------------------------------------------------------------------------------
-- Controllo: i saldi di tutti i conti devono essere identici a prima (altrimenti la migrazione si ferma e non cambia nulla).
do $$
declare r record;
begin
  for r in select p.id, p.saldo as prima,
                  c.saldo_partenza + coalesce((select sum(case when m.a_conto_id = c.id then m.importo else -m.importo end)
                                                 from movimenti_conto m where (m.a_conto_id = c.id or m.da_conto_id = c.id) and m.momento > c.saldo_partenza_il), 0) as dopo
             from saldi_prima p join conti c on c.id = p.id loop
    if r.prima <> r.dopo then
      raise exception 'Il saldo del conto % è cambiato (% -> %): migrazione annullata', r.id, r.prima, r.dopo;
    end if;
  end loop;
end $$;
drop table saldi_prima;
