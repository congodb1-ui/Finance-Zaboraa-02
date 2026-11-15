# Zaboraa Finance — Product Requirement Document (PRD) v2.9.0

**Document Version**: 2.9.0  
**Status**: Production Go-Live Verified & Operational  
**Target Environment**: `https://finance.zaboraa.com`  
**Vercel Project**: `finance-zaboraa-02` (Hobby Plan, ₹0)  
**Linked Supabase DB**: `yargpwshsycktbcxnpit` (`Finance-Zaboraa-02`, Seoul)

---

## 1. Executive Summary & Architecture Overview

Zaboraa Finance is a modern personal and small-business financial management platform built as a Vite + React Single Page Application (SPA) with Vercel Serverless Functions and Supabase Postgres.

### Core Stack Highlights
1. **Frontend**: Vite + React + Tailwind CSS + Lucide Icons.
2. **Backend / API**: Vercel Serverless Functions (`api/*.ts`) on Vercel Hobby Plan (2-function consolidation architecture: `api/auth/google.ts` for OAuth authentication and `api/[...all].ts` catch-all for secondary endpoints).
3. **Database & Auth**: Supabase Postgres with 38 database migrations applied in strict order, backed by Row Level Security (RLS) on all 21 public user-facing tables.
4. **Grant & Schema Security**: Migration `20261115000000_fix_authenticated_grants.sql` explicitly grants schema `USAGE`, table `SELECT, INSERT, UPDATE, DELETE`, and sequence `USAGE, SELECT` permissions to the `authenticated` role, resolving 42501 PostgREST permission errors while maintaining strict RLS isolation (`auth.uid() = user_id`).
5. **Edge Functions**: Supabase Edge Function (`gmail-sync`) for background email statement ingestion.
6. **Security & Seeding**: First-login user bootstrap seeding profiles, default family units, workspace scopes, and system category hierarchies automatically upon session minting.

---

## 2. Serverless Function Architecture (Vercel Hobby 12-Limit Resolution)

To comply with Vercel Hobby Plan constraints (12 Serverless Functions limit), all backend endpoints are routed through **exactly 2 serverless functions**:

1. **`api/auth/google.ts`**: Dedicated public sign-in endpoint (Google ID token exchange & magiclink minting).
2. **`api/[...all].ts`**: Multi-route catch-all dispatcher handling authenticated backend operations with inlined auth middleware and CORS headers.

### Production API Endpoints Matrix

| Endpoint | Method | Authentication | Catch-All Handler Location |
| :--- | :--- | :--- | :--- |
| `/api/auth/google` | `POST` | Public / Google ID Token | Dedicated function (`api/auth/google.ts`) |
| `/api/export` | `GET` | Bearer Token Required | `api/[...all].ts` |
| `/api/upload` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/upload/finalize` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/transactions/:id` | `PATCH` | Bearer Token Required | `api/[...all].ts` |
| `/api/backup` | `GET` | Bearer Token Required | `api/[...all].ts` |
| `/api/payment-instructions` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/payment-instructions/:id` | `PATCH` | Bearer Token Required | `api/[...all].ts` |
| `/api/payment-instructions/:id/reveal` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/gmail/status` | `GET` | Bearer Token Required | `api/[...all].ts` |
| `/api/gmail/connect` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/gmail/disconnect` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/gmail/sync-settings` | `PATCH` | Bearer Token Required | `api/[...all].ts` |
| `/api/gmail/sync` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/analytics/reports` | `GET` | Bearer Token Required | `api/[...all].ts` |
| `/api/analytics/reports/generate` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/ai/test` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/ai/anomalies` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/ai/chat` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/ai/monthly-report` | `POST` | Bearer Token Required | `api/[...all].ts` |
| `/api/ai/categorize` | `POST` | Bearer Token Required | `api/[...all].ts` |

---

## 3. Database Schema & RLS Matrix

The database contains 38 migrations. All 21 public user-facing tables enforce Row Level Security (RLS):

| Table Name | Owner Column | RLS Policy Rule | Authenticated Role Grants |
| :--- | :--- | :--- | :--- |
| `accounts` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `ai_settings` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `analytics_reports` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `audit_log` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `budgets` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `business_profiles` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `categories` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `clients` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `email_parse_errors` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `families` | `owner_id` | `auth.uid() = owner_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `family_members` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `gmail_sync_log` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `invoices` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `payment_instructions` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `profiles` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `recurring_transactions` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `staged_transactions` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `statement_uploads` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `transaction_rules` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `transactions` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `workspaces` | `user_id` | `auth.uid() = user_id` | `SELECT, INSERT, UPDATE, DELETE` |
| `gmail_oauth_vault_fallback` | N/A (Server Only) | RLS Enabled (No Client Policies) | `REVOKE ALL FROM PUBLIC, anon, authenticated` |

---

## 4. Revision History

- **v2.9.0 (2026-11-15)**: 
  - Completed migration to 2 Vercel Serverless Functions (`api/auth/google.ts` + `api/[...all].ts`) resolving the Vercel Hobby 12-function limit.
  - Applied migration `20261115000000_fix_authenticated_grants.sql` (38/38 applied on remote project `yargpwshsycktbcxnpit`), resolving PostgREST 42501 permission denied errors.
  - Passed end-to-end production smoke test on `https://finance.zaboraa.com`, RLS isolation audit (`scripts/rls-verify.ts`), and unauthenticated endpoint sweep (`scripts/auth-sweep.ts`).
- **v2.8.0**: Integrated Gemini AI financial assistant endpoints and extended family workspace schema.
