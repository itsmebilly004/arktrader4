import { createAdminClient } from "@/utils/supabase/server";
import Dashboard, { type Trade } from "@/app/components/Dashboard";

export const revalidate = 0;

export default async function Page() {
  let supabase: ReturnType<typeof createAdminClient>;

  try {
    supabase = createAdminClient();
  } catch (err) {
    return <DebugError title="Supabase client failed to initialise" message={String(err)} />;
  }

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
    tradesErr && `trades: ${tradesErr.message} (code: ${tradesErr.code})`,
    auditErr && `audit_log: ${auditErr.message} (code: ${auditErr.code})`,
    botsErr && `bots: ${botsErr.message} (code: ${botsErr.code})`,
    sessionsErr && `sessions: ${sessionsErr.message} (code: ${sessionsErr.code})`,
    accountsErr && `deriv_accounts: ${accountsErr.message} (code: ${accountsErr.code})`,
  ].filter(Boolean) as string[];

  const counts = {
    trades: trades?.length ?? 0,
    audit_log: auditLog?.length ?? 0,
    bots: bots?.length ?? 0,
    sessions: sessions?.length ?? 0,
    deriv_accounts: accounts?.length ?? 0,
  };

  const allEmpty = Object.values(counts).every((c) => c === 0);

  return (
    <>
      {(errors.length > 0 || allEmpty) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-lg bg-gray-900 border border-red-700 rounded-xl p-4 text-xs font-mono shadow-2xl">
          <p className="text-red-400 font-bold mb-2">⚠ Debug — data is empty</p>
          <p className="text-gray-400 mb-2">
            Env vars present:{" "}
            <span className="text-white">
              URL={process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓" : "✗"}{" "}
              SERVICE_ROLE={process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗"}
            </span>
          </p>
          <p className="text-gray-400 mb-1">Row counts: {JSON.stringify(counts)}</p>
          {errors.length > 0 && (
            <ul className="text-red-300 mt-2 space-y-1">
              {errors.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
          <p className="text-gray-600 mt-2 text-[10px]">Remove this panel once data appears.</p>
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
}

function DebugError({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xl w-full font-mono text-sm">
        <p className="text-red-400 font-bold mb-3">⚠ {title}</p>
        <pre className="text-gray-300 whitespace-pre-wrap break-all">{message}</pre>
      </div>
    </div>
  );
}
