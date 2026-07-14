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
