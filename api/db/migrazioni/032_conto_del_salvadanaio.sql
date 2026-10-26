-- Conto del salvadanaio (decisione 45): su quale conto stanno i suoi soldi. Facoltativo.
-- Un sotto-salvadanaio senza conto proprio eredita quello del padre (lo risolve l'API).
-- Chi non vede il conto (regole di visibilità dei conti) lo vede come «senza conto»: l'API lo controlla.
-- Se il conto viene cancellato il salvadanaio resta, senza conto.
alter table obiettivi add column conto_id uuid references conti (id) on delete set null;
create index obiettivi_conto_ix on obiettivi (conto_id);

grant update (conto_id) on obiettivi to fp_app;
