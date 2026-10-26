-- Decisione 42: i portafogli non si archiviano. Nessun dato va perso: quelli archiviati restano attivi.
alter table portafogli drop column archiviato;
