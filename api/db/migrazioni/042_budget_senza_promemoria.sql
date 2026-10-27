-- Budget senza promemoria (decisione 57, supera le parti sul promemoria delle decisioni 51, 54, 55 e 56).
-- «Elimina completamente la possibilità di creare dei reminder da un budget. Sarò io a ricordarmi di farlo guardando la pagina dei budget e
-- farò un giroconto»: un budget è solo una lente sui movimenti di una categoria (cifra, speso da qualunque conto, rosso se sforato).
--
-- Cosa sparisce: la colonna `budget.promemoria`, i conti del promemoria (`budget.conto_id`, `budget.conto_partenza_id`), il preset per persona
-- (`utenti.budget_partenza_id`, `utenti.budget_arrivo_id`), le spunte dei budget (`spunte.budget_id`), la funzione `fp_spunta_giroconto` e il
-- trigger della 041 (`fp_budget_senza_conti`).
-- I giroconti già registrati dalle spunte dei budget NON si cancellano: diventano movimenti a mano (causa 'a_mano', la stessa di «Nuovo
-- movimento» → Giroconto in Movimenti), quindi chi li aveva spuntati li può modificare o eliminare dalla pagina Movimenti. Stessi conti,
-- stesso importo e stessa data: i saldi di tutti i conti restano identici (la migrazione si ferma se non è così).
-- Le spunte dei budget (nessun'altra voce le usa) vengono eliminate. Provata su Postgres 17 e 18 (produzione: Neon).

-- Foto dei saldi di prima (per controllare, in fondo, che non cambi nulla).
create temp table saldi_prima as
  select c.id, c.saldo_partenza + coalesce((select sum(case when m.a_conto_id = c.id then m.importo else -m.importo end)
                                              from movimenti_conto m where (m.a_conto_id = c.id or m.da_conto_id = c.id) and m.momento > c.saldo_partenza_il), 0) as saldo
    from conti c where c.saldo_partenza is not null and c.id <> fp_niente();

-- ---------------------------------------------------------------------------------------------------------------
-- 1) I giroconti delle spunte dei budget diventano movimenti a mano (modificabili ed eliminabili da Movimenti).
do $$
declare n integer;
begin
  update movimenti_conto m
     set causa = 'a_mano', spunta_id = null, budget_id = null
   where m.causa = 'giroconto' and m.versamento_id is null
     and (m.budget_id is not null or m.spunta_id in (select id from spunte where budget_id is not null))
     and m.da_conto_id is not null;
  get diagnostics n = row_count;
  raise notice 'Giroconti di budget diventati movimenti a mano: %', n;
end $$;

-- Le spunte dei budget (senza altri movimenti legati: i giroconti sono già staccati).
delete from spunte where budget_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Tolte le spunte dai budget: vincolo, indice, regole di visibilità e annullamento.
drop policy spunte_vedi on spunte;
drop policy spunte_crea on spunte;
drop policy spunte_cancella on spunte;
alter table spunte drop constraint spunte_check;
drop index spunte_budget_ix;
alter table spunte drop column budget_id;
alter table spunte add constraint spunte_check check (num_nonnulls(spesa_prevista_id, rata_id) = 1);
create policy spunte_vedi on spunte for select using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id)));
create policy spunte_crea on spunte for insert with check (utente_id = fp_me() and (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id))));
create policy spunte_cancella on spunte for delete using (
  (spesa_prevista_id is not null and exists (select 1 from spese_previste s where s.id = spesa_prevista_id))
  or (rata_id is not null and exists (select 1 from rate r where r.id = rata_id)));

create or replace function fp_annulla_spunta(p_spunta uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    if not exists (select 1 from spunte s where s.id = p_spunta
                    and ((s.spesa_prevista_id is not null and fp_vede_spesa(s.spesa_prevista_id))
                      or (s.rata_id is not null and exists (select 1 from rate r where r.id = s.rata_id and r.proprietario_id = fp_me())))) then
      return;
    end if;
    delete from versamenti where promemoria_spunta_id = p_spunta;   -- porta via il suo movimento (cascata)
    delete from movimenti_conto where spunta_id = p_spunta;
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Il promemoria dei budget e i suoi conti.
drop trigger conti_dopo_eliminare_budget on conti;
drop function fp_budget_senza_conti();
drop function fp_spunta_giroconto(uuid, numeric);

alter table budget drop column promemoria, drop column conto_partenza_id, drop column conto_id;   -- porta via anche i vincoli sui conti
alter table utenti drop column budget_partenza_id, drop column budget_arrivo_id;

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
