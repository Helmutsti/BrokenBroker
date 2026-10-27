-- Budget con due modi, pagina Movimenti, spunte di voci condivise su conti che non si vedono (decisione 48).
--
-- Un budget (spese_previste.tipo = 'budget') ha un MODO, scelto per ogni budget:
--  - 'sposto': sposta soldi da un conto di partenza a un conto di arrivo. Spuntarlo nel mese registra un GIROCONTO
--    (due movimenti collegati, uno negativo sulla partenza e uno positivo sull'arrivo, con la spunta); togliere la
--    spunta li annulla insieme (fp_annulla_spunta cancella i movimenti con quella spunta). Senza i due conti
--    impostati la spunta non muove nulla.
--  - 'conto': il budget è un tetto mensile per categoria; durante il mese si registrano le USCITE reali, che sono
--    movimenti del registro (causa 'budget', budget_id) con il conto da cui escono (facoltativo).
-- I budget esistenti partono dal modo 'sposto' senza conti: non muovono nulla finché non si impostano.

alter table spese_previste
  add column budget_modo       text check (budget_modo in ('sposto', 'conto')),
  add column conto_partenza_id uuid references conti (id) on delete set null,
  add column conto_arrivo_id   uuid references conti (id) on delete set null;

update spese_previste set budget_modo = 'sposto' where tipo = 'budget';

alter table spese_previste
  add constraint spese_budget_modo check ((tipo = 'budget') = (budget_modo is not null)),
  add constraint spese_budget_conti check (coalesce(budget_modo, '') = 'sposto' or (conto_partenza_id is null and conto_arrivo_id is null)),
  add constraint spese_budget_conti_diversi check (conto_partenza_id is distinct from conto_arrivo_id or conto_partenza_id is null);

grant update (budget_modo, conto_partenza_id, conto_arrivo_id) on spese_previste to fp_app;

-- Un solo registro dei movimenti. Nuove cause: 'giroconto' (le due gambe di un budget «sposto») e 'budget'
-- (un'uscita registrata su un budget «conto le uscite»). Un'uscita può non avere un conto (conto_id vuoto).
alter table movimenti_conto drop constraint movimenti_conto_causa_check;
alter table movimenti_conto add constraint movimenti_conto_causa_check check (causa in ('spesa', 'rata', 'versamento', 'giroconto', 'budget'));
alter table movimenti_conto alter column conto_id drop not null;
alter table movimenti_conto add constraint movimenti_conto_senza_conto check (conto_id is not null or causa = 'budget');
alter table movimenti_conto
  add column budget_id    uuid references spese_previste (id) on delete set null,
  add column giroconto_id uuid;
create index movimenti_conto_budget_ix on movimenti_conto (budget_id, momento) where budget_id is not null;
create index movimenti_conto_giroconto_ix on movimenti_conto (giroconto_id) where giroconto_id is not null;

-- Chi vede un movimento: chi vede il suo conto; in più un'uscita di budget la vede chi l'ha scritta e chi vede il budget
-- (un budget condiviso ha un totale solo, anche se i conti da cui si esce sono diversi: il nome del conto resta nascosto a chi non lo vede).
drop policy movimenti_conto_vedi on movimenti_conto;
create policy movimenti_conto_vedi on movimenti_conto for select using (
  (conto_id is not null and fp_vede_conto(conto_id))
  or (causa = 'budget' and (utente_id = fp_me() or (budget_id is not null and fp_vede_spesa(budget_id)))));

drop policy movimenti_conto_crea on movimenti_conto;
create policy movimenti_conto_crea on movimenti_conto for insert with check (
  utente_id = fp_me() and (
    (conto_id is not null and fp_vede_conto(conto_id))
    or (conto_id is null and causa = 'budget' and budget_id is not null and fp_vede_spesa(budget_id))));

-- Le sole uscite di budget si possono togliere (le altre spariscono insieme a ciò che le ha create).
grant delete on movimenti_conto to fp_app;
create policy movimenti_conto_togli on movimenti_conto for delete using (
  causa = 'budget' and (
    utente_id = fp_me()
    or (conto_id is not null and fp_vede_conto(conto_id))
    or (budget_id is not null and fp_vede_spesa(budget_id))));

-- Se un conto è condiviso con qualcuno (si può chiedere per un conto che si vede o che usa una spesa che si vede).
create function fp_conto_condiviso(p_conto uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (select 1 from condivisioni where conto_id = p_conto)
       and (fp_vede_conto(p_conto)
            or exists (select 1 from spese_previste e where e.conto_id = p_conto and fp_vede_spesa(e.id)))
  $$;

-- La spunta di una spesa condivisa muove il conto e il salvadanaio della spesa anche se questi sono visibili solo a chi
-- l'ha creata (decisione 48 B): non vengono letti né modificati a mano, ma scritti da questa funzione, che controlla
-- che la spunta sia di chi chiama e che la spesa sia una che vede. Il conto e il salvadanaio sono quelli della spesa.
--  p_importo_conto: movimento sul conto della spesa (negativo = esce); causa 'spesa' o 'versamento';
--  p_versamento: versamento nel salvadanaio della spesa (positivo = quota messa da parte, legata alla spunta;
--  negativo = prelievo per pagare la spesa); i due si legano se la causa è 'versamento'.
create function fp_spunta_muovi(p_spunta uuid, p_importo_conto numeric, p_causa text, p_descrizione text, p_versamento numeric, p_data date)
  returns void
  language plpgsql security definer set search_path = public
  as $$
  declare s record; v_id uuid; v_nome text;
  begin
    select sp.utente_id, sp.spesa_prevista_id, e.conto_id, e.obiettivo_id, e.importo, e.nome into s
      from spunte sp join spese_previste e on e.id = sp.spesa_prevista_id where sp.id = p_spunta;
    if not found or s.utente_id <> fp_me() or not fp_vede_spesa(s.spesa_prevista_id) then
      raise exception 'Spunta non valida' using errcode = '42501';
    end if;
    if p_causa not in ('spesa', 'versamento')
       or abs(coalesce(p_importo_conto, 0)) > s.importo + 0.005 or abs(coalesce(p_versamento, 0)) > s.importo + 0.005 then
      raise exception 'Importo non valido' using errcode = '22023';
    end if;
    if coalesce(p_versamento, 0) <> 0 then
      if s.obiettivo_id is null then raise exception 'La spesa non ha un salvadanaio' using errcode = '22023'; end if;
      select nome into v_nome from obiettivi where id = s.obiettivo_id;
      insert into versamenti (obiettivo_id, utente_id, data, importo, quota_spunta_id, spunta_id)
        values (s.obiettivo_id, fp_me(), p_data, p_versamento,
                case when p_versamento > 0 then p_spunta end, case when p_versamento < 0 then p_spunta end)
        returning id into v_id;
    end if;
    if coalesce(p_importo_conto, 0) <> 0 then
      if s.conto_id is null then raise exception 'La spesa non ha un conto' using errcode = '22023'; end if;
      insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id, versamento_id)
        values (s.conto_id, p_importo_conto, fp_me(), p_causa,
                case when p_causa = 'versamento' then 'Versato in ' || v_nome || ' (quota di ' || s.nome || ')' else p_descrizione end,
                p_spunta, case when p_causa = 'versamento' then v_id end);
    end if;
  end
  $$;

-- La spunta di un budget «sposto»: il giroconto, due movimenti collegati (stesso giroconto_id e stessa spunta),
-- anche se i conti non sono visibili a chi spunta (budget condiviso). I conti sono quelli del budget.
create function fp_spunta_giroconto(p_spunta uuid, p_importo numeric) returns void
  language plpgsql security definer set search_path = public
  as $$
  declare s record; g uuid := gen_random_uuid(); da text; a text;
  begin
    select sp.utente_id, e.id as budget, e.nome, e.tipo, e.budget_modo, e.conto_partenza_id as partenza, e.conto_arrivo_id as arrivo, e.importo into s
      from spunte sp join spese_previste e on e.id = sp.spesa_prevista_id where sp.id = p_spunta;
    if not found or s.utente_id <> fp_me() or not fp_vede_spesa(s.budget) then
      raise exception 'Spunta non valida' using errcode = '42501';
    end if;
    if s.tipo <> 'budget' or s.budget_modo <> 'sposto' or s.partenza is null or s.arrivo is null
       or p_importo <= 0 or p_importo > s.importo + 0.005 then
      raise exception 'Giroconto non valido' using errcode = '22023';
    end if;
    select nome into da from conti where id = s.partenza;
    select nome into a from conti where id = s.arrivo;
    insert into movimenti_conto (conto_id, importo, utente_id, causa, descrizione, spunta_id, budget_id, giroconto_id)
      values (s.partenza, -p_importo, fp_me(), 'giroconto', 'Giroconto ' || s.nome || ' verso ' || a, p_spunta, s.budget, g),
             (s.arrivo,    p_importo, fp_me(), 'giroconto', 'Giroconto ' || s.nome || ' da ' || da, p_spunta, s.budget, g);
  end
  $$;
