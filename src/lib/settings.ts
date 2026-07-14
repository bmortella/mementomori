import { eq } from "drizzle-orm";
import { settings } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

export const DEFAULT_ANCHOR_PROMPT = "One of your weeks is gone for good. What did you do with it?";

export function getSetting(db: Db, key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

// Secrets (API keys) are encrypted with the master key before hitting the
// settings table, so a copied DB file doesn't leak them.
const SECRET_PREFIX = "enc:";

export function setSecretSetting(db: Db, masterKey: Buffer, key: string, value: string): void {
  const { ciphertext, nonce } = encrypt(masterKey, value);
  setSetting(db, key, `${SECRET_PREFIX}${nonce.toString("base64")}:${ciphertext.toString("base64")}`);
}

export function getSecretSetting(db: Db, masterKey: Buffer, key: string): string | null {
  const raw = getSetting(db, key);
  if (raw === null || !raw.startsWith(SECRET_PREFIX)) return raw; // plaintext = pre-encryption value
  const [nonce, ciphertext] = raw.slice(SECRET_PREFIX.length).split(":");
  return decrypt(masterKey, Buffer.from(ciphertext, "base64"), Buffer.from(nonce, "base64"));
}
