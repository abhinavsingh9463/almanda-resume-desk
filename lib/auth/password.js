// Password hashing for employer accounts (Phase 7).
//
// Uses Node's built-in crypto.scrypt rather than adding bcrypt/argon2 —
// neither is in package.json and we don't want a native-module build
// step added to Vercel's build just for this. scrypt is a recognized
// password-hashing KDF; salted per-password, constant-time compare.

import crypto from "crypto";

const KEY_LEN = 64;

/** Returns a self-describing string: "scrypt$<salt>$<hash>". */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/**
 * Fails closed (returns false) on any malformed/missing stored value —
 * never throws, never treats "can't parse the stored hash" as a pass.
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  try {
    const check = crypto.scryptSync(password, salt, KEY_LEN);
    const original = Buffer.from(hash, "hex");
    if (check.length !== original.length) return false;
    return crypto.timingSafeEqual(check, original);
  } catch {
    return false;
  }
}
