// Password hashing using Web Crypto PBKDF2-SHA256.
// Format: pbkdf2$<iterations>$<saltBase64>$<hashBase64>

const ITERATIONS = 150_000;
const KEY_LEN_BITS = 256;

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LEN_BITS
  );
}

export function isHashed(stored: string | undefined | null): boolean {
  return !!stored && stored.startsWith("pbkdf2$");
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(plain, salt, ITERATIONS);
  const saltCopy = new Uint8Array(salt); // ensure plain ArrayBuffer backing
  return `pbkdf2$${ITERATIONS}$${bufToB64(saltCopy.buffer as ArrayBuffer)}$${bufToB64(hash)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (!isHashed(stored)) {
    // Legacy plaintext record — direct compare (will be auto-upgraded on next save).
    return plain === stored;
  }
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iter = parseInt(parts[1], 10);
  const salt = b64ToBuf(parts[2]);
  const expected = parts[3];
  const hash = await pbkdf2(plain, salt, iter);
  const actual = bufToB64(hash);
  // Constant-ish-time compare
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function generateRandomPassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export type SafeUser<T extends { password?: string }> = Omit<T, "password">;

export function stripPassword<T extends { password?: string }>(user: T): SafeUser<T> {
  const { password: _pw, ...rest } = user;
  void _pw;
  return rest;
}
