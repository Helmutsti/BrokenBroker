-- Scadenza e ripetizione insieme (decisione 69, supera la 63 su questo punto). La scadenza dice solo quando cade la spesa; «Si ripete»
-- è un interruttore a parte (ogni N mesi). Con la ripetizione la quota del mese resta il traguardo diviso i mesi della durata.
alter table conti drop constraint conti_scadenza_o_durata;
