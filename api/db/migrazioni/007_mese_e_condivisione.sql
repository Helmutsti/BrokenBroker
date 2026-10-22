-- Inizio del mese personale (decisione 23) e ricerca della persona con cui condividere.

-- Il mese dell'app parte da questo giorno (1-28, così esiste in tutti i mesi):
-- con 10, ottobre va dal 10 ottobre al 9 novembre.
alter table utenti add column inizio_mese smallint not null default 1 check (inizio_mese between 1 and 28);
grant select (inizio_mese) on utenti to fp_app;
grant update (inizio_mese) on utenti to fp_app;

-- Per condividere una voce serve l'id dell'altra persona, che però non è
-- visibile finché non c'è una condivisione: questa funzione restituisce solo
-- l'id di chi ha quell'email, nient'altro.
create or replace function fp_utente_per_email(p_email text) returns uuid
  language sql stable security definer set search_path = public
  as $$ select id from utenti where lower(email) = lower(trim(p_email)) and id <> fp_me() $$;
revoke execute on function fp_utente_per_email(text) from public;
grant execute on function fp_utente_per_email(text) to fp_app;

-- Spese previste e rate: importi positivi (sono sempre uscite); i movimenti
-- che generano sono negativi.
comment on column spese_previste.importo is 'Costo positivo; per i budget è il tetto del mese';
comment on column spese_previste.prossima_scadenza is 'Prima scadenza: le successive cadono ogni ogni_mesi mesi; vuota con ogni_mesi = 1 vuol dire ogni mese';
