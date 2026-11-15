# Zaboraa Finance — Product Requirement Document (PRD) v2.9.0

**Document Version**: 2.9.0  
**Status**: Production Go-Live Verified  
**Target Environment**: `https://finance.zaboraa.com`  
**Linked Supabase DB**: `yargpwshsycktbcxnpit` (`Finance-Zaboraa-02`, Seoul)

---

## Executive Summary & Architecture Overview

Zaboraa Finance is a modern personal and small-business financial management platform built as a Vite + React Single Page Application (SPA) with Vercel Serverless Functions and Supabase Postgres.

### Core Stack Highlights
1. **Frontend**: Vite + React + Tailwind CSS + Lucide Icons.
2. **Backend / API**: Vercel Serverless Functions (`api/*.ts`) on Vercel Hobby Plan (2 function consolidation architecture: `api/auth/google.ts` for authentication and `api/[...all].ts` catch-all for secondary endpoints).
3. **Database & Auth**: Supabase Postgres with 37 database migrations applied in strict order, backed by Row Level Security (RLS) on all 17 public tables.
4. **Edge Functions**: Supabase Edge Function (`gmail-sync`) for automated background email statement ingestion.
5. **Security & Seeding**: First-login user bootstrap seeding profiles, default family units, workspace scopes, and system category hierarchies automatically upon session minting.

---

## Production API Endpoints (Vercel Serverless Consolidation)

To comply with Vercel Hobby Plan constraints (12 Serverless Functions limit), all backend endpoints are routed through 2 serverless functions:

1. **`api/auth/google.ts`**: Dedicated public sign-in endpoint.
2. **`api/[...all].ts`**: Multi-route catch-all dispatcher handling authenticated backend operations.

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

## Revision History

- **v2.9.0 (2026-11-15)**: Completed migration from Express monolith to 22 Vercel Serverless Functions. Applied all 37 Supabase DB migrations on linked `Finance-Zaboraa-02` project (`yargpwshsycktbcxnpit`). Deployed `gmail-sync` Edge Function. Passed full RLS security audit and auth sweep.
- **v2.8.0**: Integrated Gemini AI financial assistant endpoints and extended family workspace schema.
