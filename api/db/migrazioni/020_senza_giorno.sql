-- Una spesa può cadere "nel mese" senza un giorno preciso (es. «marzo»): la scadenza resta una data intera
-- (il giorno 1 del mese) e questa colonna ricorda che il giorno non è stato scelto.
alter table spese_previste add column senza_giorno boolean not null default false;
grant update (senza_giorno) on spese_previste to fp_app;
