-- Titoli trovati sui mercati: la ricerca per ticker o per nome dà il simbolo di
-- borsa (es. SWDA.MI) ma non sempre l'ISIN, quindi l'ISIN diventa facoltativo.
-- Un titolo ha almeno uno dei due.

alter table titoli alter column isin drop not null;
alter table titoli add column simbolo text unique;
alter table titoli add column borsa text;
alter table titoli add constraint titoli_codice check (isin is not null or simbolo is not null);
comment on column titoli.simbolo is 'Simbolo di borsa come lo usa Yahoo Finance, es. SWDA.MI';
comment on column titoli.borsa is 'Borsa di quotazione, es. Milano';
