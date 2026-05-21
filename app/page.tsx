import { createClient } from "@/utils/supabase/server";
import Dashboard, { type Trade } from "@/app/components/Dashboard";

export const revalidate = 0;

export default async function Page() {
  try {
    const supabase = await createClient();

    const [
      { data: trades, error: tradesErr },
      { data: auditLog, error: auditErr },
      { data: bots, error: botsErr },
      { data: sessions, error: sessionsErr },
      { data: accounts, error: accountsErr },
    ] = await Promise.all([
      supabase
        .from("trades")
        .select(
          "id, symbol, trade_type, stake, payout, profit_loss, status, created_at, closed_at, deriv_accounts(is_demo, currency, account_id)"
        )
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("audit_log")
        .select("id, action, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(30),

      supabase
        .from("bots")
        .select("id, name, status, last_run_at")
        .order("updated_at", { ascending: false })
        .limit(10),

      supabase
        .from("sessions")
        .select("id, account_id, currency, balance, is_demo, is_active, loginid")
        .eq("is_active", true),

      supabase
        .from("deriv_accounts")
        .select("id, account_id, currency, is_demo, balance, balance_updated_at")
        .order("created_at", { ascending: false }),
    ]);

    const errors = [
      tradesErr?.message,
      auditErr?.message,
      botsErr?.message,
      sessionsErr?.message,
      accountsErr?.message,
    ].filter(Boolean) as string[];

    const uniqueErrors = [...new Set(errors)];

    return (
      <>
        {uniqueErrors.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-950 border border-red-700 rounded-xl p-4 text-xs font-mono shadow-2xl">
            <p className="text-red-400 font-bold mb-1">Supabase error</p>
            {uniqueErrors.map((e) => (
              <p key={e} className="text-red-300">• {e}</p>
            ))}
          </div>
        )}
        <Dashboard
          initialTrades={(trades ?? []) as unknown as Trade[]}
          initialAuditLog={auditLog ?? []}
          initialBots={bots ?? []}
          initialSessions={sessions ?? []}
          initialAccounts={accounts ?? []}
        />
      </>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
        <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xl w-full font-mono text-sm space-y-3">
          <p className="text-red-400 font-bold text-base">Server error — page failed to load</p>
          <p className="text-gray-300 break-all">{msg}</p>
          <div className="text-gray-500 text-xs space-y-1 pt-2 border-t border-gray-800">
            <p>SUPABASE_URL set: {process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓" : "✗ MISSING"}</p>
            <p>SUPABASE_ANON_KEY set: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✓" : "✗ MISSING"}</p>
          </div>
        </div>
      </div>
    );
  }
}
