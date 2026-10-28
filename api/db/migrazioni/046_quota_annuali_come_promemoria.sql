-- La quota delle annuali non è più un promemoria speciale (decisione 62): lo stesso lavoro lo fa il promemoria del salvadanaio delle annuali
-- (quello che contiene le ceste), la cui quota del mese è la somma di quanto serve a ogni cesta per arrivare piena alla sua scadenza.
-- Via la spesa speciale, la colonna che la segnava e il «conto delle annuali» del profilo.
delete from spese_previste where quota_annuali;
drop index spese_quota_annuali_ux;
alter table spese_previste drop column quota_annuali;
alter table utenti drop column conto_annuali_id;
