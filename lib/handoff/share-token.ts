import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * NEXVORA Handoff — Stateless Share Token (HMAC).
 *
 * We sign `${projectId}.${packageId}` with a server secret so the resulting
 * URL is a self-verifying capability: no DB migration, no per-token row.
 * The share page is Read-Only over an immutable/finalized package snapshot.
 *
 * Secret lookup order (any one is fine):
 *   HANDOFF_SHARE_SECRET → SUPABASE_JWT_SECRET → NEXTAUTH_SECRET
 *   → SUPABASE_SERVICE_ROLE_KEY (fallback so prod always has a secret)
 */
function shareSecret(): string {
  const s =
    process.env.HANDOFF_SHARE_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) throw new Error("لا يوجد سر موقّع لروابط المشاركة (HANDOFF_SHARE_SECRET).");
  return s;
}

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signHandoffShareToken(projectId: string, packageId: string): string {
  const payload = `${projectId}.${packageId}`;
  const sig = createHmac("sha256", shareSecret()).update(payload).digest();
  return `${b64urlEncode(payload)}.${b64urlEncode(sig)}`;
}

export function verifyHandoffShareToken(
  token: string,
): { projectId: string; packageId: string } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let payload: string;
  let sig: Buffer;
  try {
    payload = b64urlDecode(payloadB64).toString("utf8");
    sig = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  const expected = createHmac("sha256", shareSecret()).update(payload).digest();
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(sig, expected)) return null;
  } catch {
    return null;
  }
  const [projectId, packageId] = payload.split(".");
  if (!projectId || !packageId) return null;
  return { projectId, packageId };
}

export function buildHandoffShareUrl(origin: string, token: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/handoff-share/${token}`;
}
