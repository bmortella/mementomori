import { NextResponse } from "next/server";
import { authToken } from "@/lib/auth";
import { readJson } from "../request";

export async function POST(req: Request) {
  const body = await readJson<{ password?: string }>(req);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const { password } = body;
  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mm_auth", await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    // Conditional so plain-HTTP LAN deployments keep working.
    secure:
      new URL(req.url).protocol === "https:" ||
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
