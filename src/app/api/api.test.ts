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
