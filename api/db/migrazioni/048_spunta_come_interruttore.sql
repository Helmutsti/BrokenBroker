-- La spunta è un interruttore (decisione 64): spuntando i soldi escono, togliendo la spunta tornano, sempre, anche se nel frattempo è
-- stato scritto il saldo del conto. Il saldo calcolato (saldi.ts) è il saldo scritto più le transazioni DOPO il suo momento: una
-- transazione di una spunta che nasce o sparisce PRIMA di quel momento non lo muoverebbe. Per questo, in quel caso, si corregge il saldo
-- scritto stesso di ogni conto che la transazione attraversa (entra o esce dal conto con i suoi sotto-conti). Le transazioni scritte a mano
-- non cambiano: il saldo scritto le comprende già.

-- `p_segno` = 1 quando la transazione nasce, -1 quando sparisce. Per ogni conto (e i conti che lo contengono): +1 se ci entra, -1 se ne esce,
-- 0 se entra ed esce dallo stesso contenitore.
create function fp_spunta_nel_saldo_scritto(p_da uuid, p_a uuid, p_importo numeric, p_momento timestamptz, p_segno int) returns void
  language sql security definer set search_path = public as $$
    with recursive su(id, lato) as (
      select x.id, x.lato from (values (p_da, -1), (p_a, 1)) as x(id, lato) where x.id is not null
      union all
      select c.padre_id, su.lato from su join conti c on c.id = su.id where c.padre_id is not null
    ), effetto as (select id, sum(lato) as lato from su group by id)
    update conti c set saldo_scritto = c.saldo_scritto + p_segno * e.lato * p_importo
      from effetto e
     where c.id = e.id and e.lato <> 0 and c.saldo_scritto is not null and c.saldo_scritto_il >= p_momento
  $$;

create function fp_movimenti_spunta_saldo() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    if tg_op in ('DELETE', 'UPDATE') and old.spunta_id is not null then
      perform fp_spunta_nel_saldo_scritto(old.da_conto_id, old.a_conto_id, old.importo, old.momento, -1);
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.spunta_id is not null then
      perform fp_spunta_nel_saldo_scritto(new.da_conto_id, new.a_conto_id, new.importo, new.momento, 1);
    end if;
    return coalesce(new, old);
  end $$;

create trigger movimenti_spunta_saldo after insert or update or delete on movimenti
  for each row execute function fp_movimenti_spunta_saldo();
