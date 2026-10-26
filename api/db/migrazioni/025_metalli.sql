-- Beni con prezzo di mercato (metalli preziosi) e beni non quotati (decisione 42).
-- Catalogo comune (come i titoli): oro, argento, platino, palladio a grammi e
-- monete standard con i grammi di metallo fino noti. Il valore di un bene del
-- catalogo è grammi fini × quotazione SPOT del metallo.

create table catalogo_beni (
  codice              text primary key,
  nome                text not null,
  metallo             text not null check (metallo in ('XAU', 'XAG', 'XPT', 'XPD')),
  unita               text not null check (unita in ('grammi', 'pezzi')),
  -- Per le monete (pezzi): grammi di metallo fino in ogni pezzo.
  grammi_fini         numeric(10,4) check (grammi_fini > 0),
  -- Per i grammi: purezza in millesimi proposta se l'utente non la scrive.
  purezza_predefinita numeric(5,1) check (purezza_predefinita > 0 and purezza_predefinita <= 1000),
  ordine              smallint not null,
  check ((unita = 'pezzi' and grammi_fini is not null and purezza_predefinita is null)
      or (unita = 'grammi' and grammi_fini is null and purezza_predefinita is not null))
);
insert into catalogo_beni (codice, nome, metallo, unita, grammi_fini, purezza_predefinita, ordine) values
  ('oro',                'Oro (lingotti, grammi)',        'XAU', 'grammi', null,    999.9, 1),
  ('argento',            'Argento (lingotti, grammi)',    'XAG', 'grammi', null,    999.0, 2),
  ('platino',            'Platino (lingotti, grammi)',    'XPT', 'grammi', null,    999.5, 3),
  ('palladio',           'Palladio (lingotti, grammi)',   'XPD', 'grammi', null,    999.5, 4),
  ('marengo',            'Marengo',                       'XAU', 'pezzi',  5.8060,  null,  5),
  ('napoleone',          'Napoleone 20 franchi (= Marengo)', 'XAU', 'pezzi', 5.8060, null,  6),
  ('sterlina',           'Sterlina',                      'XAU', 'pezzi',  7.3224,  null,  7),
  ('krugerrand',         'Krugerrand 1 oz',               'XAU', 'pezzi',  31.1035, null,  8),
  ('maple-leaf-oro',     'Maple Leaf oro 1 oz',           'XAU', 'pezzi',  31.1035, null,  9),
  ('philharmoniker-oro', 'Philharmoniker oro 1 oz',       'XAU', 'pezzi',  31.1035, null, 10);
grant select on catalogo_beni to fp_app;

-- Quotazioni spot per metallo: euro per grammo di metallo fino, una al giorno.
create table quotazioni_metalli (
  metallo      text not null check (metallo in ('XAU', 'XAG', 'XPT', 'XPD')),
  data         date not null,
  euro_grammo  numeric(12,4) not null check (euro_grammo > 0),
  fonte        text not null,
  primary key (metallo, data)
);
insert into quotazioni_metalli (metallo, data, euro_grammo, fonte)
  select 'XAU', data, euro_grammo, fonte from quotazioni_oro;
grant select, insert, update on quotazioni_metalli to fp_app;
drop table quotazioni_oro;

-- Beni ---------------------------------------------------------------------
alter table beni add column catalogo_codice text references catalogo_beni (codice);
alter table beni add column quantita numeric(14,4) check (quantita > 0);
-- L'oro già presente diventa la voce «oro» del catalogo: grammi = peso, purezza com'era.
update beni set catalogo_codice = 'oro', quantita = peso_grammi where tipo = 'oro';
-- Togliere forma e peso_grammi elimina anche i vincoli che li usano.
alter table beni drop column forma;
alter table beni drop column peso_grammi;
alter table beni drop constraint beni_tipo_check;
update beni set tipo = 'metallo' where tipo = 'oro';
alter table beni add constraint beni_tipo_check
  check (tipo in ('fondo_pensione', 'crowdfunding', 'societa', 'immobile', 'altro', 'metallo'));
-- Il valore dei metalli si calcola dalla quotazione: non si salva.
alter table beni alter column valore drop not null;
update beni set valore = null where catalogo_codice is not null;
alter table beni add constraint beni_forma_check check (
  (catalogo_codice is null and tipo <> 'metallo' and valore is not null and quantita is null and purezza is null)
  or (catalogo_codice is not null and tipo = 'metallo' and valore is null and quantita is not null));
comment on column beni.purezza is 'Millesimi di metallo fino (solo beni del catalogo venduti a grammi), es. 999.9';
comment on column beni.quantita is 'Grammi o pezzi, secondo l''unità della voce del catalogo';
