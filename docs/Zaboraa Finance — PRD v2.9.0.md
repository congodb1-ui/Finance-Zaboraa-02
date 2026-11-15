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
2. **Backend / API**: Vercel Serverless Functions (`api/*.ts` and `api/*/*.ts`) providing self-contained, un-bundled runtime endpoints.
3. **Database & Auth**: Supabase Postgres with 37 database migrations applied in strict order, backed by Row Level Security (RLS) on all 17 public tables.
4. **Edge Functions**: Supabase Edge Function (`gmail-sync`) for automated background email statement ingestion.
5. **Security & Seeding**: First-login user bootstrap seeding profiles, default family units, workspace scopes, and system category hierarchies automatically upon session minting.

---

## Production API Endpoints (Vercel Serverless)

| Endpoint | Method | Authentication | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/google` | `POST` | Public / Google ID Token | Verifies Google ID tokens, creates Supabase user, seeds bootstrap records, returns session tokens. |
| `/api/export` | `GET` | Bearer Token Required | Exports workspace data (JSON/CSV). |
| `/api/upload` | `POST` | Bearer Token Required | Processes bank statement file uploads. |
| `/api/upload/finalize` | `POST` | Bearer Token Required | Finalizes staged transaction imports. |
| `/api/transactions/[id]` | `PATCH` | Bearer Token Required | Updates transaction metadata or categorizations. |
| `/api/backup` | `GET` | Bearer Token Required | Returns encrypted account and workspace backup payload. |
| `/api/payment-instructions` | `GET/POST` | Bearer Token Required | Fetches or creates payment instructions. |
| `/api/payment-instructions/[id]` | `PATCH` | Bearer Token Required | Modifies payment instructions. |
| `/api/payment-instructions/[id]/reveal` | `POST` | Bearer Token Required | Decrypts and reveals secure bank/PAN payment info. |
| `/api/profile/pan` | `POST` | Bearer Token Required | Updates user PAN details securely. |
| `/api/gmail/status` | `GET` | Bearer Token Required | Returns Gmail sync integration status. |
| `/api/gmail/connect` | `POST` | Bearer Token Required | Initiates OAuth flow or sets connection tokens for Gmail. |
| `/api/gmail/disconnect` | `POST` | Bearer Token Required | Removes stored Gmail OAuth credentials. |
| `/api/gmail/settings` | `PATCH` | Bearer Token Required | Updates Gmail auto-sync preferences. |
| `/api/gmail/sync` | `POST` | Bearer Token Required | Triggers manual sync of financial email alerts. |
| `/api/analytics/reports` | `GET` | Bearer Token Required | Generates financial report aggregations. |
| `/api/analytics/generate` | `POST` | Bearer Token Required | Computes ad-hoc analytics models. |
| `/api/ai/test` | `POST` | Bearer Token Required | Tests Gemini AI connectivity and API key validity. |
| `/api/ai/anomalies` | `POST` | Bearer Token Required | Scans workspace transactions for spending anomalies. |
| `/api/ai/chat` | `POST` | Bearer Token Required | Interactive AI financial advisor chat endpoint. |
| `/api/ai/monthly-report` | `POST` | Bearer Token Required | Synthesizes monthly financial summaries and suggestions. |
| `/api/ai/categorize` | `POST` | Bearer Token Required | Automated transaction categorization via LLM heuristics. |

---

## Revision History

- **v2.9.0 (2026-11-15)**: Completed migration from Express monolith to 22 Vercel Serverless Functions. Applied all 37 Supabase DB migrations on linked `Finance-Zaboraa-02` project (`yargpwshsycktbcxnpit`). Deployed `gmail-sync` Edge Function. Passed full RLS security audit and auth sweep.
- **v2.8.0**: Integrated Gemini AI financial assistant endpoints and extended family workspace schema.
