import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Use the pooled DATABASE_URL for runtime queries with a transaction-capable
 * Postgres driver. Never use DATABASE_URL_UNPOOLED here — that is reserved
 * for drizzle-kit migrations.
 */

const pool = new Pool({
	connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

