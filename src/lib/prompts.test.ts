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

describe("loadPrompts resilience", () => {
  it("falls back to defaults on malformed JSON without touching the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mm-"));
    const file = path.join(dir, "prompts.json");
    writeFileSync(file, "{ not json");
    expect(loadPrompts(dir).length).toBe(30);
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });
  it("falls back to defaults on an empty array", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mm-"));
    writeFileSync(path.join(dir, "prompts.json"), "[]");
    expect(loadPrompts(dir).length).toBe(30);
  });
});

describe("drawPrompt empty pool", () => {
  it("throws a clear error", () => {
    expect(() => drawPrompt([], [])).toThrow("Prompt pool is empty");
  });
});
