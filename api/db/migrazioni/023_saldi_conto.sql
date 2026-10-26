-- "Sul conto oggi" per ogni conto: il saldo scritto a mano da una persona su un conto,
-- con la data in cui l'ha scritto. È per utente (primary key utente + conto): un conto
-- condiviso ha un saldo per ciascuna delle due persone, e ognuno vede e cambia solo il
-- proprio. Il vecchio saldo unico (utenti.sul_conto) resta per «Tutti i conti».
create table saldi_conto (
  utente_id  uuid not null references utenti (id) on delete cascade,
  conto_id   uuid not null references conti (id) on delete cascade,
  importo    numeric(12,2) not null,
  al         date not null,
  primary key (utente_id, conto_id)
);

grant select, insert, update, delete on saldi_conto to fp_app;
alter table saldi_conto enable row level security;
create policy saldi_conto_vedi      on saldi_conto for select using (utente_id = fp_me());
create policy saldi_conto_crea      on saldi_conto for insert with check (utente_id = fp_me() and fp_vede_conto(conto_id));
create policy saldi_conto_modifica  on saldi_conto for update using (utente_id = fp_me()) with check (utente_id = fp_me() and fp_vede_conto(conto_id));
create policy saldi_conto_cancella  on saldi_conto for delete using (utente_id = fp_me());
