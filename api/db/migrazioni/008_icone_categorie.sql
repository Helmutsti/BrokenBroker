-- Icone Lucide delle categorie standard (proposta nel registro del design).
-- Le sottocategorie senza icona usano quella del padre.

create or replace function fp_icone_standard(p_utente uuid) returns void
  language plpgsql security definer set search_path = public
  as $$
declare
  icone jsonb := '{
    "Casa": "house", "Casa/Bollette": "zap", "Casa/Tari": "trash-2", "Casa/Arredamento": "sofa",
    "Cibo": "utensils", "Cibo/Supermercato": "shopping-cart", "Cibo/Bar": "coffee",
    "Trasporti": "car", "Trasporti/Carburante": "fuel", "Trasporti/Parcheggio e box": "square-parking",
    "Trasporti/Assicurazione": "shield", "Trasporti/Bollo": "file-text",
    "Trasporti/Revisione e manutenzione": "wrench", "Trasporti/Mezzi pubblici": "bus",
    "Abbonamenti": "repeat", "Abbonamenti/Streaming": "tv", "Abbonamenti/Musica": "music",
    "Abbonamenti/Software": "laptop", "Abbonamenti/Telefono": "smartphone",
    "Svago": "ticket", "Svago/Viaggi e vacanze": "tree-palm", "Svago/Libri e giochi": "gamepad-2",
    "Salute e cura": "heart", "Salute e cura/Farmacia": "pill", "Salute e cura/Visite": "stethoscope",
    "Salute e cura/Ottico": "glasses",
    "Shopping": "package", "Shopping/Vestiti": "shirt", "Shopping/Tecnologia": "laptop", "Shopping/Regali": "gift",
    "Animali": "cat", "Finanza": "landmark", "Finanza/Rate": "credit-card",
    "Finanza/Risparmio e investimenti": "trending-up", "Lavoro": "briefcase", "Altro": "ellipsis", "Entrate": "banknote"
  }';
begin
  update categorie set icona = icone ->> nome
   where proprietario_id = p_utente and padre_id is null and icona is null and icone ? nome;
  update categorie c set icona = icone ->> (p.nome || '/' || c.nome)
    from categorie p
   where c.proprietario_id = p_utente and p.id = c.padre_id and p.padre_id is null
     and c.icona is null and icone ? (p.nome || '/' || c.nome);
end
$$;
revoke execute on function fp_icone_standard(uuid) from public;

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
  perform fp_icone_standard(nuovo);
  return nuovo;
end
$$;

-- Utenti già registrati.
select fp_icone_standard(id) from utenti;
