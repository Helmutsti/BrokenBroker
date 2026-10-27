-- Il salvadanaio sul conto (decisione 52, cambia la 47 G e la 51 per i versamenti «Dal conto»).
--
-- Un salvadanaio può stare su un conto (migrazione 032: `obiettivi.conto_id`, quello che vale è il proprio o il più vicino dei suoi
-- superiori). Quando i soldi per un versamento «Dal conto» vengono dal conto in cui sta già il salvadanaio, non lasciano il conto:
-- il saldo non si muove, sono solo messi da parte. Quindi, per un versamento positivo dal conto C verso un salvadanaio che sta sul conto K:
--      K = C                -> nessun movimento (il saldo di C resta uguale);
--      K = un altro conto   -> un giroconto (una riga): C -> K;
--      K = nessun conto     -> come prima: C -> Niente.
-- Un prelievo verso il conto C è simmetrico (K = C nessun movimento, altro conto K -> C, nessun conto: Niente -> C).
-- Lo decide l'API (`movimenti.ts`, `movimentoDelVersamento`) con la funzione qui sotto.
--
-- «Liberi» di un conto = saldo - soldi nei salvadanai che stanno su quel conto: `fp_nei_salvadanai()`.

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Il conto di un salvadanaio per chi chiama: il proprio conto o il primo che si trova salendo verso i superiori, MA solo se chi chiama
--    lo vede (le regole di visibilità valgono: un conto altrui non condiviso è come se non ci fosse). Funzione normale (non security
--    definer): l'albero lo percorre solo nella parte che chi chiama vede.
create function fp_conto_del_salvadanaio(p_id uuid) returns uuid
  language sql stable
  as $$
    with recursive su (padre_id, conto_id, livello) as (
      select o.padre_id, o.conto_id, 0 from obiettivi o where o.id = p_id
      union all
      select o.padre_id, o.conto_id, su.livello + 1 from obiettivi o join su on o.id = su.padre_id where su.livello < 50
    )
    select c.id from conti c
     where c.id = (select s.conto_id from su s where s.conto_id is not null order by s.livello limit 1)
  $$;

-- 2) Quanti soldi stanno nei salvadanai di ogni conto, per chi chiama: la somma dei versamenti (saldo PROPRIO di ogni salvadanaio, quindi
--    senza contare due volte i sotto-salvadanai) di tutti i salvadanai che chi chiama vede e che stanno su quel conto, nascosti compresi.
--    Un salvadanaio condiviso lo vedono tutti e due con i suoi versamenti interi (come l'albero dei salvadanai); uno privato che sta su un
--    conto condiviso lo conta solo il suo proprietario. Un salvadanaio il cui conto chi chiama non vede non conta da nessuna parte.
create function fp_nei_salvadanai() returns table (conto_id uuid, totale numeric)
  language sql stable
  as $$
    select k.cid, sum(k.versato)
      from (select fp_conto_del_salvadanaio(o.id) as cid,
                   coalesce((select sum(x.importo) from versamenti x where x.obiettivo_id = o.id), 0) as versato
              from obiettivi o) k
     where k.cid is not null
     group by k.cid
  $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Conversione dei movimenti che ci sono già.
--    Un versamento «Dal conto» (conto -> Niente) o «Torna sul conto» (Niente -> conto) verso un salvadanaio che sta sullo STESSO conto
--    non doveva muovere il saldo: il movimento si toglie e il saldo di quel conto risale della cifra (i soldi non erano mai usciti dal
--    conto). Il versamento nel salvadanaio resta. Il conto del salvadanaio è quello di oggi (il proprio o del superiore più vicino).
--    I movimenti verso un salvadanaio su un ALTRO conto restano come sono (conto -> Niente): si contano e si segnalano, non si toccano.
--    Le date e i saldi di partenza non cambiano; il controllo in fondo ricalcola i saldi di tutti i conti e si ferma se la differenza
--    non coincide esattamente con la somma dei movimenti tolti.
create temp table conti_del_salvadanaio on commit drop as
  with recursive su (origine, id, padre_id, conto_id, livello) as (
    select o.id, o.id, o.padre_id, o.conto_id, 0 from obiettivi o
    union all
    select su.origine, o.id, o.padre_id, o.conto_id, su.livello + 1 from obiettivi o join su on o.id = su.padre_id where su.livello < 50
  )
  select distinct on (origine) origine as obiettivo_id, conto_id from su where conto_id is not null order by origine, livello;

create temp table saldi_prima on commit drop as
  select c.id, c.nome, c.saldo_partenza + coalesce((select sum(case when m.a_conto_id = c.id then m.importo else -m.importo end)
                                                      from movimenti_conto m where (m.a_conto_id = c.id or m.da_conto_id = c.id) and m.momento > c.saldo_partenza_il), 0) as saldo
    from conti c where c.saldo_partenza is not null and c.id <> fp_niente();

create temp table da_togliere on commit drop as
  select m.id, m.importo, m.momento, cs.conto_id, case when m.da_conto_id = cs.conto_id then 1 else -1 end as segno
    from movimenti_conto m
    join versamenti x on x.id = m.versamento_id
    join conti_del_salvadanaio cs on cs.obiettivo_id = x.obiettivo_id
   where m.causa = 'versamento'
     and ((m.da_conto_id = cs.conto_id and m.a_conto_id = fp_niente()) or (m.a_conto_id = cs.conto_id and m.da_conto_id = fp_niente()));

do $$
declare r record; altri int;
begin
  select count(*) into altri from movimenti_conto m
    join versamenti x on x.id = m.versamento_id join conti_del_salvadanaio cs on cs.obiettivo_id = x.obiettivo_id
   where m.causa = 'versamento' and m.id not in (select id from da_togliere)
     and ((m.da_conto_id <> cs.conto_id and m.a_conto_id = fp_niente()) or (m.a_conto_id <> cs.conto_id and m.da_conto_id = fp_niente()));
  for r in select t.conto_id, c.nome, count(*) as quanti, sum(t.importo) as totale from da_togliere t join conti c on c.id = t.conto_id group by t.conto_id, c.nome loop
    raise notice 'Conto %: tolti % movimenti di versamento verso salvadanai sullo stesso conto, % euro', r.nome, r.quanti, r.totale;
  end loop;
  raise notice 'Movimenti di versamento verso salvadanai su un altro conto lasciati come sono (conto -> Niente): %', altri;
end $$;

delete from movimenti_conto where id in (select id from da_togliere);

-- Controllo: il saldo di ogni conto cambia esattamente della somma dei movimenti tolti che contavano (dopo il saldo di partenza):
-- un'uscita tolta lo fa salire, un'entrata tolta lo fa scendere. Altrimenti la migrazione si ferma e non cambia nulla.
do $$
declare r record;
begin
  for r in select p.nome, p.saldo as prima,
                  c.saldo_partenza + coalesce((select sum(case when m.a_conto_id = c.id then m.importo else -m.importo end)
                                                 from movimenti_conto m where (m.a_conto_id = c.id or m.da_conto_id = c.id) and m.momento > c.saldo_partenza_il), 0) as dopo,
                  coalesce((select sum(t.segno * t.importo) from da_togliere t where t.conto_id = c.id and t.momento > c.saldo_partenza_il), 0) as attesa
             from saldi_prima p join conti c on c.id = p.id loop
    if r.dopo - r.prima <> r.attesa then
      raise exception 'Il saldo del conto % non torna (% -> %, attesa una differenza di %): migrazione annullata', r.nome, r.prima, r.dopo, r.attesa;
    end if;
    if r.dopo <> r.prima then
      raise notice 'Saldo del conto %: % -> % (i soldi messi da parte restano sul conto)', r.nome, r.prima, r.dopo;
    end if;
  end loop;
end $$;
