-- Almanda — schema additions for Phases 6-10.
-- Run this AFTER schema.sql (Phases 1-5) in the same database. Nothing
-- here alters an existing Phase 1-5 table — candidate_profiles, resumes,
-- resume_versions, jobs, job_matches etc. are untouched.
--
-- Design notes:
--  - Employer/candidate data are fully separate universes. `users` and
--    `organizations` (Phase 7) have no foreign key to `candidate_profiles`
--    (Phase 1) — a person could in principle be both, but nothing links
--    the two accounts automatically.
--  - Every table that belongs to an organization carries an explicit
--    organization_id column, even where it could be derived by joining
--    through job_postings (e.g. `applications`). This is Phase 10's
--    load-bearing hardening decision: every employer-side query filters
--    "where organization_id = $sessionOrgId" directly, with no reliance
--    on a multi-hop join to enforce isolation.

create extension if not exists "uuid-ossp";

-- Phase 6 — Tailored Resume Versions ----------------------------------

create table if not exists tailored_resumes (
  id uuid primary key default uuid_generate_v4(),
  candidate_profile_id uuid not null references candidate_profiles(id) on delete cascade,
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  template_slug text not null,
  section_order jsonb not null,
  tailored_summary text, -- AI-written, constrained to cited evidence only; nullable if generation failed
  emphasized_bullets jsonb not null, -- evidence_text strings pinned to the top because they matched a passed requirement for this job
  addressed_gaps jsonb not null,     -- requirement_text of mandatory/preferred items this version's evidence actually supports
  full_text text not null,           -- final rendered plain-text resume — fully deterministic given the fields above
  generator_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tailored_resumes_candidate on tailored_resumes(candidate_profile_id);
create index if not exists idx_tailored_resumes_job on tailored_resumes(job_id);
create index if not exists idx_tailored_resumes_resume_version on tailored_resumes(resume_version_id);

-- Phase 7 — Employer accounts & organizations --------------------------

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null, -- see lib/auth/password.js — scrypt, salted, never plaintext
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'recruiter', -- 'owner' | 'recruiter'
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- Session tokens are stored hashed (sha256), same reasoning as password
-- hashing: a leaked DB row alone should not be replayable as a cookie.
create table if not exists employer_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists job_postings (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by uuid not null references users(id),
  title text,
  raw_description text not null,
  status text not null default 'open', -- 'open' | 'closed'
  created_at timestamptz not null default now()
);

-- Deliberately separate from Phase 3's job_requirements (candidate-side
-- "jobs" a candidate pasted in for themselves) even though the shape is
-- identical — the two are populated by the same deterministic classifier
-- (lib/parsing/jobParser.js, lib/parsing/requirementClassifier.js) so
-- mandatory/preferred classification can never silently diverge between
-- what a candidate sees and what a recruiter's screen uses, but they are
-- different rows because a posting can outlive an org's whole relationship
-- with any one candidate's saved analysis.
create table if not exists posting_requirements (
  id uuid primary key default uuid_generate_v4(),
  job_posting_id uuid not null references job_postings(id) on delete cascade,
  requirement_text text not null,
  requirement_type text not null,
  classification text not null,
  parsed_value jsonb,
  classification_reason text
);

create index if not exists idx_org_members_org on organization_members(organization_id);
create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_employer_sessions_token on employer_sessions(session_token_hash);
create index if not exists idx_employer_sessions_expiry on employer_sessions(expires_at);
create index if not exists idx_job_postings_org on job_postings(organization_id);
create index if not exists idx_posting_requirements_posting on posting_requirements(job_posting_id);

-- Phase 8 — Bulk resume screening ---------------------------------------

create table if not exists applications (
  id uuid primary key default uuid_generate_v4(),
  job_posting_id uuid not null references job_postings(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade, -- denormalized on purpose, see design note above
  candidate_file_name text,
  raw_resume_text text not null,
  parsed_json jsonb not null, -- {parsed, computed} — same shape as resume_versions.parsed_json
  parser_version text not null,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists screening_results (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  eligibility text not null, -- 'eligible' | 'not_eligible' | 'needs_review'
  mandatory_passed integer not null,
  mandatory_total integer not null,
  preferred_passed integer not null,
  preferred_total integer not null,
  requirement_results jsonb not null,
  missing_mandatory jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_applications_posting on applications(job_posting_id);
create index if not exists idx_applications_org on applications(organization_id);
create index if not exists idx_screening_results_app on screening_results(application_id);

-- Phase 9 — Evidence dashboard, recruiter override, audit log ----------

-- An override never rewrites screening_results — the deterministic
-- result stays the system-of-record and this is layered on top with
-- who/why/when, so "the algorithm said X but a human overrode it to Y,
-- because Z" is always reconstructable.
create table if not exists recruiter_overrides (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  overridden_by uuid not null references users(id),
  override_status text not null, -- 'eligible' | 'not_eligible' | 'shortlist' | 'reject'
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null, -- e.g. 'posting.created', 'posting.bulk_screened', 'application.overridden'
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_recruiter_overrides_app on recruiter_overrides(application_id);
create index if not exists idx_audit_log_org on audit_log(organization_id);
create index if not exists idx_audit_log_org_created on audit_log(organization_id, created_at desc);

-- Phase 10 — Hardening ---------------------------------------------------
-- No new tables. Isolation is enforced in application code (every
-- employer query below is scoped by organization_id read from the
-- verified session, never from a client-supplied id — see
-- lib/auth/employerSession.js and every pages/api/employer/* route).
-- This block only adds defensive constraints the app code already
-- assumes are true.

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so each is wrapped to
-- stay safely re-runnable like every other statement in this file.
do $$ begin
  alter table organization_members
    add constraint chk_org_member_role check (role in ('owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table job_postings
    add constraint chk_posting_status check (status in ('open', 'closed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table screening_results
    add constraint chk_screening_eligibility check (eligibility in ('eligible', 'not_eligible', 'needs_review'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table recruiter_overrides
    add constraint chk_override_status check (override_status in ('eligible', 'not_eligible', 'shortlist', 'reject'));
exception when duplicate_object then null; end $$;
