// Simple in-memory rate limiter for auth endpoints (Phase 10 hardening).
//
// Same caveat the README already gives for the challenge leaderboard:
// this resets whenever the serverless function cold-starts or you
// redeploy, and it's per-instance, not global. That's still good enough
// to blunt casual credential-stuffing/brute-force attempts on register
// and login. Swap for Vercel KV/Upstash if this needs to hold across
// instances before a public launch.

const buckets = new Map();

/** Returns true if the call is allowed, false if the key is over its limit. */
export function rateLimit(key, { max = 10, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length <= max;
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
