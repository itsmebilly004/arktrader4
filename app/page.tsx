import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Dashboard, { type Trade } from "@/app/components/Dashboard";

export const revalidate = 0;

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { data: trades },
    { data: auditLog },
    { data: bots },
    { data: sessions },
    { data: accounts },
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
