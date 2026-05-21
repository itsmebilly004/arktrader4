import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;

  if (!token || !ref) {
    return NextResponse.json(
      { configured: false, error: "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set" },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { configured: true, error: `Supabase API ${res.status}: ${await res.text()}` },
        { status: 200 }
      );
    }
    const project = (await res.json()) as { status?: string; name?: string };
    return NextResponse.json({
      configured: true,
      status: project.status ?? "UNKNOWN",
      name: project.name ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
