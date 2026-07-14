import { sqliteTable, integer, text, blob, uniqueIndex } from "drizzle-orm/sqlite-core";

export const years = sqliteTable("years", {
  year: integer("year").primaryKey(),
  unlockDate: text("unlock_date").notNull(), // YYYY-MM-DD
  status: text("status", { enum: ["active", "unlocked"] }).notNull().default("active"),
  reflectionText: text("reflection_text"),
  reflectionStatus: text("reflection_status", { enum: ["none", "running", "done", "failed"] })
    .notNull()
    .default("none"),
  reflectionError: text("reflection_error"),
});

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    weekNumber: integer("week_number").notNull(),
    sealedAt: text("sealed_at").notNull(), // ISO timestamp
    ciphertext: blob("ciphertext", { mode: "buffer" }).notNull(),
    nonce: blob("nonce", { mode: "buffer" }).notNull(),
    promptId: text("prompt_id"),
  },
  (t) => [uniqueIndex("entries_year_week").on(t.year, t.weekNumber)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
