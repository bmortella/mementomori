# Memento Mori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted, single-user stoic ritual web app: one short reflection sealed (encrypted) per week into a 52-cell year grid, unreadable until Dec 31, then revealed with an AI-written reflection on the year.

**Architecture:** Next.js App Router monolith. Pure logic (week math, crypto, seal rules, year state) lives in `src/lib/` as small testable modules; route handlers in `src/app/api/` are thin wrappers; the UI is a single client page (grid + writing surface) plus archive/settings pages. SQLite (better-sqlite3 + Drizzle) in a data directory alongside the AES key file and editable prompt pool.

**Tech Stack:** Next.js 15+ (App Router, TypeScript), Tailwind CSS v4, Drizzle ORM + better-sqlite3, Vitest, Node `crypto` (AES-256-GCM), Geist Sans/Mono fonts.

Spec: `docs/superpowers/specs/2026-07-14-mementomori-design.md`

## Global Constraints

- Entry cap: **750 characters**, single paragraph (no `\r` or `\n`), enforced server-side; UI cap is convenience only.
- Default anchor prompt (verbatim): **"This week is spent. What did you trade it for?"**
- Seal confirmation copy (verbatim, `{date}` = configured unlock date): **"Sealed is sealed. No reading, no editing, until {date}."**
- Weeks: exactly 52 per year. Week n covers days `Jan 1 + 7·(n−1)` .. `+7 days`; week 52 absorbs the year's tail (Dec 31, or Dec 30–31 in leap years). Server local time (`TZ` env) is authoritative; client clocks never trusted.
- Sealed entries: AES-256-GCM ciphertext only in DB; plaintext never written to disk; decrypt only when the year's status is `unlocked`.
- Missed weeks stay empty forever: server accepts seals only for the current week (sealing the current week remains allowed after unlock).
- UI: strictly black & white + grayscale, no accent color; Geist Sans + Geist Mono; single screen (13×4 grid above, writing surface below); respect `prefers-reduced-motion`.
- Data volume: everything persistent lives under `DATA_DIR` (default `./data`): `mementomori.db`, `master.key`, `prompts.json`.
- LLM providers: `anthropic` (default model `claude-sonnet-5`) and `ollama`, selected in settings. Unlock and entry reading never depend on the LLM.
- No accounts. Optional `APP_PASSWORD` env enables a cookie gate.

---

### Task 1: Scaffold Next.js project with Vitest

**Files:**
- Create: Next.js app in repo root (`src/app/…`, `package.json`, `tsconfig.json`, etc. via create-next-app)
- Create: `vitest.config.ts`
- Create: `src/lib/config.ts`
- Test: `src/lib/config.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `dataDir(): string` (returns `process.env.DATA_DIR` or `<cwd>/data`), `MAX_ENTRY_CHARS = 750`, `WEEKS_PER_YEAR = 52` from `@/lib/config`; `@/*` alias works in app and tests; `npm test` runs Vitest.

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/bruno/Projects/mementomori
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm
```

(`create-next-app` tolerates the existing `.git` and `docs/`. Accept defaults for anything else it asks.)

- [ ] **Step 2: Add dependencies and test script**

```bash
npm install better-sqlite3 drizzle-orm
npm install -D vitest @types/better-sqlite3
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

In `next.config.ts`, set: `serverExternalPackages: ["better-sqlite3"]` and `output: "standalone"` inside the config object.

- [ ] **Step 3: Write the failing test**

`src/lib/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import path from "path";

afterEach(() => { delete process.env.DATA_DIR; });

describe("config", () => {
  it("defaults dataDir to <cwd>/data", async () => {
    const { dataDir } = await import("@/lib/config");
    expect(dataDir()).toBe(path.join(process.cwd(), "data"));
  });

  it("honors DATA_DIR env", async () => {
    process.env.DATA_DIR = "/tmp/mm-test";
    const { dataDir } = await import("@/lib/config");
    expect(dataDir()).toBe("/tmp/mm-test");
  });

  it("exports caps", async () => {
    const { MAX_ENTRY_CHARS, WEEKS_PER_YEAR } = await import("@/lib/config");
    expect(MAX_ENTRY_CHARS).toBe(750);
    expect(WEEKS_PER_YEAR).toBe(52);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/config`.

- [ ] **Step 5: Implement `src/lib/config.ts`**

```ts
// No Node imports here: this module is also pulled into client components
// (MAX_ENTRY_CHARS), so it must stay bundler-safe.
export const MAX_ENTRY_CHARS = 750;
export const WEEKS_PER_YEAR = 52;

export function dataDir(): string {
  return process.env.DATA_DIR ?? `${process.cwd()}/data`;
}
```

- [ ] **Step 6: Verify tests pass and app boots**

Run: `npm test` → PASS (3 tests).
Run: `npm run dev` → visit http://localhost:3000, default Next page renders. Stop the server.
Add `data/` to `.gitignore`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and SQLite deps"
```

---

### Task 2: Week math

**Files:**
- Create: `src/lib/weeks.ts`
- Test: `src/lib/weeks.test.ts`

**Interfaces:**
- Consumes: `WEEKS_PER_YEAR` from `@/lib/config`
- Produces (from `@/lib/weeks`):
  - `currentWeek(now: Date): { year: number; week: number }` — week 1–52 in server-local time
  - `weekRange(year: number, week: number): { start: Date; end: Date }` — `start` inclusive local midnight, `end` exclusive; week 52's `end` is Jan 1 of the next year
  - `formatWeekDates(year: number, week: number): string` — e.g. `"Jul 13 – Jul 19"` (en dash, inclusive last day)

- [ ] **Step 1: Write the failing test**

`src/lib/weeks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { currentWeek, weekRange, formatWeekDates } from "@/lib/weeks";

describe("currentWeek", () => {
  it("maps Jan 1 to week 1 and Jan 7 to week 1", () => {
    expect(currentWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    expect(currentWeek(new Date(2026, 0, 7))).toEqual({ year: 2026, week: 1 });
  });
  it("maps Jan 8 to week 2", () => {
    expect(currentWeek(new Date(2026, 0, 8)).week).toBe(2);
  });
  it("caps the year's tail into week 52 (non-leap)", () => {
    expect(currentWeek(new Date(2026, 11, 31)).week).toBe(52); // day 365 would be week 53
    expect(currentWeek(new Date(2026, 11, 24)).week).toBe(52); // first day of week 52
    expect(currentWeek(new Date(2026, 11, 23)).week).toBe(51);
  });
  it("caps both extra days in a leap year", () => {
    expect(currentWeek(new Date(2028, 11, 30)).week).toBe(52);
    expect(currentWeek(new Date(2028, 11, 31)).week).toBe(52);
  });
});

describe("weekRange", () => {
  it("week 1 starts Jan 1", () => {
    const { start } = weekRange(2026, 1);
    expect(start).toEqual(new Date(2026, 0, 1));
  });
  it("week 52 ends at next Jan 1 (exclusive), absorbing the tail", () => {
    const { start, end } = weekRange(2026, 52);
    expect(start).toEqual(new Date(2026, 11, 24));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
  it("ordinary weeks are 7 days", () => {
    const { start, end } = weekRange(2026, 2);
    expect(start).toEqual(new Date(2026, 0, 8));
    expect(end).toEqual(new Date(2026, 0, 15));
  });
});

describe("formatWeekDates", () => {
  it("formats inclusive range", () => {
    expect(formatWeekDates(2026, 2)).toBe("Jan 8 – Jan 14");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/weeks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/weeks.ts`**

```ts
import { WEEKS_PER_YEAR } from "@/lib/config";

function dayOfYear(d: Date): number {
  // 0-based; uses calendar dates so DST shifts can't skew the count
  const start = Date.UTC(d.getFullYear(), 0, 1);
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((cur - start) / 86_400_000);
}

export function currentWeek(now: Date): { year: number; week: number } {
  const week = Math.min(Math.floor(dayOfYear(now) / 7) + 1, WEEKS_PER_YEAR);
  return { year: now.getFullYear(), week };
}

export function weekRange(year: number, week: number): { start: Date; end: Date } {
  const start = new Date(year, 0, 1 + (week - 1) * 7);
  const end =
    week === WEEKS_PER_YEAR
      ? new Date(year + 1, 0, 1)
      : new Date(year, 0, 1 + week * 7);
  return { start, end };
}

const FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function formatWeekDates(year: number, week: number): string {
  const { start, end } = weekRange(year, week);
  const lastDay = new Date(end.getTime() - 86_400_000);
  return `${FMT.format(start)} – ${FMT.format(lastDay)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/weeks.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/weeks.ts src/lib/weeks.test.ts
git commit -m "feat: 52-week calendar math"
```

---

### Task 3: Crypto (AES-256-GCM + key management)

**Files:**
- Create: `src/lib/crypto.ts`
- Test: `src/lib/crypto.test.ts`

**Interfaces:**
- Consumes: nothing app-specific
- Produces (from `@/lib/crypto`):
  - `loadOrCreateKey(dir: string): Buffer` — 32 bytes; `MASTER_KEY` env (64 hex chars) wins; else reads/creates `<dir>/master.key` (hex, mode 0600)
  - `encrypt(key: Buffer, plaintext: string): { ciphertext: Buffer; nonce: Buffer }` — GCM auth tag appended to ciphertext; fresh 12-byte nonce
  - `decrypt(key: Buffer, ciphertext: Buffer, nonce: Buffer): string` — throws on tampering/wrong key

- [ ] **Step 1: Write the failing test**

`src/lib/crypto.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const TAG_LEN = 16;

export function loadOrCreateKey(dir: string): Buffer {
  const env = process.env.MASTER_KEY;
  if (env !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(env)) {
      throw new Error("MASTER_KEY must be 64 hex characters (32 bytes)");
    }
    return Buffer.from(env, "hex");
  }
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "master.key");
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    if (key.length !== 32) throw new Error(`${file} is corrupted`);
    return key;
  }
  const key = randomBytes(32);
  writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}

export function encrypt(key: Buffer, plaintext: string): { ciphertext: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext, nonce };
}

export function decrypt(key: Buffer, ciphertext: Buffer, nonce: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const data = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.ts src/lib/crypto.test.ts
git commit -m "feat: AES-256-GCM encryption and key management"
```

---

### Task 4: Database (schema, migration, app context, canary)

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/context.ts`
- Test: `src/lib/db/db.test.ts`

**Interfaces:**
- Consumes: `dataDir()` from `@/lib/config`; `loadOrCreateKey`, `encrypt`, `decrypt` from `@/lib/crypto`
- Produces:
  - `@/lib/db/schema`: Drizzle tables `years`, `entries`, `settings` (columns below)
  - `@/lib/db`: `createDb(file: string): Db` (runs DDL, WAL mode; `":memory:"` supported), type `Db`
  - `@/lib/context`: `getCtx(): Ctx` (lazy singleton `{ db: Db; key: Buffer }`, canary-verified), `resetCtx(): void` (tests only), `verifyCanary(db: Db, key: Buffer): void` (throws `"Encryption key does not match existing data."` on mismatch)

- [ ] **Step 1: Write the failing test**

`src/lib/db/db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { createDb } from "@/lib/db";
import { years, entries, settings } from "@/lib/db/schema";
import { verifyCanary } from "@/lib/context";

describe("createDb", () => {
  it("creates tables and enforces unique (year, week)", () => {
    const db = createDb(":memory:");
    db.insert(years).values({ year: 2026, unlockDate: "2026-12-31" }).run();
    const row = { year: 2026, weekNumber: 1, sealedAt: "t", ciphertext: Buffer.from("c"), nonce: Buffer.from("n") };
    db.insert(entries).values(row).run();
    expect(() => db.insert(entries).values(row).run()).toThrow(/UNIQUE/);
  });
  it("years default to active with no reflection", () => {
    const db = createDb(":memory:");
    db.insert(years).values({ year: 2026, unlockDate: "2026-12-31" }).run();
    const y = db.select().from(years).get()!;
    expect(y.status).toBe("active");
    expect(y.reflectionStatus).toBe("none");
  });
});

describe("verifyCanary", () => {
  it("plants a canary then accepts the same key", () => {
    const db = createDb(":memory:");
    const key = randomBytes(32);
    verifyCanary(db, key);
    expect(() => verifyCanary(db, key)).not.toThrow();
    expect(db.select().from(settings).all().some((s) => s.key === "canary")).toBe(true);
  });
  it("rejects a different key", () => {
    const db = createDb(":memory:");
    verifyCanary(db, randomBytes(32));
    expect(() => verifyCanary(db, randomBytes(32))).toThrow(/does not match/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/db.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement schema, db, context**

`src/lib/db/schema.ts`:

```ts
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
```

`src/lib/db/index.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS years (
  year INTEGER PRIMARY KEY,
  unlock_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reflection_text TEXT,
  reflection_status TEXT NOT NULL DEFAULT 'none',
  reflection_error TEXT
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  sealed_at TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  prompt_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_year_week ON entries(year, week_number);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function createDb(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

`src/lib/context.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/db.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db src/lib/context.ts
git commit -m "feat: sqlite schema, app context, key canary"
```

---

### Task 5: Prompt pool (30 curated prompts + draw logic)

**Files:**
- Create: `src/lib/default-prompts.ts`, `src/lib/prompts.ts`
- Test: `src/lib/prompts.test.ts`

**Interfaces:**
- Consumes: `dataDir()` from `@/lib/config`
- Produces (from `@/lib/prompts`):
  - `type PoolPrompt = { id: string; text: string }`
  - `loadPrompts(dir: string): PoolPrompt[]` — copies the default pool to `<dir>/prompts.json` on first run, then always reads that file (user-editable)
  - `drawPrompt(pool: PoolPrompt[], usedIds: string[]): PoolPrompt` — uniform random among prompts whose id is not in `usedIds`; if all are used, draws from the full pool
  - `DEFAULT_PROMPTS` (30 items) from `@/lib/default-prompts`

- [ ] **Step 1: Write the failing test**

`src/lib/prompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loadPrompts, drawPrompt } from "@/lib/prompts";
import { DEFAULT_PROMPTS } from "@/lib/default-prompts";

describe("default pool", () => {
  it("has 30 prompts with unique ids", () => {
    expect(DEFAULT_PROMPTS.length).toBe(30);
    expect(new Set(DEFAULT_PROMPTS.map((p) => p.id)).size).toBe(30);
  });
});

describe("loadPrompts", () => {
  it("seeds prompts.json on first run, then reads the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mm-"));
    expect(loadPrompts(dir).length).toBe(30);
    const file = path.join(dir, "prompts.json");
    writeFileSync(file, JSON.stringify([{ id: "custom", text: "Only prompt?" }]));
    expect(loadPrompts(dir)).toEqual([{ id: "custom", text: "Only prompt?" }]);
    expect(readFileSync(file, "utf8")).toContain("custom");
  });
});

describe("drawPrompt", () => {
  const pool = [
    { id: "a", text: "A?" },
    { id: "b", text: "B?" },
    { id: "c", text: "C?" },
  ];
  it("never returns a used prompt while unused remain", () => {
    for (let i = 0; i < 50; i++) {
      expect(drawPrompt(pool, ["a", "b"]).id).toBe("c");
    }
  });
  it("resets to the full pool when exhausted", () => {
    const drawn = drawPrompt(pool, ["a", "b", "c"]);
    expect(pool.some((p) => p.id === drawn.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/prompts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/default-prompts.ts` (the curated pool — copy verbatim):

```ts
export type PoolPrompt = { id: string; text: string };

export const DEFAULT_PROMPTS: PoolPrompt[] = [
  { id: "fear-unrealized", text: "What did you fear this week that never happened?" },
  { id: "control-forgotten", text: "What was within your control this week that you treated as if it weren't?" },
  { id: "complaint-vs-action", text: "What did you complain about that you could have simply fixed or accepted?" },
  { id: "approval-chased", text: "Whose approval did you chase this week, and what did it cost you?" },
  { id: "younger-self", text: "What would the person you were five years ago admire about this week?" },
  { id: "eternal-return", text: "If this week repeated forever, what habit would you change first?" },
  { id: "postponed", text: "What did you postpone this week that you know matters?" },
  { id: "anger-audit", text: "Where did anger serve you this week, and where did it use you?" },
  { id: "avoided-discomfort", text: "What discomfort did you avoid that would have made you stronger?" },
  { id: "wanted-needless", text: "What did you acquire or want this week that you could live without?" },
  { id: "patience-teacher", text: "Who tested your patience, and what did they teach you?" },
  { id: "herd-motion", text: "What did you do this week only because everyone else does it?" },
  { id: "one-year-left", text: "If you learned you had one year left, what from this week would you keep doing?" },
  { id: "small-death", text: "What small death — an ending, a loss, a change — did this week bring?" },
  { id: "busy-vs-useful", text: "Where did you mistake being busy for being useful?" },
  { id: "unsaid-truth", text: "What truth did you avoid saying this week, and to whom?" },
  { id: "grown-strength", text: "What did you handle well this week that once would have broken you?" },
  { id: "broken-promise", text: "What promise to yourself did you break, and how did you justify it?" },
  { id: "performed-virtue", text: "Where did you perform virtue instead of practicing it?" },
  { id: "obstacle-way", text: "What obstacle this week was actually the way forward?" },
  { id: "aurelius-cut", text: "What would Marcus Aurelius cut from your week without hesitation?" },
  { id: "best-hours", text: "What did you give your best hours to, and did it deserve them?" },
  { id: "peace-found", text: "When were you most at peace this week, and what were you doing?" },
  { id: "judgment-mirror", text: "What judgment about someone did you make that says more about you?" },
  { id: "luxury-necessity", text: "What luxury has quietly become a necessity for you?" },
  { id: "comfort-vs-character", text: "Where did you choose comfort over character this week?" },
  { id: "grip-loosened", text: "What are you gripping that you should hold loosely?" },
  { id: "failure-teacher", text: "What did failure teach you this week that success never could?" },
  { id: "example-to-child", text: "If this week were your example to a child, what would they learn?" },
  { id: "forgotten-in-five", text: "What will you not remember about this week in five years — and why did it consume you?" },
];
```

`src/lib/prompts.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { DEFAULT_PROMPTS, type PoolPrompt } from "@/lib/default-prompts";

export type { PoolPrompt };

export function loadPrompts(dir: string): PoolPrompt[] {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "prompts.json");
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify(DEFAULT_PROMPTS, null, 2));
  }
  return JSON.parse(readFileSync(file, "utf8")) as PoolPrompt[];
}

export function drawPrompt(pool: PoolPrompt[], usedIds: string[]): PoolPrompt {
  const used = new Set(usedIds);
  const unused = pool.filter((p) => !used.has(p.id));
  const candidates = unused.length > 0 ? unused : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/prompts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/default-prompts.ts src/lib/prompts.ts src/lib/prompts.test.ts
git commit -m "feat: curated stoic prompt pool with draw logic"
```

---

### Task 6: Years and settings (create, unlock, key/value helpers)

**Files:**
- Create: `src/lib/settings.ts`, `src/lib/years.ts`
- Test: `src/lib/years.test.ts`

**Interfaces:**
- Consumes: `Db` + schema from Task 4
- Produces:
  - `@/lib/settings`: `getSetting(db: Db, key: string): string | null`, `setSetting(db: Db, key: string, value: string): void`, `DEFAULT_ANCHOR_PROMPT = "This week is spent. What did you trade it for?"` — settings keys used across the app: `anchor_prompt`, `unlock_day` (MM-DD, default `12-31`), `provider_type` (`anthropic` | `ollama`), `provider_model`, `anthropic_api_key`, `ollama_host`
  - `@/lib/years`: `getOrCreateYear(db: Db, year: number): YearRow` (unlock date = `` `${year}-${unlock_day}` ``), `maybeUnlock(db: Db, year: number, now: Date): boolean` (idempotent; unlocks when `now` ≥ local midnight of unlock date), type `YearRow = typeof years.$inferSelect`

- [ ] **Step 1: Write the failing test**

`src/lib/years.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createDb } from "@/lib/db";
import { getOrCreateYear, maybeUnlock } from "@/lib/years";
import { getSetting, setSetting } from "@/lib/settings";

describe("settings", () => {
  it("get/set round-trips and overwrites", () => {
    const db = createDb(":memory:");
    expect(getSetting(db, "anchor_prompt")).toBeNull();
    setSetting(db, "anchor_prompt", "One?");
    setSetting(db, "anchor_prompt", "Two?");
    expect(getSetting(db, "anchor_prompt")).toBe("Two?");
  });
});

describe("getOrCreateYear", () => {
  it("creates lazily with Dec 31 unlock and is idempotent", () => {
    const db = createDb(":memory:");
    const y = getOrCreateYear(db, 2026);
    expect(y).toMatchObject({ year: 2026, unlockDate: "2026-12-31", status: "active" });
    expect(getOrCreateYear(db, 2026).year).toBe(2026);
  });
  it("honors the unlock_day setting for new years", () => {
    const db = createDb(":memory:");
    setSetting(db, "unlock_day", "11-30");
    expect(getOrCreateYear(db, 2027).unlockDate).toBe("2027-11-30");
  });
});

describe("maybeUnlock", () => {
  it("stays active before the unlock date", () => {
    const db = createDb(":memory:");
    expect(maybeUnlock(db, 2026, new Date(2026, 11, 30, 23, 59))).toBe(false);
    expect(getOrCreateYear(db, 2026).status).toBe("active");
  });
  it("unlocks on the date, idempotently", () => {
    const db = createDb(":memory:");
    expect(maybeUnlock(db, 2026, new Date(2026, 11, 31, 0, 0))).toBe(true);
    expect(getOrCreateYear(db, 2026).status).toBe("unlocked");
    expect(maybeUnlock(db, 2026, new Date(2027, 0, 2))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/years.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/settings.ts`:

```ts
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
```

`src/lib/years.ts`:

```ts
import { eq } from "drizzle-orm";
import { years } from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export type YearRow = typeof years.$inferSelect;

export function getOrCreateYear(db: Db, year: number): YearRow {
  const unlockDay = getSetting(db, "unlock_day") ?? "12-31";
  db.insert(years)
    .values({ year, unlockDate: `${year}-${unlockDay}` })
    .onConflictDoNothing()
    .run();
  return db.select().from(years).where(eq(years.year, year)).get()!;
}

export function maybeUnlock(db: Db, year: number, now: Date): boolean {
  const row = getOrCreateYear(db, year);
  if (row.status === "unlocked") return false;
  const [y, m, d] = row.unlockDate.split("-").map(Number);
  const unlockAt = new Date(y, m - 1, d); // local midnight
  if (now.getTime() < unlockAt.getTime()) return false;
  db.update(years).set({ status: "unlocked" }).where(eq(years.year, year)).run();
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/years.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/years.ts src/lib/years.test.ts
git commit -m "feat: year lifecycle and settings store"
```

---

### Task 7: Entries — seal and read rules

**Files:**
- Create: `src/lib/entries.ts`
- Test: `src/lib/entries.test.ts`

**Interfaces:**
- Consumes: `Ctx` (Task 4), `encrypt`/`decrypt` (Task 3), `currentWeek` (Task 2), `getOrCreateYear` (Task 6), `MAX_ENTRY_CHARS` (Task 1)
- Produces (from `@/lib/entries`):
  - `class SealError extends Error { code: "WRONG_WEEK" | "ALREADY_SEALED" | "TOO_LONG" | "MULTI_PARAGRAPH" | "EMPTY" }`
  - `sealEntry(ctx: Ctx, input: { year: number; week: number; content: string; promptId?: string; now?: Date }): { sealedAt: string }`
  - `type EntryMeta = { week: number; sealedAt: string; promptId: string | null }`
  - `listEntryMeta(db: Db, year: number): EntryMeta[]` (ordered by week; never includes content)
  - `readEntries(ctx: Ctx, year: number): Array<EntryMeta & { content: string }>` — throws `Error("YEAR_LOCKED")` unless the year's status is `unlocked`

- [ ] **Step 1: Write the failing test**

`src/lib/entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { entries, years } from "@/lib/db/schema";
import type { Ctx } from "@/lib/context";
import { sealEntry, SealError, listEntryMeta, readEntries } from "@/lib/entries";
import { maybeUnlock } from "@/lib/years";

const NOW = new Date(2026, 6, 14); // Tue Jul 14 2026 → week 28
function ctx(): Ctx {
  return { db: createDb(":memory:"), key: randomBytes(32) };
}
const ok = { year: 2026, week: 28, content: "A quiet, honest week.", now: NOW };

function code(fn: () => unknown): string {
  try { fn(); } catch (e) { if (e instanceof SealError) return e.code; throw e; }
  throw new Error("did not throw");
}

describe("sealEntry", () => {
  it("stores ciphertext, not plaintext", () => {
    const c = ctx();
    const { sealedAt } = sealEntry(c, ok);
    expect(sealedAt).toBe(NOW.toISOString());
    const row = c.db.select().from(entries).get()!;
    expect(row.ciphertext.includes(Buffer.from("honest"))).toBe(false);
  });
  it("rejects seals for any week but the current one", () => {
    expect(code(() => sealEntry(ctx(), { ...ok, week: 27 }))).toBe("WRONG_WEEK");
    expect(code(() => sealEntry(ctx(), { ...ok, week: 29 }))).toBe("WRONG_WEEK");
    expect(code(() => sealEntry(ctx(), { ...ok, year: 2025 }))).toBe("WRONG_WEEK");
  });
  it("rejects double-seal without overwriting", () => {
    const c = ctx();
    sealEntry(c, ok);
    expect(code(() => sealEntry(c, { ...ok, content: "second try" }))).toBe("ALREADY_SEALED");
    expect(c.db.select().from(entries).all().length).toBe(1);
  });
  it("enforces the content rules", () => {
    expect(code(() => sealEntry(ctx(), { ...ok, content: "  " }))).toBe("EMPTY");
    expect(code(() => sealEntry(ctx(), { ...ok, content: "one\ntwo" }))).toBe("MULTI_PARAGRAPH");
    expect(code(() => sealEntry(ctx(), { ...ok, content: "x".repeat(751) }))).toBe("TOO_LONG");
    expect(() => sealEntry(ctx(), { ...ok, content: "x".repeat(750) })).not.toThrow();
  });
  it("still accepts the current week after unlock", () => {
    const c = ctx();
    const dec31 = new Date(2026, 11, 31, 9, 0);
    maybeUnlock(c.db, 2026, dec31);
    expect(() => sealEntry(c, { year: 2026, week: 52, content: "The last one.", now: dec31 })).not.toThrow();
  });
});

describe("reading", () => {
  it("meta never includes content; readEntries requires unlock", () => {
    const c = ctx();
    sealEntry(c, { ...ok, promptId: "fear-unrealized" });
    const meta = listEntryMeta(c.db, 2026);
    expect(meta).toEqual([{ week: 28, sealedAt: NOW.toISOString(), promptId: "fear-unrealized" }]);
    expect(() => readEntries(c, 2026)).toThrow("YEAR_LOCKED");
    c.db.update(years).set({ status: "unlocked" }).where(eq(years.year, 2026)).run();
    expect(readEntries(c, 2026)[0].content).toBe("A quiet, honest week.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/entries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/entries.ts`**

```ts
import { asc, eq } from "drizzle-orm";
import { MAX_ENTRY_CHARS } from "@/lib/config";
import type { Ctx } from "@/lib/context";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { currentWeek } from "@/lib/weeks";
import { getOrCreateYear } from "@/lib/years";

export type SealErrorCode = "WRONG_WEEK" | "ALREADY_SEALED" | "TOO_LONG" | "MULTI_PARAGRAPH" | "EMPTY";

export class SealError extends Error {
  constructor(public code: SealErrorCode) {
    super(code);
  }
}

export function sealEntry(
  ctx: Ctx,
  input: { year: number; week: number; content: string; promptId?: string; now?: Date },
): { sealedAt: string } {
  const now = input.now ?? new Date();
  const cw = currentWeek(now);
  if (input.year !== cw.year || input.week !== cw.week) throw new SealError("WRONG_WEEK");
  const content = input.content.trim();
  if (content.length === 0) throw new SealError("EMPTY");
  if (/[\r\n]/.test(content)) throw new SealError("MULTI_PARAGRAPH");
  if (content.length > MAX_ENTRY_CHARS) throw new SealError("TOO_LONG");

  getOrCreateYear(ctx.db, input.year);
  const { ciphertext, nonce } = encrypt(ctx.key, content);
  const sealedAt = now.toISOString();
  try {
    ctx.db
      .insert(entries)
      .values({ year: input.year, weekNumber: input.week, sealedAt, ciphertext, nonce, promptId: input.promptId ?? null })
      .run();
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) throw new SealError("ALREADY_SEALED");
    throw e;
  }
  return { sealedAt };
}

export type EntryMeta = { week: number; sealedAt: string; promptId: string | null };

export function listEntryMeta(db: Db, year: number): EntryMeta[] {
  return db
    .select()
    .from(entries)
    .where(eq(entries.year, year))
    .orderBy(asc(entries.weekNumber))
    .all()
    .map((r) => ({ week: r.weekNumber, sealedAt: r.sealedAt, promptId: r.promptId }));
}

export function readEntries(ctx: Ctx, year: number): Array<EntryMeta & { content: string }> {
  const row = getOrCreateYear(ctx.db, year);
  if (row.status !== "unlocked") throw new Error("YEAR_LOCKED");
  return ctx.db
    .select()
    .from(entries)
    .where(eq(entries.year, year))
    .orderBy(asc(entries.weekNumber))
    .all()
    .map((r) => ({
      week: r.weekNumber,
      sealedAt: r.sealedAt,
      promptId: r.promptId,
      content: decrypt(ctx.key, r.ciphertext, r.nonce),
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/entries.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entries.ts src/lib/entries.test.ts
git commit -m "feat: seal-on-submit entries with encryption and read gating"
```

---

### Task 8: Year state assembly (grid cells)

**Files:**
- Modify: `src/lib/years.ts` (append)
- Test: `src/lib/year-state.test.ts`

**Interfaces:**
- Consumes: `listEntryMeta` (Task 7), `currentWeek`/`formatWeekDates` (Task 2), `getOrCreateYear` (Task 6)
- Produces (appended to `@/lib/years`):
  - `type CellState = "sealed" | "current" | "missed" | "future"`
  - `type Cell = { week: number; state: CellState; sealedAt: string | null; dates: string }`
  - `type YearState = { year: number; status: "active" | "unlocked"; unlockDate: string; currentWeek: number | null; cells: Cell[]; reflection: { status: string; text: string | null; error: string | null } }`
  - `getYearState(db: Db, year: number, now: Date): YearState` — `currentWeek` is null when `year` isn't the calendar year of `now`

- [ ] **Step 1: Write the failing test**

`src/lib/year-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { createDb } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { sealEntry } from "@/lib/entries";
import { getYearState, maybeUnlock } from "@/lib/years";

const NOW = new Date(2026, 6, 14); // week 28

function seeded(): Ctx {
  const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
  sealEntry(c, { year: 2026, week: 28, content: "sealed this week", now: NOW });
  return c;
}

describe("getYearState", () => {
  it("classifies all 52 cells for the active year", () => {
    const { db } = seeded();
    const s = getYearState(db, 2026, NOW);
    expect(s.cells.length).toBe(52);
    expect(s.currentWeek).toBe(28);
    expect(s.cells[27]).toMatchObject({ week: 28, state: "sealed" }); // sealed wins over current
    expect(s.cells[26].state).toBe("missed");
    expect(s.cells[0].state).toBe("missed");
    expect(s.cells[28].state).toBe("future");
    expect(s.cells[51].state).toBe("future");
    expect(s.cells[0].dates).toBe("Jan 1 – Jan 7");
  });
  it("marks the current week 'current' when unsealed", () => {
    const db = createDb(":memory:");
    expect(getYearState(db, 2026, NOW).cells[27].state).toBe("current");
  });
  it("treats past years' empty cells as missed", () => {
    const { db } = seeded();
    maybeUnlock(db, 2026, new Date(2026, 11, 31));
    const s = getYearState(db, 2026, new Date(2027, 5, 1));
    expect(s.status).toBe("unlocked");
    expect(s.currentWeek).toBeNull();
    expect(s.cells[27].state).toBe("sealed");
    expect(s.cells[51].state).toBe("missed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/year-state.test.ts`
Expected: FAIL — `getYearState` not exported.

- [ ] **Step 3: Append to `src/lib/years.ts`**

Add imports at the top of the file: `import { listEntryMeta } from "@/lib/entries";`, `import { currentWeek, formatWeekDates } from "@/lib/weeks";`, `import { WEEKS_PER_YEAR } from "@/lib/config";` — then append:

```ts
export type CellState = "sealed" | "current" | "missed" | "future";
export type Cell = { week: number; state: CellState; sealedAt: string | null; dates: string };
export type YearState = {
  year: number;
  status: "active" | "unlocked";
  unlockDate: string;
  currentWeek: number | null;
  cells: Cell[];
  reflection: { status: string; text: string | null; error: string | null };
};

export function getYearState(db: Db, year: number, now: Date): YearState {
  const row = getOrCreateYear(db, year);
  const metaByWeek = new Map(listEntryMeta(db, year).map((m) => [m.week, m]));
  const cw = currentWeek(now);
  const isCurrentYear = cw.year === year;

  const cells: Cell[] = [];
  for (let week = 1; week <= WEEKS_PER_YEAR; week++) {
    const meta = metaByWeek.get(week);
    let state: CellState;
    if (meta) state = "sealed";
    else if (isCurrentYear && week === cw.week) state = "current";
    else if (isCurrentYear && week > cw.week) state = "future";
    else state = "missed";
    cells.push({ week, state, sealedAt: meta?.sealedAt ?? null, dates: formatWeekDates(year, week) });
  }

  return {
    year,
    status: row.status,
    unlockDate: row.unlockDate,
    currentWeek: isCurrentYear ? cw.week : null,
    cells,
    reflection: { status: row.reflectionStatus, text: row.reflectionText, error: row.reflectionError },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/year-state.test.ts`
Expected: PASS (3 tests). Also run `npm test` — all previous suites still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/years.ts src/lib/year-state.test.ts
git commit -m "feat: 52-cell year state assembly"
```

---

### Task 9: AI reflection (prompt builder, providers, job)

**Files:**
- Create: `src/lib/reflection/provider.ts`, `src/lib/reflection/anthropic.ts`, `src/lib/reflection/ollama.ts`, `src/lib/reflection/job.ts`
- Test: `src/lib/reflection/reflection.test.ts`

**Interfaces:**
- Consumes: `readEntries` (Task 7), `getSetting` (Task 6), `formatWeekDates` (Task 2), `years` schema, `Ctx`
- Produces:
  - `@/lib/reflection/provider`: `type ReflectionEntry = { week: number; dates: string; prompt: string | null; content: string }`, `interface ReflectionProvider { generate(year: number, entries: ReflectionEntry[]): Promise<string> }`, `buildReflectionPrompt(year: number, entries: ReflectionEntry[]): string`, `getProvider(db: Db): ReflectionProvider`
  - `@/lib/reflection/job`: `runReflection(ctx: Ctx, year: number, provider?: ReflectionProvider): Promise<void>` — sets `reflectionStatus` `running → done | failed`; no-op if the year isn't unlocked or a run is already `running`; with zero entries sets `done` with `reflectionText = null`

- [ ] **Step 1: Write the failing test**

`src/lib/reflection/reflection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { years } from "@/lib/db/schema";
import type { Ctx } from "@/lib/context";
import { sealEntry } from "@/lib/entries";
import { maybeUnlock } from "@/lib/years";
import { buildReflectionPrompt, type ReflectionProvider } from "@/lib/reflection/provider";
import { runReflection } from "@/lib/reflection/job";

function unlockedCtx(): Ctx {
  const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
  sealEntry(c, { year: 2026, week: 28, content: "I traded it for patience.", now: new Date(2026, 6, 14) });
  maybeUnlock(c.db, 2026, new Date(2026, 11, 31));
  return c;
}
const yearRow = (c: Ctx) => c.db.select().from(years).where(eq(years.year, 2026)).get()!;

describe("buildReflectionPrompt", () => {
  it("includes every entry with week dates and notes gaps", () => {
    const p = buildReflectionPrompt(2026, [
      { week: 28, dates: "Jul 9 – Jul 15", prompt: null, content: "I traded it for patience." },
    ]);
    expect(p).toContain("I traded it for patience.");
    expect(p).toContain("Jul 9 – Jul 15");
    expect(p).toContain("51"); // 51 missed weeks acknowledged
  });
});

describe("runReflection", () => {
  it("stores provider output on success", async () => {
    const c = unlockedCtx();
    const provider: ReflectionProvider = { generate: async () => "A year of patience." };
    await runReflection(c, 2026, provider);
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: "A year of patience." });
  });
  it("records failure and allows retry", async () => {
    const c = unlockedCtx();
    const bad: ReflectionProvider = { generate: async () => { throw new Error("api down"); } };
    await runReflection(c, 2026, bad);
    expect(yearRow(c).reflectionStatus).toBe("failed");
    expect(yearRow(c).reflectionError).toContain("api down");
    await runReflection(c, 2026, { generate: async () => "recovered" });
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: "recovered" });
  });
  it("does nothing while the year is locked", async () => {
    const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
    sealEntry(c, { year: 2026, week: 28, content: "x", now: new Date(2026, 6, 14) });
    await runReflection(c, 2026, { generate: async () => "nope" });
    expect(yearRow(c).reflectionStatus).toBe("none");
  });
  it("completes with null text when the year had no entries", async () => {
    const c: Ctx = { db: createDb(":memory:"), key: randomBytes(32) };
    maybeUnlock(c.db, 2026, new Date(2026, 11, 31));
    await runReflection(c, 2026, { generate: async () => "unused" });
    expect(yearRow(c)).toMatchObject({ reflectionStatus: "done", reflectionText: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reflection/reflection.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/reflection/provider.ts`:

```ts
import { WEEKS_PER_YEAR } from "@/lib/config";
import type { Db } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";

export type ReflectionEntry = { week: number; dates: string; prompt: string | null; content: string };

export interface ReflectionProvider {
  generate(year: number, entries: ReflectionEntry[]): Promise<string>;
}

export function buildReflectionPrompt(year: number, entries: ReflectionEntry[]): string {
  const missed = WEEKS_PER_YEAR - entries.length;
  const body = entries
    .map((e) => `Week ${e.week} (${e.dates})${e.prompt ? ` — drawn prompt: "${e.prompt}"` : ""}\n${e.content}`)
    .join("\n\n");
  return [
    `You are a thoughtful Stoic friend. You have been handed one year (${year}) of weekly reflections,`,
    `each written in answer to: "This week is spent. What did you trade it for?" and sealed unread until today.`,
    `${entries.length} of ${WEEKS_PER_YEAR} weeks were written; ${missed} weeks passed unrecorded — treat the gaps as part of the record.`,
    ``,
    `Write a reflection on the year for the author. Look for: recurring themes and preoccupations; contradictions`,
    `between what they valued and where their weeks went; how they changed from the first entries to the last;`,
    `and what the gaps might mean. Quote short phrases from the entries where it sharpens the point.`,
    `Be direct and warm, never flattering. Do not summarize week by week. End with one question worth carrying`,
    `into the new year. Aim for 400-600 words of plain prose.`,
    ``,
    `The entries:`,
    ``,
    body,
  ].join("\n");
}

export function getProvider(db: Db): ReflectionProvider {
  const type = getSetting(db, "provider_type") ?? "anthropic";
  if (type === "ollama") {
    return new OllamaProvider(
      getSetting(db, "ollama_host") ?? "http://localhost:11434",
      getSetting(db, "provider_model") ?? "llama3.1",
    );
  }
  return new AnthropicProvider(
    process.env.ANTHROPIC_API_KEY ?? getSetting(db, "anthropic_api_key") ?? "",
    getSetting(db, "provider_model") ?? "claude-sonnet-5",
  );
}
```

`src/lib/reflection/anthropic.ts`:

```ts
import { buildReflectionPrompt, type ReflectionEntry, type ReflectionProvider } from "./provider";

export class AnthropicProvider implements ReflectionProvider {
  constructor(private apiKey: string, private model: string) {}

  async generate(year: number, entries: ReflectionEntry[]): Promise<string> {
    if (!this.apiKey) throw new Error("Anthropic API key is not configured (settings or ANTHROPIC_API_KEY).");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: "user", content: buildReflectionPrompt(year, entries) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text.");
    return text;
  }
}
```

`src/lib/reflection/ollama.ts`:

```ts
import { buildReflectionPrompt, type ReflectionEntry, type ReflectionProvider } from "./provider";

export class OllamaProvider implements ReflectionProvider {
  constructor(private host: string, private model: string) {}

  async generate(year: number, entries: ReflectionEntry[]): Promise<string> {
    const res = await fetch(`${this.host.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: "user", content: buildReflectionPrompt(year, entries) }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { message?: { content?: string } };
    if (!data.message?.content) throw new Error("Ollama returned no text.");
    return data.message.content;
  }
}
```

`src/lib/reflection/job.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Ctx } from "@/lib/context";
import { dataDir } from "@/lib/config";
import { years } from "@/lib/db/schema";
import { readEntries } from "@/lib/entries";
import { loadPrompts } from "@/lib/prompts";
import { formatWeekDates } from "@/lib/weeks";
import { getProvider, type ReflectionEntry, type ReflectionProvider } from "./provider";

export async function runReflection(ctx: Ctx, year: number, provider?: ReflectionProvider): Promise<void> {
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked" || row.reflectionStatus === "running") return;

  ctx.db.update(years).set({ reflectionStatus: "running", reflectionError: null }).where(eq(years.year, year)).run();
  try {
    const raw = readEntries(ctx, year);
    if (raw.length === 0) {
      ctx.db.update(years).set({ reflectionStatus: "done", reflectionText: null }).where(eq(years.year, year)).run();
      return;
    }
    const pool = new Map(loadPrompts(dataDir()).map((p) => [p.id, p.text]));
    const entries: ReflectionEntry[] = raw.map((e) => ({
      week: e.week,
      dates: formatWeekDates(year, e.week),
      prompt: e.promptId ? (pool.get(e.promptId) ?? null) : null,
      content: e.content,
    }));
    const text = await (provider ?? getProvider(ctx.db)).generate(year, entries);
    ctx.db.update(years).set({ reflectionStatus: "done", reflectionText: text }).where(eq(years.year, year)).run();
  } catch (e) {
    ctx.db
      .update(years)
      .set({ reflectionStatus: "failed", reflectionError: e instanceof Error ? e.message : String(e) })
      .where(eq(years.year, year))
      .run();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reflection/reflection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reflection
git commit -m "feat: pluggable AI reflection with async job lifecycle"
```

---

### Task 10: API routes

**Files:**
- Create: `src/app/api/year/route.ts`, `src/app/api/seal/route.ts`, `src/app/api/prompts/draw/route.ts`, `src/app/api/reflection/retry/route.ts`, `src/app/api/archive/route.ts`, `src/app/api/settings/route.ts`
- Test: `src/app/api/api.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–9 via `getCtx()`
- Produces (JSON API used by the UI):
  - `GET /api/year[?year=N]` → `YearState & { anchorPrompt: string; entries: Array<EntryMeta & { content: string }> | null }` (entries only when unlocked; triggers `maybeUnlock` + kicks `runReflection` when unlocked with `reflectionStatus === "none"`); 404 `{ error: "NOT_FOUND" }` for a non-current year with no row
  - `POST /api/seal` body `{ week: number; content: string; promptId?: string }` → 201 `{ sealedAt }`; SealError → 409 for `ALREADY_SEALED`/`WRONG_WEEK`, 400 otherwise, as `{ error: code }`
  - `POST /api/prompts/draw` → `{ id, text }`
  - `POST /api/reflection/retry` body `{ year: number }` → `{ status: "running" }` (fire-and-forget rerun; 409 `{ error: "YEAR_LOCKED" }` if not unlocked)
  - `GET /api/archive` → `{ years: Array<{ year: number; entryCount: number }> }` (unlocked years, newest first)
  - `GET /api/settings` → `{ anchorPrompt, unlockDay, providerType, providerModel, ollamaHost, anthropicKeySet: boolean }`; `PUT /api/settings` accepts any subset of `{ anchorPrompt, unlockDay, providerType, providerModel, ollamaHost, anthropicApiKey }` → 204

- [ ] **Step 1: Write the failing test**

`src/app/api/api.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { resetCtx } from "@/lib/context";
import { currentWeek } from "@/lib/weeks";

beforeEach(() => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "mm-api-"));
  resetCtx();
});

const NOW = new Date();
const week = currentWeek(NOW).week;

async function post(mod: { POST: (r: Request) => Promise<Response> }, body: unknown) {
  return mod.POST(new Request("http://x/", { method: "POST", body: JSON.stringify(body) }));
}

describe("seal + year", () => {
  it("seals the current week and reflects it in year state", async () => {
    const seal = await import("@/app/api/seal/route");
    const yearRoute = await import("@/app/api/year/route");
    const res = await post(seal, { week, content: "Sealed via API." });
    expect(res.status).toBe(201);
    const state = await (await yearRoute.GET(new Request("http://x/api/year"))).json();
    expect(state.cells[week - 1].state).toBe("sealed");
    expect(state.entries).toBeNull(); // locked: no content anywhere
    expect(state.anchorPrompt).toBe("This week is spent. What did you trade it for?");
    expect(JSON.stringify(state)).not.toContain("Sealed via API.");
  });
  it("maps seal errors to status codes", async () => {
    const seal = await import("@/app/api/seal/route");
    expect((await post(seal, { week, content: "" })).status).toBe(400);
    expect((await post(seal, { week: week === 1 ? 2 : week - 1, content: "x" })).status).toBe(409);
    await post(seal, { week, content: "first" });
    const dup = await post(seal, { week, content: "second" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe("ALREADY_SEALED");
  });
  it("404s for an unknown non-current year", async () => {
    const yearRoute = await import("@/app/api/year/route");
    expect((await yearRoute.GET(new Request("http://x/api/year?year=1999"))).status).toBe(404);
  });
});

describe("prompts + settings + archive", () => {
  it("draws a prompt from the pool", async () => {
    const draw = await import("@/app/api/prompts/draw/route");
    const p = await (await draw.POST(new Request("http://x/", { method: "POST" }))).json();
    expect(typeof p.id).toBe("string");
    expect(p.text.length).toBeGreaterThan(10);
  });
  it("settings round-trip without leaking the API key", async () => {
    const s = await import("@/app/api/settings/route");
    const put = await s.PUT(
      new Request("http://x/", { method: "PUT", body: JSON.stringify({ anchorPrompt: "Custom?", anthropicApiKey: "sk-test" }) }),
    );
    expect(put.status).toBe(204);
    const got = await (await s.GET()).json();
    expect(got.anchorPrompt).toBe("Custom?");
    expect(got.anthropicKeySet).toBe(true);
    expect(JSON.stringify(got)).not.toContain("sk-test");
  });
  it("archive lists only unlocked years", async () => {
    const archive = await import("@/app/api/archive/route");
    expect((await (await archive.GET()).json()).years).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/api.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement the routes**

`src/app/api/year/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { readEntries } from "@/lib/entries";
import { runReflection } from "@/lib/reflection/job";
import { DEFAULT_ANCHOR_PROMPT, getSetting } from "@/lib/settings";
import { getYearState, maybeUnlock } from "@/lib/years";

export async function GET(req: Request) {
  const ctx = getCtx();
  const now = new Date();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? now.getFullYear());

  if (year !== now.getFullYear()) {
    const exists = ctx.db.select().from(years).where(eq(years.year, year)).get();
    if (!exists) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  maybeUnlock(ctx.db, year, now);
  const state = getYearState(ctx.db, year, now);
  if (state.status === "unlocked" && state.reflection.status === "none") {
    void runReflection(ctx, year);
    state.reflection.status = "running";
  }
  return NextResponse.json({
    ...state,
    anchorPrompt: getSetting(ctx.db, "anchor_prompt") ?? DEFAULT_ANCHOR_PROMPT,
    entries: state.status === "unlocked" ? readEntries(ctx, year) : null,
  });
}
```

`src/app/api/seal/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { sealEntry, SealError } from "@/lib/entries";

export async function POST(req: Request) {
  const ctx = getCtx();
  const body = (await req.json()) as { week?: number; content?: string; promptId?: string };
  try {
    const result = sealEntry(ctx, {
      year: new Date().getFullYear(),
      week: Number(body.week),
      content: String(body.content ?? ""),
      promptId: body.promptId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof SealError) {
      const status = e.code === "ALREADY_SEALED" || e.code === "WRONG_WEEK" ? 409 : 400;
      return NextResponse.json({ error: e.code }, { status });
    }
    throw e;
  }
}
```

`src/app/api/prompts/draw/route.ts`:

```ts
import { NextResponse } from "next/server";
import { dataDir } from "@/lib/config";
import { getCtx } from "@/lib/context";
import { listEntryMeta } from "@/lib/entries";
import { drawPrompt, loadPrompts } from "@/lib/prompts";

export async function POST(_req: Request) {
  const ctx = getCtx();
  const year = new Date().getFullYear();
  const usedIds = listEntryMeta(ctx.db, year)
    .map((m) => m.promptId)
    .filter((id): id is string => id !== null);
  return NextResponse.json(drawPrompt(loadPrompts(dataDir()), usedIds));
}
```

`src/app/api/reflection/retry/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { runReflection } from "@/lib/reflection/job";

export async function POST(req: Request) {
  const ctx = getCtx();
  const { year } = (await req.json()) as { year: number };
  const row = ctx.db.select().from(years).where(eq(years.year, year)).get();
  if (!row || row.status !== "unlocked") {
    return NextResponse.json({ error: "YEAR_LOCKED" }, { status: 409 });
  }
  if (row.reflectionStatus !== "running") {
    ctx.db.update(years).set({ reflectionStatus: "none" }).where(eq(years.year, year)).run();
    void runReflection(ctx, year);
  }
  return NextResponse.json({ status: "running" });
}
```

`src/app/api/archive/route.ts`:

```ts
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { listEntryMeta } from "@/lib/entries";

export async function GET() {
  const ctx = getCtx();
  const unlocked = ctx.db.select().from(years).where(eq(years.status, "unlocked")).orderBy(desc(years.year)).all();
  return NextResponse.json({
    years: unlocked.map((y) => ({ year: y.year, entryCount: listEntryMeta(ctx.db, y.year).length })),
  });
}
```

`src/app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { DEFAULT_ANCHOR_PROMPT, getSetting, setSetting } from "@/lib/settings";

export async function GET() {
  const { db } = getCtx();
  return NextResponse.json({
    anchorPrompt: getSetting(db, "anchor_prompt") ?? DEFAULT_ANCHOR_PROMPT,
    unlockDay: getSetting(db, "unlock_day") ?? "12-31",
    providerType: getSetting(db, "provider_type") ?? "anthropic",
    providerModel: getSetting(db, "provider_model") ?? "claude-sonnet-5",
    ollamaHost: getSetting(db, "ollama_host") ?? "http://localhost:11434",
    anthropicKeySet: Boolean(process.env.ANTHROPIC_API_KEY ?? getSetting(db, "anthropic_api_key")),
  });
}

const KEYS: Record<string, string> = {
  anchorPrompt: "anchor_prompt",
  unlockDay: "unlock_day",
  providerType: "provider_type",
  providerModel: "provider_model",
  ollamaHost: "ollama_host",
  anthropicApiKey: "anthropic_api_key",
};

export async function PUT(req: Request) {
  const { db } = getCtx();
  const body = (await req.json()) as Record<string, unknown>;
  for (const [field, settingKey] of Object.entries(KEYS)) {
    if (typeof body[field] === "string" && (body[field] as string).length > 0) {
      setSetting(db, settingKey, body[field] as string);
    }
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/api.test.ts`
Expected: PASS (6 tests). Then `npm test` — everything passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "feat: JSON API for year state, sealing, prompts, reflection, settings"
```

---

### Task 11: Main page UI — grid + writing surface

**Files:**
- Modify: `src/app/globals.css` (replace body), `src/app/layout.tsx` (metadata + fonts, keep create-next-app's Geist wiring)
- Create: `src/components/YearGrid.tsx`, `src/components/WritingSurface.tsx`
- Modify: `src/app/page.tsx` (replace entirely)

**Interfaces:**
- Consumes: `GET /api/year`, `POST /api/seal`, `POST /api/prompts/draw` (Task 10 shapes); `Cell`/`YearState` field names from Task 8
- Produces:
  - `<YearGrid cells={Cell[]} revealing?: boolean />` — 13×4 monochrome grid, tooltips, entrance stagger, breathing current ring
  - `<WritingSurface anchorPrompt={string} week={number} year={number} unlockDate={string} onSealed={() => void} />` — draft autosave in localStorage key `mm-draft-<year>-<week>`, drawn prompt, counter past 80%, two-step seal confirm with the exact spec copy
  - Main page at `/` composing both

- [ ] **Step 1: Global styles**

Replace the `:root`/body rules in `src/app/globals.css` (keep the Tailwind import line) with:

```css
@import "tailwindcss";

:root {
  --bg: #ffffff;
  --fg: #0a0a0a;
  --gray-1: #f3f3f3;
  --gray-2: #d4d4d4;
  --gray-3: #8a8a8a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0a0a;
    --fg: #fafafa;
    --gray-1: #1c1c1c;
    --gray-2: #3a3a3a;
    --gray-3: #7a7a7a;
  }
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

@keyframes mm-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes mm-breathe {
  0%, 100% { box-shadow: 0 0 0 1.5px var(--fg); }
  50% { box-shadow: 0 0 0 1.5px var(--gray-3); }
}
@keyframes mm-fill {
  from { background: var(--bg); }
  to { background: var(--fg); }
}
.mm-enter { animation: mm-enter 0.3s ease-out both; }
.mm-breathe { animation: mm-breathe 3s ease-in-out infinite; }
.mm-fill { animation: mm-fill 0.9s ease-in both; }

@media (prefers-reduced-motion: reduce) {
  .mm-enter, .mm-breathe, .mm-fill { animation: none; }
  .mm-breathe { box-shadow: 0 0 0 1.5px var(--fg); }
  .mm-fill { background: var(--fg); }
}
```

In `src/app/layout.tsx`, keep the scaffolded Geist font setup and change only the metadata:

```ts
export const metadata: Metadata = {
  title: "memento mori",
  description: "52 weeks, sealed until December.",
};
```

- [ ] **Step 2: `src/components/YearGrid.tsx`**

```tsx
"use client";

import type { Cell } from "@/lib/years";

const CELL_STYLE: Record<Cell["state"], string> = {
  sealed: "bg-[var(--fg)]",
  current: "bg-[var(--bg)] mm-breathe",
  missed: "border border-[var(--gray-2)] mm-strike",
  future: "border border-[var(--gray-1)]",
};

export default function YearGrid({ cells, revealing = false }: { cells: Cell[]; revealing?: boolean }) {
  return (
    <div className="grid grid-cols-13 gap-[6px]" role="img" aria-label="52 weeks of the year">
      {cells.map((cell, i) => (
        <div key={cell.week} className="group relative">
          <div
            className={`aspect-square w-full rounded-[3px] mm-enter ${revealing && cell.state === "sealed" ? "mm-fill" : ""} ${CELL_STYLE[cell.state]}`}
            style={{
              animationDelay: revealing
                ? `${cell.state === "sealed" ? i * 60 : 0}ms`
                : `${i * 12}ms`,
              ...(cell.state === "missed"
                ? { backgroundImage: "linear-gradient(135deg, transparent 46%, var(--gray-2) 46%, var(--gray-2) 54%, transparent 54%)" }
                : {}),
            }}
          />
          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--fg)] px-2 py-1 font-mono text-[10px] text-[var(--bg)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            wk {cell.week} · {cell.dates}
            {cell.sealedAt ? ` · sealed ${new Date(cell.sealedAt).toLocaleDateString()}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note: Tailwind v4 generates `grid-cols-13` from the arbitrary value engine; if it doesn't, use `grid-cols-[repeat(13,minmax(0,1fr))]`.

- [ ] **Step 3: `src/components/WritingSurface.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { MAX_ENTRY_CHARS } from "@/lib/config";

type Drawn = { id: string; text: string };

export default function WritingSurface({
  anchorPrompt,
  week,
  year,
  unlockDate,
  onSealed,
}: {
  anchorPrompt: string;
  week: number;
  year: number;
  unlockDate: string;
  onSealed: () => void;
}) {
  const draftKey = `mm-draft-${year}-${week}`;
  const [content, setContent] = useState("");
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) setContent(saved);
  }, [draftKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (content) localStorage.setItem(draftKey, content);
      else localStorage.removeItem(draftKey);
    }, 2000);
    return () => clearTimeout(t);
  }, [content, draftKey]);

  async function draw() {
    const res = await fetch("/api/prompts/draw", { method: "POST" });
    if (res.ok) setDrawn(await res.json());
  }

  async function seal() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week, content, promptId: drawn?.id }),
    });
    setBusy(false);
    if (res.ok) {
      localStorage.removeItem(draftKey);
      onSealed();
    } else {
      const { error: code } = await res.json();
      setError(
        code === "ALREADY_SEALED" ? "This week is already sealed."
        : code === "WRONG_WEEK" ? "This week has passed. The cell stays empty."
        : code === "TOO_LONG" ? `Too long — ${MAX_ENTRY_CHARS} characters at most.`
        : "One paragraph only.",
      );
      setConfirming(false);
    }
  }

  const unlockLabel = new Date(`${unlockDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const over = content.length > MAX_ENTRY_CHARS;

  return (
    <section className="mt-14">
      <h1 className="text-2xl font-medium tracking-tight">{anchorPrompt}</h1>
      {drawn && <p className="mt-3 text-sm text-[var(--gray-3)] mm-enter">{drawn.text}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.replace(/[\r\n]/g, " "))}
        rows={4}
        placeholder="One paragraph. Then it's sealed."
        className="mt-6 w-full resize-none border-b border-[var(--gray-2)] bg-transparent pb-2 text-base leading-relaxed outline-none placeholder:text-[var(--gray-3)] focus:border-[var(--fg)]"
      />
      <div className="mt-3 flex items-center justify-between font-mono text-xs text-[var(--gray-3)]">
        <button onClick={draw} className="hover:text-[var(--fg)]">
          I&apos;m circling — draw a prompt
        </button>
        {content.length >= MAX_ENTRY_CHARS * 0.8 && (
          <span className={`mm-enter ${over ? "text-[var(--fg)] font-bold" : ""}`}>
            {content.length}/{MAX_ENTRY_CHARS}
          </span>
        )}
      </div>
      {error && <p className="mt-4 font-mono text-xs">{error}</p>}
      <div className="mt-8">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!content.trim() || over}
            className="bg-[var(--fg)] px-6 py-2.5 text-sm font-medium text-[var(--bg)] transition-transform active:scale-95 disabled:opacity-30"
          >
            Seal
          </button>
        ) : (
          <div className="mm-enter flex items-center gap-4">
            <p className="text-sm">Sealed is sealed. No reading, no editing, until {unlockLabel}.</p>
            <button onClick={seal} disabled={busy}
              className="bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] active:scale-95 disabled:opacity-50">
              Seal it
            </button>
            <button onClick={() => setConfirming(false)} className="text-sm text-[var(--gray-3)] hover:text-[var(--fg)]">
              Back
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import YearGrid from "@/components/YearGrid";
import WritingSurface from "@/components/WritingSurface";
import type { YearState } from "@/lib/years";
import type { EntryMeta } from "@/lib/entries";

export type YearResponse = YearState & {
  anchorPrompt: string;
  entries: Array<EntryMeta & { content: string }> | null;
};

export default function Home() {
  const [data, setData] = useState<YearResponse | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/year");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;

  const currentCell = data.cells.find((c) => c.week === data.currentWeek);
  const sealedThisWeek = currentCell?.state === "sealed";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <header className="mb-10 flex items-baseline justify-between font-mono text-xs text-[var(--gray-3)]">
        <span>{data.year}</span>
        <span>
          {data.cells.filter((c) => c.state === "sealed").length} sealed ·{" "}
          {data.cells.filter((c) => c.state === "future").length} to come
        </span>
      </header>

      <YearGrid cells={data.cells} />

      {data.status === "active" && data.currentWeek !== null && !sealedThisWeek && (
        <WritingSurface
          anchorPrompt={data.anchorPrompt}
          week={data.currentWeek}
          year={data.year}
          unlockDate={data.unlockDate}
          onSealed={load}
        />
      )}
      {data.status === "active" && sealedThisWeek && (
        <p className="mt-14 font-mono text-sm text-[var(--gray-3)] mm-enter">
          Week {data.currentWeek} is sealed. Nothing to do here until next week.
        </p>
      )}

      <footer className="mt-20 flex items-center justify-between font-mono text-xs text-[var(--gray-3)]">
        <Link href="/archive" className="hover:text-[var(--fg)]">past years</Link>
        <Link href="/settings" className="hover:text-[var(--fg)]">⚙</Link>
      </footer>
    </main>
  );
}
```

(The unlocked-year branch is added in Task 12; until then an unlocked year simply shows the grid.)

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev` and open http://localhost:3000. Check:
- Grid renders 13×4, cells stagger-fade in; past weeks show a diagonal strike; current week has a breathing ring; future weeks are faint outlines.
- Hovering a cell shows the mono tooltip with week dates.
- Type a reflection: counter appears near 600 chars; newlines are converted to spaces.
- "draw a prompt" shows a pool prompt; drawing again replaces it.
- Seal → confirmation with the exact copy and the real unlock date → "Seal it" → cell fills solid, writing surface is replaced by the sealed notice. Reload: still sealed.
- `npm test` still passes.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx src/components
git commit -m "feat: monochrome year grid and seal-on-submit writing surface"
```

---

### Task 12: Unlock reveal, reading pane, archive, settings pages

**Files:**
- Create: `src/components/ReadingPane.tsx`, `src/app/archive/page.tsx`, `src/app/archive/[year]/page.tsx`, `src/app/settings/page.tsx`
- Modify: `src/app/page.tsx` (add unlocked branch)

**Interfaces:**
- Consumes: `YearResponse` (Task 11), `GET /api/archive`, `GET/PUT /api/settings`, `POST /api/reflection/retry`
- Produces: `<ReadingPane data={YearResponse} onRetry={() => void} showReveal={boolean} />`; pages at `/archive`, `/archive/[year]`, `/settings`

- [ ] **Step 1: `src/components/ReadingPane.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { YearResponse } from "@/app/page";

export default function ReadingPane({
  data,
  onRetry,
  showReveal,
}: {
  data: YearResponse;
  onRetry: () => void;
  showReveal: boolean;
}) {
  const revealKey = `mm-revealed-${data.year}`;
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    if (showReveal && !localStorage.getItem(revealKey)) {
      setRevealed(false);
      const sealedCount = data.cells.filter((c) => c.state === "sealed").length;
      const t = setTimeout(() => {
        localStorage.setItem(revealKey, "1");
        setRevealed(true);
      }, sealedCount * 60 + 1200);
      return () => clearTimeout(t);
    }
  }, [showReveal, revealKey, data.cells]);

  if (!revealed) {
    return (
      <div className="mt-14 text-center">
        <p className="font-mono text-xs text-[var(--gray-3)]">{data.year} opens.</p>
        <button
          onClick={() => {
            localStorage.setItem(revealKey, "1");
            setRevealed(true);
          }}
          className="mt-4 font-mono text-xs text-[var(--gray-3)] underline hover:text-[var(--fg)]"
        >
          skip
        </button>
      </div>
    );
  }

  const r = data.reflection;
  return (
    <section className="mt-14 space-y-10">
      {(data.entries ?? []).map((e) => {
        const cell = data.cells.find((c) => c.week === e.week)!;
        return (
          <article key={e.week} id={`week-${e.week}`} className="mm-enter">
            <h2 className="font-mono text-xs text-[var(--gray-3)]">
              week {e.week} · {cell.dates}
            </h2>
            <p className="mt-2 leading-relaxed">{e.content}</p>
          </article>
        );
      })}

      <div className="border-t border-[var(--gray-2)] pt-10">
        <h2 className="font-mono text-xs text-[var(--gray-3)]">the year, read back</h2>
        {r.status === "done" && r.text && (
          <p className="mt-3 whitespace-pre-line leading-relaxed">{r.text}</p>
        )}
        {r.status === "done" && !r.text && (
          <p className="mt-3 text-sm text-[var(--gray-3)]">No entries were sealed this year.</p>
        )}
        {(r.status === "running" || r.status === "none") && (
          <p className="mt-3 text-sm text-[var(--gray-3)]">Being written…</p>
        )}
        {r.status === "failed" && (
          <div className="mt-3 text-sm">
            <p className="text-[var(--gray-3)]">The reflection failed: {r.error}</p>
            <button onClick={onRetry} className="mt-2 underline hover:text-[var(--fg)]">
              retry reflection
            </button>
          </div>
        )}
        {r.status === "done" && r.text && (
          <button onClick={onRetry} className="mt-4 font-mono text-xs text-[var(--gray-3)] underline hover:text-[var(--fg)]">
            regenerate
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into `src/app/page.tsx`**

Add the import: `import ReadingPane from "@/components/ReadingPane";`

Inside `Home`, add a retry handler and poll while the reflection is running:

```tsx
const retry = useCallback(async () => {
  await fetch("/api/reflection/retry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ year: data?.year }),
  });
  void load();
}, [data?.year, load]);

useEffect(() => {
  if (data?.reflection.status === "running" || (data?.status === "unlocked" && data.reflection.status === "none")) {
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }
}, [data, load]);
```

After the `sealedThisWeek` notice block, add:

```tsx
{data.status === "unlocked" && <ReadingPane data={data} onRetry={retry} showReveal />}
```

And pass the reveal state into the grid by replacing `<YearGrid cells={data.cells} />` with:

```tsx
<YearGrid cells={data.cells} revealing={data.status === "unlocked" && !revealSeen} />
```

where `revealSeen` is computed at the top of the component:

```tsx
const [revealSeen, setRevealSeen] = useState(true);
useEffect(() => {
  if (data?.status === "unlocked") setRevealSeen(Boolean(localStorage.getItem(`mm-revealed-${data.year}`)));
}, [data?.status, data?.year]);
```

- [ ] **Step 3: Archive pages**

`src/app/archive/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ArchivePage() {
  const [years, setYears] = useState<Array<{ year: number; entryCount: number }> | null>(null);
  useEffect(() => {
    void fetch("/api/archive").then(async (r) => setYears((await r.json()).years));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-mono text-xs text-[var(--gray-3)]">past years</h1>
      <ul className="mt-8 space-y-3">
        {years?.map((y) => (
          <li key={y.year}>
            <Link href={`/archive/${y.year}`} className="flex items-baseline justify-between border-b border-[var(--gray-1)] pb-3 hover:border-[var(--fg)]">
              <span className="text-2xl font-medium">{y.year}</span>
              <span className="font-mono text-xs text-[var(--gray-3)]">{y.entryCount}/52 sealed</span>
            </Link>
          </li>
        ))}
        {years?.length === 0 && <p className="text-sm text-[var(--gray-3)]">No unlocked years yet.</p>}
      </ul>
      <footer className="mt-20 font-mono text-xs">
        <Link href="/" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← this year</Link>
      </footer>
    </main>
  );
}
```

`src/app/archive/[year]/page.tsx`:

```tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import YearGrid from "@/components/YearGrid";
import ReadingPane from "@/components/ReadingPane";
import type { YearResponse } from "@/app/page";

export default function ArchiveYearPage({ params }: { params: Promise<{ year: string }> }) {
  const { year } = use(params);
  const [data, setData] = useState<YearResponse | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/year?year=${year}`);
    if (res.ok) setData(await res.json());
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  const retry = useCallback(async () => {
    await fetch("/api/reflection/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ year: Number(year) }),
    });
    void load();
  }, [year, load]);

  if (!data) return null;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <header className="mb-10 font-mono text-xs text-[var(--gray-3)]">{data.year}</header>
      <YearGrid cells={data.cells} />
      <ReadingPane data={data} onRetry={retry} showReveal={false} />
      <footer className="mt-20 font-mono text-xs">
        <Link href="/archive" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← past years</Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Settings page — `src/app/settings/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  anchorPrompt: string;
  unlockDay: string;
  providerType: string;
  providerModel: string;
  ollamaHost: string;
  anthropicKeySet: boolean;
};

const FIELD = "mt-1 w-full border-b border-[var(--gray-2)] bg-transparent pb-1 outline-none focus:border-[var(--fg)]";
const LABEL = "block font-mono text-xs text-[var(--gray-3)]";

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/settings").then(async (r) => setS(await r.json()));
  }, []);

  async function save() {
    if (!s) return;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anchorPrompt: s.anchorPrompt,
        unlockDay: s.unlockDay,
        providerType: s.providerType,
        providerModel: s.providerModel,
        ollamaHost: s.ollamaHost,
        ...(apiKey ? { anthropicApiKey: apiKey } : {}),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return null;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-mono text-xs text-[var(--gray-3)]">settings</h1>
      <div className="mt-8 space-y-6 text-sm">
        <label className="block">
          <span className={LABEL}>anchor prompt</span>
          <input className={FIELD} value={s.anchorPrompt} onChange={(e) => setS({ ...s, anchorPrompt: e.target.value })} />
        </label>
        <label className="block">
          <span className={LABEL}>unlock day (MM-DD, applies to new years)</span>
          <input className={FIELD} value={s.unlockDay} onChange={(e) => setS({ ...s, unlockDay: e.target.value })} />
        </label>
        <label className="block">
          <span className={LABEL}>reflection provider</span>
          <select className={FIELD} value={s.providerType} onChange={(e) => setS({ ...s, providerType: e.target.value })}>
            <option value="anthropic">anthropic</option>
            <option value="ollama">ollama</option>
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>model</span>
          <input className={FIELD} value={s.providerModel} onChange={(e) => setS({ ...s, providerModel: e.target.value })} />
        </label>
        {s.providerType === "anthropic" ? (
          <label className="block">
            <span className={LABEL}>anthropic api key {s.anthropicKeySet ? "(set — leave blank to keep)" : "(not set)"}</span>
            <input className={FIELD} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
        ) : (
          <label className="block">
            <span className={LABEL}>ollama host</span>
            <input className={FIELD} value={s.ollamaHost} onChange={(e) => setS({ ...s, ollamaHost: e.target.value })} />
          </label>
        )}
        <button onClick={save} className="bg-[var(--fg)] px-6 py-2.5 text-sm font-medium text-[var(--bg)] active:scale-95">
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      <footer className="mt-20 font-mono text-xs">
        <Link href="/" className="text-[var(--gray-3)] hover:text-[var(--fg)]">← this year</Link>
      </footer>
    </main>
  );
}
```

- [ ] **Step 5: Verify the unlock path end-to-end**

Run with a temp data dir and a past unlock day to force an unlocked year:

```bash
DATA_DIR=/tmp/mm-unlock-test npm run dev
```

Then: open http://localhost:3000/settings, set unlock day to `01-01` — but note this only applies to **new** years, so instead force it in the DB:

```bash
sqlite3 /tmp/mm-unlock-test/mementomori.db "UPDATE years SET unlock_date='2026-01-01' WHERE year=2026;"
```

Reload http://localhost:3000. Check:
- The reveal plays (cells fill in order), skippable; after it, entries appear below with the reflection block showing "Being written…" then failing fast (no API key) with a readable error + retry button.
- Set a real key in /settings (or switch provider to ollama with a local model) → retry → reflection text appears.
- `/archive` lists 2026; `/archive/2026` renders grid + entries read-only.
- `npm test` still passes.
- Delete `/tmp/mm-unlock-test` afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/app src/components
git commit -m "feat: unlock reveal, reading pane, archive, and settings"
```

---

### Task 13: Password gate, Dockerfile, README

**Files:**
- Create: `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/api/login/route.ts`, `Dockerfile`, `.dockerignore`
- Create: `README.md` (repo root)
- Test: `src/lib/auth.test.ts`, plus manual verification

**Interfaces:**
- Consumes: nothing new; wraps the whole app
- Produces: `authToken(password: string): Promise<string>` from `@/lib/auth` (SHA-256 hex via Web Crypto — usable in middleware and Node); when `APP_PASSWORD` is set, all routes except `/login` + `/api/login` require cookie `mm_auth === authToken(APP_PASSWORD)`; Docker image serving on port 3000 with `/app/data` volume

- [ ] **Step 1: Write the failing test**

`src/lib/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { authToken } from "@/lib/auth";

describe("authToken", () => {
  it("hashes deterministically to 64 hex chars", async () => {
    const t = await authToken("hunter2");
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(await authToken("hunter2")).toBe(t);
    expect(await authToken("other")).not.toBe(t);
  });
});
```

Run: `npx vitest run src/lib/auth.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/auth.ts`**

```ts
export async function authToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mm:${password}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Run: `npx vitest run src/lib/auth.test.ts` → PASS.

- [ ] **Step 3: Middleware and login**

`src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { authToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (req.cookies.get("mm_auth")?.value === (await authToken(password))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
```

`src/app/api/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { authToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mm_auth", await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
```

`src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else setWrong(true);
  }

  return (
    <main className="mx-auto max-w-xs px-6 py-32">
      <form onSubmit={submit}>
        <label className="block font-mono text-xs text-[var(--gray-3)]">password</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full border-b border-[var(--gray-2)] bg-transparent pb-1 outline-none focus:border-[var(--fg)]"
        />
        {wrong && <p className="mt-3 font-mono text-xs">Wrong password.</p>}
        <button type="submit" className="mt-6 bg-[var(--fg)] px-6 py-2 text-sm text-[var(--bg)] active:scale-95">
          Enter
        </button>
      </form>
    </main>
  );
}
```

Verify manually: `APP_PASSWORD=test npm run dev` → any page redirects to `/login`; wrong password shows the error; right password lands on the grid. Without `APP_PASSWORD`, no gate.

- [ ] **Step 4: Dockerfile**

`Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore`:

```
node_modules
.next
data
.git
docs
```

Verify: `docker build -t mementomori . && docker run -p 3000:3000 -v mm-data:/app/data mementomori` → app works at http://localhost:3000, sealing persists across container restarts (volume).

- [ ] **Step 5: README**

`README.md` — must cover, in this order (write real prose, not placeholders):
1. One-paragraph description of the ritual (seal weekly, encrypted until Dec 31, AI reflection, missed weeks stay empty).
2. Quick start: `docker run -d -p 3000:3000 -v mm-data:/app/data -e TZ=America/Sao_Paulo ghcr.io/OWNER/mementomori` and the `docker build` alternative; dev setup (`npm install && npm run dev`).
3. Environment variables table: `DATA_DIR`, `TZ` (the ritual's timezone), `MASTER_KEY` (optional, else auto keyfile), `APP_PASSWORD` (optional gate), `ANTHROPIC_API_KEY` (optional, overrides settings).
4. **Backups:** copy the whole data volume — `mementomori.db` *and* `master.key` together; ciphertext without the key is unrecoverable by design.
5. Customizing: anchor prompt/unlock day/provider in `/settings`; editing `prompts.json` in the data volume.

- [ ] **Step 6: Full verification + commit**

Run: `npm test` (all suites pass), `npm run build` (succeeds), `npm run lint` (clean).

```bash
git add src/middleware.ts src/app/login src/app/api/login src/lib/auth.ts src/lib/auth.test.ts Dockerfile .dockerignore README.md
git commit -m "feat: optional password gate, Docker packaging, README"
```

---

## Post-plan notes

- **Stretch (explicitly not a gate):** a Playwright smoke test (write → seal → cell fills). Skip unless asked.
- **Deferred by design (YAGNI):** notifications, multi-user, entry export, true time-lock crypto, regeneration history (latest reflection only).
