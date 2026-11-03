// Versioned, additive upgrades:  npm run db:migrate   (also run automatically when the Docker container starts)
//  • Empty database (no "users" table): installs migrations/baseline/baseline.sql – the full current schema – and marks every migration as applied.
//  • Existing database: applies migrations/NNNN_*.sql in order, each in its own transaction, recorded in schema_migrations.
// Every migration is idempotent, so re-running is harmless. Nothing here ever drops or rewrites existing data.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dir = path.resolve(process.cwd(), "migrations");
try {
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const [{ has }] = await sql`select to_regclass('public.users') is not null as has`;
  if (!has) {
    const baseline = readFileSync(path.join(dir, "baseline", "baseline.sql"), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(baseline);
      for (const f of files) await tx`insert into schema_migrations (name) values (${f}) on conflict do nothing`;
    });
    console.log(`Installed a fresh database (baseline + ${files.length} migrations recorded).`);
  } else {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(path.join(dir, f), "utf8"));
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      console.log(`applied ${f}`);
      applied++;
    }
    console.log(applied ? `${applied} migration(s) applied.` : "Database is up to date.");
  }
} catch (e) {
  console.error(`Migration failed – nothing from the failing step was applied.\n${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
