# Phases 6–10 — setup

## What's new
- `lib/db/schema_phase6_10.sql` — new tables: `tailored_resumes` (6),
  `users`/`organizations`/`organization_members`/`employer_sessions`/
  `job_postings`/`posting_requirements` (7), `applications`/
  `screening_results` (8), `recruiter_overrides`/`audit_log` (9), plus a
  few `check` constraints (10). Nothing here touches Phases 1–5's tables
  (`candidate_profiles`, `resumes`, `jobs`, `job_matches`, etc.) — run
  this *after* `schema.sql`, not instead of it.
- `lib/tailoring/`, `lib/auth/`, `lib/org/`, `lib/screening/`,
  `lib/audit/` — the new logic. All deterministic pieces are covered by
  tests (`test/resumeTailor.test.js`, `test/password.test.js` — 38 tests
  total now, run with `npm test`).
- `pages/api/career/tailor-resume.js` (Phase 6, candidate side) and
  `pages/api/employer/**` (Phases 7–9: register, login, logout,
  postings/create, postings/list, postings/[id]/screen-bulk,
  postings/[id]/candidates, candidates/[applicationId],
  candidates/[applicationId]/override, audit-log). All existing routes
  are unchanged.

## One-time setup
1. **Run the new schema.** In the same database you already set up for
   Phases 1–5, open the Query editor (or `psql`) and run
   `lib/db/schema_phase6_10.sql`. Safe to re-run — everything is
   `if not exists` or wrapped to skip if already applied.
2. **Push this code.** Commit and push; Vercel redeploys automatically.
3. No new environment variables — `ANTHROPIC_API_KEY` and `POSTGRES_URL`
   are all this needs.

## Design decisions worth knowing about
- **Employer accounts are a separate universe from candidate sessions.**
  `users`/`organizations` have no link to `candidate_profiles`. A person
  could have both, but nothing connects them automatically.
- **Org isolation is enforced in code, not just by foreign keys.** Every
  `pages/api/employer/*` route reads `organization_id` from the verified
  session (`lib/auth/employerSession.js`) and filters every query by it
  directly — never by an id the client sent. `applications` even carries
  a denormalized `organization_id` column so that check never depends on
  a multi-hop join.
- **Mandatory/preferred classification is the same code on both sides.**
  Employer job postings are parsed with the identical
  `lib/parsing/jobParser.js` + `requirementClassifier.js` used for a
  candidate's own "Compare Jobs" — so a candidate's self-assessed
  eligibility and a recruiter's screening result can never silently
  disagree about what counts as mandatory.
- **Overrides don't overwrite.** A recruiter override is a new row in
  `recruiter_overrides` layered on top of the original
  `screening_results` row, which is never edited. The evidence dashboard
  and audit log always show both.
- **Passwords use Node's built-in `crypto.scrypt`**, not bcrypt/argon2 —
  neither was already a dependency, and neither needs a native build
  step on Vercel for this. Salted, constant-time compare, fails closed
  on any malformed stored hash.
- **Bulk screening reuses the pdf/docx/txt pipeline you already have.**
  Files are converted to plain text client-side (same approach as
  `pages/index.js` uses today) and sent as `{fileName, rawText}` — the
  API never parses an uploaded file server-side, so no new
  multipart-upload handling was needed.

## What's not built yet
Same situation Phases 1–5 left things in: this is the backend/API layer
for Phases 6–10, tested and ready, but there's **no Recruiting Desk UI**
yet — no login page, no posting form, no bulk-upload screen, no
evidence-dashboard page. I held off for the same reason as before: get
the data layer and org-isolation logic confirmed correct first. If
this looks right, say so and I'll build the Career Desk pages (Phases
1–6: Resume Score, My Profile, Find My Resume Format, Compare Jobs, Job
Analysis, Tailored Resume) and the Recruiting Desk pages (Phases 7–9:
sign up/sign in, Postings, Bulk Screen, Candidate Evidence view) next,
in the existing paper/ink visual style — that's the natural Phase 11.

A few things are explicitly **not** in this batch and would need their
own pass before a real public launch of the employer side:
- Email verification on signup, and password reset
- Invite-a-teammate flow (right now the only way into an org is being
  its creator — `organization_members` supports more than one member
  per org, but nothing yet adds a second one)
- The in-memory rate limiter (`lib/org/rateLimit.js`) has the exact same
  caveat as the existing challenge leaderboard: resets on cold
  start/redeploy, per-instance only. Fine to blunt casual abuse during
  testing; swap for Vercel KV/Upstash before it matters for real.
- CSRF protection beyond `SameSite=Lax` cookies

## Try it without UI (for now)
```
# 1. Register an employer + org
curl -X POST https://your-site/api/employer/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@company.com","password":"a-strong-password-1","organizationName":"Acme Hiring"}' \
  -c cookies.txt

# 2. Create a posting
curl -X POST https://your-site/api/employer/postings/create \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"rawDescription":"<paste job description>"}'

# 3. Bulk-screen resumes against it (use the posting_id from step 2)
curl -X POST https://your-site/api/employer/postings/<posting_id>/screen-bulk \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"resumes":[{"fileName":"a.txt","rawText":"<resume text>"}]}'

# 4. See the evidence dashboard for that posting
curl https://your-site/api/employer/postings/<posting_id>/candidates -b cookies.txt
```

On the candidate side, once you've called `/api/career/analyze-job`
(Phase 4) for a resume+job pair, generate a tailored version:
```
curl -X POST https://your-site/api/career/tailor-resume \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"resumeVersionId":"<from parse-resume>","jobId":"<from analyze-job>"}'
```
