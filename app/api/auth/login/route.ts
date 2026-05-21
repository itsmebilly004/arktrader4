import { NextResponse } from "next/server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const dynamic = "force-dynamic";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  let password: unknown;
  try {
    const body = await req.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof password !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!adminPassword) {
    return NextResponse.json(
      { error: "Server misconfigured: ADMIN_PASSWORD env var is not set in Vercel." },
      { status: 500 }
    );
  }
  if (!sessionSecret) {
    return NextResponse.json(
      { error: "Server misconfigured: SESSION_SECRET env var is not set in Vercel." },
      { status: 500 }
    );
  }

  if (!constantTimeEqual(password, adminPassword)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  try {
    const token = await signSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
