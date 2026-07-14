import { NextResponse } from "next/server";
import { getCtx } from "@/lib/context";
import { DEFAULT_ANCHOR_PROMPT, getSetting, setSetting } from "@/lib/settings";
import { readJson } from "../request";

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
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (typeof body.unlockDay === "string" && body.unlockDay.length > 0 &&
      !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(body.unlockDay)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (typeof body.providerType === "string" && body.providerType.length > 0 &&
      body.providerType !== "anthropic" && body.providerType !== "ollama") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  for (const [field, settingKey] of Object.entries(KEYS)) {
    if (typeof body[field] === "string" && (body[field] as string).length > 0) {
      setSetting(db, settingKey, body[field] as string);
    }
  }
  return new NextResponse(null, { status: 204 });
}
