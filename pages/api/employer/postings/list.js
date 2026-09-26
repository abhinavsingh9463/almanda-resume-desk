// GET -> every job posting for the caller's organization, with a live
// applicant count. Org-scoped by session.organizationId only — never by
// any client-supplied id (Phase 10).

import { requireEmployerSession } from "../../../../lib/auth/employerSession.js";
import { query } from "../../../../lib/db/client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  try {
    const rows = await query(
      `select jp.id, jp.title, jp.status, jp.created_at,
              count(a.id)::int as application_count
       from job_postings jp
       left join applications a on a.job_posting_id = jp.id
       where jp.organization_id = $1
       group by jp.id
       order by jp.created_at desc`,
      [session.organizationId]
    );
    return res.status(200).json({ postings: rows.rows });
  } catch (err) {
    console.error("[employer/postings/list] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't load your postings just now." });
  }
}
