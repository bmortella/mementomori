import { eq } from "drizzle-orm";
import path from "path";
import { dataDir } from "@/lib/config";
import { decrypt, encrypt, loadOrCreateKey } from "@/lib/crypto";
import { createDb, type Db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export type Ctx = { db: Db; key: Buffer };

const CANARY = "memento mori";

export function verifyCanary(db: Db, key: Buffer): void {
  const row = db.select().from(settings).where(eq(settings.key, "canary")).get();
  if (!row) {
    const { ciphertext, nonce } = encrypt(key, CANARY);
    db.insert(settings)
      .values({ key: "canary", value: JSON.stringify({ c: ciphertext.toString("base64"), n: nonce.toString("base64") }) })
      .run();
    return;
  }
  const { c, n } = JSON.parse(row.value) as { c: string; n: string };
  try {
    if (decrypt(key, Buffer.from(c, "base64"), Buffer.from(n, "base64")) === CANARY) return;
  } catch {
    /* fall through */
  }
  throw new Error("Encryption key does not match existing data.");
}

let ctx: Ctx | null = null;

export function getCtx(): Ctx {
  if (!ctx) {
    const dir = dataDir();
    const db = createDb(path.join(dir, "mementomori.db"));
    const key = loadOrCreateKey(dir);
    verifyCanary(db, key);
    ctx = { db, key };
  }
  return ctx;
}

export function resetCtx(): void {
  ctx = null;
}
