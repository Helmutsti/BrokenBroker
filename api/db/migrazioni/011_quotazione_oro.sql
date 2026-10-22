-- Quotazione dell'oro: il valore dell'oro fisico si calcola da peso, purezza e
-- prezzo al grammo di oro fino. L'API la legge una volta al giorno da una fonte
-- pubblica e la conserva qui, così resta disponibile anche senza internet e
-- serve per l'andamento nel tempo. Dato comune a tutti, come i prezzi dei titoli.

create table quotazioni_oro (
  data         date primary key,
  euro_grammo  numeric(12,4) not null check (euro_grammo > 0),
  fonte        text not null
);
comment on column quotazioni_oro.euro_grammo is 'Euro per grammo di oro fino (24 carati)';

grant select, insert, update on quotazioni_oro to fp_app;
