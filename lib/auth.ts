// Edge-runtime-compatible auth helpers (Web Crypto, no Node-only APIs).

export const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 1 week

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSession(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const ts = Date.now().toString();
  const sig = await hmacHex(secret, ts);
  return `${ts}.${sig}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Date.now() - tsNum > SESSION_MAX_AGE_SECONDS * 1000) return false;
  const expected = await hmacHex(secret, ts);
  return constantTimeEqual(sig, expected);
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD is not set");
  return constantTimeEqual(password, expected);
}

export { SESSION_MAX_AGE_SECONDS };
