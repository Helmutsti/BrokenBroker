import type { PoolClient } from 'pg';

// Il saldo unico (decisione 72): una sola cifra scritta a mano (`utenti.sul_conto`, con il momento in cui è stata scritta). Il saldo che vale
// adesso è quella cifra meno le uscite nate dalle spunte (spese e rate, la quota di chi spunta) fatte DOPO quel momento: togliendo la spunta
// la cifra risale da sola. Senza cifra scritta il saldo non c'è (null). Riscrivere la cifra riparte da zero (nuovo momento).

export type Saldo = {
  // La cifra scritta e quando; `uscite_spuntate` quanto hanno tolto le spunte da allora; `effettivo` quello che vale adesso.
  sul_conto: string | null; scritto_il: string | null; uscite_spuntate: string; effettivo: string | null;
};

export async function leggiSaldo(db: PoolClient): Promise<Saldo> {
  const { rows } = await db.query<Saldo>(
    `select u.sul_conto::text as sul_conto, u.sul_conto_al as scritto_il, q.uscite::numeric(12,2)::text as uscite_spuntate,
            (u.sul_conto - q.uscite)::text as effettivo
       from utenti u
       cross join lateral (
         select coalesce(sum(m.importo), 0) as uscite
           from movimenti m join spunte sp on sp.id = m.spunta_id
          where m.utente_id = fp_me() and sp.utente_id = fp_me() and sp.creata_il > u.sul_conto_al
            and m.a_conto_id is null and coalesce(m.verso, 'uscita') = 'uscita') q
      where u.id = fp_me()`);
  return rows[0];
}

// Scrive la cifra (adesso è il nuovo momento di riferimento); null la toglie.
export async function scriviSaldo(db: PoolClient, importo: string | null): Promise<Saldo> {
  await db.query(
    `update utenti set sul_conto = $1::numeric, sul_conto_al = case when $1::numeric is null then null else now() end where id = fp_me()`, [importo]);
  return leggiSaldo(db);
}
