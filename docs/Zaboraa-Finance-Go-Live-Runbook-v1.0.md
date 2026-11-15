# Zaboraa Finance — Go-Live Runbook (Vercel, autonomous)

Antigravity CLI runs this runbook phase by phase. It is autonomous *inside* a phase (retry up to 3 times, then BLOCKED), but it MUST STOP after each phase, write the exit-gate result, and wait for the user to say `go P<n>` before starting the next phase. Never run P0-P6 in one go without a checkpoint. Status as of 15 Nov 2026: connections, domain and login are done; migrations, 22 API routes, Gmail sync and QA are not.

## 1. Operating rules for Antigravity CLI

**Autonomy.** Run one phase at a time. Do not ask for confirmation *inside* a phase. When a phase passes its exit gate, STOP, report the result, and wait for the user to say `go P<n>`. Make decisions yourself within the rules below and record each one in the run log.

**Hard stops.** Stop the affected work, log why, and continue with anything independent when a step would:

- print, log or commit a secret (service role key, client secret, ENCRYPTION\_KEY, GEMINI\_API\_KEY)
- touch the website Supabase project FX-Zaboraa (ref nbkztgptodawtstffrhd) or the Google client Zaboraa Website Login
- turn on billing, add a card, or move off Vercel Hobby
- convert the app to Next.js or reintroduce middleware.ts
- enable the Cloudflare orange cloud (proxy must stay DNS only)
- drop, reset or truncate the remote database, or force-push main
- run `npx supabase db push` without first running `npx supabase migration list` + `npx supabase projects list` and showing: linked project is yargpwshsycktbcxnpit, local file count = 37, remote applied count, and that remote is empty or you have an explicit backup. If remote has real data, STOP.
- import from `src/` inside any file under `api/` (Vercel Functions do not bundle `src/` — this caused ERR_MODULE_NOT_FOUND). Helpers for Functions must live in `api/_lib/` only.
- flip `USE_SUPABASE_EDGE_GMAIL_SYNC` to `true` in Vercel, or enable the 6-hour cron, until manual Gmail sync has passed on production and the user says `enable gmail cron`
- change Supabase Dashboard URL Config, Google Cloud OAuth, or Cloudflare DNS in code — those are manual dashboard steps. Tell the user to do them, do not script them.
- delete QA users/rows and claim QA is done if any QA row still references the owner's real user_id

**Human-only steps.** Do not try to automate these; list them in the final report as the user's to-do: publishing the Google OAuth consent screen (or adding test users), adding the gmail.readonly scope, and pasting secret values you cannot read.

**Git.** Commit small and often to main with clear messages. Pushes auto-deploy on Vercel. Do not use feature branches for deploys: Google origins and Supabase redirect URLs only allow finance.zaboraa.com and finance-zaboraa-02.vercel.app, so login fails on other preview URLs.

**Failure policy.** Retry a failing step with a different fix up to 3 times. After that, log the error, revert the last commit if it broke the live site, mark the item BLOCKED and move on.

**Rollback.** Revert the commit, or promote the previous deployment in Vercel. Fix migrations forward with a new migration file; never edit an applied one.

## 2. Fixed project facts

| Item | Value |
| --- | --- |
| Repo | github.com/congodb1-ui/Finance-Zaboraa-02, branch main (repo 01 is a backup, never used) |
| Local folder | C:\\Users\\admin\\OneDrive - CongoVirtualization\\Websites\\Zaboraa-Finance\\Finance-Zaboraa-02 |
| Brand and domains | Zaboraa (double a, never Zabura). Finance: finance.zaboraa.com. Preview: finance-zaboraa-02.vercel.app |
| Architecture | Vite + React SPA, Express logic in server.ts for local dev, Vercel Functions in api/ for production. No Next.js |
| Cost | No spend. Vercel Hobby only |
| Supabase project | Finance-Zaboraa-02, ref yargpwshsycktbcxnpit, Seoul, org FX-Zaboraa. Auth Site URL is https://finance.zaboraa.com |
| Cloudflare | CNAME finance to b614e850c263b245.vercel-dns-017.com, DNS only, TTL Auto |
| Vercel | Framework Vite, root ./, Install `npm install --legacy-peer-deps`, Build `npm run build`, Output dist, Node 20.x, env NPM\_CONFIG\_LEGACY\_PEER\_DEPS=true |

## 3. Environment variables

Local file is `.env.local` in the repo root (gitignored, never committed). The committed template is `.env.example` with placeholders only. `.gitignore` must contain `.env.local` and `.env`. Use `.env` only on a plain server that is not Vercel.

| Variable | Local | Vercel production |
| --- | --- | --- |
| VITE\_SUPABASE\_URL, VITE\_SUPABASE\_ANON\_KEY, VITE\_GOOGLE\_CLIENT\_ID | set | same |
| VITE\_APP\_URL | http://localhost:3000 | https://finance.zaboraa.com |
| NEXT\_PUBLIC\_APP\_URL | http://localhost:3000 | https://finance.zaboraa.com |
| NEXT\_PUBLIC\_SUPABASE\_URL, NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY | same as VITE\_ values | created by the Supabase integration |
| NODE\_ENV | development | production |
| SUPABASE\_SERVICE\_ROLE\_KEY | set | created by the Supabase integration |
| ALLOWED\_EMAILS | set | same |
| ENCRYPTION\_KEY | 32+ chars | same value if same database |
| GEMINI\_API\_KEY | set | same |
| GEMINI\_MODEL\_FLASH, GEMINI\_MODEL\_PRO | gemini-3.5-flash-lite, gemini-3.8-flash | same |
| GOOGLE\_CLIENT\_ID | same as VITE\_GOOGLE\_CLIENT\_ID | same |
| GOOGLE\_CLIENT\_SECRET | set | same |
| USE\_SUPABASE\_EDGE\_GMAIL\_SYNC | false | false for now |
| NPM\_CONFIG\_LEGACY\_PEER\_DEPS | not needed | true |

The Supabase integration (specific project finance-zaboraa-02) creates the NEXT\_PUBLIC\_ pair and the service role key. The VITE\_ variables still have to be added to Vercel by hand. Never prefix server secrets with VITE\_.

## 4. Phase plan

| Phase | Goal | Exit gate |
| --- | --- | --- |
| P0 | Preflight and repo hygiene | Lint, tests and build pass; Supabase link points to yargpwshsycktbcxnpit |
| P1 | Run the 37 migrations | All tables exist, RLS on every table, RLS tests pass |
| P2 | First-login bootstrap | Seed categories, families and profile exist for a new user |
| P3 | Convert 22 Express routes to Vercel Functions, 4 batches | Each batch passes its tests on production |
| P4 | Gmail Edge Function and 6-hour cron | Manual sync logs a row; cron registered |
| P5 | Full QA and security sweep | QA report has no open critical or high items |
| P6 | Documentation | PRD v2.9.0 and this runbook match reality |

### P0. Preflight and repo hygiene

1. Verify link first: run `npx supabase projects list` and `cat supabase/config.toml | grep project_id`. It must show LINKED = Finance-Zaboraa-02 (yargpwshsycktbcxnpit). Only run `npx supabase link --project-ref yargpwshsycktbcxnpit` if it shows a different project. It once pointed at the old project xxdxwmneygdhtosgdynf (Zaboraa Website) — never link to that.
2. Delete `bun.lock` and keep only `package-lock.json`.
3. Bump esbuild to `^0.28.2` in package.json, regenerate the lockfile, and confirm `npm install` works without `--legacy-peer-deps` LOCALLY. Do NOT remove the flag / NPM\_CONFIG\_LEGACY\_PEER\_DEPS from Vercel in this phase. Only remove them after a production Vercel deploy with the new lockfile has passed its smoke test, and the user confirms. Keep them as fallback until then.
4. Confirm `react-is` is in dependencies and `.gitignore` is correct.
5. Run `npm run lint`, then `npm run build` (last known good: 2244 modules, about 2.7 s).
6. Restore `scripts/rls-verify.ts` and `scripts/auth-sweep.ts`, which are missing from the repo.

### P1. Migrations

1. Pre-push gate (do this BEFORE any push): run `npx supabase migration list` and `ls supabase/migrations`. Report: local file count, remote applied count, linked project. Local must be 37 files, 20240001000000\_extensions.sql through 20240014000001\_batch\_6b\_analytics\_reports.sql, in filename order (Batch 3c has no migration). Remote must be 0 applied on a fresh DB, or STOP and ask. Only then run `npx supabase db push` against the linked project.
2. Verify every expected table exists: accounts, categories, workspaces, statement\_uploads, staged\_transactions, transactions, audit\_log, rules, recurring, budgets, invoicing tables, profiles, ai\_settings, business\_profiles, clients, payment\_instructions, invoices, families, family\_members, gmail\_sync\_log, email\_parse\_errors, analytics\_reports.
3. Verify RLS is enabled on every public table and that Vault RPCs are service\_role only.
4. Run `rls-verify.ts` with two QA users (see Section 5).

### P2. First-login bootstrap

`ensureBatch2bBootstrap` was removed from login. Check whether a fresh user gets seed categories, system transfer categories, a family and a profile. If not, add the bootstrap inside the Vercel login function or on first load, using only code that lives under `api/` or `api/_lib/`.

### P3. Convert the 22 Express-only routes

Pattern for every function:

- one file per route under `api/`, with shared helpers in `api/_lib/`
- no imports from `src/` (this caused ERR\_MODULE\_NOT\_FOUND before)
- verify the Supabase JWT (Authorization: Bearer <Supabase access token>), then check ALLOWED\_EMAILS, then run the handler. Do NOT re-verify the Google ID token here — Google verification happens only in `api/auth/google.ts`.
- `verifyOtp` with only `token_hash` and `type` applies ONLY to `api/auth/google.ts`. Do NOT use verifyOtp in any other route.
- keep the JSON shapes the frontend already expects
- vercel.json keeps `/api/(.*)` ahead of the SPA fallback

Batches, in order — data first, AI last (dashboard needs data routes before AI can be tested):

| Batch | Routes | Why this order |
| --- | --- | --- |
| B. Data and files (5) | GET /api/export, POST /api/upload, POST /api/upload/finalize, PATCH /api/transactions/:id, GET /api/backup | Dashboard / Ledger / Upload depend on these. Do this batch first. |
| C. Payment instructions (3) | POST /api/payment-instructions, PATCH /api/payment-instructions/:id, POST /api/payment-instructions/:id/reveal | Needs ENCRYPTION_KEY + audit log. Test reveal audit after B passes. |
| D. Gmail and analytics (7) | GET /api/gmail/status, POST /api/gmail/connect, /api/gmail/disconnect, PATCH /api/gmail/sync-settings, POST /api/gmail/sync, GET /api/analytics/reports, POST /api/analytics/reports/generate | Gmail sync here uses the Express path (USE_SUPABASE_EDGE_GMAIL_SYNC=false) until P4. Analytics needs transactions from B. |
| A. AI (5) | POST /api/ai/test, /api/ai/anomalies, /api/ai/chat, /api/ai/monthly-report, /api/ai/categorize | Last — AI needs data + transactions to be meaningful, and costs GEMINI_API_KEY calls. Mock Gemini in tests, do not call real Gemini in every test run. |

After each batch: run that batch's tests (Section 5), push, wait for the Vercel deploy, run the production smoke checks, then start the next batch. Do not start a batch until the previous one is green.

Upload limit: Vercel Functions cap request bodies at 4.5 MB while the PRD allows 20 MB. HARD RULE in Batch B: If PRD v2.8.0 already defines an upload fix, follow PRD exactly, do NOT invent a signed-URL flow. Only if PRD defines NO fix, implement: browser -> Supabase Storage signed upload URL -> `/api/upload/finalize` processes the stored file. Log the choice, and add a test with a file above 4.5 MB (and one below, and one at exactly 20 MB boundary).

### P4. Gmail Edge Function and cron

1. `npx supabase functions deploy gmail-sync --no-verify-jwt`.
2. Set Edge secrets: ENCRYPTION\_KEY, GOOGLE\_CLIENT\_ID, GOOGLE\_CLIENT\_SECRET, GEMINI\_API\_KEY, GEMINI\_MODEL\_FLASH. Read the values from `.env.local`; never print them.
3. Register a 6-hour schedule (`0 */6 * * *`) as an authenticated POST with an empty JSON body. If Supabase CLI or the API cannot create it, mark that item HUMAN and give the Dashboard steps in the report.
4. Keep USE\_SUPABASE\_EDGE\_GMAIL\_SYNC=false until the Edge Function has passed its tests AND manual Gmail sync has passed on production AND the user says `enable gmail cron`. Flipping the flag is a HUMAN decision, not an autonomous one. Never flip it in the same phase as deploying the Edge Function.
5. Gmail will not work for real until the human-only Google consent step is done. Test everything else with mocked Gmail responses.

### P5. Full QA

Run every check in Section 5 against the final production deployment and write the report.

### P6. Documentation

Update the PRD from v2.8.0 to v2.9.0 and this runbook using only what actually happened. The PRD must state: Vercel is the primary host; `/api/*` runs as Vercel Functions; the vercel.json rewrite rules; Supabase Site URL and redirect URLs; Google OAuth origins including the Vercel domain; the Cloudflare CNAME target and DNS-only rule; the esbuild, react-is and bun.lock fixes; the self-contained `api/` pattern with no `src/` imports; the `verifyOtp` token\_hash-only rule; and the status of the 22 routes. Do not invent changes.

## 5. Automated testing and QA

All checks run from the CLI and write results to `docs/qa/` (committed, no secrets).

**Test data rules.** Create two QA users with the Supabase admin API (`qa-a`, `qa-b`) with emails like `qa-a+<date>@zaboraa.com` / `qa-b+<date>@zaboraa.com` — never reuse the owner's real email. Tag all test rows with a `qa_` prefix + run date (e.g. `qa_20261115_`). Delete the QA users and rows at the end of each run, and verify deletion (query must return 0 rows for that prefix). Never touch the owner's real data. Use a fixed sample statement file (e.g. `docs/qa/sample-statement.csv` — 10 rows, known totals) for upload/dedup tests, do not use a real bank statement. Run happy-path API tests locally with `npx vercel dev` (pull env with `vercel env pull`), adding the QA emails to ALLOWED\_EMAILS in `.env.local` only, never in Vercel. Run only negative and smoke tests against production.

| Layer | What to run | Must pass |
| --- | --- | --- |
| Static | `npm run lint` (tsc --noEmit), ESLint if configured, `npm run build` | 0 errors |
| Unit (Vitest, add if missing) | PII masking, Google ID token verification, ALLOWED\_EMAILS check, statement parsers, dedup keys (upi\_ref\_no, imps\_ref\_no), self-transfer pairing, balance\_after math, ITR summary and analytics aggregation | all green |
| API contract | Every one of the 22 routes: 401 with no token, 403 for a non-allowed user, 400 on bad input, 200 and correct JSON shape on valid input, correct method (no 405) | all green |
| RLS and isolation | `rls-verify.ts` with qa-a and qa-b: neither can read, update or delete the other's rows in any table; service\_role-only RPCs are blocked for normal users | zero cross-user access |
| Auth sweep | `auth-sweep.ts`: no `/api/*` route answers without a valid session | zero open routes |
| Security | secret scan of the repo and `dist/` (no service role key, client secret, ENCRYPTION\_KEY or API keys), `npm audit --omit=dev`, response headers, CORS, rate limits, payment-instruction reveal is audited | no critical or high findings |
| End to end (Playwright) | sign in as a QA user using an admin-generated session (real Google login cannot be automated), open dashboard, upload the fixed sample statement, check ledger rows and dedup, edit a transaction, create a budget, run Ask AI with a mocked Gemini response, generate an analytics report, export and backup | all green |
| Data integrity | upload the same statement twice (no duplicates), a self-transfer between two accounts (paired, excluded from income and expense), balances reconcile to balance\_after | all green |
| Production smoke | after every deploy: home returns 200, deep link `/#/dashboard` loads, `/api/auth/google` rejects a bad token cleanly, unauthenticated API calls return 401 | all green |
| Non-functional | Lighthouse on the login and dashboard pages, bundle size (the main chunk is about 2.6 MB, so list code-splitting options), console errors on load | report only, no gate |

**QA report.** Write `docs/qa/go-live-report-<date>.md` with one table (check, result, evidence, severity), a defect list, the human-only to-do list, and the run log. A critical or high defect that is open means the release is not ready; fix it and re-run the affected layer.

## 6. Manual checks left for the user

These cannot be automated and are not part of the autonomous run:

- Google Cloud: publish the OAuth consent screen or add test users, and add `gmail.readonly`. Testing mode expires refresh tokens after 7 days, which breaks the 6-hour sync.
- Sign in once with the real Google account and confirm the dashboard shows real data after the first upload.
- Connect Gmail once consent is published and confirm the first sync.
- Remove the old wrong Supabase redirect URLs (the finance-zaboraa-02-zaboraa ones) when convenient.

## 7. Kickoff prompt to paste into Antigravity CLI

> You are the release engineer for Zaboraa Finance. Read the runbook below in full. Execute ONE phase at a time, starting with P0. You are autonomous INSIDE a phase. After a phase passes its exit gate, STOP, write the result to the run log, commit, and wait for me to say `go P<n>` before starting the next phase. Never run P0-P6 in one go. Obey the hard stops, the failure policy and the test data rules exactly. After P5, write docs/qa/go-live-report-<date>.md. After P6, update the PRD to v2.9.0. Give me a short summary after each phase that lists what passed, what is BLOCKED, and what I must do by hand. Never print secrets. The runbook follows.
