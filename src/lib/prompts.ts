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
