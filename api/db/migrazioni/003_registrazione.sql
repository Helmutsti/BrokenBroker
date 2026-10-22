-- Registrazione di un utente con le categorie standard (decisione 10).
-- Colori e icone restano vuoti: si decidono nella tappa Figma.

create or replace function fp_crea_categorie_standard(p_utente uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
declare
  albero jsonb := '[
    {"nome": "Casa", "figli": [
      "Affitto",
      {"nome": "Bollette", "figli": ["Luce", "Gas", "Internet e telefono"]},
      "Tari", "Manutenzione", "Arredamento"]},
    {"nome": "Cibo", "figli": ["Supermercato", "Ristoranti", "Pranzo fuori", "Bar", "Consegne a domicilio"]},
    {"nome": "Trasporti", "figli": ["Carburante", "Assicurazione", "Bollo", "Revisione e manutenzione",
                                    "Parcheggio e box", "Mezzi pubblici", "Pedaggi"]},
    {"nome": "Abbonamenti", "figli": ["Streaming", "Musica", "Software", "Cloud", "Telefono"]},
    {"nome": "Svago", "figli": ["Uscite", "Hobby", "Viaggi e vacanze", "Libri e giochi"]},
    {"nome": "Salute e cura", "figli": ["Farmacia", "Visite", "Ottico", "Cura personale", "Sport"]},
    {"nome": "Shopping", "figli": ["Vestiti", "Tecnologia", "Regali"]},
    {"nome": "Animali", "figli": ["Cibo", "Veterinario"]},
    {"nome": "Finanza", "figli": ["Rate", "Commissioni", "Tasse", "Risparmio e investimenti"]},
    {"nome": "Lavoro", "figli": ["Domini e siti", "Strumenti di lavoro"]},
    {"nome": "Altro"},
    {"nome": "Entrate", "tipo": "entrata", "figli": ["Stipendio", "Rimborsi", "Regali ricevuti", "Altre entrate"]}
  ]';
begin
  perform fp_inserisci_categorie(p_utente, null, 'uscita', albero);
end
$$;

-- Inserisce ricorsivamente un ramo: ogni nodo è una stringa o {nome, tipo?, figli?}.
create or replace function fp_inserisci_categorie(p_utente uuid, p_padre uuid, p_tipo text, p_nodi jsonb) returns void
  language plpgsql security definer set search_path = public
  as $$
declare
  nodo    jsonb;
  pos     integer := 0;
  nuovo   uuid;
  v_tipo  text;
begin
  for nodo in select value from jsonb_array_elements(p_nodi) loop
    v_tipo := case when jsonb_typeof(nodo) = 'object' then coalesce(nodo ->> 'tipo', p_tipo) else p_tipo end;
    insert into categorie (proprietario_id, padre_id, nome, tipo, ordine)
    values (p_utente, p_padre,
            case when jsonb_typeof(nodo) = 'string' then nodo #>> '{}' else nodo ->> 'nome' end,
            v_tipo, pos)
    returning id into nuovo;
    if jsonb_typeof(nodo) = 'object' and nodo ? 'figli' then
      perform fp_inserisci_categorie(p_utente, nuovo, v_tipo, nodo -> 'figli');
    end if;
    pos := pos + 1;
  end loop;
end
$$;

create or replace function fp_registra(p_email text, p_nome text, p_password_hash text) returns uuid
  language plpgsql security definer set search_path = public
  as $$
declare
  nuovo uuid;
begin
  insert into utenti (email, nome, password_hash)
  values (trim(p_email), trim(p_nome), p_password_hash)
  returning id into nuovo;
  perform fp_crea_categorie_standard(nuovo);
  return nuovo;
end
$$;

revoke execute on function fp_crea_categorie_standard(uuid), fp_inserisci_categorie(uuid, uuid, text, jsonb) from public;
revoke execute on function fp_registra(text, text, text) from public;
grant execute on function fp_registra(text, text, text) to fp_app;
