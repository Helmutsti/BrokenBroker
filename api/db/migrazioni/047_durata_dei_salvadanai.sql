-- La durata dei salvadanai (decisione 63). Un salvadanaio ha una scadenza (una data da raggiungere), oppure una durata che si ripete
-- (es. l'assicurazione, ogni 12 mesi), oppure niente. Con una durata la quota del promemoria è il traguardo diviso i mesi della durata.

alter table conti
  add column durata_mesi smallint check (durata_mesi is null or durata_mesi between 1 and 120),
  add constraint conti_scadenza_o_durata check (scadenza is null or durata_mesi is null);
grant select (durata_mesi), update (durata_mesi) on conti to fp_app;
