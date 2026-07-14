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
