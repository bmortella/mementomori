import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { loadOrCreateKey, encrypt, decrypt } from "@/lib/crypto";

afterEach(() => { delete process.env.MASTER_KEY; });

describe("loadOrCreateKey", () => {
  it("creates a 32-byte keyfile and reloads the same key", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mm-"));
    const k1 = loadOrCreateKey(dir);
    expect(k1.length).toBe(32);
    expect(readFileSync(path.join(dir, "master.key"), "utf8")).toMatch(/^[0-9a-f]{64}$/);
    expect(loadOrCreateKey(dir).equals(k1)).toBe(true);
  });
  it("MASTER_KEY env takes precedence", () => {
    const hex = randomBytes(32).toString("hex");
    process.env.MASTER_KEY = hex;
    const dir = mkdtempSync(path.join(tmpdir(), "mm-"));
    expect(loadOrCreateKey(dir).toString("hex")).toBe(hex);
  });
  it("rejects malformed MASTER_KEY", () => {
    process.env.MASTER_KEY = "abc";
    expect(() => loadOrCreateKey(mkdtempSync(path.join(tmpdir(), "mm-")))).toThrow(/MASTER_KEY/);
  });
});

describe("encrypt/decrypt", () => {
  const key = randomBytes(32);
  it("round-trips text", () => {
    const { ciphertext, nonce } = encrypt(key, "memento mori");
    expect(decrypt(key, ciphertext, nonce)).toBe("memento mori");
  });
  it("ciphertext does not contain plaintext", () => {
    const { ciphertext } = encrypt(key, "a very secret reflection");
    expect(ciphertext.includes(Buffer.from("secret"))).toBe(false);
  });
  it("fails with the wrong key", () => {
    const { ciphertext, nonce } = encrypt(key, "x");
    expect(() => decrypt(randomBytes(32), ciphertext, nonce)).toThrow();
  });
});
