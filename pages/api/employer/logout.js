import { clearSessionCookie, revokeSession } from "../../../lib/auth/employerSession.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    await revokeSession(req);
  } catch (err) {
    console.error("[employer/logout] failed to revoke DB session (non-fatal):", err.message || err);
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
