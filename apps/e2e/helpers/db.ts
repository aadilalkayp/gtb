/** Direct Postgres access to the gtb_e2e database (reset + raw assertions). */
import pg from "pg";
import { E2E } from "./env.js";

export function e2ePool(): pg.Pool {
  return new pg.Pool({ connectionString: E2E.databaseUrl, max: 2 });
}

/**
 * Wipe all application state: every table in `public` (except Prisma's
 * migration ledger), all Supabase auth users, and all stored objects.
 * The schema itself (migrations) is left intact.
 */
export async function resetDatabase(): Promise<void> {
  const pool = e2ePool();
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename from pg_tables
       where schemaname = 'public' and tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `public."${r.tablename}"`).join(", ");
      await pool.query(`truncate table ${tables} restart identity cascade`);
    }
    await pool.query(`delete from auth.users`);
    // storage.objects is cleared via the Storage API (ensureBuckets/emptyBuckets):
    // newer storage images forbid direct SQL deletes on their tables.
  } finally {
    await pool.end();
  }
}
