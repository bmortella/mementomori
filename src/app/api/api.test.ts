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
  it("sweeps past-due active years into the archive", async () => {
    const { getCtx } = await import("@/lib/context");
    const { years } = await import("@/lib/db/schema");
    getCtx().db.insert(years).values({ year: 2020, unlockDate: "2020-12-31" }).run();
    const archive = await import("@/app/api/archive/route");
    const { years: list } = await (await archive.GET()).json();
    expect(list).toEqual([{ year: 2020, entryCount: 0 }]);
  });
});

describe("request validation", () => {
  it("rejects malformed JSON bodies with 400", async () => {
    const seal = await import("@/app/api/seal/route");
    const retry = await import("@/app/api/reflection/retry/route");
    const settings = await import("@/app/api/settings/route");
    const bad = (url: string) => new Request(url, { method: "POST", body: "{ not json" });
    expect((await seal.POST(bad("http://x/"))).status).toBe(400);
    expect((await retry.POST(bad("http://x/"))).status).toBe(400);
    expect((await settings.PUT(new Request("http://x/", { method: "PUT", body: "{ not json" }))).status).toBe(400);
  });
  it("rejects a missing or non-integer week with 400, not 409", async () => {
    const seal = await import("@/app/api/seal/route");
    expect((await post(seal, { content: "no week" })).status).toBe(400);
    expect((await post(seal, { week: "seven", content: "x" })).status).toBe(400);
  });
  it("rejects malformed unlockDay and unknown providerType", async () => {
    const s = await import("@/app/api/settings/route");
    const put = (body: unknown) =>
      s.PUT(new Request("http://x/", { method: "PUT", body: JSON.stringify(body) }));
    expect((await put({ unlockDay: "31-12" })).status).toBe(400);
    expect((await put({ unlockDay: "13-45" })).status).toBe(400);
    expect((await put({ providerType: "gemini" })).status).toBe(400);
    expect((await put({ unlockDay: "11-30", providerType: "ollama" })).status).toBe(204);
  });
});
