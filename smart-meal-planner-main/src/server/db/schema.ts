/**
 * Profile-hash plan cache storage supports fast regeneration reuse
 * within a bounded TTL window.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  json,
  numeric,
  pgEnum,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
/**
 * Use the same DB instance for all tables, namespaced by prefix.
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `smart_meal_${name}`);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const user = createTable("user", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  consentTimestamp: timestamp("consent_timestamp"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ---------------------------------------------------------------------------
// Profiles
// TODO (db-api-implementation): add all columns per PRD FR-1.3
// ---------------------------------------------------------------------------
export const profiles = createTable("profile", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  toddlers: integer("toddlers").notNull().default(0),
  dietTypes: text("diet_types").array().notNull().default(sql`ARRAY[]::text[]`),
  allergens: text("allergens").array().notNull().default(sql`ARRAY[]::text[]`),
  dislikes: text("dislikes").array().notNull().default(sql`ARRAY[]::text[]`),
  weeklyBudgetEuro: integer("weekly_budget_euro").notNull().default(0),
  portionMultipliers: json("portion_multipliers"),
  maxCookTimeMinutes: integer("max_cook_time_minutes").default(120),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const mealTypeEnum = pgEnum("meal_type", [
  "breakfast",
  "lunch",
  "dinner",
]);

export const shoppingListScopeEnum = pgEnum("shopping_list_scope", [
  "meal",
  "day",
  "plan",
]);

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const plans = createTable("plan", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  planDays: integer("plan_days").notNull(),
  generationStatus: varchar("generation_status", { length: 20 })
    .notNull()
    .default("idle"),
  startDate: timestamp("start_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ---------------------------------------------------------------------------
// Plan cache (per-user profile hash snapshots for generation reuse)
// ---------------------------------------------------------------------------
export const planCache = createTable(
  "plan_cache",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profileHash: text("profile_hash").notNull(),
    planJson: json("plan_json").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    profileHashCreatedAtIdx: index("plan_cache_profile_hash_created_at_idx").on(
      table.profileHash,
      table.createdAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Days (one per calendar day in a plan)
// ---------------------------------------------------------------------------
export const days = createTable("day", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(), // 1–7
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  failureReason: varchar("failure_reason", { length: 100 }),
});

// ---------------------------------------------------------------------------
// Meals (up to 3 per day: breakfast / lunch / dinner)
// ---------------------------------------------------------------------------
export const meals = createTable("meal", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dayId: text("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  mealType: mealTypeEnum("meal_type").notNull(),
  recipeName: text("recipe_name").notNull(),
  imageUrl: text("image_url"),
  // JSON array of { name, quantity, unit, category } objects (see MealPlanSchema)
  ingredients: json("ingredients").notNull(),
  shortSummary: text("short_summary").notNull().default(""),
  instructions: text("instructions").notNull().default("Open this recipe to view full cooking instructions."),
  mealHash: text("meal_hash"),
  cookTimeMinutes: integer("cook_time_minutes").notNull(),
});

// ---------------------------------------------------------------------------
// Shopping lists
// ---------------------------------------------------------------------------
export const shoppingLists = createTable(
  "shopping_list",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scope: shoppingListScopeEnum("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    name: text("name").notNull().default("Shopping List"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    userScopeUnique: uniqueIndex("shopping_list_user_scope_unique").on(
      table.userId,
      table.scope,
      table.scopeId,
    ),
    nameIdx: index("shopping_list_name_idx").on(table.name),
    userCreatedAtIdx: index("shopping_list_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Shopping list items
// ---------------------------------------------------------------------------
export const shoppingListItems = createTable("shopping_list_item", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  shoppingListId: text("shopping_list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  ingredientName: text("ingredient_name").notNull(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  // Best-effort category: Produce | Dairy | Meat | Frozen | Pantry | Other
  category: text("category").notNull().default("Other"),
  isChecked: boolean("is_checked").notNull().default(false),
  // true = user added manually (not generated from a recipe)
  isManual: boolean("is_manual").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Meal feedback (one rating per user+recipe pair)
// ---------------------------------------------------------------------------
export const mealFeedback = createTable(
  "meal_feedback",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipeName: text("recipe_name").notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    userRecipeUnique: uniqueIndex("meal_feedback_user_recipe_unique").on(
      table.userId,
      table.recipeName,
    ),
    ratingRange: check(
      "meal_feedback_rating_range",
      sql`${table.rating} >= 1 and ${table.rating} <= 5`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const usersRelations = relations(user, ({ one, many }) => ({
  profile: one(profiles, { fields: [user.id], references: [profiles.userId] }),
  plans: many(plans),
  shoppingLists: many(shoppingLists),
  planCache: many(planCache),
  mealFeedback: many(mealFeedback),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, { fields: [profiles.userId], references: [user.id] }),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  user: one(user, { fields: [plans.userId], references: [user.id] }),
  days: many(days),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  user: one(user, { fields: [shoppingLists.userId], references: [user.id] }),
  items: many(shoppingListItems),
}));

export const planCacheRelations = relations(planCache, ({ one }) => ({
  user: one(user, { fields: [planCache.userId], references: [user.id] }),
}));

export const daysRelations = relations(days, ({ one, many }) => ({
  plan: one(plans, { fields: [days.planId], references: [plans.id] }),
  meals: many(meals),
}));

export const mealsRelations = relations(meals, ({ one }) => ({
  day: one(days, { fields: [meals.dayId], references: [days.id] }),
}));

export const shoppingListItemsRelations = relations(
  shoppingListItems,
  ({ one }) => ({
    shoppingList: one(shoppingLists, {
      fields: [shoppingListItems.shoppingListId],
      references: [shoppingLists.id],
    }),
  }),
);

export const mealFeedbackRelations = relations(mealFeedback, ({ one }) => ({
  user: one(user, { fields: [mealFeedback.userId], references: [user.id] }),
}));
