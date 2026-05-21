import { NextResponse } from "next/server";
import { verifyPassword, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

  try {
    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

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
