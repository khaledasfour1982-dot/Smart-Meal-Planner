import { type Config } from "drizzle-kit";

import { env } from "~/env";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Use the unpooled direct connection for migrations (Neon requirement)
    url: env.DATABASE_URL_UNPOOLED,
  },
  tablesFilter: ["smart_meal_*"],
} satisfies Config;
