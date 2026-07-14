import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCtx } from "@/lib/context";
import { years } from "@/lib/db/schema";
import { DEFAULT_ANCHOR_PROMPT, getSetting, setSecretSetting, setSetting } from "@/lib/settings";
import { readJson } from "../request";

export async function GET() {
  const { db } = getCtx();
  return NextResponse.json({
    anchorPrompt: getSetting(db, "anchor_prompt") ?? DEFAULT_ANCHOR_PROMPT,
    unlockDay: getSetting(db, "unlock_day") ?? "12-31",
    confirmSeal: (getSetting(db, "confirm_seal") ?? "0") === "1",
    providerType: getSetting(db, "provider_type") ?? "anthropic",
    providerModel: getSetting(db, "provider_model") ?? "claude-sonnet-5",
    ollamaHost: getSetting(db, "ollama_host") ?? "http://localhost:11434",
    anthropicKeySet: Boolean(process.env.ANTHROPIC_API_KEY ?? getSetting(db, "anthropic_api_key")),
  });
}

const KEYS: Record<string, string> = {
  anchorPrompt: "anchor_prompt",
  unlockDay: "unlock_day",
  confirmSeal: "confirm_seal",
  providerType: "provider_type",
  providerModel: "provider_model",
  ollamaHost: "ollama_host",
};

function isRealMonthDay(unlockDay: string): boolean {
  if (!/^\d{2}-\d{2}$/.test(unlockDay)) return false;
  const [m, d] = unlockDay.split("-").map(Number);
  // Leap reference year: allows 02-29, rejects normalized dates like 02-31.
  const date = new Date(2000, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d;
}

export async function PUT(req: Request) {
  const { db, key } = getCtx();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (typeof body.unlockDay === "string" && body.unlockDay.length > 0 && !isRealMonthDay(body.unlockDay)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (typeof body.providerType === "string" && body.providerType.length > 0 &&
      body.providerType !== "anthropic" && body.providerType !== "ollama") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (typeof body.confirmSeal === "string" && body.confirmSeal.length > 0 &&
      body.confirmSeal !== "0" && body.confirmSeal !== "1") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  for (const [field, settingKey] of Object.entries(KEYS)) {
    if (typeof body[field] === "string" && (body[field] as string).length > 0) {
      setSetting(db, settingKey, body[field] as string);
    }
  }
  if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.length > 0) {
    setSecretSetting(db, key, "anthropic_api_key", body.anthropicApiKey);
  }
  if (typeof body.unlockDay === "string" && body.unlockDay.length > 0) {
    // A new unlock day applies to years still sealed, not just future ones.
    for (const row of db.select().from(years).where(eq(years.status, "active")).all()) {
      db.update(years)
        .set({ unlockDate: `${row.year}-${body.unlockDay}` })
        .where(eq(years.year, row.year))
        .run();
    }
  }
  return new NextResponse(null, { status: 204 });
}
