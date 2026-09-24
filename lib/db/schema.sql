-- Almanda Career Desk — schema for Phases 1-5 (candidate side only).
-- Employer/Organization tables (User, Organization, JobApplication,
-- ScreeningResult, CandidateEvidence-for-recruiters) are added in Phase 7
-- so we don't build auth tables we can't wire up yet.
--
-- Run this once in your database's SQL console (Vercel Postgres / Neon).
--
-- Design notes:
--  - candidate_profiles.session_id is a random anonymous ID stored in a
--    browser cookie (see lib/db/session.js). This lets a candidate use
--    Career Desk features without an account. When Phase 7 adds real
--    accounts, we add a user_id column and backfill it from session_id —
--    no data is thrown away.
--  - Every extracted fact keeps evidence_text + evidence_source so the
--    UI can show "where this came from in your resume" (Part 13).

create extension if not exists "uuid-ossp";

create table if not exists candidate_profiles (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resumes (
  id uuid primary key default uuid_generate_v4(),
  candidate_profile_id uuid not null references candidate_profiles(id) on delete cascade,
  file_name text,
  raw_text text not null,
  source_format text, -- 'pdf' | 'docx' | 'txt'
  created_at timestamptz not null default now()
);

-- A resume can be re-parsed (better model, edited resume, etc.) without
-- losing prior parses — each parse is a resume_version.
create table if not exists resume_versions (
  id uuid primary key default uuid_generate_v4(),
  resume_id uuid not null references resumes(id) on delete cascade,
  parsed_json jsonb not null, -- full structured output, see parsing/resumeParser.js
  parser_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists experiences (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  job_title text,
  company text,
  start_date date,
  end_date date, -- null = current
  is_current boolean not null default false,
  months_duration integer, -- deterministic, computed at parse time
  description text,
  evidence_text text,
  sort_order integer not null default 0
);

create table if not exists educations (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  degree text,
  field_of_study text,
  institution text,
  graduation_year integer,
  evidence_text text,
  sort_order integer not null default 0
);

create table if not exists skills (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  name text not null,
  category text, -- 'technical' | 'soft' | 'language' | 'tool'
  proficiency text, -- free text, e.g. 'fluent', 'A1', 'expert'
  evidence_text text
);

create table if not exists certifications (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  name text not null,
  issuer text,
  year_obtained integer,
  evidence_text text
);

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  name text not null,
  description text,
  evidence_text text
);

create table if not exists achievements (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  description text not null,
  is_quantified boolean not null default false, -- has a number/metric
  evidence_text text
);

create table if not exists templates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text,
  recommended_section_order jsonb not null -- e.g. ["header","summary","skills",...]
);

create table if not exists template_recommendations (
  id uuid primary key default uuid_generate_v4(),
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  template_id uuid not null references templates(id),
  reasons jsonb not null, -- array of strings, from the rule engine
  sections_emphasized jsonb not null,
  sections_reduced jsonb not null,
  recommended_page_length text,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default uuid_generate_v4(),
  candidate_profile_id uuid not null references candidate_profiles(id) on delete cascade,
  title text,
  raw_description text not null,
  created_at timestamptz not null default now()
);

create table if not exists job_requirements (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  requirement_text text not null,
  requirement_type text not null, -- 'education'|'experience'|'certification'|'skill'|'language'|'location'|'work_authorization'|'other'
  classification text not null,   -- 'mandatory'|'preferred'|'nice_to_have'|'needs_review'
  parsed_value jsonb,             -- structured form, e.g. {"years": 3} or {"language":"German","level":"C1"}
  classification_reason text      -- why the rule engine classified it this way
);

create table if not exists job_matches (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  resume_version_id uuid not null references resume_versions(id) on delete cascade,
  eligibility text not null, -- 'eligible'|'not_eligible'
  mandatory_passed integer not null,
  mandatory_total integer not null,
  preferred_passed integer not null,
  preferred_total integer not null,
  requirement_results jsonb not null, -- per-requirement pass/fail + evidence
  missing_mandatory jsonb not null,   -- array of requirement_text
  created_at timestamptz not null default now()
);

-- Seed the template catalog (Phase 2). Keep this list in sync with
-- lib/matching/templateEngine.js TEMPLATES — the slug is the join key.
insert into templates (slug, name, description, recommended_section_order) values
  ('experience-led', 'Experience-Led', 'Leads with work history for candidates with solid, relevant experience.', '["header","summary","core_skills","experience","achievements","projects","education","certifications"]'),
  ('skills-forward-technical', 'Skills-Forward Technical', 'Leads with technical skills and projects.', '["header","summary","technical_skills","projects","experience","certifications","education"]'),
  ('education-first-early-career', 'Education-First (Early Career)', 'For candidates with limited work history — leads with education.', '["header","summary","education","projects","skills","experience","certifications"]'),
  ('leadership-narrative', 'Leadership Narrative', 'For candidates with documented leadership experience.', '["header","summary","leadership_highlights","experience","achievements","core_skills","education"]'),
  ('certification-forward', 'Certification-Forward', 'For candidates whose certifications are a strong differentiator.', '["header","summary","certifications","technical_skills","experience","education","projects"]')
on conflict (slug) do nothing;

create index if not exists idx_resumes_profile on resumes(candidate_profile_id);
create index if not exists idx_resume_versions_resume on resume_versions(resume_id);
create index if not exists idx_experiences_version on experiences(resume_version_id);
create index if not exists idx_skills_version on skills(resume_version_id);
create index if not exists idx_jobs_profile on jobs(candidate_profile_id);
create index if not exists idx_job_requirements_job on job_requirements(job_id);
create index if not exists idx_job_matches_job on job_matches(job_id);
