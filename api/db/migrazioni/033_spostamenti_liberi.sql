-- Spostamenti tra i liberi di un salvadanaio e i suoi sotto-salvadanai (decisione 46).
-- I versamenti nati dallo stesso spostamento (uno negativo da una parte, uno o più positivi dall'altra)
-- hanno lo stesso spostamento_id: l'app li mostra come «da liberi di …» e, cancellandone uno, spariscono tutti.
-- Facoltativa: i versamenti normali restano senza.
alter table versamenti add column spostamento_id uuid;
create index versamenti_spostamento_ix on versamenti (spostamento_id) where spostamento_id is not null;
