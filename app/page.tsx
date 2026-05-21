import { createClient } from "@/utils/supabase/server";
import Dashboard, { type Trade, type DailyVolume } from "@/app/components/Dashboard";


export const revalidate = 0;

export default async function Page() {
  try {
    const supabase = await createClient();

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: trades, error: tradesErr },
      { data: auditLog, error: auditErr },
      { data: bots, error: botsErr },
      { data: sessions, error: sessionsErr },
      { data: accounts, error: accountsErr },
      { data: dailyTrades, error: dailyErr },
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

      supabase
        .from("trades")
        .select("created_at, stake, deriv_accounts(is_demo)")
        .gte("created_at", fourteenDaysAgo)
        .limit(50000),
    ]);

    const dailyVolume = aggregateDaily(dailyTrades ?? []);

    const errors = [
      tradesErr?.message,
      auditErr?.message,
      botsErr?.message,
      sessionsErr?.message,
      accountsErr?.message,
      dailyErr?.message,
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
          initialDailyVolume={dailyVolume}
        />
      </>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
        <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xl w-full font-mono text-sm space-y-3">
          <p className="text-red-400 font-bold text-base">Server error</p>
          <p className="text-gray-300 break-all">{msg}</p>
        </div>
      </div>
    );
  }
}

type RawDailyTrade = {
  created_at: string;
  stake: number | null;
  deriv_accounts: { is_demo: boolean } | { is_demo: boolean }[] | null;
};

function aggregateDaily(rows: RawDailyTrade[]): DailyVolume[] {
  const buckets = new Map<string, { real: number; demo: number; realCount: number; demoCount: number }>();

  // Seed last 14 days so empty days still render
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { real: 0, demo: 0, realCount: 0, demoCount: 0 });
  }

  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    const ref = Array.isArray(row.deriv_accounts) ? row.deriv_accounts[0] : row.deriv_accounts;
    const stake = row.stake ?? 0;
    if (ref?.is_demo === false) {
      bucket.real += stake;
      bucket.realCount += 1;
    } else if (ref?.is_demo === true) {
      bucket.demo += stake;
      bucket.demoCount += 1;
    }
  }

  return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
}
