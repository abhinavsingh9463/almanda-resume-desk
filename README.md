# Almanda — Resume Desk

Deployable version of the resume scorer. Your Anthropic API key stays on the
server (in `pages/api/*.js`) — it's never sent to visitors' browsers, unlike
the chat prototype.

## What's real vs. what's a placeholder

- **Scoring, PDF import, docx/txt import** — fully working, calls your own
  Anthropic API key server-side.
- **Feedback (👍/👎)** — captured, but only logged to your Vercel function
  logs. Fine for reading manually with your first 20 testers; swap for a real
  database (Supabase free tier is easiest) once you want it queryable.
- **Challenge leaderboard** — works, but stored in server memory. It resets
  whenever the serverless function cold-starts or you redeploy. Fine for a
  testing week with friends; before a public launch, add Vercel KV (an
  add-on in your Vercel project dashboard) or Supabase so it persists for
  real.

## Deploy steps (about 15–20 minutes)

1. Get an Anthropic API key at https://console.anthropic.com (Settings → API Keys).
2. Push this folder to a new GitHub repository.
3. Go to https://vercel.com, sign in, click "Add New Project", import that repo.
4. In the project's Environment Variables, add:
   `ANTHROPIC_API_KEY` = your key from step 1.
5. Click Deploy. Vercel gives you a live URL immediately
   (e.g. `almanda.vercel.app`).
6. Once you've bought your domain (almanda.in), add it under
   Project Settings → Domains in Vercel, and point your domain's DNS at
   Vercel following the instructions it shows you.

## Local testing before you deploy

```
npm install
# create a file named .env.local with:
# ANTHROPIC_API_KEY=your_key_here
npm run dev
```

Then open http://localhost:3000
