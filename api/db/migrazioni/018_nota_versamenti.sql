-- Nota breve su ogni versamento (la causale: "tartarughe", "regalo dopo assicurazione"), da rivedere nello storico.
alter table versamenti add column nota text;
grant update (nota) on versamenti to fp_app;
