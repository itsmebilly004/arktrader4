import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [trades, auditLog, bots, sessions, accounts] = await Promise.all([
      supabase.from("trades").select("id", { count: "exact", head: false }).limit(1),
      supabase.from("audit_log").select("id", { count: "exact", head: false }).limit(1),
      supabase.from("bots").select("id", { count: "exact", head: false }).limit(1),
      supabase.from("sessions").select("id", { count: "exact", head: false }).limit(1),
      supabase.from("deriv_accounts").select("id", { count: "exact", head: false }).limit(1),
    ]);

    return NextResponse.json({
      env: {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasPublishableKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      },
      tables: {
        trades: { count: trades.count, error: trades.error?.message },
        audit_log: { count: auditLog.count, error: auditLog.error?.message },
        bots: { count: bots.count, error: bots.error?.message },
        sessions: { count: sessions.count, error: sessions.error?.message },
        deriv_accounts: { count: accounts.count, error: accounts.error?.message },
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
