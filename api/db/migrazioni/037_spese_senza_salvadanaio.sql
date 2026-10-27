-- Spese senza salvadanaio (decisione 50). Una spesa non si collega più a un salvadanaio: resta un promemoria
-- che si spunta come le altre e muove il saldo del conto. Restano solo il «Ricordami» di un salvadanaio
-- (spese_previste.alimenta_obiettivo_id) e la spesa creata al raggiungimento del traguardo (obiettivi.spesa_creata_id).
-- Si tolgono: spese_previste.obiettivo_id (il salvadanaio «pagante»), obiettivi.da_spesa e il legame tra spunta e
-- versamento (versamenti.quota_spunta_id e versamenti.spunta_id). Nessun versamento e nessun movimento viene cancellato.

-- 1) I salvadanai che oggi prendono scadenza e traguardo da una spesa periodica attiva (ogni_mesi > 1) diventano
--    salvadanai normali: la scadenza che l'API calcolava (prossima uscita, per mesi personali di chi li possiede)
--    si scrive come data fissa; il traguardo, se mancava, è l'importo della spesa.
create function pg_temp.mese_inizio(d date, ini int) returns date
  language sql immutable as $$
    select case when extract(day from d) >= ini then date_trunc('month', d)::date
                else (date_trunc('month', d) - interval '1 month')::date end $$;

-- Come prossimaUscita in api/src/periodo.ts: il mese personale di «oggi» conta ancora; senza giorno vale l'ultimo
-- giorno del mese personale; con giorno, quel giorno dentro il mese personale (fermo all'ultimo del mese).
create function pg_temp.prossima(prima date, ogni int, senza boolean, ini int, oggi date) returns date
  language plpgsql immutable as $$
  declare
    ora date := pg_temp.mese_inizio(oggi, ini);
    primo date := case when senza then date_trunc('month', prima)::date else pg_temp.mese_inizio(prima, ini) end;
    arretrati int := (extract(year from ora)::int - extract(year from primo)::int) * 12 + extract(month from ora)::int - extract(month from primo)::int;
    mese date;
    giorno int := extract(day from prima)::int;
    base date;
  begin
    mese := (primo + make_interval(months => case when arretrati <= 0 then 0 else ceil(arretrati::numeric / ogni)::int * ogni end))::date;
    if senza then
      return (mese + make_interval(days => ini - 1) + interval '1 month' - interval '1 day')::date;
    end if;
    base := case when giorno >= ini then mese else (mese + interval '1 month')::date end;
    return base + (least(giorno, extract(day from (date_trunc('month', base) + interval '1 month' - interval '1 day'))::int) - 1);
  end $$;

update obiettivi o
   set scadenza = pg_temp.prossima(x.prossima_scadenza, x.ogni_mesi, x.senza_giorno, u.inizio_mese::int, (now() at time zone 'Europe/Rome')::date),
       traguardo = coalesce(o.traguardo, x.importo)
  from (select distinct on (obiettivo_id) obiettivo_id, prossima_scadenza, ogni_mesi, senza_giorno, importo
          from spese_previste
         where obiettivo_id is not null and attiva and ogni_mesi > 1 and prossima_scadenza is not null
         order by obiettivo_id, prossima_scadenza, id) x,
       utenti u
 where o.id = x.obiettivo_id and u.id = o.proprietario_id;

-- 2) Il legame tra spunta e versamento sparisce. I movimenti del conto nati da una spunta con quota versata
--    restano come movimenti del versamento (spariscono con lui, non con la spunta).
update movimenti_conto set spunta_id = null where versamento_id is not null and spunta_id is not null;
drop index versamenti_quota_spunta_ix;
alter table versamenti drop column quota_spunta_id;
alter table versamenti drop column spunta_id;

-- 3) Il salvadanaio «pagante» di una spesa e il salvadanaio nato da una spesa.
drop trigger spese_previste_obiettivo on spese_previste;
drop index spese_previste_obiettivo_ix;
alter table spese_previste drop column obiettivo_id;
alter table obiettivi drop column da_spesa;

-- Il salvadanaio del «Ricordami» deve restare visibile a chi scrive la spesa (come prima, solo per alimenta_obiettivo_id).
create or replace function fp_controlla_obiettivo_spesa() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if new.alimenta_obiettivo_id is not null and not fp_vede_obiettivo(new.alimenta_obiettivo_id) then
    raise exception 'Obiettivo non trovato' using errcode = '23503';
  end if;
  return new;
end
$$;
create trigger spese_previste_obiettivo before insert or update of alimenta_obiettivo_id on spese_previste
  for each row execute function fp_controlla_obiettivo_spesa();

-- 4) Togliere la spunta annulla solo il movimento sul conto (nessun versamento legato).
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
    delete from movimenti_conto where spunta_id = p_spunta;
  end
  $$;

-- 5) La spunta di una spesa muove solo il conto della spesa (anche se è visibile solo a chi l'ha creata): la funzione
--    controlla che la spunta sia di chi chiama e che la spesa sia una che vede. Niente più versamenti.
drop function fp_spunta_muovi(uuid, numeric, text, text, numeric, date);
create function fp_spunta_muovi(p_spunta uuid, p_importo_conto numeric, p_descrizione text)
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
    if p_importo_conto is null or p_importo_conto = 0 or abs(p_importo_conto) > s.importo + 0.005 then
      raise exception 'Importo non valido' using errcode = '22023';
    end if;
    if s.conto_id is null then raise exception 'La spesa non ha un conto' using errcode = '22023'; end if;
    insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id)
      values (s.conto_id, p_importo_conto, fp_me(), 'spesa', p_descrizione, p_spunta);
  end
  $$;
