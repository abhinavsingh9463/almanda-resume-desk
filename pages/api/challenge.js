// MVP leaderboard storage — kept in memory, which means it resets whenever
// this serverless function cold-starts or you redeploy. That's fine for
// testing with a small group this week. Before a real public launch, swap
// this for Vercel KV (add-on in your Vercel dashboard) or a free Supabase
// project so challenges survive restarts.

const challenges = globalThis.__almandaChallenges || (globalThis.__almandaChallenges = new Map());

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default async function handler(req, res) {
  const { action } = req.query;

  if (req.method === "POST" && action === "start") {
    const { job } = req.body || {};
    if (!job) return res.status(400).json({ error: "Missing job description." });
    const code = genCode();
    challenges.set(code, { job, entries: [] });
    return res.status(200).json({ code });
  }

  if (req.method === "GET" && action === "join") {
    const code = String(req.query.code || "").toUpperCase();
    const c = challenges.get(code);
    if (!c) return res.status(404).json({ error: "No challenge found with that code." });
    return res.status(200).json({ job: c.job, entries: c.entries });
  }

  if (req.method === "POST" && action === "post-score") {
    const { code, name, score } = req.body || {};
    const c = challenges.get(String(code || "").toUpperCase());
    if (!c) return res.status(404).json({ error: "Challenge not found." });
    c.entries.push({ name: name || "Anonymous", score, at: Date.now() });
    c.entries.sort((a, b) => b.score - a.score);
    return res.status(200).json({ entries: c.entries });
  }

  if (req.method === "GET" && action === "leaderboard") {
    const code = String(req.query.code || "").toUpperCase();
    const c = challenges.get(code);
    if (!c) return res.status(404).json({ error: "Challenge not found." });
    return res.status(200).json({ entries: c.entries });
  }

  return res.status(400).json({ error: "Unknown action." });
}
