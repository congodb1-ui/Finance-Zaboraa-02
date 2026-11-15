# Zaboraa Finance — Go-Live QA Audit Report (v2)
**Date**: November 15, 2026
**Environment**: Production (`https://finance.zaboraa.com`)
**Vercel Project**: `finance-zaboraa-02` (Hobby Plan, ₹0)
**Supabase Project**: `Finance-Zaboraa-02` (`yargpwshsycktbcxnpit`)

---

## 1. Executive Summary

A comprehensive release engineering audit and verification sweep was executed following the resolution of the Vercel Hobby 12-Serverless-Function limit blocker. All 23 original standalone routes under `api/` have been consolidated into **exactly 2 serverless functions**:
1. `api/auth/google.ts`: OAuth sign-in and magiclink verification endpoint.
2. `api/[...all].ts`: Single catch-all router for all secondary API endpoints.

All 20 secondary routes were verified via unauthenticated HTTP calls against production (`https://finance.zaboraa.com`), with all endpoints properly denying access with `401 Unauthorized`. Additionally, the dedicated authentication sweep (`scripts/auth-sweep.ts`) passed with 0 unauthenticated security bypass vulnerabilities detected.

---

## 2. Serverless Function Verification Matrix

| Check / Requirement | Baseline Constraint | Status | Empirical Result / Details |
| :--- | :--- | :--- | :--- |
| **Function Count Limit** | Max 12 Functions (Hobby Plan) | **PASSED** | Exactly 2 TypeScript files in `api/`: `api/auth/google.ts` & `api/[...all].ts`. |
| **Vercel Build Status** | Clean deployment build | **PASSED** | 0x `12 Serverless Functions` error, 0x `TS2688` type errors. |
| **Frontend Root (`/`)** | HTTP 200 OK | **PASSED** | Returns HTML SPA bundle cleanly on `https://finance.zaboraa.com`. |
| **Auth Route (`/api/auth/google`)** | Invalid token error handling | **PASSED** | Returns `401 {"error":"Invalid or expired Google sign-in token. Please try again."}`. |
| **Catch-All Auth Security** | Unauthenticated 401 | **PASSED** | Verified across all 20 secondary routes via direct HTTP requests. |

---

## 3. Route Authentication & Status Matrix

All 20 secondary routes routed through `api/[...all].ts` were audited:

| Method | Endpoint Route | Unauthenticated Status | Pass / Fail |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/test` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/ai/anomalies` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/ai/chat` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/ai/monthly-report` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/ai/categorize` | 401 Unauthorized | **PASSED** |
| `GET` | `/api/export` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/upload` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/upload/finalize` | 401 Unauthorized | **PASSED** |
| `PATCH` | `/api/transactions/:id` | 401 Unauthorized | **PASSED** |
| `GET` | `/api/backup` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/payment-instructions` | 401 Unauthorized | **PASSED** |
| `PATCH` | `/api/payment-instructions/:id` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/payment-instructions/:id/reveal` | 401 Unauthorized | **PASSED** |
| `GET` | `/api/gmail/status` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/gmail/connect` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/gmail/disconnect` | 401 Unauthorized | **PASSED** |
| `PATCH` | `/api/gmail/sync-settings` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/gmail/sync` | 401 Unauthorized | **PASSED** |
| `GET` | `/api/analytics/reports` | 401 Unauthorized | **PASSED** |
| `POST` | `/api/analytics/reports/generate` | 401 Unauthorized | **PASSED** |

---

## 4. Security & Compliance Findings

1. **Secret Scanning**:
   - Clean. No production secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `GEMINI_API_KEY`) committed to git history or output artifacts.
2. **Dependency Vulnerabilities**:
   - `npm audit --omit=dev`: Identifies 5 high-severity advisories (`@grpc/grpc-js` deep dependency in `@firebase/firestore` and legacy `xlsx` library). Non-blocking for edge runtime serverless functions, but scheduled for future cleanup.
3. **Database RLS Policies**:
   - Row Level Security policies enforce user isolation at the Postgres level. Direct script execution verified clean policy separation without schema mutations (`db push` skipped as required).

---

## 5. 42501 Fix (November 15, 2026)

* **Migration Filename**: `20261115000000_fix_authenticated_grants.sql`
* **Remote Status**: 38/38 migrations applied on project `yargpwshsycktbcxnpit`.
* **Grants Applied**: 21 public tables received explicit `GRANT USAGE ON SCHEMA public`, `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated`, and sequence grants (`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated`).
* **RLS Isolation Test**: QA User A reading own rows returns `200 OK`; QA User A reading QA User B rows returns `0 rows`.
* **42501 Permission Denied Result**: **RESOLVED** across `profiles`, `business_profiles`, `payment_instructions`, and `ai_settings`.

---

## 6. Human To-Do List (Manual Steps Required)

> [!IMPORTANT]
> The following manual administrative tasks must be verified directly in the respective vendor consoles by an account owner:

1. **Supabase Console**:
   - Verify Site URL is set to `https://finance.zaboraa.com`.
   - Verify Redirect URLs list includes `https://finance.zaboraa.com/**`.
2. **Google Cloud Console (OAuth)**:
   - Ensure `https://finance.zaboraa.com` is listed under **Authorized JavaScript origins**.
   - Ensure `https://finance.zaboraa.com/api/auth/google` (if applicable for redirect flow) is authorized.
3. **Cloudflare DNS**:
   - Confirm CNAME record for `finance.zaboraa.com` points cleanly to Vercel CNAME (`cname.vercel-dns.com`).
