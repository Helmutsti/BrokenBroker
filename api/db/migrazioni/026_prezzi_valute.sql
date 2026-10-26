-- Prezzi dei titoli in altra valuta (decisione 42). Il prezzo salvato resta in euro
-- (prezzi.prezzo); si conservano anche il prezzo originale, la valuta e il cambio
-- usato. I cambi (euro per 1 unità di valuta) sono dati comuni, salvati una volta al giorno.

alter table titoli add column valuta text;
alter table prezzi add column valuta text not null default 'EUR';
alter table prezzi add column prezzo_valuta numeric(14,4);
alter table prezzi add column cambio numeric(14,6);
alter table prezzi add column fonte text;
comment on column titoli.valuta is 'Valuta di quotazione secondo la fonte prezzi (vuota = non ancora letta)';
comment on column prezzi.prezzo is 'Prezzo in euro';
comment on column prezzi.fonte is 'Da dove arriva il prezzo; vuoto = scritto a mano';

create table cambi (
  valuta        text not null,
  data          date not null,
  euro_per_uno  numeric(14,6) not null check (euro_per_uno > 0),
  fonte         text not null,
  primary key (valuta, data)
);
comment on column cambi.euro_per_uno is 'Euro per 1 unità della valuta (es. USD 0.8939)';
grant select, insert, update on cambi to fp_app;
