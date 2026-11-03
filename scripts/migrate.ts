// Versioned, additive upgrades:  npm run db:migrate
// Applies migrations/*.sql in order, each in its own transaction, and records them in schema_migrations.
// Every migration is idempotent (create … if not exists / add column if not exists) so re-running is harmless.
// First-time installs on an EMPTY database use `npm run db:push`; upgrades of a database with data use this script.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const dir = path.resolve(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const text = readFileSync(path.join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${f})`;
    });
    console.log(`applied ${f}`);
    applied++;
  }
  console.log(applied ? `${applied} migration(s) applied.` : "Database is up to date.");
  await sql.end();
}
main().catch((e) => {
  console.error(`Migration failed – nothing from the failing file was applied.\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
