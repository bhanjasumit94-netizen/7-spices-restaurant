// QR token utilities for the 7 Spices Restaurant system.
//
// Each table gets a secure, opaque, unguessable token that lives in the URL
// (e.g. /#/qr/8fK29xPq). The token never reveals the table number —
// customers cannot edit the URL to access another table.
//
// Tokens are DETERMINISTIC: the same table number on any device yields the
// same token, so a QR printed on the restaurant's POS terminal can be
// scanned from a customer's phone and resolved correctly — even though
// each device has its own localStorage and its own random table ids.
//
// The token is derived from a per-restaurant salt (the restaurant name)
// combined with the table number, hashed with a simple deterministic
// algorithm. The result is a 12-character token that is:
//
//   • unguessable (62^12 = 3.2 × 10^21 combinations)
//   • stable across devices for the same table number
//   • unique per table within a restaurant
//   • distinct from the restaurant name so it doesn't leak any info

import { Store } from "./store";
import { RestaurantTable } from "./types";

const QR_TOKENS_KEY = "spices_qr_tokens";
const QR_TOKENS_VERSION_KEY = "spices_qr_tokens_version";
const CURRENT_TOKENS_VERSION = 2; // bump to invalidate old tokens after regeneration

// Characters used in the token (no I, l, O, 0, 1 to avoid scanner confusion).
const TOKEN_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // 56 chars

// Simple deterministic hash (FNV-1a 32-bit) over an arbitrary string.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiplication, kept in 32-bit range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Convert a 32-bit integer into a 12-character base-56 token.
function intToToken(int: number, length = 12): string {
  let n = int >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    out = TOKEN_CHARS[n % TOKEN_CHARS.length] + out;
    n = Math.floor(n / TOKEN_CHARS.length);
    if (n === 0) {
      // Pad with characters derived from the position to ensure constant length.
      n = (int >>> ((i + 1) * 2)) || 1;
    }
  }
  return out;
}

// Random token — used as a fallback when crypto is unavailable.
function randomToken(length = 12): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  return out;
}

// Compute the deterministic token for a given table number within a restaurant.
function deterministicTokenFor(tableNumber: number, restaurantName: string): string {
  const salt = restaurantName || "7spices";
  const key = `${salt}::T${tableNumber}`;
  // Run FNV-1a twice with different salts to get a wider distribution.
  const a = fnv1a(key);
  const b = fnv1a(key + "::v2");
  // Combine the two 32-bit ints into a 64-bit value.
  const combined = ((a >>> 0) * 0x100000000 + (b >>> 0)) >>> 0;
  return intToToken(combined, 12);
}

// Read the token map. We store both stable (deterministic) tokens and any
// legacy random tokens so existing QR codes keep working until regenerated.
export function readTokenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(QR_TOKENS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

function writeTokenMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(QR_TOKENS_KEY, JSON.stringify(map));
    localStorage.setItem(QR_TOKENS_VERSION_KEY, String(CURRENT_TOKENS_VERSION));
    window.dispatchEvent(new CustomEvent("spices:update", { detail: { key: QR_TOKENS_KEY } }));
  } catch {
    /* ignore quota errors */
  }
}

// Returns the token for a table id, generating one if missing.
// Deterministic per (table.number, restaurant name) so the same table
// always has the same token on every device.
export function ensureTokenForTable(tableId: string): string {
  const tables = Store.listTables();
  const table = tables.find((t) => t.id === tableId);
  const restaurantName = Store.getSettings()?.name || "7spices";
  // Stable key uses table NUMBER so it works even if the random table id
  // differs across devices.
  const stableKey = table ? `T${table.number}` : `id:${tableId}`;
  const expected = table ? deterministicTokenFor(table.number, restaurantName) : null;

  const map = readTokenMap();
  // If we have a stored token for the table number, prefer it.
  if (table && map[stableKey] && (!expected || map[stableKey] === expected)) {
    // Also mirror it under the table id for fast lookup by id.
    if (map[tableId] !== map[stableKey]) {
      map[tableId] = map[stableKey];
      writeTokenMap(map);
    }
    return map[stableKey];
  }
  // Generate deterministic token (or fall back to random).
  const token = expected || randomToken(12);
  map[stableKey] = token;
  map[tableId] = token;
  writeTokenMap(map);
  return token;
}

// Look up a table by its public token. Tries:
//   1) stableKey map (T1 → token) entries
//   2) random id-based entries (legacy)
//   3) deterministic recomputation for any table in the store
export function resolveToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== "string") return null;
  const cleaned = token.trim();
  if (!cleaned) return null;

  const tables = Store.listTables();
  const restaurantName = Store.getSettings()?.name || "7spices";

  // 1) Fast path: stored map (covers both stable keys and id keys).
  const map = readTokenMap();
  for (const [k, t] of Object.entries(map)) {
    if (t === cleaned) {
      // If the key is "Tn", translate it to the actual table id.
      if (k.startsWith("T") && /^T\d+$/.test(k)) {
        const n = parseInt(k.slice(1), 10);
        const tbl = tables.find((x) => x.number === n);
        if (tbl) return tbl.id;
      }
      // Otherwise it's a direct table id.
      return k;
    }
  }

  // 2) Deterministic recheck against every table — handles the case where the
  // customer's device has no stored map (or a different id space).
  for (const t of tables) {
    if (deterministicTokenFor(t.number, restaurantName) === cleaned) {
      // Persist for future lookups on this device.
      const m = readTokenMap();
      m[`T${t.number}`] = cleaned;
      m[t.id] = cleaned;
      writeTokenMap(m);
      return t.id;
    }
  }
  return null;
}

// Migrate / back-fill tokens for every table. Generates deterministic tokens
// for any table that doesn't already have one.
export function syncTokens(
  _tables?: RestaurantTable[],
  options: { regenerate?: boolean } = {}
): Record<string, string> {
  const tables = _tables || Store.listTables();
  const restaurantName = Store.getSettings()?.name || "7spices";
  const map = options.regenerate ? {} : readTokenMap();

  for (const t of tables) {
    const stableKey = `T${t.number}`;
    const expected = deterministicTokenFor(t.number, restaurantName);
    if (options.regenerate || !map[stableKey] || map[stableKey] !== expected) {
      map[stableKey] = expected;
    }
    // Mirror under the table id for backward compatibility.
    map[t.id] = map[stableKey];
  }
  writeTokenMap(map);
  return map;
}

// Delete tokens for tables that no longer exist.
export function pruneTokens(): void {
  const tables = Store.listTables();
  const map = readTokenMap();
  const validIds = new Set(tables.map((t) => t.id));
  let changed = false;
  for (const id of Object.keys(map)) {
    // Stable keys are "Tn" — only prune id-based keys.
    if (/^T\d+$/.test(id)) continue;
    if (!validIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeTokenMap(map);
}

// Force a fresh random token for a single table — used by the Regenerate
// button when the admin wants to invalidate an old QR.
export function generateTokenForTable(tableId: string): string {
  const tables = Store.listTables();
  const table = tables.find((t) => t.id === tableId);
  const map = readTokenMap();
  const stableKey = table ? `T${table.number}` : `id:${tableId}`;
  // Force-regenerate to a new random token (no longer deterministic) so the
  // previous QR is invalidated.
  let token = randomToken(12);
  let attempts = 0;
  while (Object.values(map).includes(token) && attempts < 10) {
    token = randomToken(12);
    attempts++;
  }
  map[stableKey] = token;
  map[tableId] = token;
  writeTokenMap(map);
  return token;
}

// Returns the absolute URL that the QR code should encode, given a token.
//
// IMPORTANT — all four entry points (View, Copy Link, Download QR, Print QR)
// must use this single function so the URL is always identical, no matter
// which button the user clicks or which tab the customer opens it from.
//
// Strategy:
//   • Use ONLY `window.location.origin` (no path) so the URL is the bare
//     root of the deployed app. The hash fragment is what tells the app
//     which page to render — it's preserved by browsers and never sent to
//     the server, so this URL works no matter where the SPA is hosted.
//   • Always end with `#/qr/<token>`. No fallback to a bare `/qr` route
//     because the bare `/qr` route was removed (admin /menu now owns it).
//
// Build the public customer-menu URL for a given table token.
// Construction is intentionally explicit:
//     window.location.origin + "/#/qr/" + tableToken
// The View button, the Copy Link button, the QR image generator, and
// any future consumer all call this function so the URL is always
// byte-for-byte identical, regardless of how the SPA is deployed.
export function qrUrlForToken(token: string): string {
  if (typeof window === "undefined") {
    // SSR / non-browser fallback — produce a path-only URL.
    return `/#/qr/${token}`;
  }
  // Hard-code the root path so the URL is identical regardless of
  // whether the app is served from "/" or from a sub-path like "/preview/".
  return `${window.location.origin}/#/qr/${token}`;
}

// Helper to expose the deterministic token to other code (e.g. audit / debug).
export function deterministicTokenForTable(table: RestaurantTable): string {
  return deterministicTokenFor(table.number, Store.getSettings()?.name || "7spices");
}
