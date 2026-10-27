-- Il saldo dei conti (decisione 47). Un saldo per conto, uguale per tutte le persone che lo vedono:
-- un saldo di partenza scritto a mano (con data e ora) + i movimenti registrati DOPO quel momento.
-- Sostituisce il saldo per persona (saldi_conto, migrazione 023); il «sul conto» del profilo
-- (utenti.sul_conto) non serve più ma resta nel database finché non è chiaro cosa farne.

alter table conti
  add column saldo_partenza    numeric(12,2),
  add column saldo_partenza_il timestamptz;
grant update (saldo_partenza, saldo_partenza_il) on conti to fp_app;

-- Migrazione dei saldi per persona: per ogni conto vale quello scritto più di recente
-- (a parità di data, quello della persona con l'id più basso, in modo ripetibile).
-- Se due persone avevano scritto cifre diverse sullo stesso conto resta solo la più recente: lo scrivo nel log.
do $$
declare r record;
begin
  for r in select conto_id, count(distinct importo) as quanti from saldi_conto group by conto_id having count(distinct importo) > 1 loop
    raise notice 'Conto % : saldi diversi scritti da persone diverse, vale il più recente', r.conto_id;
  end loop;
end $$;

update conti c
   set saldo_partenza = x.importo,
       saldo_partenza_il = (x.al + time '00:00') at time zone 'Europe/Rome'
  from (select distinct on (conto_id) conto_id, importo, al from saldi_conto order by conto_id, al desc, utente_id) x
 where x.conto_id = c.id;

-- Persone che avevano scritto il «sul conto» unico del profilo e nessuno dei conti che vedono ha un saldo:
-- il valore non si tocca (l'app lo mostra ancora in «Tutti i conti» finché non si scrive il saldo di un conto).
do $$
declare r record;
begin
  for r in select u.id, u.sul_conto from utenti u
            where u.sul_conto is not null
              and not exists (select 1 from conti c where c.saldo_partenza is not null
                                and (c.proprietario_id = u.id or exists (select 1 from condivisioni s where s.conto_id = c.id and s.condiviso_con_id = u.id)))
  loop
    raise notice 'Utente % ha un «sul conto» di % e nessun conto con il saldo: il valore resta in utenti.sul_conto', r.id, r.sul_conto;
  end loop;
end $$;

drop table saldi_conto;

-- Registro dei movimenti del conto. Importo con segno (uscite negative). Nessuna correzione a mano:
-- per riallinearsi alla banca si riscrive il saldo di partenza. Visibile come il conto.
--  - causa 'spesa' / 'rata': la spunta (spunta_id; se la spesa viene eliminata resta il movimento, senza spunta);
--  - causa 'versamento': il versamento di un salvadanaio (versamento_id, uno per uno; se il versamento
--    sparisce — annullato o salvadanaio eliminato — sparisce anche il movimento). Una spunta di spesa annuale con
--    salvadanaio ha spunta_id e versamento_id insieme: sposta la quota dal conto al salvadanaio.
create table movimenti_conto (
  id            uuid primary key default gen_random_uuid(),
  conto_id      uuid not null references conti (id) on delete cascade,
  importo       numeric(12,2) not null check (importo <> 0),
  momento       timestamptz not null default now(),
  utente_id     uuid not null references utenti (id),
  causa         text not null check (causa in ('spesa', 'rata', 'versamento')),
  descrizione   text not null,
  spunta_id     uuid references spunte (id) on delete set null,
  versamento_id uuid unique references versamenti (id) on delete cascade,
  check (causa <> 'versamento' or versamento_id is not null)
);
create index movimenti_conto_conto_ix on movimenti_conto (conto_id, momento desc);
create index movimenti_conto_spunta_ix on movimenti_conto (spunta_id) where spunta_id is not null;

grant select, insert on movimenti_conto to fp_app;
alter table movimenti_conto enable row level security;
create policy movimenti_conto_vedi on movimenti_conto for select using (fp_vede_conto(conto_id));
create policy movimenti_conto_crea on movimenti_conto for insert with check (utente_id = fp_me() and fp_vede_conto(conto_id));

-- Spunta di una spesa annuale con salvadanaio: il versamento della quota si lega alla spunta (senza cascata:
-- eliminare la spesa non fa sparire i soldi messi da parte); togliendo la spunta il versamento si annulla.
alter table versamenti add column quota_spunta_id uuid references spunte (id) on delete set null;
create index versamenti_quota_spunta_ix on versamenti (quota_spunta_id) where quota_spunta_id is not null;

-- Togliere la spunta annulla anche il movimento sul conto e il versamento collegati, anche se a spuntare è stata
-- l'altra persona e il conto o il salvadanaio non sono visibili a chi toglie (security definer, controlla la spunta).
create function fp_annulla_spunta(p_spunta uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
  begin
    if not exists (select 1 from spunte s where s.id = p_spunta
                    and ((s.spesa_prevista_id is not null and fp_vede_spesa(s.spesa_prevista_id))
                      or (s.rata_id is not null and exists (select 1 from rate r where r.id = s.rata_id and r.proprietario_id = fp_me())))) then
      return;
    end if;
    delete from versamenti where quota_spunta_id = p_spunta;       -- porta via anche il suo movimento
    delete from movimenti_conto where spunta_id = p_spunta;
  end
  $$;

-- I budget non sono più legati ai conti (decisione 47 E): hanno una categoria e basta.
update spese_previste set conto_id = null where tipo = 'budget' and conto_id is not null;
alter table spese_previste add constraint spese_budget_senza_conto check (tipo <> 'budget' or conto_id is null);
