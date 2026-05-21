import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  // Raw fetch test — bypasses the Supabase SDK entirely
  let rawFetchResult: unknown = null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/trades?select=count`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
    });
    rawFetchResult = {
      status: res.status,
      body: await res.text(),
    };
  } catch (e) {
    rawFetchResult = { fetchError: String(e) };
  }

  // SDK test
  let sdkResult: unknown = null;
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true });
    sdkResult = { count, error: error?.message };
  } catch (e) {
    sdkResult = { thrown: String(e) };
  }

  return NextResponse.json({
    env: {
      url: supabaseUrl ? supabaseUrl.slice(0, 40) : "NOT SET",
      serviceKeyPrefix: serviceRoleKey ? serviceRoleKey.slice(0, 12) + "..." : "NOT SET",
      publishableKeyPrefix: publishableKey ? publishableKey.slice(0, 12) + "..." : "NOT SET",
    },
    rawFetch: rawFetchResult,
    sdk: sdkResult,
  });
}
