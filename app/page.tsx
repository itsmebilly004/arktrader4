import { createAdminClient } from "@/utils/supabase/server";
import Dashboard, { type Trade } from "@/app/components/Dashboard";

export const revalidate = 0;


export default async function Page() {
  const supabase = createAdminClient();

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

  // Log errors server-side so they appear in Vercel function logs.
  const errors = { tradesErr, auditErr, botsErr, sessionsErr, accountsErr };
  for (const [key, err] of Object.entries(errors)) {
    if (err) console.error(`[page] Supabase query error (${key}):`, err.message);
  }

  return (
    <Dashboard
      initialTrades={(trades ?? []) as unknown as Trade[]}
      initialAuditLog={auditLog ?? []}
      initialBots={bots ?? []}
      initialSessions={sessions ?? []}
      initialAccounts={accounts ?? []}
    />
  );
}
