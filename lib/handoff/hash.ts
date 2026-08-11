/**
 * NEXVORA Handoff — Canonical hashing utilities (0111 hardening)
 * ================================================================
 * Deterministic SHA-256 based hashing for handoff source identity.
 * Returns 32-char hex (128-bit prefix — collision-resistant for our scale).
 * Same content → same hash always, regardless of key order for objects
 * or insertion order for lists.
 */
import { createHash } from "node:crypto";

export function createSourceHash(
  input: string | readonly string[] | Record<string, unknown>,
): string {
  let normalized: string;
  if (typeof input === "string") {
    normalized = input.trim();
  } else if (Array.isArray(input)) {
    normalized = [...input].sort().join("|");
  } else {
    // Object: sort keys deterministically before stringifying
    normalized = JSON.stringify(sortKeys(input as Record<string, unknown>));
  }
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = sortKeys(obj[k]);
    return acc;
  }, {} as Record<string, unknown>);
}

/** For list-based sources: hashes sorted "id:updatedAt" pairs. */
export function hashSourceList(
  entries: readonly { id: string; updatedAt: string }[],
): string {
  const pairs = entries.map((e) => `${e.id}:${e.updatedAt}`);
  return createSourceHash(pairs);
}
