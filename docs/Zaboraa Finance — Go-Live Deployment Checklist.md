# Zaboraa Finance — Go-Live Deployment Checklist

Target: https://finance.zaboraa.com · PRD v2.8.0 · Covers Batches 0 through 6b

## 0. Gaps to resolve before you start

- **Vercel body size limit:** the PRD flagged a 4.5 MB serverless limit vs the 20 MB statement upload limit. The AI Studio checklist does not mention it. If you host Express on Cloud Run or a VPS this does not apply; if on Vercel, confirm how uploads are handled.
- **Security scripts missing:** `scripts/` is empty in the workspace. Restore or recreate `rls-verify.ts` and `auth-sweep.ts` before relying on the RLS and auth sweeps.
- **Balance columns (resolved):** `accounts.current_balance` and `profiles.gmail_email` are added by the Batch 5b migration, so no extra check against the Batch 4b migration is needed beyond running both in order.
- **Hosting target is not stated** in the checklist (Cloud Run, VPS or Vercel). Decide this first, because it changes the env var and reverse proxy steps.

## 1. Local setup and build verification

Requires Node.js 20 or later.

1. `npm install` (the postinstall step copies `pdf.worker.min.mjs` to `public/pdf.worker.min.js`)
2. `cp .env.example .env`, then fill in the values from Section 2
3. `npm run lint` (runs `tsc --noEmit`)
4. `npm run build` (runs `vite build` into `dist/`)
5. `npm run dev` (Express + Vite on http://localhost:3000)
6. Production start: `NODE_ENV=production npm start` (port 3000)
7. Security sweeps, once the scripts are restored:
   - `RLS_USER1_TOKEN=<jwt1> RLS_USER2_TOKEN=<jwt2> npx tsx scripts/rls-verify.ts --seed`, then `npx tsx scripts/rls-verify.ts`
   - `npx tsx scripts/auth-sweep.ts`

## 2. Environment variables

Never prefix server secrets with `VITE_`. Set every variable below in your production runtime environment.

### Browser-exposed (baked into `dist/` at build time)

| Variable | Local | Production |
| --- | --- | --- |
| VITE\_SUPABASE\_URL | https://\<project-ref>.supabase.co | Same |
| VITE\_SUPABASE\_ANON\_KEY | Supabase anon public key | Same |
| VITE\_GOOGLE\_CLIENT\_ID | Google Web Client ID | Same |
| VITE\_APP\_URL | http://localhost:3000 | https://finance.zaboraa.com |

### Server-only

| Variable | Purpose |
| --- | --- |
| NODE\_ENV | `production` when serving built `dist/` |
| SUPABASE\_SERVICE\_ROLE\_KEY | Required. Session minting, audit\_log writes, Vault RPCs, Gmail sync |
| ALLOWED\_EMAILS | Required. Comma-separated Google emails allowed to sign in and call `/api/*` |
| ENCRYPTION\_KEY | Required. 32+ character random secret (AES-256-GCM) for PAN, payment instructions and Vault fallback |
| GEMINI\_API\_KEY | Required for AI features, `/api/analytics/generate` and Gmail AI fallback |
| GEMINI\_MODEL\_FLASH | Default `gemini-3.5-flash-lite` |
| GEMINI\_MODEL\_PRO | Default `gemini-3.8-flash` |
| GOOGLE\_CLIENT\_ID | Optional server override of the VITE value |
| GOOGLE\_CLIENT\_SECRET | Required for 6-hour offline Gmail sync (refresh tokens) |
| USE\_SUPABASE\_EDGE\_GMAIL\_SYNC | `false` = Express handles manual sync; `true` = delegates to the Edge Function |
| NEXT\_PUBLIC\_SUPABASE\_URL | Same as VITE\_SUPABASE\_URL |
| NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY | Same as VITE\_SUPABASE\_ANON\_KEY |
| NEXT\_PUBLIC\_APP\_URL | https://finance.zaboraa.com in production |

## 3. Supabase migrations (exact order)

**Option A, CLI:** `npx supabase login`, then `npx supabase link --project-ref <your-project-ref>`, then `npx supabase db push`.

**Option B, SQL Editor:** run in this order.

1. 20240001000000\_extensions.sql
2. 20240002000000\_accounts.sql
3. 20240002000001\_categories.sql
4. 20240002000002\_workspaces.sql
5. 20240002000003\_rls\_accounts.sql
6. 20240002000004\_seed\_categories.sql
7. 20240002000005\_on\_new\_user\_trigger.sql
8. 20240002000006\_rls\_categories.sql
9. 20240002000007\_rls\_workspaces.sql
10. 20240003000000\_statement\_uploads.sql
11. 20240003000001\_staged\_transactions.sql
12. 20240003000002\_rls\_uploads.sql
13. 20240003000003\_storage\_buckets.sql
14. 20240004000000\_transactions.sql
15. 20240004000001\_audit\_log.sql
16. 20240004000002\_rules.sql
17. 20240004000003\_rls\_transactions.sql
18. 20240004000004\_rls\_rules.sql
19. 20240004000005\_rls\_audit\_log.sql
20. 20240007000000\_recurring.sql
21. 20240007000001\_budgets.sql
22. 20240008000000\_invoicing.sql
23. 20240009000001\_profiles.sql
24. 20240009000002\_ai\_settings.sql
25. 20240009000003\_accounts\_opening\_balance.sql
26. 20240009000004\_transactions\_transfer\_pair.sql
27. 20240009000005\_ai\_settings\_report\_cache.sql
28. 20240010000001\_business\_profiles.sql
29. 20240010000002\_clients.sql
30. 20240010000003\_payment\_instructions.sql
31. 20240010000004\_invoices\_v2.sql
32. 20240010000005\_invoice\_numbering\_rpc.sql
33. 20240010000006\_logos\_bucket.sql
34. 20240011000001\_batch\_2b\_family\_and\_seed.sql (families, family\_members, family RLS, system transfer categories)
35. 20240012000001\_batch\_4b\_dedup\_self\_transfer.sql (upi\_ref\_no, imps\_ref\_no, source, balance\_after, transfer\_pair\_id, is\_self\_transfer, status)
36. 20240013000001\_batch\_5b\_gmail\_sync.sql (gmail\_sync\_log, email\_parse\_errors, accounts.current\_balance, profiles.gmail\_email, service\_role-only Vault RPCs)
37. 20240014000001\_batch\_6b\_analytics\_reports.sql (analytics\_reports with owner-only RLS)

Batch 3c had no SQL migration; it changed UI components only.

## 4. Edge Function and 6-hour cron (gmail-sync)

1. Deploy: `npx supabase functions deploy gmail-sync --no-verify-jwt` (the function checks `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` itself).
2. Set secrets: `npx supabase secrets set ENCRYPTION_KEY="..." GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." GEMINI_API_KEY="..." GEMINI_MODEL_FLASH="gemini-3.5-flash-lite"` SUPABASE\_URL and SUPABASE\_SERVICE\_ROLE\_KEY are injected automatically.
3. Schedule: in Dashboard, Edge Functions, gmail-sync, Schedules, create cron `0 */6 * * *` as an HTTP POST with header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and body `{}`. With no `user_id`, it syncs every user with `gmail_connected` and `gmail_sync_enabled` true.
4. Optional: set `USE_SUPABASE_EDGE_GMAIL_SYNC=true` on the Express server to route manual syncs through the Edge Function.

## 5. External dashboards and config

### Google Cloud Console (OAuth Web Client)

- Authorized JavaScript origins: http://localhost:3000, https://finance.zaboraa.com, https://zaboraa.com
- Authorized redirect URIs: `postmessage`, https://finance.zaboraa.com, http://localhost:3000
- OAuth consent screen: add the `https://www.googleapis.com/auth/gmail.readonly` scope. Either list your email under Test users, or publish the app. In Testing mode, refresh tokens expire after 7 days, which breaks the 6-hour sync. This is the main production blocker for Batch 5b.

### Supabase Dashboard

- Authentication, URL Configuration: Site URL `https://finance.zaboraa.com`; Redirect URLs `https://finance.zaboraa.com/**` and `http://localhost:3000/**`
- Database, Extensions: confirm `vault` is enabled (migration 36 has an encrypted fallback table if it is not)

### Codebase

- `.env` is gitignored; never commit it.
- `firebase-applet-config.json` needs no edit; the app uses direct Google Identity Services on localhost, finance.zaboraa.com and zaboraa.com.
- CORS is already locked to https://finance.zaboraa.com. Behind a reverse proxy, forward to Express on port 3000 with `X-Forwarded-Host` and `X-Forwarded-Proto`.
- Keep the same `ENCRYPTION_KEY` between local and production if they share a database. After any key change, re-save PAN and Payment Instructions in Settings.

## 6. Post-deploy smoke test

1. Sign in with an `ALLOWED_EMAILS` account; sign in with a non-allowed account and confirm it is rejected.
2. Unauthenticated calls to `/api/*` return 401.
3. Upload a statement, confirm staging and dedup work.
4. Connect Gmail, run a manual sync, confirm `gmail_sync_log` gets a row.
5. Generate an Analytics report on `/analytics` and export to PDF.
6. Confirm the cron fires after the next 6-hour mark.

## 7. Single prompt for Antigravity CLI

> Review the attached Zaboraa Finance Go-Live Deployment Checklist against the actual codebase. For each section, verify that file names, migration order, env variable names, Edge Function config and CORS settings match what exists in the repo. List every mismatch or missing item, restore the missing scripts/rls-verify.ts and scripts/auth-sweep.ts, confirm how the 4.5 MB vs 20 MB upload limit is handled for the chosen host, then run lint and build and report the results. Do not change anything outside these checks without asking.
