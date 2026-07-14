import { WEEKS_PER_YEAR } from "@/lib/config";
import type { Db } from "@/lib/db";
import { DEFAULT_ANCHOR_PROMPT, getSecretSetting, getSetting } from "@/lib/settings";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";

export type ReflectionEntry = { week: number; dates: string; prompt: string | null; content: string };

export interface ReflectionProvider {
  generate(year: number, entries: ReflectionEntry[], anchorPrompt?: string): Promise<string>;
}

export function buildReflectionPrompt(
  year: number,
  entries: ReflectionEntry[],
  anchorPrompt: string = DEFAULT_ANCHOR_PROMPT,
): string {
  const missed = WEEKS_PER_YEAR - entries.length;
  const body = entries
    .map((e) => `Week ${e.week} (${e.dates})${e.prompt ? ` — drawn prompt: "${e.prompt}"` : ""}\n${e.content}`)
    .join("\n\n");
  return [
    `Below is one year (${year}) of weekly reflections, each written in answer to: "${anchorPrompt}"`,
    `and sealed unread until today.`,
    `${entries.length} of ${WEEKS_PER_YEAR} weeks were written; ${missed} weeks passed unrecorded — treat the gaps as part of the record.`,
    ``,
    `Write a reflection on the year for the author — a Stoic examination of a year of weeks, in the spirit of`,
    `Seneca's evening review. Its job is to hand them usable insight into how they lived. Look for: what they`,
    `did well, including what they undervalued at the time; the lesson the year kept teaching until they`,
    `learned it; where their time and attention went against their own stated values; how they changed from`,
    `the first entries to the last; and what the gaps might mean. Quote short phrases from the entries where`,
    `it sharpens the point.`,
    `Work only from the entries below: never invent events, people, or details that are not written there,`,
    `and only mention weeks that actually appear. If something is ambiguous, let it stay ambiguous.`,
    `Be direct and warm, never flattering. Honor the author's practice of examining their weeks — your role`,
    `is to deepen it. Address the author plainly in the second person — this is not a letter: no greeting,`,
    `no sign-off, no "dear friend". Do not summarize week by week. End with one concrete lesson drawn from`,
    `their own entries, stated as something to practice in the new year. Aim for 400-600 words of plain prose.`,
    ``,
    `The entries:`,
    ``,
    body,
  ].join("\n");
}

export function getProvider(db: Db, masterKey: Buffer): ReflectionProvider {
  const type = getSetting(db, "provider_type") ?? "anthropic";
  if (type === "ollama") {
    return new OllamaProvider(
      getSetting(db, "ollama_host") ?? "http://localhost:11434",
      getSetting(db, "provider_model") ?? "llama3.1",
    );
  }
  return new AnthropicProvider(
    process.env.ANTHROPIC_API_KEY ?? getSecretSetting(db, masterKey, "anthropic_api_key") ?? "",
    getSetting(db, "provider_model") ?? "claude-sonnet-5",
  );
}
