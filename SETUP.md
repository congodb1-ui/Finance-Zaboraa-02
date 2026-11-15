# Zaboraa Finance — Local & Production Setup Guide

> **Portal Domain:** `https://finance.zaboraa.com`  
> **Architecture:** Vite + React SPA + Express (`server.ts` / `src/server-app.ts`) + Supabase (PostgreSQL + RLS + Storage)

---

## (a) Exact Steps to Run Locally After Download

1. **Install Node.js (`>= 20`) and dependencies:**
   ```bash
   npm install
   ```
2. **Create your local environment file from the template:**
   ```bash
   cp .env.example .env
   ```
   Fill in every required variable in `.env` (see Section b below).
3. **Run the Supabase database migrations** (see Section c below).
4. **Verify TypeScript and production bundle compilation:**
   ```bash
   npm run lint     # runs tsc --noEmit
   npm run build    # runs vite build
   ```
5. **Start the Express + Vite development server on port `3000`:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.
6. **Production start (after `npm run build`):**
   ```bash
   NODE_ENV=production npm start
   ```

---

## (b) Environment Variables — What to Set and Where

### Where to Set Them
- **Local Development:** Place in `.env` at the project root (`.env*` is gitignored; never commit `.env`).
- **Production Hosting (Vercel / Cloud Run / VPS):** Add in your hosting provider's Environment Variables / Secrets manager. Variables prefixed with `VITE_` are embedded in the browser bundle at build time; **never** add `VITE_` to server secrets.

### Client-Side Variables (`VITE_*`)
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase `anon` public key (enforces PostgreSQL RLS) |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud OAuth Web Client ID for `finance.zaboraa.com` (authorized origins: `http://localhost:3000`, `https://finance.zaboraa.com`) |
| `VITE_APP_URL` | Portal base URL (`http://localhost:3000` locally or `https://finance.zaboraa.com` in production) |

### Server-Only Variables (Express `/api/*`)
| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key used strictly on Express to verify GIS logins and write `audit_log` entries |
| `ALLOWED_EMAILS` | Comma-separated allowlist of Google email addresses allowed to access the portal |
| `ENCRYPTION_KEY` | 32+ character random secret for server-side AES-256-GCM encryption of `profiles.pan_encrypted` and `payment_instructions` |
| `GEMINI_API_KEY` | Google AI Gemini API key used by server `/api/ai/*` routes |
| `GEMINI_MODEL_FLASH` | Default `gemini-3.5-flash-lite` (categorization, cleaning, anomalies, chat) |
| `GEMINI_MODEL_PRO` | Default `gemini-3.8-flash` (monthly financial report) |
| `GOOGLE_CLIENT_ID` | Optional server override for `VITE_GOOGLE_CLIENT_ID` |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional server fallback matching `VITE_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional server fallback matching `VITE_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_APP_URL` | Optional server fallback matching `VITE_APP_URL` |

---

## (c) How to Run Supabase Migrations in Order

### Option 1: Supabase CLI (Recommended)
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Option 2: Supabase Dashboard → SQL Editor
Run the files in `supabase/migrations/` **one by one in exact chronological filename order**:

1. `20240001000000_extensions.sql`
2. `20240002000000_accounts.sql`
3. `20240002000001_categories.sql`
4. `20240002000002_workspaces.sql`
5. `20240002000003_rls_accounts.sql`
6. `20240002000004_seed_categories.sql`
7. `20240002000005_on_new_user_trigger.sql`
8. `20240002000006_rls_categories.sql`
9. `20240002000007_rls_workspaces.sql`
10. `20240003000000_statement_uploads.sql`
11. `20240003000001_staged_transactions.sql`
12. `20240003000002_rls_uploads.sql`
13. `20240003000003_storage_buckets.sql`
14. `20240004000000_transactions.sql`
15. `20240004000001_audit_log.sql`
16. `20240004000002_rules.sql`
17. `20240004000003_rls_transactions.sql`
18. `20240004000004_rls_rules.sql`
19. `20240004000005_rls_audit_log.sql`
20. `20240007000000_recurring.sql`
21. `20240007000001_budgets.sql`
22. `20240008000000_invoicing.sql`
23. `20240009000001_profiles.sql`
24. `20240009000002_ai_settings.sql`
25. `20240009000003_accounts_opening_balance.sql`
26. `20240009000004_transactions_transfer_pair.sql`
27. `20240009000005_ai_settings_report_cache.sql`
28. `20240010000001_business_profiles.sql`
29. `20240010000002_clients.sql`
30. `20240010000003_payment_instructions.sql`
31. `20240010000004_invoices_v2.sql`
32. `20240010000005_invoice_numbering_rpc.sql`
33. `20240010000006_logos_bucket.sql`
34. `20240011000001_batch_2b_family_and_seed.sql`
35. `20240012000001_batch_4b_dedup_self_transfer.sql`
36. `20240013000001_batch_5b_gmail_sync.sql`
37. `20240014000001_batch_6b_analytics_reports.sql`

### Deploying the `gmail-sync` Edge Function & 6-Hour Cron
```bash
npx supabase functions deploy gmail-sync
npx supabase secrets set ENCRYPTION_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GEMINI_API_KEY=...
```
Schedule `gmail-sync` in Supabase Dashboard → Edge Functions → Schedules with cron `"0 */6 * * *"`.

---

## (d) How to Run Security Verification Scripts

### 1. Cross-User RLS Verification (`scripts/rls-verify.ts`)
Verifies positive seed presence (`> 0` rows for User 1), cross-user read/insert/update/delete isolation for User 2, and unauthenticated anon-key read blocking (`0` rows) across all 13 private tables:

```bash
# Optional: seed minimal rows as User 1 first (uses RLS_USER1_TOKEN only, never service_role)
RLS_USER1_TOKEN=<user1_jwt> RLS_USER2_TOKEN=<user2_jwt> npx tsx scripts/rls-verify.ts --seed

# Run full RLS verification (exits 0 on all pass, 1 on any failure)
RLS_USER1_TOKEN=<user1_jwt> RLS_USER2_TOKEN=<user2_jwt> npx tsx scripts/rls-verify.ts
```

*(Note: `audit_log` is `SELECT`-only for authenticated users; perform an authenticated upload or categorization in the app as User 1 to generate an `audit_log` entry before running without `--seed`.)*

### 2. Unauthenticated Express API Auth Sweep (`scripts/auth-sweep.ts`)
Ensure the server is running (`npm run dev` on port `3000`, or pass `BASE_URL=...`), then verify every protected `/api/*` route returns HTTP `401` when called without a token:

```bash
npx tsx scripts/auth-sweep.ts
```
