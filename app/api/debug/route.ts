import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const results = await Promise.all(
      ["trades", "audit_log", "bots", "sessions", "deriv_accounts"].map(async (table) => {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        return { table, count, error: error?.message ?? null };
      })
    );

    return NextResponse.json({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKeyPrefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").slice(0, 20) + "...",
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
