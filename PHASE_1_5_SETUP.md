# Phases 1–5 — setup

## What's new
- `lib/db/schema.sql` — new tables (candidate profile, resumes, experiences,
  skills, jobs, requirements, matches). Nothing here touches your existing
  scorer or leaderboard.
- `lib/parsing/`, `lib/matching/`, `lib/eligibility/` — the actual logic
  (resume parsing, template recommendation, job parsing, eligibility,
  comparison/gap analysis). All deterministic pieces are covered by tests
  in `test/` (29 tests, run with `npm test`).
- `pages/api/career/parse-resume.js`, `analyze-job.js`, `compare-jobs.js` —
  new API routes. Your existing `/api/score`, `/api/extract-pdf`,
  `/api/challenge`, `/api/feedback` and the `/` page are unchanged.
- Bumped `next` from 14.2.5 → 14.2.35 (patches the Dec 2025 Next.js CVEs).

## One-time setup

1. **Add a Postgres database.** In your Vercel project → Storage tab →
   Create Database → Postgres (this uses Neon under the hood, still
   inside your Vercel dashboard). Vercel sets `POSTGRES_URL` for you
   automatically — no separate account.

2. **Run the schema.** Open the database's Query editor in Vercel (or
   connect with `psql`) and run the contents of `lib/db/schema.sql`.
   This also seeds the 5 resume templates from Phase 2.

3. **Push this code.** Commit and push to your GitHub repo; Vercel will
   redeploy automatically.

No other environment variables are needed beyond your existing
`ANTHROPIC_API_KEY`.

## What's not built yet
There's no Career Desk *UI* yet — only the backend/API layer, tested and
ready. I held off on UI until the data layer was confirmed working, per
Part 19 ("implement underlying data structures and APIs" first). If this
looks right, say so and I'll build the Career Desk pages next (Resume
Score, My Profile, Find My Resume Format, Compare Jobs, Job Analysis) in
the existing paper/ink visual style.

## Try it without UI (for now)
```
curl -X POST https://your-site/api/career/parse-resume \
  -H "Content-Type: application/json" \
  -d '{"rawText": "<paste resume text>", "fileName": "resume.txt"}'
```
Use the returned `resume_version_id` to call `analyze-job`, then GET
`/api/career/compare-jobs` to see the dashboard data once you've
analyzed 2+ jobs.
