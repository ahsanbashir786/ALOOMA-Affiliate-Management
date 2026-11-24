import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    prepare: false,
    // The screens run short reporting queries: compiling them (JIT) costs more than it saves, and a little more sort memory keeps sorts off disk.
    connection: { jit: "off", work_mem: "16MB" },
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { client as sql };
