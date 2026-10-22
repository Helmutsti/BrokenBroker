-- Chi vede cosa, imposto dal database (Row Level Security).
--
-- L'API si collega con il ruolo fp_app e, a ogni richiesta, dichiara chi è
-- l'utente con: select set_config('app.utente_id', '<uuid>', true)
-- Regole (decisioni 5, 6, 7, 16):
--   - ognuno vede i propri dati;
--   - conti, spese previste, movimenti e obiettivi condivisi sono in piena
--     collaborazione: entrambi vedono e modificano;
--   - solo chi ha creato e condiviso una voce può cancellarla o smettere di
--     condividerla;
--   - rate, investimenti, regole, prove d'acquisto e chiusure restano private.

create or replace function fp_me() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.utente_id', true), '')::uuid $$;

-- Funzioni di visibilità: security definer per poter leggere le tabelle
-- senza ricadere nelle stesse regole (evita ricorsioni tra le policy).

create or replace function fp_vede_conto(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from conti where id = p_id and proprietario_id = fp_me())
        or exists (select 1 from condivisioni where conto_id = p_id and condiviso_con_id = fp_me())
  $$;

create or replace function fp_vede_spesa(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from spese_previste where id = p_id and proprietario_id = fp_me())
        or exists (select 1 from condivisioni where spesa_prevista_id = p_id and condiviso_con_id = fp_me())
  $$;

create or replace function fp_vede_obiettivo(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from obiettivi where id = p_id and proprietario_id = fp_me())
        or exists (select 1 from condivisioni where obiettivo_id = p_id and condiviso_con_id = fp_me())
  $$;

create or replace function fp_vede_movimento(p_id uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from movimenti m where m.id = p_id and fp_vede_conto(m.conto_id))
        or exists (select 1 from condivisioni where movimento_id = p_id and condiviso_con_id = fp_me())
  $$;

-- Vero se l'altra persona ha almeno una condivisione con me (in un verso o nell'altro).
create or replace function fp_collegato(p_utente uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select p_utente = fp_me()
        or exists (select 1 from condivisioni
                    where (proprietario_id = fp_me() and condiviso_con_id = p_utente)
                       or (proprietario_id = p_utente and condiviso_con_id = fp_me()))
  $$;

-- Per condividere una voce bisogna esserne il creatore.
create or replace function fp_possiede_voce(p_conto uuid, p_spesa uuid, p_movimento uuid, p_obiettivo uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select case
      when p_conto     is not null then exists (select 1 from conti where id = p_conto and proprietario_id = fp_me())
      when p_spesa     is not null then exists (select 1 from spese_previste where id = p_spesa and proprietario_id = fp_me())
      when p_movimento is not null then exists (select 1 from movimenti where id = p_movimento and inserito_da = fp_me())
      when p_obiettivo is not null then exists (select 1 from obiettivi where id = p_obiettivo and proprietario_id = fp_me())
      else false
    end
  $$;

-- Accesso: queste funzioni girano prima che l'utente sia noto.

create or replace function fp_credenziali(p_email text)
  returns table (id uuid, password_hash text)
  language sql stable security definer set search_path = public
  as $$ select id, password_hash from utenti where lower(email) = lower(p_email) $$;

create or replace function fp_apri_sessione(p_utente uuid, p_token_hash bytea, p_scade timestamptz) returns void
  language sql security definer set search_path = public
  as $$
    delete from sessioni where utente_id = p_utente and scade_il < now();
    insert into sessioni (token_hash, utente_id, scade_il) values (p_token_hash, p_utente, p_scade);
  $$;

create or replace function fp_utente_sessione(p_token_hash bytea) returns uuid
  language sql stable security definer set search_path = public
  as $$ select utente_id from sessioni where token_hash = p_token_hash and scade_il > now() $$;

create or replace function fp_chiudi_sessione(p_token_hash bytea) returns void
  language sql security definer set search_path = public
  as $$ delete from sessioni where token_hash = p_token_hash $$;

-- Permessi del ruolo dell'API -------------------------------------------

revoke all on all tables in schema public from public;
revoke execute on all functions in schema public from public;
grant usage on schema public to fp_app;
grant execute on all functions in schema public to fp_app;

-- utenti: niente lettura della password, niente cambio di email/id.
grant select (id, email, nome, stipendio_netto, giorno_paga, creato_il) on utenti to fp_app;
grant update (nome, stipendio_netto, giorno_paga) on utenti to fp_app;
alter table utenti enable row level security;
create policy utenti_vedi on utenti for select using (fp_collegato(id));
create policy utenti_modifica on utenti for update using (id = fp_me()) with check (id = fp_me());

-- conti
grant select, insert, delete on conti to fp_app;
grant update (nome, tipo, saldo_iniziale, data_saldo_iniziale, archiviato) on conti to fp_app;
alter table conti enable row level security;
-- Nelle policy di lettura si controllano le colonne della riga e non le
-- funzioni fp_vede_*: con insert ... returning la riga appena creata non è
-- ancora visibile alle funzioni, e la lettura verrebbe rifiutata.
create policy conti_vedi      on conti for select
  using (proprietario_id = fp_me() or exists (select 1 from condivisioni s where s.conto_id = conti.id and s.condiviso_con_id = fp_me()));
create policy conti_crea      on conti for insert with check (proprietario_id = fp_me());
create policy conti_modifica  on conti for update using (fp_vede_conto(id)) with check (fp_vede_conto(id));
create policy conti_cancella  on conti for delete using (proprietario_id = fp_me());

-- categorie: private; si vedono anche quelle dell'altra persona collegata,
-- perché una voce condivisa mostra la categoria di chi l'ha creata.
grant select, insert, delete on categorie to fp_app;
grant update (padre_id, nome, tipo, colore, icona, ordine) on categorie to fp_app;
alter table categorie enable row level security;
create policy categorie_vedi     on categorie for select using (fp_collegato(proprietario_id));
create policy categorie_crea     on categorie for insert with check (proprietario_id = fp_me());
create policy categorie_modifica on categorie for update using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
create policy categorie_cancella on categorie for delete using (proprietario_id = fp_me());

-- spese previste
grant select, insert, delete on spese_previste to fp_app;
grant update (nome, importo, ogni_mesi, prossima_scadenza, conto_id, categoria_id, tipo, attiva, note) on spese_previste to fp_app;
alter table spese_previste enable row level security;
create policy spese_vedi     on spese_previste for select
  using (proprietario_id = fp_me() or exists (select 1 from condivisioni s where s.spesa_prevista_id = spese_previste.id and s.condiviso_con_id = fp_me()));
create policy spese_crea     on spese_previste for insert with check (proprietario_id = fp_me());
create policy spese_modifica on spese_previste for update using (fp_vede_spesa(id)) with check (fp_vede_spesa(id));
create policy spese_cancella on spese_previste for delete using (proprietario_id = fp_me());

-- obiettivi
grant select, insert, delete on obiettivi to fp_app;
grant update (nome, tipo, traguardo, scadenza, conto_id) on obiettivi to fp_app;
alter table obiettivi enable row level security;
create policy obiettivi_vedi     on obiettivi for select
  using (proprietario_id = fp_me() or exists (select 1 from condivisioni s where s.obiettivo_id = obiettivi.id and s.condiviso_con_id = fp_me()));
create policy obiettivi_crea     on obiettivi for insert with check (proprietario_id = fp_me());
create policy obiettivi_modifica on obiettivi for update using (fp_vede_obiettivo(id)) with check (fp_vede_obiettivo(id));
create policy obiettivi_cancella on obiettivi for delete using (proprietario_id = fp_me());

-- movimenti: si inseriscono su conti propri o condivisi; li cancella chi li
-- ha inseriti o il proprietario del conto.
grant select, insert, delete on movimenti to fp_app;
grant update (conto_id, data, importo, esercente, descrizione, categoria_id, spesa_prevista_id,
              rata_id, obiettivo_id, trasferimento_id, modificato_il) on movimenti to fp_app;
alter table movimenti enable row level security;
create policy movimenti_vedi     on movimenti for select
  using (fp_vede_conto(conto_id)
         or exists (select 1 from condivisioni s where s.movimento_id = movimenti.id and s.condiviso_con_id = fp_me()));
create policy movimenti_crea     on movimenti for insert with check (inserito_da = fp_me() and fp_vede_conto(conto_id));
create policy movimenti_modifica on movimenti for update
  using (fp_vede_conto(conto_id)
         or exists (select 1 from condivisioni s where s.movimento_id = movimenti.id and s.condiviso_con_id = fp_me()))
  with check (fp_vede_conto(conto_id)
              or exists (select 1 from condivisioni s where s.movimento_id = movimenti.id and s.condiviso_con_id = fp_me()));
create policy movimenti_cancella on movimenti for delete
  using (inserito_da = fp_me() or exists (select 1 from conti c where c.id = conto_id and c.proprietario_id = fp_me()));

-- versamenti: visibili con l'obiettivo; ognuno versa a nome proprio.
grant select, insert, delete on versamenti to fp_app;
grant update (data, importo, movimento_id) on versamenti to fp_app;
alter table versamenti enable row level security;
create policy versamenti_vedi     on versamenti for select using (fp_vede_obiettivo(obiettivo_id));
create policy versamenti_crea     on versamenti for insert with check (utente_id = fp_me() and fp_vede_obiettivo(obiettivo_id));
create policy versamenti_modifica on versamenti for update using (fp_vede_obiettivo(obiettivo_id)) with check (fp_vede_obiettivo(obiettivo_id));
create policy versamenti_cancella on versamenti for delete
  using (utente_id = fp_me() or exists (select 1 from obiettivi o where o.id = obiettivo_id and o.proprietario_id = fp_me()));

-- quote: seguono la voce a cui appartengono.
grant select, insert, update, delete on quote to fp_app;
alter table quote enable row level security;
create policy quote_tutte on quote for all
  using (coalesce(fp_vede_spesa(spesa_prevista_id), false) or coalesce(fp_vede_movimento(movimento_id), false))
  with check (coalesce(fp_vede_spesa(spesa_prevista_id), false) or coalesce(fp_vede_movimento(movimento_id), false));

-- condivisioni: le crea e le toglie solo chi possiede la voce.
grant select, insert, delete on condivisioni to fp_app;
alter table condivisioni enable row level security;
create policy condivisioni_vedi     on condivisioni for select using (proprietario_id = fp_me() or condiviso_con_id = fp_me());
create policy condivisioni_crea     on condivisioni for insert
  with check (proprietario_id = fp_me() and fp_possiede_voce(conto_id, spesa_prevista_id, movimento_id, obiettivo_id));
create policy condivisioni_cancella on condivisioni for delete using (proprietario_id = fp_me());

-- Voci sempre private -----------------------------------------------------

grant select, insert, update, delete on rate, operazioni, prove_acquisto to fp_app;
alter table rate enable row level security;
create policy rate_proprie on rate for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
alter table operazioni enable row level security;
create policy operazioni_proprie on operazioni for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());
alter table prove_acquisto enable row level security;
create policy prove_proprie on prove_acquisto for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());

grant select, insert, update, delete on regole to fp_app;
alter table regole enable row level security;
create policy regole_proprie on regole for all using (proprietario_id = fp_me()) with check (proprietario_id = fp_me());

grant select, insert, update, delete on chiusure_mensili to fp_app;
alter table chiusure_mensili enable row level security;
create policy chiusure_proprie on chiusure_mensili for all using (utente_id = fp_me()) with check (utente_id = fp_me());

-- Anagrafica titoli comune: tutti leggono e aggiungono, nessuno cancella.
grant select, insert, update on titoli, prezzi, esposizioni to fp_app;
