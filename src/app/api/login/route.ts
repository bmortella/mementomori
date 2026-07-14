import { NextResponse } from "next/server";
import { authToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mm_auth", await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
