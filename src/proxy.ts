import { NextResponse, type NextRequest } from "next/server";
import { authToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (req.cookies.get("mm_auth")?.value === (await authToken(password))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
