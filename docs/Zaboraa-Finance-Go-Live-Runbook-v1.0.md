# Zaboraa Finance — Go-Live Runbook (Vercel, autonomous)

Antigravity CLI runs this runbook phase by phase. It is autonomous *inside* a phase (retry up to 3 times, then BLOCKED), but it MUST STOP after each phase, write the exit-gate result, and wait for the user to say `go P<n>` before starting the next phase. Never run P0-P6 in one go without a checkpoint.

---

## 1. Operating rules for Antigravity CLI

**Autonomy.** Run one phase at a time. Do not ask for confirmation *inside* a phase. When a phase passes its exit gate, STOP, report the result, and wait for the user to say `go P<n>`. Make decisions yourself within the rules below and record each one in the run log.

**Hard stops.** Stop the affected work, log why, and continue with anything independent when a step would:

- print, log or commit a secret (service role key, client secret, ENCRYPTION_KEY, GEMINI_API_KEY)
- touch the website Supabase project FX-Zaboraa (ref nbkztgptodawtstffrhd) or the Google client Zaboraa Website Login
- turn on billing, add a card, or move off Vercel Hobby
- convert the app to Next.js or reintroduce middleware.ts
- enable the Cloudflare orange cloud (proxy must stay DNS only)
- drop, reset or truncate the remote database, or force-push main
- run `npx supabase db push` without first running `npx supabase migration list` + `npx supabase projects list` and showing: linked project is yargpwshsycktbcxnpit, local file count = 38, remote applied count, and that remote is empty or you have an explicit backup. If remote has real data, STOP.
- import from `src/` inside any file under `api/` (Vercel Functions do not bundle `src/` — this caused ERR_MODULE_NOT_FOUND). Helpers for Functions must live in `api/_lib/` or be inlined directly inside `api/[...all].ts`.
- flip `USE_SUPABASE_EDGE_GMAIL_SYNC` to `true` in Vercel, or enable the 6-hour cron, until manual Gmail sync has passed on production and the user says `enable gmail cron`
- change Supabase Dashboard URL Config, Google Cloud OAuth, or Cloudflare DNS in code — those are manual dashboard steps. Tell the user to do them, do not script them.
- delete QA users/rows and claim QA is done if any QA row still references the owner's real user_id

**Human-only steps.** Do not try to automate these; list them in the final report as the user's to-do: publishing the Google OAuth consent screen (or adding test users), adding the gmail.readonly scope, and pasting secret values you cannot read.

**Git.** Commit small and often to main with clear messages. Pushes auto-deploy on Vercel. Do not use feature branches for deploys: Google origins and Supabase redirect URLs only allow finance.zaboraa.com and finance-zaboraa-02.vercel.app, so login fails on other preview URLs.

**Failure policy.** Retry a failing step with a different fix up to 3 times. After that, log the error, revert the last commit if it broke the live site, mark the item BLOCKED and move on.

**Rollback.** Revert the commit, or promote the previous deployment in Vercel. Fix migrations forward with a new migration file; never edit an applied one.

---

## 2. Fixed Project Facts & Production Architecture

| Item | Value |
| --- | --- |
| Repo | github.com/congodb1-ui/Finance-Zaboraa-02, branch main (repo 01 is a backup, never used) |
| Local folder | C:\Users\admin\OneDrive - CongoVirtualization\Websites\Zaboraa-Finance\Finance-Zaboraa-02 |
| Brand and domains | Zaboraa (double a, never Zabura). Finance: finance.zaboraa.com. Preview: finance-zaboraa-02.vercel.app |
| Architecture | Vite + React SPA, 2 Vercel Serverless Functions (`api/auth/google.ts` + `api/[...all].ts`) on Hobby Plan |
| Cost | ₹0 spend. Vercel Hobby only |
| Supabase project | Finance-Zaboraa-02, ref `yargpwshsycktbcxnpit`, Seoul, org FX-Zaboraa. Auth Site URL is https://finance.zaboraa.com |
| Migrations | 38 applied migrations (including `20261115000000_fix_authenticated_grants.sql` for 42501 resolution) |
| Cloudflare | CNAME finance to `cname.vercel-dns.com`, DNS only, TTL Auto |
| Vercel | Framework Vite, root ./, Install `npm install --legacy-peer-deps`, Build `npm run build`, Output dist, Node 20.x, env `NPM_CONFIG_LEGACY_PEER_DEPS=true` |

---

## 3. Environment Variables

Local file is `.env.local` in the repo root (gitignored, never committed). The committed template is `.env.example` with placeholders only. `.gitignore` must contain `.env.local` and `.env`.

| Variable | Local | Vercel production |
| --- | --- | --- |
| VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_CLIENT_ID | set | same |
| VITE_APP_URL | http://localhost:3000 | https://finance.zaboraa.com |
| NEXT_PUBLIC_APP_URL | http://localhost:3000 | https://finance.zaboraa.com |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | same as VITE_ values | created by the Supabase integration |
| NODE_ENV | development | production |
| SUPABASE_SERVICE_ROLE_KEY | set | created by the Supabase integration |
| ALLOWED_EMAILS | set | same |
| ENCRYPTION_KEY | 32+ chars | same value if same database |
| GEMINI_API_KEY | set | same |
| GEMINI_MODEL_FLASH, GEMINI_MODEL_PRO | gemini-3.5-flash-lite, gemini-3.8-flash | same |
| GOOGLE_CLIENT_ID | same as VITE_GOOGLE_CLIENT_ID | same |
| GOOGLE_CLIENT_SECRET | set | same |
| USE_SUPABASE_EDGE_GMAIL_SYNC | false | false for now |
| NPM_CONFIG_LEGACY_PEER_DEPS | not needed | true |

---

## 4. Execution Log & Phase Status (As of Nov 15, 2026)

| Phase | Goal | Exit Gate | Status |
| --- | --- | --- | --- |
| **P0** | Preflight & repo hygiene | Lint, tests, build pass; linked project = `yargpwshsycktbcxnpit` | **PASSED** |
| **P1** | Database Migrations & Grants | 38 migrations applied; RLS enabled & grants applied (`20261115000000`) | **PASSED** |
| **P2** | First-login bootstrap | Seed categories, family workspace & profile auto-mint on sign-in | **PASSED** |
| **P3** | Function Consolidation | 23 routes consolidated to 2 (`google.ts` + `[...all].ts`) for Hobby plan | **PASSED** |
| **P4** | Gmail Edge Function | `gmail-sync` deployed; manual sync operational | **PASSED** |
| **P5** | Full QA & Security Sweep | QA Report v2 generated; 0 unauth leaks; 42501 permission error fixed | **PASSED** |
| **P6** | Documentation | PRD v2.9.0 and Runbook v1.0 updated to reflect 2-function & 38-migration state | **PASSED** |

---

## 5. Post-Deployment Verification & Maintenance

To perform future releases or schema updates:
1. **Migration Rule**: Always create a NEW migration file under `supabase/migrations/` with a monotonically increasing timestamp prefix. Never alter existing migration files.
2. **Migration Deployment**: Run `npx supabase db push --remote --yes` against `yargpwshsycktbcxnpit`.
3. **Serverless Limits**: Keep non-`_lib` TypeScript files in `api/` at **<= 12 files** (currently 2). Route all new backend endpoints through `api/[...all].ts`.
4. **Build Verification**: Verify with `npm run build && npx tsc --noEmit` before pushing commits to `main`.
