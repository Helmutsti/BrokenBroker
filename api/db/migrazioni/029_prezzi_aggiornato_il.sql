-- Data e ora in cui un prezzo è stato letto dalla fonte o scritto a mano (decisione 42): serve alla
-- finestra della posizione («aggiornato il gg/mm hh:mm · fonte»). I prezzi vecchi restano senza ora.
alter table prezzi add column aggiornato_il timestamptz;
