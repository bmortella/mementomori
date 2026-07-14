import { eq } from "drizzle-orm";
import { settings } from "@/lib/db/schema";
import type { Db } from "@/lib/db";

export const DEFAULT_ANCHOR_PROMPT = "This week is spent. What did you trade it for?";

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
