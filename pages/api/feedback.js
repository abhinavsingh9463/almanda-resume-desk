// MVP feedback capture — logs to your Vercel function logs so you can read
// them in the dashboard. Once you have real traffic, swap this for a proper
// database (Supabase's free tier is the easiest next step) so feedback is
// queryable instead of buried in logs.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const { helpful, score } = req.body || {};
  console.log("[feedback]", JSON.stringify({ helpful, score, at: new Date().toISOString() }));
  return res.status(200).json({ ok: true });
}
