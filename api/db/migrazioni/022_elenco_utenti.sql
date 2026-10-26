-- Elenco delle altre persone del sistema, per scegliere con chi condividere una voce:
-- solo id e nome (mai l'email), perché la lettura diretta di utenti è limitata a chi è già collegato.
create or replace function fp_altri_utenti() returns table (id uuid, nome text)
  language sql stable security definer set search_path = public
  as $$ select u.id, u.nome from utenti u where u.id <> fp_me() order by u.nome $$;
revoke execute on function fp_altri_utenti() from public;
grant execute on function fp_altri_utenti() to fp_app;
