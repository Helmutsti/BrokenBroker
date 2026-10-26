-- Una spesa MENSILE (ogni_mesi = 1) non ha una data ma solo il giorno del mese (decisione 44):
-- giorno_mese 1-31, null = senza giorno (vale tutto il mese personale). prossima_scadenza resta per le
-- altre cadenze (ogni N mesi, una volta sola). I budget restano senza giorno.
alter table spese_previste add column giorno_mese smallint check (giorno_mese between 1 and 31);

update spese_previste
   set giorno_mese = case when tipo = 'budget' or senza_giorno then null else extract(day from prossima_scadenza)::smallint end,
       prossima_scadenza = null,
       senza_giorno = false
 where ogni_mesi = 1 and prossima_scadenza is not null;

alter table spese_previste add constraint spese_mensile_senza_data check (ogni_mesi is distinct from 1 or prossima_scadenza is null);
alter table spese_previste add constraint spese_giorno_solo_mensile check (giorno_mese is null or ogni_mesi = 1);

grant update (giorno_mese) on spese_previste to fp_app;
