-- Un salvadanaio creato da una spesa (da "Dividi per spesa" o dal modulo della spesa, anche sotto un altro
-- salvadanaio o in un contenitore nuovo) si riconosce da questa colonna. È bloccato (decisione 37 a)
-- solo finché esiste una spesa che lo paga: eliminata la spesa torna libero.
alter table obiettivi add column da_spesa boolean not null default false;
grant select on obiettivi to fp_app;

update obiettivi o set da_spesa = true
 where exists (select 1 from utenti u where u.id = o.proprietario_id and u.obiettivo_annuali = o.padre_id)
   and exists (select 1 from spese_previste s where s.obiettivo_id = o.id);
