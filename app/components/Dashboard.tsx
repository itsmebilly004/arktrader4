"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountRef = {
  is_demo: boolean;
  currency: string | null;
  account_id: string;
};

// Supabase infers FK joins as arrays; we normalise to a single object at the call sites.
export type Trade = {
  id: string;
  symbol: string;
  trade_type: string;
  stake: number;
  payout: number | null;
  profit_loss: number | null;
  status: string;
  created_at: string;
  closed_at: string | null;
  deriv_accounts: AccountRef | AccountRef[] | null;
};

function accountRef(trade: Trade): AccountRef | null {
  if (!trade.deriv_accounts) return null;
  return Array.isArray(trade.deriv_accounts)
    ? trade.deriv_accounts[0] ?? null
    : trade.deriv_accounts;
}

type AuditEntry = {
  id: number;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Bot = {
  id: string;
  name: string;
  status: string;
  last_run_at: string | null;
};

type Session = {
  id: string;
  account_id: string;
  currency: string | null;
  balance: number | null;
  is_demo: boolean;
  is_active?: boolean;
  loginid: string | null;
};

type DerivAccount = {
  id: string;
  account_id: string;
  currency: string | null;
  is_demo: boolean;
  balance: number | null;
  balance_updated_at: string | null;
};

export type DailyVolume = {
  date: string;
  real: number;
  demo: number;
  realCount: number;
  demoCount: number;
};

interface DashboardProps {
  initialTrades: Trade[];
  initialAuditLog: AuditEntry[];
  initialBots: Bot[];
  initialSessions: Session[];
  initialAccounts: DerivAccount[];
  initialDailyVolume: DailyVolume[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeStats(trades: Trade[]) {
  const real = trades.filter((t) => { const a = accountRef(t); return a && !a.is_demo; });
  const demo = trades.filter((t) => accountRef(t)?.is_demo);
  const closed = trades.filter((t) => t.status === "won" || t.status === "lost");
  const won = trades.filter((t) => t.status === "won");
  return {
    totalTrades: trades.length,
    realCount: real.length,
    demoCount: demo.length,
    realVolume: real.reduce((s, t) => s + (t.stake ?? 0), 0),
    demoVolume: demo.reduce((s, t) => s + (t.stake ?? 0), 0),
    realPnl: real.reduce((s, t) => s + (t.profit_loss ?? 0), 0),
    demoPnl: demo.reduce((s, t) => s + (t.profit_loss ?? 0), 0),
    winRate: closed.length > 0 ? (won.length / closed.length) * 100 : 0,
  };
}

// Group trades into hourly buckets for the last 24 h
function buildHourlyBuckets(trades: Trade[]) {
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => {
    const start = now - (23 - i) * 3_600_000;
    const end = start + 3_600_000;
    const bucket = trades.filter((t) => {
      const ts = new Date(t.created_at).getTime();
      return ts >= start && ts < end;
    });
    return {
      label: new Date(start).getHours() + "h",
      real: bucket
        .filter((t) => { const a = accountRef(t); return a && !a.is_demo; })
        .reduce((s, t) => s + (t.stake ?? 0), 0),
      demo: bucket
        .filter((t) => accountRef(t)?.is_demo)
        .reduce((s, t) => s + (t.stake ?? 0), 0),
    };
  });
}

// ─── Small UI components ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "blue" | "red" | "yellow";
}) {
  const border = {
    green: "border-emerald-800/60",
    blue: "border-blue-800/60",
    red: "border-red-800/60",
    yellow: "border-yellow-800/60",
    undefined: "border-gray-800",
  }[accent ?? "undefined"];

  const valueColor = {
    green: "text-emerald-400",
    blue: "text-blue-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    undefined: "text-white",
  }[accent ?? "undefined"];

  return (
    <div className={`bg-gray-900 rounded-xl border ${border} p-4 sm:p-5`}>
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    won: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
    lost: "bg-red-900/60 text-red-300 border-red-700/50",
    pending: "bg-yellow-900/60 text-yellow-300 border-yellow-700/50",
    open: "bg-blue-900/60 text-blue-300 border-blue-700/50",
    error: "bg-red-900/60 text-red-300 border-red-700/50",
    running: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
    idle: "bg-gray-800 text-gray-400 border-gray-700",
    stopped: "bg-gray-800 text-gray-400 border-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        styles[status] ?? "bg-gray-800 text-gray-400 border-gray-700"
      }`}
    >
      {status}
    </span>
  );
}

function AccountTag({ isDemo }: { isDemo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isDemo
          ? "bg-blue-900/50 text-blue-300"
          : "bg-emerald-900/50 text-emerald-300"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isDemo ? "bg-blue-400" : "bg-emerald-400"}`}
      />
      {isDemo ? "Demo" : "Real"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="text-gray-500 text-sm">{message}</p>
      <p className="text-gray-700 text-xs mt-1">Updates will appear here in real time</p>
    </div>
  );
}

// ─── Trend chart (pure SVG, no dependencies) ──────────────────────────────────

function TrendChart({ trades }: { trades: Trade[] }) {
  const buckets = buildHourlyBuckets(trades);
  const maxVal = Math.max(...buckets.flatMap((b) => [b.real, b.demo]), 1);
  const W = 600;
  const H = 100;
  const padX = 4;
  const padY = 8;

  const toX = (i: number) => padX + (i / (buckets.length - 1)) * (W - padX * 2);
  const toY = (v: number) => H - padY - (v / maxVal) * (H - padY * 2);

  const realPoints = buckets.map((b, i) => `${toX(i)},${toY(b.real)}`).join(" ");
  const demoPoints = buckets.map((b, i) => `${toX(i)},${toY(b.demo)}`).join(" ");

  // Fill paths
  const realFill =
    `M${toX(0)},${H} ` +
    buckets.map((b, i) => `L${toX(i)},${toY(b.real)}`).join(" ") +
    ` L${toX(buckets.length - 1)},${H} Z`;
  const demoFill =
    `M${toX(0)},${H} ` +
    buckets.map((b, i) => `L${toX(i)},${toY(b.demo)}`).join(" ") +
    ` L${toX(buckets.length - 1)},${H} Z`;

  const hasData = buckets.some((b) => b.real > 0 || b.demo > 0);

  if (!hasData) {
    return (
      <div className="h-24 flex items-center justify-center text-gray-700 text-sm">
        No trade data in the last 24 hours
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={realFill} fill="url(#realGrad)" />
      <path d={demoFill} fill="url(#demoGrad)" />
      <polyline points={realPoints} fill="none" stroke="#10b981" strokeWidth="1.5" />
      <polyline points={demoPoints} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Volume bar ───────────────────────────────────────────────────────────────

function VolumeBar({
  realVolume,
  demoVolume,
}: {
  realVolume: number;
  demoVolume: number;
}) {
  const total = realVolume + demoVolume || 1;
  const realPct = (realVolume / total) * 100;
  const demoPct = (demoVolume / total) * 100;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Real
          </span>
          <span className="text-white font-semibold tabular-nums">${fmt(realVolume)}</span>
        </div>
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${realPct}%` }}
          />
        </div>
        <p className="text-gray-600 text-xs mt-0.5 text-right">{realPct.toFixed(1)}% of total</p>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-blue-400 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Demo
          </span>
          <span className="text-white font-semibold tabular-nums">${fmt(demoVolume)}</span>
        </div>
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${demoPct}%` }}
          />
        </div>
        <p className="text-gray-600 text-xs mt-0.5 text-right">{demoPct.toFixed(1)}% of total</p>
      </div>
    </div>
  );
}

// ─── Daily volume chart (stacked bars: real + demo) ───────────────────────────

function DailyVolumeChart({ data }: { data: DailyVolume[] }) {
  const W = 800;
  const H = 180;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(...data.map((d) => d.real + d.demo), 1);
  const barW = innerW / data.length;
  const gap = Math.min(4, barW * 0.2);

  const hasData = data.some((d) => d.real + d.demo > 0);

  if (!hasData) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-700 text-sm">
        No daily volume yet. (Real/demo classification requires populated{" "}
        <code className="text-gray-500">deriv_accounts</code> rows.)
      </div>
    );
  }

  const yTicks = [0, 0.5, 1].map((t) => ({
    v: maxVal * t,
    y: padT + innerH - t * innerH,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      {yTicks.map((t) => (
        <g key={t.y}>
          <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#1f2937" strokeWidth="1" />
          <text x={padL - 4} y={t.y + 3} fontSize="9" textAnchor="end" fill="#4b5563">
            ${Math.round(t.v).toLocaleString()}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * barW + gap / 2;
        const w = barW - gap;
        const realH = (d.real / maxVal) * innerH;
        const demoH = (d.demo / maxVal) * innerH;
        const realY = padT + innerH - realH;
        const demoY = realY - demoH;
        const label = d.date.slice(5);
        return (
          <g key={d.date}>
            {d.real > 0 && <rect x={x} y={realY} width={w} height={realH} fill="#10b981" rx="1" />}
            {d.demo > 0 && <rect x={x} y={demoY} width={w} height={demoH} fill="#3b82f6" rx="1" />}
            <text
              x={x + w / 2}
              y={H - padB + 12}
              fontSize="9"
              textAnchor="middle"
              fill="#4b5563"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Admin actions (logout, pause, resume) ────────────────────────────────────

function AdminActions() {
  const [busy, setBusy] = useState<null | "pause" | "restore" | "logout">(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(path: string, action: "pause" | "restore" | "logout", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`✗ ${body.error || `HTTP ${res.status}`}`);
      } else {
        if (action === "logout") {
          window.location.href = "/login";
          return;
        }
        setMsg(`✓ ${action === "pause" ? "Pause" : "Restore"} request sent`);
      }
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      if (action !== "logout") setTimeout(() => setMsg(null), 6000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span
          className={`text-xs hidden md:inline ${
            msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {msg}
        </span>
      )}
      <button
        onClick={() =>
          call("/api/supabase/pause", "pause", "Pause the Supabase project? The dashboard will stop loading data until you resume.")
        }
        disabled={busy !== null}
        className="text-xs px-3 py-1.5 rounded-lg border border-yellow-800/60 text-yellow-300 hover:bg-yellow-900/30 disabled:opacity-50"
      >
        {busy === "pause" ? "…" : "Pause"}
      </button>
      <button
        onClick={() => call("/api/supabase/restore", "restore", "Resume the Supabase project?")}
        disabled={busy !== null}
        className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
      >
        {busy === "restore" ? "…" : "Resume"}
      </button>
      <button
        onClick={() => call("/api/auth/logout", "logout")}
        disabled={busy !== null}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
      >
        Logout
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard({
  initialTrades,
  initialAuditLog,
  initialBots,
  initialSessions,
  initialAccounts,
  initialDailyVolume,
}: DashboardProps) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(initialAuditLog);
  const [bots, setBots] = useState<Bot[]>(initialBots);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [accounts, setAccounts] = useState<DerivAccount[]>(initialAccounts);
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>(initialDailyVolume);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [pulseAccountId, setPulseAccountId] = useState<string | null>(null);

  const touch = useCallback(() => setLastUpdate(new Date()), []);

  useEffect(() => {
    const supabase = createClient();

    type RTPayload<T = Record<string, unknown>> = {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: T;
      old: T;
      table: string;
    };

    const channel = supabase
      .channel("dashboard-rt")
      // ── TRADES ──
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        async (payload: RTPayload) => {
          touch();
          const { data } = await supabase
            .from("trades")
            .select(
              "id, symbol, trade_type, stake, payout, profit_loss, status, created_at, closed_at, deriv_accounts(is_demo, currency, account_id)"
            )
            .eq("id", payload.new.id as string)
            .single();
          if (!data) return;
          const trade = data as unknown as Trade;
          setPulseId(trade.id);
          setTimeout(() => setPulseId(null), 2000);
          setTrades((prev) => [trade, ...prev.slice(0, 49)]);

          // Update today's daily-volume bucket
          const ref = accountRef(trade);
          if (ref) {
            const today = new Date().toISOString().slice(0, 10);
            const stake = trade.stake ?? 0;
            setDailyVolume((prev) =>
              prev.map((d) =>
                d.date === today
                  ? {
                      ...d,
                      real: ref.is_demo ? d.real : d.real + stake,
                      demo: ref.is_demo ? d.demo + stake : d.demo,
                      realCount: ref.is_demo ? d.realCount : d.realCount + 1,
                      demoCount: ref.is_demo ? d.demoCount + 1 : d.demoCount,
                    }
                  : d
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trades" },
        (payload: RTPayload) => {
          touch();
          setTrades((prev) =>
            prev.map((t) =>
              t.id === payload.new.id ? { ...t, ...(payload.new as Partial<Trade>) } : t
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "trades" },
        (payload: RTPayload) => {
          touch();
          setTrades((prev) => prev.filter((t) => t.id !== (payload.old.id as string)));
        }
      )
      // ── DERIV ACCOUNTS (balances) ──
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deriv_accounts" },
        (payload: RTPayload<DerivAccount>) => {
          touch();
          if (payload.eventType === "INSERT") {
            setAccounts((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setPulseAccountId(payload.new.id);
            setTimeout(() => setPulseAccountId(null), 2000);
            setAccounts((prev) =>
              prev.map((a) => (a.id === payload.new.id ? { ...a, ...payload.new } : a))
            );
          } else if (payload.eventType === "DELETE") {
            setAccounts((prev) => prev.filter((a) => a.id !== payload.old.id));
          }
        }
      )
      // ── SESSIONS ──
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        (payload: RTPayload<Session>) => {
          touch();
          if (payload.eventType === "INSERT") {
            if (payload.new.is_active) setSessions((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setSessions((prev) => {
              if (payload.new.is_active === false) {
                return prev.filter((s) => s.id !== payload.new.id);
              }
              const exists = prev.some((s) => s.id === payload.new.id);
              return exists
                ? prev.map((s) => (s.id === payload.new.id ? { ...s, ...payload.new } : s))
                : [payload.new, ...prev];
            });
          } else if (payload.eventType === "DELETE") {
            setSessions((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      // ── BOTS ──
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bots" },
        (payload: RTPayload<Bot>) => {
          touch();
          if (payload.eventType === "INSERT") {
            setBots((prev) => [payload.new, ...prev.slice(0, 9)]);
          } else if (payload.eventType === "UPDATE") {
            setBots((prev) =>
              prev.map((b) => (b.id === payload.new.id ? { ...b, ...payload.new } : b))
            );
          } else if (payload.eventType === "DELETE") {
            setBots((prev) => prev.filter((b) => b.id !== payload.old.id));
          }
        }
      )
      // ── AUDIT LOG ──
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload: RTPayload<AuditEntry>) => {
          touch();
          setAuditLog((prev) => [payload.new, ...prev.slice(0, 29)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [touch]);

  const stats = computeStats(trades);
  const runningBots = bots.filter((b) => b.status === "running").length;
  const realAccounts = accounts.filter((a) => !a.is_demo);
  const demoAccounts = accounts.filter((a) => a.is_demo);
  const realBalance = realAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const demoBalance = accounts
    .filter((a) => a.is_demo)
    .reduce((s, a) => s + (a.balance ?? 0), 0);

  return (
    <div className="min-h-screen text-gray-100 font-[family-name:var(--font-geist-sans)]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-black text-sm select-none">
              A
            </div>
            <span className="text-white font-bold text-lg tracking-tight">ArkTrader</span>
            <span className="text-gray-600 text-sm hidden sm:block">/ Activity Dashboard</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            <span className="text-gray-600 hidden sm:block">
              Updated {timeAgo(lastUpdate.toISOString())}
            </span>
            <AdminActions />
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <StatCard label="Total Trades" value={stats.totalTrades.toString()} sub="all time" />
          <StatCard
            label="Real Volume"
            value={`$${fmt(stats.realVolume)}`}
            sub={`${stats.realCount} trades`}
            accent="green"
          />
          <StatCard
            label="Demo Volume"
            value={`$${fmt(stats.demoVolume)}`}
            sub={`${stats.demoCount} trades`}
            accent="blue"
          />
          <StatCard
            label="Real P&L"
            value={`${stats.realPnl >= 0 ? "+" : ""}$${fmt(stats.realPnl)}`}
            sub={`Balance: $${fmt(realBalance)}`}
            accent={stats.realPnl >= 0 ? "green" : "red"}
          />
          <StatCard
            label="Demo P&L"
            value={`${stats.demoPnl >= 0 ? "+" : ""}$${fmt(stats.demoPnl)}`}
            sub={`Balance: $${fmt(demoBalance)}`}
            accent={stats.demoPnl >= 0 ? "green" : "red"}
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            sub={`${runningBots} bot${runningBots !== 1 ? "s" : ""} running`}
            accent={stats.winRate >= 50 ? "green" : stats.winRate > 0 ? "yellow" : undefined}
          />
        </div>

        {/* ── Volume + Trend ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Trade Volume · Real vs Demo
            </h2>
            <VolumeBar realVolume={stats.realVolume} demoVolume={stats.demoVolume} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-emerald-400 text-xs font-medium">Real P&L</p>
                <p
                  className={`text-xl font-bold mt-0.5 tabular-nums ${
                    stats.realPnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {stats.realPnl >= 0 ? "+" : ""}${fmt(stats.realPnl)}
                </p>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3">
                <p className="text-blue-400 text-xs font-medium">Demo P&L</p>
                <p
                  className={`text-xl font-bold mt-0.5 tabular-nums ${
                    stats.demoPnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {stats.demoPnl >= 0 ? "+" : ""}${fmt(stats.demoPnl)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Volume Trend · Last 24 h
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-emerald-500 rounded" /> Real
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-500 rounded" /> Demo
                </span>
              </div>
            </div>
            <TrendChart trades={trades} />
          </div>
        </div>

        {/* ── Daily volume (last 14 days) ── */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Daily Trade Volume · Last 14 Days · Real vs Demo
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Real
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Demo
              </span>
            </div>
          </div>
          <DailyVolumeChart data={dailyVolume} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-gray-500">Real volume (14d)</p>
              <p className="text-emerald-400 font-semibold text-base mt-0.5 tabular-nums">
                ${fmt(dailyVolume.reduce((s, d) => s + d.real, 0))}
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-gray-500">Demo volume (14d)</p>
              <p className="text-blue-400 font-semibold text-base mt-0.5 tabular-nums">
                ${fmt(dailyVolume.reduce((s, d) => s + d.demo, 0))}
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-gray-500">Real trades (14d)</p>
              <p className="text-white font-semibold text-base mt-0.5 tabular-nums">
                {dailyVolume.reduce((s, d) => s + d.realCount, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-gray-500">Demo trades (14d)</p>
              <p className="text-white font-semibold text-base mt-0.5 tabular-nums">
                {dailyVolume.reduce((s, d) => s + d.demoCount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">

          {/* Left 2/3: Trades table */}
          <div className="xl:col-span-2">
            <div className="bg-gray-900 rounded-xl border border-gray-800 h-full">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recent Trades
                </h2>
                <span className="text-gray-600 text-xs">{trades.length} records</span>
              </div>

              {trades.length === 0 ? (
                <EmptyState message="No trades recorded yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-600 text-xs border-b border-gray-800 bg-gray-900/50">
                        <th className="text-left px-5 py-3 font-medium">Symbol</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-right px-4 py-3 font-medium">Stake</th>
                        <th className="text-right px-4 py-3 font-medium">Payout</th>
                        <th className="text-right px-4 py-3 font-medium">P&L</th>
                        <th className="text-center px-4 py-3 font-medium">Account</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                        <th className="text-right px-5 py-3 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {trades.map((trade) => (
                        <tr
                          key={trade.id}
                          className={`transition-colors hover:bg-gray-800/40 ${
                            pulseId === trade.id ? "bg-emerald-900/20" : ""
                          }`}
                        >
                          <td className="px-5 py-3 font-mono text-white font-semibold text-xs">
                            {trade.symbol}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{trade.trade_type}</td>
                          <td className="px-4 py-3 text-right text-white tabular-nums text-xs">
                            ${fmt(trade.stake ?? 0)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                            {trade.payout != null ? `$${fmt(trade.payout)}` : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold tabular-nums text-xs ${
                              (trade.profit_loss ?? 0) > 0
                                ? "text-emerald-400"
                                : (trade.profit_loss ?? 0) < 0
                                ? "text-red-400"
                                : "text-gray-600"
                            }`}
                          >
                            {trade.profit_loss != null
                              ? `${trade.profit_loss >= 0 ? "+" : ""}$${fmt(trade.profit_loss)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {accountRef(trade) ? (
                              <AccountTag isDemo={accountRef(trade)!.is_demo} />
                            ) : (
                              <span className="text-gray-700 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={trade.status} />
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600 text-xs tabular-nums">
                            {timeAgo(trade.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right 1/3: Activity + Bots + Sessions */}
          <div className="space-y-4 sm:space-y-6">

            {/* Accounts */}
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Linked Accounts
                </h2>
              </div>
              {accounts.length === 0 ? (
                <EmptyState message="No accounts linked" />
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className={`px-5 py-3 flex items-center justify-between gap-3 transition-colors ${
                        pulseAccountId === acc.id ? "bg-emerald-900/30" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <AccountTag isDemo={acc.is_demo} />
                          <span className="text-white text-xs font-mono truncate">
                            {acc.account_id}
                          </span>
                        </div>
                        {acc.balance_updated_at && (
                          <p className="text-gray-600 text-xs mt-0.5">
                            updated {timeAgo(acc.balance_updated_at)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-semibold text-sm tabular-nums">
                          {acc.balance != null
                            ? `${acc.currency ?? ""} ${fmt(acc.balance)}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Sessions */}
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Active Sessions
                </h2>
                {sessions.length > 0 && (
                  <span className="bg-emerald-900/50 text-emerald-300 text-xs px-2 py-0.5 rounded-full">
                    {sessions.length} online
                  </span>
                )}
              </div>
              {sessions.length === 0 ? (
                <EmptyState message="No active sessions" />
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {sessions.map((s) => (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-white text-xs font-mono truncate">
                            {s.loginid ?? s.account_id}
                          </p>
                          <p className="text-gray-600 text-xs">
                            {s.is_demo ? "Demo" : "Real"} · {s.currency}
                          </p>
                        </div>
                      </div>
                      <p className="text-white text-sm tabular-nums shrink-0">
                        {s.balance != null
                          ? `${s.currency ?? ""} ${fmt(s.balance)}`
                          : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bots */}
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bots</h2>
                {runningBots > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {runningBots} running
                  </span>
                )}
              </div>
              {bots.length === 0 ? (
                <EmptyState message="No bots configured" />
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {bots.map((bot) => (
                    <div
                      key={bot.id}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{bot.name}</p>
                        <p className="text-gray-600 text-xs mt-0.5">
                          {bot.last_run_at
                            ? `Last run ${timeAgo(bot.last_run_at)}`
                            : "Never run"}
                        </p>
                      </div>
                      <StatusBadge status={bot.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Feed */}
            <div className="bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Activity Log
                </h2>
                <span className="flex items-center gap-1 text-emerald-500 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              {auditLog.length === 0 ? (
                <EmptyState message="No activity yet" />
              ) : (
                <div className="divide-y divide-gray-800/60 max-h-72 overflow-y-auto">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-gray-200 text-sm font-medium leading-snug">
                          {entry.action}
                        </p>
                        <span className="text-gray-600 text-xs whitespace-nowrap shrink-0">
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <p className="text-gray-600 text-xs mt-0.5 font-mono truncate">
                          {JSON.stringify(entry.metadata)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
