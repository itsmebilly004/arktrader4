import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;

  if (!token || !ref) {
    return NextResponse.json(
      { error: "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set in env vars." },
      { status: 500 }
    );
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const body = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: body || `HTTP ${res.status}` }, { status: res.status });
  }
  return NextResponse.json({ ok: true, body });
}
