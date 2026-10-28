-- I conti sono solo etichette (decisione 59). «Deve essere solo uno strumento e non una copia della mia situazione finanziaria,
-- altrimenti diventa solo un'app da mantenere»: come nel file Excel, la spunta è solo un segno e il saldo in alto lo scrive l'utente
-- (`utenti.sul_conto`, già esistente). Un conto serve solo a dire dove sta una spesa, una rata o un salvadanaio.
--
-- Cosa sparisce: il saldo dei conti (`conti.saldo_partenza`, `saldo_partenza_il`), il registro dei movimenti automatici (spunte di spese e
-- rate, versamenti «Dal conto», giroconti), il conto speciale «Niente», la condivisione dei conti e le funzioni che muovevano i saldi.
-- Restano, in una tabella nuova `movimenti`, solo i movimenti scritti a mano (entrate e uscite, anche quelle registrate da un budget):
-- uno strumento a parte, insieme ai budget, che non tocca Spese, Panoramica o altre pagine. I giroconti scritti a mano spariscono
-- (senza saldi non cambiano nessun numero).

-- ---------------------------------------------------------------------------------------------------------------
-- 1) La tabella nuova dei movimenti: entrata o uscita, con il conto come etichetta.
create table movimenti (
  id           uuid primary key default gen_random_uuid(),
  utente_id    uuid not null references utenti(id) on delete cascade,
  tipo         text not null check (tipo in ('entrata', 'uscita')),
  importo      numeric(12,2) not null check (importo > 0),
  momento      timestamptz not null default now(),
  descrizione  text not null,
  conto_id     uuid references conti(id) on delete set null,
  categoria_id uuid references categorie(id) on delete set null,
  -- L'uscita registrata da un budget: la vede anche chi condivide quel budget.
  budget_id    uuid references budget(id) on delete set null,
  check (tipo = 'uscita' or (categoria_id is null and budget_id is null))
);
create index movimenti_utente_ix on movimenti (utente_id, momento desc);
create index movimenti_categoria_ix on movimenti (categoria_id, momento) where categoria_id is not null;
create index movimenti_budget_ix on movimenti (budget_id, momento) where budget_id is not null;

grant select, insert, update, delete on movimenti to fp_app;
alter table movimenti enable row level security;
create policy movimenti_vedi on movimenti for select using (utente_id = fp_me() or (budget_id is not null and fp_vede_budget(budget_id)));
create policy movimenti_crea on movimenti for insert with check (utente_id = fp_me() and (budget_id is null or fp_vede_budget(budget_id)));
create policy movimenti_cambia on movimenti for update using (utente_id = fp_me()) with check (utente_id = fp_me());
create policy movimenti_togli on movimenti for delete using (utente_id = fp_me());

-- Le entrate e le uscite scritte a mano e le uscite dei budget passano nella tabella nuova; il conto «Niente» non è un'etichetta.
insert into movimenti (id, utente_id, tipo, importo, momento, descrizione, conto_id, categoria_id, budget_id)
select m.id, m.utente_id,
       case when m.a_conto_id = fp_niente() then 'uscita' else 'entrata' end,
       m.importo, m.momento, m.descrizione,
       case when m.a_conto_id = fp_niente() then m.da_conto_id else m.a_conto_id end,
       case when m.a_conto_id = fp_niente() then m.categoria_id end,
       case when m.a_conto_id = fp_niente() then m.budget_id end
  from movimenti_conto m
 where m.causa in ('a_mano', 'budget')
   and (m.a_conto_id = fp_niente() or m.da_conto_id = fp_niente());

do $$
declare tenuti integer; tolti integer;
begin
  select count(*) into tenuti from movimenti;
  select count(*) - tenuti into tolti from movimenti_conto;
  raise notice 'Movimenti scritti a mano tenuti: %, movimenti automatici e giroconti tolti: %', tenuti, tolti;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Via il registro vecchio e le funzioni che muovevano i saldi.
drop table movimenti_conto;
drop function fp_spunta_muovi(uuid, numeric, text);
drop function fp_annulla_spunta(uuid);
drop function fp_nei_salvadanai();
drop function fp_conto_del_salvadanaio(uuid);
drop function fp_conto_condiviso(uuid);
drop trigger conti_prima_di_eliminare on conti;
drop function fp_conto_eliminato();

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Il conto: solo nome, icona e archiviato. Niente saldo, niente «Niente», niente condivisione.
alter table conti drop column saldo_partenza, drop column saldo_partenza_il;
delete from conti where id = fp_niente();
alter table conti drop constraint conti_proprietario_o_niente;
alter table conti alter column proprietario_id set not null;
drop function fp_niente();

delete from condivisioni where conto_id is not null;
alter table condivisioni add constraint condivisioni_niente_conti check (conto_id is null);
