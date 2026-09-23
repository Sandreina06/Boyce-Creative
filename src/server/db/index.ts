import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __bmiDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

/** Lazily-created singleton so dev hot-reloads don't exhaust connections. */
export function db(): Db {
  if (!globalForDb.__bmiDb) globalForDb.__bmiDb = createDb();
  return globalForDb.__bmiDb;
}

export { schema };
