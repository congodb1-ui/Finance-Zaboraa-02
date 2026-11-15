# Zaboraa Finance — PRD v2.8.0

Nov 15, 2026 · @congo 1992

## Document Header

> **Document Version:** `v2.8.0` | **Product Name:** Zaboraa Finance | **Domain:** https://finance.zaboraa.com | **Last Updated:** 2026-11-15
>
> **Changelog:**
>
> - `v1.0.0` — Original PRD + 7 batches
> - `v2.0.0 (Merged)` — Merged PRD + Claude review. Zabora Finance branding, zaboraa.com domain config, credit-card handling, audit log, idle logout, encrypted backup
> - `v2.1.0` — **BRANDING: Zabora → Zaboraa.** Product renamed to Zaboraa Finance everywhere.
> - `v2.2.0` — **BUILD COMPLETE THROUGH BATCH 8B.** Architecture: Vite + React SPA + Express dev server.
> - `v2.3.0` — Plan only. Added §4.9 and §4.10. Batches 9A–9D and 10A–10H.
> - `v2.4.0` — Batches 9A–9D + 10A–10E complete.
> - `v2.5.0` — **ALL BATCHES 0–10H COMPLETE.**
> - `v2.6.0` — **GO-LIVE HARDENING COMPLETE (Passes 1 & 2).** Domain `https://finance.zaboraa.com`.
> - `v2.7.0` — **SCOPE EXPANSION.** Added §4.11 (Gmail Auto-Import), §4.12 (Multi-Bank Parsers), §4.13 (Family Schema), §4.14 (Cross-Source Dedup & Self-Transfer). New batches: 2b, 3c, 4b, 5b.
> - `v2.8.0 (Current)` — **BATCH 2b COMPLETE. All four batch prompts (2b, 3c, 4b, 5b) fully detailed with confirmed real data.** Accounts list locked at 11 accounts; BOM last4 = 8212 confirmed. BOI parser (HO.starsandesh@bankofindia.co.in) added to Batch 3c. PNB confirmed as manual-upload-only (Salim's Gmail, not Wasim's). BOM secondary address `mahaalerts@bankofmaharashtra.bank.in` confirmed active. Build status and Next Actions updated.

> **Version Convention:** `vMAJOR.MINOR.PATCH`

> **⚠️ ARCHITECTURE — READ FIRST:** Codebase is **Vite + React SPA + Express dev server** (`server.ts` / `src/server-app.ts`), NOT Next.js. All prompts must say: "Keep Vite + React SPA + Express architecture — do NOT convert to Next.js." Domain: `https://finance.zaboraa.com`. Brand: **Zaboraa Finance** (double-a).

## 1. Product Identity

| Item | Value |
| --- | --- |
| **Product Name** | **Zaboraa Finance** |
| **Domain** | **https://finance.zaboraa.com** |
| **Tagline** | Your money, clearly accounted. |
| **Owner** | Wasim Salim Sayyed (primary). Family members in V2 UI. |
| **Currency / FY** | INR, April–March, Asia/Kolkata |
| **Build Status** | Batches 0–10H + Hardening + **Batch**es 2b, 3c, 4b, 5b COMPLETE. Go-Live NEXT. |

## 2. Users & Access Model (Updated v2.7.0)

### V1 (Current — Single User)

| Role | Who | Access |
| --- | --- | --- |
| **Owner** | Wasim (allowlisted Google) | Full access |
| **Public Visitor** | Anyone without login | Landing only |
| **Other Google User** | Any other login | Empty + "Not authorized" |

### V2 (Family — schema ready in Batch 2b ✅, UI deferred)

Decision: Option 3 — schema supports family from day one, family UI built in V2.

| Role (V2) | Access |
| --- | --- |
| **Owner** | All accounts + all family data + reports |
| **Member** | Own accounts + shared accounts |
| **View-only** | Read-only on shared accounts |

**Non-Goals:** Multi-user SaaS, direct bank API, automatic ITR/GST filing, payroll, UPI initiation.

## 3. Tech Stack — LOCKED

| Layer | Choice |
| --- | --- |
| Frontend | Vite + React SPA + TypeScript + Tailwind CSS |
| Backend | Express dev server (`server.ts`, `src/server-app.ts`) |
| DB | Supabase (PostgreSQL) — Auth, DB, Storage, RLS |
| API Client | `src/lib/api-client.ts` — `apiGet/apiPost/apiPatch`, Bearer token, 401→signOut |
| Hosting | Vercel (Express adapter) or Node host (Render/Railway/Fly.io) |
| AI Runtime | Gemini: `GEMINI_MODEL_FLASH` (gemini-3.5-flash-lite) + `GEMINI_MODEL_PRO` (gemini-3.8-flash) |
| AI Builder | Google AI Studio — Gemini 3.8 Flash default; Carbon for hardest batches |
| Parsers | `pdfjs-dist` + `papaparse` + `xlsx`. Banks: `hdfc.ts`, `paytm-upi.ts` (Batch 3c), `gpay.ts` (Batch 3c), `bom.ts` (Batch 3c), `boi.ts` (Batch 3c), `sbi.ts`, `icici.ts`, `axis.ts`, `kotak.ts`, `generic.ts` |
| Gmail | Google OAuth `gmail.readonly` scope — Supabase Edge Function cron, every 6 hours (Batch 5b) |

## 4. Functional Requirements

### 4.1 Master Profile

Fields: Full Legal Name, Mobile, Email, PAN (encrypted), Address, Default FY, INR, Asia/Kolkata. Linked to `auth.users.id`.

**Pre-seeded (Batch 2b ✅):** Owner name = **Wasim Salim Sayyed** (used for self-transfer detection). Full account list below.

### 4.2 Accounts Module (Batch 2b ✅ — 11 accounts seeded)

| Field | Rule |
| --- | --- |
| nickname, bank\_name, last4, account\_number\_full (encrypted), customer\_id (encrypted), ifsc, upi\_id | For matching |
| account\_type | Savings / Current / Wallet / UPI / Cash / Credit Card |
| purpose | Personal / Business / Mixed |
| account\_holder\_name | Legal account holder (new — Batch 2b) |
| operated\_by\_owner | true = Wasim operates; self-transfer between all true accounts (new — Batch 2b) |
| **Edit feature** | All account fields editable after creation. Edit button on Account Detail page. |

**Accounts seeded (Batch 2b ✅):**

*Wasim's own accounts (operated\_by\_owner = true):*

| # | Bank | Type | Last4 | Nickname |
| --- | --- | --- | --- | --- |
| 1 | HDFC Bank | savings | 3597 | Wasim HDFC |
| 2 | HDFC Bank | current | 8458 | Congo |
| 3 | HDFC Bank | current | 5231 | Zaboraa |
| 4 | Bank of Maharashtra | savings | **8212** | Wasim BOM |

*Business accounts in family names (operated\_by\_owner = true):*

| # | Bank | Type | Last4 | Nickname | Holder |
| --- | --- | --- | --- | --- | --- |
| 5 | HDFC Bank | current | 5320 | Cifor Systems | Alisha Wasim Sayyed |
| 6 | HDFC Bank | current | 5244 | Hamtron Tech | Minaz Salim Sayyed |

*Family personal accounts (operated\_by\_owner = false — Family Transfer):*

| # | Bank | Type | Last4 | Nickname | Holder |
| --- | --- | --- | --- | --- | --- |
| 7 | HDFC Bank | savings | 3011 | Alisha HDFC | Alisha Wasim Sayyed |
| 8 | Bank of Maharashtra | savings | 9735 | Alisha BOM | Alisha Wasim Sayyed |
| 9 | Bank of India | savings | 0553 | Minaz BOI | Minaz Salim Sayyed |
| 10 | Punjab National Bank | savings | 7904 | Salim PNB | Salim Gaffar Sayyed |

**Self-Transfer Group** (transfers between any two of these = Self Transfer): `['3597', '8458', '5231', '8212', '5320', '5244']`

### 4.3 Statement Upload & Duplicate Detection — 5 Layers

- **Layer 1** File Hash: SHA-256 same user+account → Block
- **Layer 2** Period: Same account + same From–To → Warn + Missing Only mode
- **Layer 3** Transaction Multiset: `account_id + txn_date + amount + normalizedDescription`
- **Layer 4 (Batch 4b)** UPI Ref No cross-source: `upi_ref_no` exists on any account → skip silently
- **Layer 5 (Batch 4b)** IMPS Ref cross-source: `imps_ref_no` exists → skip silently

### 4.4 Transactions & Categorization (Updated v2.7.0)

**New fields (Batch 4b):**

| Field | Description |
| --- | --- |
| `upi_ref_no` | UPI transaction ref (globally unique NPCI key) |
| `imps_ref_no` | IMPS reference number |
| `source` | `manual_upload` \| `gmail_auto` \| `statement_import` |
| `balance_after` | Account balance after this transaction |
| `transfer_pair_id` | Links debit+credit sides of a transfer |
| `is_self_transfer` | True if both sides are own accounts |

**Self-Transfer Detection:** If money moves between any two accounts where `operated_by_owner = true`:

- Both tagged `is_self_transfer = true`, `category = Self Transfer`
- Linked via `transfer_pair_id`
- Excluded from Income + Expense totals in all reports
- Shown in dedicated "Transfers" tab only

Rule: `IF imps_ref_no appears on both a DEBIT and CREDIT for accounts owned by same user_id → Self Transfer`. Also: `IF sender/destination name contains 'WASIM SALIM SAYYED' AND the other account is registered under same user_id → Self Transfer`.

**Fully automated categorization:**

- Confidence > 0.75 → `status = 'confirmed'`, inserted automatically
- Confidence < 0.75 → `status = 'review'`, flagged in weekly digest
- No manual confirmation screen for routine transactions

### 4.5–4.10 (Unchanged from v2.6.0)

Dashboard, Gemini AI, ITR & Reports, Additional Modules, Data Persistence Rules, Export Invoicing v2 — all complete.

---

## 4.11 Gmail Auto-Import (Batch 5b)

Gmail = primary daily driver. No manual uploads needed for UPI/IMPS.

| Tier | Source | Frequency | Purpose |
| --- | --- | --- | --- |
| 1 | Gmail auto-import | Every 6 hours | Daily driver: UPI + IMPS |
| 2 | Bank statement upload | Month-end | Catch NEFT/RTGS, reconcile |
| 3 | Paytm/GPay statement | Quarterly / one-time | History import, category tags |

### Confirmed Gmail Alert Sources (v2.8.0)

| Bank | From address | Status | Accounts covered |
| --- | --- | --- | --- |
| HDFC | alerts@hdfcbank.bank.in | ✅ Confirmed active | 3597, 8458, 5231, 5244, 5320, 3011 |
| HDFC | alerts@hdfcbank.net | ✅ Confirmed active | Same HDFC accounts |
| Bank of Maharashtra | mahaalert@mahabank.co.in | ✅ Confirmed active | 8212 (Wasim), 9735 (Alisha) |
| Bank of Maharashtra | mahaalerts@bankofmaharashtra.bank.in | ✅ Confirmed active (secondary) | Same BOM accounts |
| Bank of India | HO.starsandesh@bankofindia.co.in | ✅ Confirmed active | 0553 (Minaz, alerts in Wasim's Gmail) |
| Punjab National Bank | salim64sayyed@gmail.com | ⚠️ Personal Gmail — not a bank alert address | Alerts go to Salim's Gmail. PNB = manual upload only. |

### Parser Regex Specs (see Batch 5b prompt for full detail)

Five parsers: HDFC UPI debit, HDFC IMPS credit, HDFC IMPS debit, HDFC balance alert (balance update only — no transaction), BOM IMPS. BOI IMPS (best-effort — confirm format from live sample).

### Pipeline (Edge Function, every 6 hours)

1. Gmail query: `from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in) after:{last_sync}`
2. For each email: identify type → extract fields → match account by last4 → dedup (UPI/IMPS ref) → self-transfer check → AI categorize → insert → update balance → log
3. Write `gmail_sync_log`. Update `profiles.gmail_last_synced`.

**Month-end reconciliation (statement upload):** UPI/IMPS ref match → mark reconciled, skip. New NEFT/RTGS → AI categorize → insert.

**Privacy:** Never store email body. Only parsed transaction fields. PII mask before Gemini. Gmail token server-only, never returned by API.

---

## 4.12 Multi-Bank Statement Parsers (Batch 3c)

### Paytm UPI PDF (`parsers/paytm-upi.ts`)

- Date: "10 Nov\\n10:01 PM" → parse `DD MMM HH:MM`
- Amount: `- Rs.X` = Debit, `+ Rs.X` = Credit
- UPI ref: regex `/UPI Ref No[:\s]+(\d{9,})/i`
- Paytm tags → category mapping (see §Batch 3c prompt for full table)
- Tags skip AI categorisation (`ai_category_skip: true`)

### Google Pay PDF/CSV (`parsers/gpay.ts`)

- Columns: Date & Time, Payee Name, UPI Transaction ID, Bank used, Amount
- UPI Transaction ID → `upi_ref_no`. All rows = debit.
- If multiple HDFC accounts: prefer account where upi\_id is set (or last4 = 3597 for GPay default)

### Bank of Maharashtra (`parsers/bom.ts`)

- Columns: Txn Date, Value Date, Description/Narration, Ref No, Debit, Credit, Balance
- IMPS ref: `/IMPS[\/\s-]?(\d{12})/i`, UTR: `/UTR[:\s]+([A-Z]{4}\d{18})/i`

### Bank of India (`parsers/boi.ts`) — Added v2.8.0

- Columns: Date, Narration/Particulars, Chq/Ref Number, Debit, Credit, Balance
- IMPS ref: `/IMPS\/?[A-Z]*\/?(\d{12})/i`
- Gmail alerts from `HO.starsandesh@bankofindia.co.in` confirmed active

---

## 4.13 Family & Multi-User Support (Batch 2b ✅)

Schema ready. UI in V2.

### Tables Created (Batch 2b ✅)

```sql
CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('owner','member','view_only')),
  display_name text NOT NULL,
  email text,
  relationship text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(family_id, user_id)
);
```

**Family members seeded:** Wasim (owner), Alisha (spouse), Minaz (mother), Salim (father).

**Note:** Minaz has no personal Gmail. Her bank alerts route to `wasimssayyed@gmail.com`. Batch 5b must match by `account_last4`, not by from-address.

---

## 4.14 Cross-Source Dedup & Self-Transfer (Batch 4b)

### New DB Columns (Batch 4b)

```sql
ALTER TABLE transactions ADD COLUMN upi_ref_no text;
ALTER TABLE transactions ADD COLUMN imps_ref_no text;
ALTER TABLE transactions ADD COLUMN source text NOT NULL DEFAULT 'manual_upload'
  CHECK (source IN ('manual_upload','gmail_auto','statement_import'));
ALTER TABLE transactions ADD COLUMN balance_after numeric(15,2);
ALTER TABLE transactions ADD COLUMN transfer_pair_id uuid REFERENCES transactions(id);
ALTER TABLE transactions ADD COLUMN is_self_transfer boolean NOT NULL DEFAULT false;
ALTER TABLE staged_transactions ADD COLUMN upi_ref_no text;
ALTER TABLE staged_transactions ADD COLUMN imps_ref_no text;

CREATE INDEX idx_transactions_upi_ref ON transactions(upi_ref_no) WHERE upi_ref_no IS NOT NULL;
CREATE INDEX idx_transactions_imps_ref ON transactions(imps_ref_no) WHERE imps_ref_no IS NOT NULL;
CREATE INDEX idx_transactions_source ON transactions(source);
CREATE INDEX idx_transactions_self_transfer ON transactions(is_self_transfer) WHERE is_self_transfer = true;
```

### Cross-Source Dedup Strategy

Same UPI payment can appear in HDFC statement + Paytm statement + GPay statement + Gmail alert. Strategy: UPI Ref = gold standard. IMPS Ref = dedup for IMPS. If either ref exists in `transactions` → skip silently. Amount + Date ±1 day = fallback for NEFT/RTGS (flag for review).

### Self-Transfer Rule

```
IF imps_ref_no appears on BOTH a DEBIT and CREDIT
   AND both accounts have operated_by_owner = true
THEN:
  is_self_transfer = true on both
  category = Self Transfer on both
  transfer_pair_id links both rows
  EXCLUDED from P&L totals
  Shown in Transfers tab only

ALSO: IF sender/destination name contains profiles.owner_full_name
      AND other account last4 is registered under same user_id
→ same Self Transfer logic
```

## 5–9. (Unchanged from v2.6.0)

Public/Private Pages, Design System, DB Schema (base), Security & Privacy, AI Model Selection — all unchanged. See v2.6.0 for full spec.

## Security & DB Additions (v2.7.0+)

**Security addition:** Gmail OAuth token stored in Supabase Vault (encrypted). `gmail.readonly` scope only. No write scope. No email content stored.

**DB additions (Batch 2b ✅):**

- `profiles` new columns: `gmail_connected bool`, `gmail_last_synced timestamptz`, `gmail_sync_enabled bool`, `owner_full_name text`
- `accounts` new columns: `account_holder_name text`, `operated_by_owner boolean`
- New system categories: **Self Transfer** (Transfer), **Family Transfer** (Transfer), **Monthly Bissi** (Transfer)
- New payee rules: Sheetal Petroleum → Fuel; Apple Media Services → Subscriptions; Google Cloud → Business-Office

**DB additions (Batch 4b ✅):**

- `transactions` new columns: `upi_ref_no`, `imps_ref_no`, `source`, `balance_after`, `transfer_pair_id`, `is_self_transfer`
- `staged_transactions` new columns: `upi_ref_no`, `imps_ref_no`, `source`
- Indexes on `upi_ref_no`, `imps_ref_no`, `source`, `is_self_transfer`

**DB additions (Batch 5b ✅):**

- New table: `gmail_sync_log`
- New table: `email_parse_errors`

## 10. Domain & Deployment (Unchanged)

See v2.6.0. Note: Vercel + Express body size limit (4.5 MB) vs upload limit (20 MB) — resolve before Go-Live (direct-to-Storage signed upload, or Node host).

## 11. Implementation Plan — Batches (Updated v2.8.0)

**Always include in prompts:** *"Keep Vite + React SPA + Express architecture — do NOT convert to Next.js. Brand is Zaboraa Finance (double-a). Production domain is https://finance.zaboraa.com."*

| Batch | Name | Deliverable | Status |
| --- | --- | --- | --- |
| Batch 0 | Design System | Tailwind + CSS vars, Card/Button/Badge/KPI | ✅ DONE |
| Batch 1 | Foundation + Auth | Vite + Supabase, Google Auth, RLS | ✅ DONE |
| Batch 2 | Accounts | CRUD, health dot, credit-card fields | ✅ DONE |
| **Batch 2b** | Family Schema + Seed | `families`, `family_members`, `family_id` on all tables, RLS rewrite, 11-account seed, Self Transfer category, Account edit feature | ✅ **DONE** |
| Batch 3a | Upload CSV/XLSX | Upload UI, dedup, review | ✅ DONE |
| Batch 3b | PDF Parsing (HDFC) | HDFC + generic PDF parsers | ✅ DONE |
| **Batch 3c** | PDF Parsers — Paytm/GPay/BOM/BOI | `paytm-upi.ts`, `gpay.ts`, `bom.ts`, `boi.ts`, Paytm tag→category mapping | ✅ **DONE** |
| Batch 4 | Transactions + Rules | Multiset dedup, rules, bulk edit | ✅ DONE |
| **Batch 4b** | Cross-Source Dedup + Self-Transfer | New DB columns, Layers 4+5, self-transfer detection, Transfers tab | ✅ **DONE** |
| Batch 5 | Dashboard + ITR | Charts, FY filters, ITR export | ✅ DONE |
| **Batch 5b** | Gmail Auto-Import | OAuth gmail.readonly, Edge Function cron, 6 email parsers (HDFC ×3, BOM, BOI, balance alert), dedup, self-transfer, AI categorize, sync log, Settings UI | ✅ **DONE** |
| Batch 6 | Gemini AI | Categorization, Monthly Report, Anomaly, Chat | ✅ DONE |
| Batch 7 | Extras + Hardening | Recurring, Budgets, Vault, Backup, Playwright | ✅ DONE |
| Batches 8A–10H | Backend + Invoicing v2 | All complete | ✅ DONE |
| Hardening 1+2 | Go-Live Hardening | Auth sweep, CORS, rate limiting | ✅ DONE |
| **Go-Live** | Deploy | Vercel + finance.zaboraa.com | 🔨 **NEXT** |
| **V2** | Family UI | Member switcher, per-member Gmail, shared views | 🔲 FUTURE |

### Recommended Order

1. ~~**Batch 2b**~~ ✅ Done
2. **Batch 3c** — Paytm/GPay/BOM/BOI parsers (run now)
3. **Go-Live** — deploy to finance.zaboraa.com
4. **Batch 4b** — cross-source dedup + self-transfer
5. **Batch 5b** — Gmail auto-import
6. **V2 family UI** — after 2–3 months of V1 usage

## Batch Prompts (Ready to Paste into AI Studio)

> **How to use:** For each batch, copy the full prompt below and paste into AI Studio along with your codebase ZIP and this PRD v2.8.0.

---

### Batch 2b Prompt ✅ COMPLETE — do not re-run

See companion file `batch2b-prompt.md` (v2.8.0 version) for the full seeded prompt. All 11 accounts, family members, categories, rules, and business profile are pre-filled. This batch is already done.

---

### Batch 3c Prompt — Run This Next

See companion file `batch3c-prompt.md` for the full prompt. Summary of scope:

Build **Batch 3c only** for Zaboraa Finance. Batches 0–10H + Hardening + Batch 2b are complete.

**Architecture (do not change):** Vite + React SPA + Express dev server (`server.ts` / `src/server-app.ts`). Do NOT convert to Next.js. **Brand:** Zaboraa Finance (double-a). **Domain:** https://finance.zaboraa.com

**Scope: New PDF Statement Parsers — Paytm UPI, Google Pay, Bank of Maharashtra, Bank of India**

1. `src/lib/parsers/paytm-upi.ts` — Paytm UPI PDF parser. Date "10 Nov\\n10:01 PM" format. Signed amount col (`- Rs.X` / `+ Rs.X`). Extract `upi_ref_no` via `/UPI Ref No[:\s]+(\d{9,})/i`. Map Paytm tags to system categories per lookup table. Set `ai_category_skip: true` on tagged rows.
2. `src/lib/parsers/gpay.ts` — Google Pay PDF/CSV. UPI Transaction ID → `upi_ref_no`. All rows = debit. For multiple HDFC accounts, prefer last4 = 3597 (GPay default).
3. `src/lib/parsers/bom.ts` — Bank of Maharashtra. Columns: Txn Date, Value Date, Description/Narration, Ref No, Debit, Credit, Balance. IMPS ref: `/IMPS[\/\s-]?(\d{12})/i`. Fallback to `generic.ts` if format not recognised.
4. `src/lib/parsers/boi.ts` — Bank of India (account 0553, Minaz). Gmail alerts from `HO.starsandesh@bankofindia.co.in` confirmed active. Columns: Date, Narration, Chq/Ref, Debit, Credit, Balance. IMPS ref: `/IMPS\/?[A-Z]*\/?(\d{12})/i`.
5. Register all four in parser dispatch. Detection: Paytm → PDF contains "Paytm" or "UPI Ref No"; GPay → "Google Pay" or "UPI Transaction ID"; BOM → "Bank of Maharashtra" or "MAHABANK"; BOI → "Bank of India" or "BANK OF INDIA".
6. Add optional fields to `ParsedTransaction` type: `upi_ref_no?`, `imps_ref_no?`, `source?` (populate if columns exist; skip silently pre-Batch 4b).
7. DO NOT touch existing parsers (hdfc.ts, sbi.ts, icici.ts, axis.ts, kotak.ts, generic.ts).
8. DO NOT change: commitUploadTransactions, pii-mask.ts, chat.ts, gemini-client.ts, backup encryption, idle logout.

**Paytm tag → system category mapping:**

| Paytm tag | System category |
| --- | --- |
| # Food | Food |
| # Fuel | Fuel |
| # Shopping | Shopping |
| # Groceries | Groceries |
| # Travel | Travel |
| # Entertainment | Subscriptions |
| # Health | Health |
| # Utilities | Utilities |
| # Education | Education |
| # Recharge | Utilities |
| # Transfer | Self Transfer |
| (none/unrecognised) | null — leave for AI |

*Commit message:* `feat(batch-3c): Paytm UPI, Google Pay, BOM, BOI statement parsers`

---

### Batch 4b Prompt

See companion file `batch4b-prompt.md` for the full prompt. Summary of scope:

Build **Batch 4b only** for Zaboraa Finance. Batches 0–10H + Hardening + Batch 2b + Batch 3c are complete.

**Architecture (do not change):** Same rules.

**Scope: Cross-Source Dedup Columns + Self-Transfer Detection Upgrade**

1. Migration: add `upi_ref_no`, `imps_ref_no`, `source` (CHECK `manual_upload`/`gmail_auto`/`statement_import`), `balance_after`, `transfer_pair_id`, `is_self_transfer` to `transactions`. Add `upi_ref_no`, `imps_ref_no`, `source` to `staged_transactions`. Create four indexes.
2. Add Layer 4 (UPI ref) + Layer 5 (IMPS ref) to `commitUploadTransactions()` — batch-query refs, skip silently, count in `duplicates_skipped`. Do NOT change Layer 1–3.
3. Extract self-transfer logic into `src/lib/self-transfer.ts` → `detectAndLinkSelfTransfers()`. Link by IMPS ref when both sides present + both `operated_by_owner = true`. Name-match fallback using `profiles.owner_full_name` ('Wasim Salim Sayyed'). Call at end of `commitUploadTransactions`.
4. Add **Transfers** tab to Transactions page. Show only `is_self_transfer = true` rows. Exclude self-transfers from Dashboard Income/Expense totals and ITR Report totals.
5. Set `source = 'statement_import'` on all rows inserted via statement upload.
6. DO NOT build Gmail parsing. DO NOT break existing self-transfer logic from Batch 2b.

*Commit message:* `feat(batch-4b): cross-source dedup layers 4+5, self-transfer detection, Transfers tab`

---

### Batch 5b Prompt

See companion file `batch5b-prompt.md` for the full prompt. Summary of scope:

Build **Batch 5b only** for Zaboraa Finance. Batches 0–10H + Hardening + Batches 2b + 3c + 4b are complete.

**Architecture (do not change):** Same rules.

**Scope: Gmail Auto-Import — Fully Automated Daily Transaction Pipeline**

1. Extend Google OAuth to request `gmail.readonly` scope. Store access/refresh token in Supabase Vault (key: `gmail_token_{user_id}`). Never return token via API.
2. Supabase Edge Function `gmail-sync`: cron every 6 hours. HTTP endpoint `POST /api/gmail/sync` for Sync Now. Rate limit: 1 manual sync per 5 minutes.
3. Gmail query: `from:(alerts@hdfcbank.bank.in OR alerts@hdfcbank.net OR mahaalert@mahabank.co.in OR mahaalerts@bankofmaharashtra.bank.in OR HO.starsandesh@bankofindia.co.in) after:{last_sync}`
4. Implement 6 parsers (regex specs in §4.11): HDFC UPI debit, HDFC IMPS credit, HDFC IMPS debit, HDFC balance alert (balance update ONLY — no transaction), BOM IMPS, BOI IMPS (best-effort).
5. Pipeline per email: identify type → extract fields → match account by last4 → dedup (UPI/IMPS ref) → self-transfer (call `detectAndLinkSelfTransfers`) → AI categorize → insert with `source = 'gmail_auto'` → update balance → log.
6. **Minaz BOI alert handling:** BOI alerts from `HO.starsandesh@bankofindia.co.in` arrive in Wasim's Gmail. Match by `account_last4 = '0553'` — not by from-address.
7. **PNB:** Skip entirely. `salim64sayyed@gmail.com` is Salim's personal Gmail, not a bank alert address. PNB = manual statement upload only.
8. New tables: `gmail_sync_log`, `email_parse_errors` (200-char snippet max for debugging).
9. Settings page — Gmail section: Connect Gmail button, connected status + Gmail address, Last synced time, Enable/disable toggle, Sync Now button.
10. Dashboard banner (dismissable per session): "Gmail: synced X min ago · N new transactions today".
11. Privacy: Never store email body/subject/metadata beyond `email_parse_errors` snippet. Never send email content to Gemini. Use pii-mask.ts — DO NOT CHANGE IT.

*Commit message:* `feat(batch-5b): Gmail auto-import, 6 bank email parsers, Edge Function cron, Settings Gmail UI`

## 12. Testing Checklist (Updated v2.8.0)

*(All v2.6.0 + v2.7.0 tests unchanged, plus:)*

- [ ] Batch 2b: 11 accounts seeded with correct last4 values (3597, 8458, 5231, 8212, 5320, 5244, 3011, 9735, 0553, 7904)
- [ ] Batch 2b: BOM last4 = 8212 (Wasim BOM), 9735 (Alisha BOM)
- [ ] Batch 2b: families row "Sayyed Family" exists; 4 family\_members rows (Wasim owner + 3 members)
- [ ] Batch 2b: Self Transfer, Family Transfer, Monthly Bissi categories present
- [ ] Batch 2b: Account Detail edit button saves all fields correctly
- [ ] Batch 3c: Upload Paytm UPI PDF → `# Food` tag → category = Food (not sent to AI)
- [ ] Batch 3c: Upload GPay CSV → UPI Transaction ID → `upi_ref_no` extracted
- [ ] Batch 3c: Upload BOM statement PDF → transactions parsed, IMPS ref extracted
- [ ] Batch 3c: Upload BOI statement PDF → transactions parsed, IMPS ref extracted
- [ ] Batch 3c: Unknown bank PDF → falls through to generic.ts without error
- [ ] Batch 4b: Same UPI ref in HDFC statement + Paytm statement → appears exactly once
- [ ] Batch 4b: IMPS self-transfer HDFC→BOM → tagged Self Transfer, excluded from P&L
- [ ] Batch 4b: Name-match self-transfer → tagged correctly
- [ ] Batch 4b: Transfers tab on Transactions page → shows only self-transfer rows
- [ ] Batch 4b: Dashboard Month Expense card EXCLUDES self-transfer amounts
- [ ] Batch 5b: Gmail sync: HDFC UPI alert → transaction with `source = 'gmail_auto'`
- [ ] Batch 5b: Balance alert email → account balance updated, NO transaction inserted
- [ ] Batch 5b: Duplicate Gmail email (UPI ref already in DB) → skipped silently
- [ ] Batch 5b: Minaz BOI alert (arriving in Wasim's Gmail) → matched to account 0553 by last4
- [ ] Batch 5b: PNB not attempted via Gmail (manual upload only)
- [ ] Batch 5b: Gmail token not visible in any API response or profiles row
- [ ] Family schema: second Google account still sees nothing (RLS isolation unchanged)

## 13. Next Actions (v2.8.0)

1. ~~Run Batch 3c~~ ✅ Complete (do this now) — paste `batch3c-prompt.md` + codebase ZIP into AI Studio. Adds Paytm, GPay, BOM, and BOI statement parsers.
2. **Go-Live (do this now)** — deploy to finance.zaboraa.com. All batches 2b–5b are complete. Confirm all 11 accounts appear.
3. ~~Run Batch 4b~~ ✅ Complete — paste `batch4b-prompt.md` + updated codebase ZIP. Cross-source dedup + self-transfer detection.
4. ~~Run Batch 5b~~ ✅ Complete — paste `batch5b-prompt.md` + updated codebase ZIP. Gmail auto-import goes live.
5. **V2 family UI** — after 2–3 months of V1 usage.

**For any future feature:** paste `Zaboraa-Finance-PRD-V2-8-0.md` + prompt + codebase ZIP into AI Studio. Always say: *"Keep Vite + React SPA + Express — do NOT convert to Next.js. Brand: Zaboraa Finance (double-a). Domain: https://finance.zaboraa.com."*

**Data flags (carry forward from Batch 2b):**

1. **Business email missing:** `business_profiles.business_email` is NULL. Owner to fill in Settings.
2. **BOM last4 confirmed:** Wasim BOM = `8212`. Alisha BOM = `9735`.
3. **Monthly Bissi type:** Set as `transfer` (chit fund / ROSCA). Owner can change to `expense` in portal if preferred.
4. **BOI parser:** Minaz's BOI account (0553) added to Batch 3c (statement) and Batch 5b (Gmail). Best-effort — confirm format from live sample.
5. **PNB confirmed manual-only:** Salim's PNB (7904) alert email `salim64sayyed@gmail.com` is his personal Gmail. PNB is statement upload only — never auto-import.
6. **Minaz Gmail routing:** Minaz's alerts (BOI) go to `wasimssayyed@gmail.com`. Batch 5b matches by `account_last4 = '0553'`, not from-address.

*— End of Zaboraa Finance v2.8.0 — Batches 0–10H + Hardening + Batch 2b COMPLETE. Batches 3c, 4b, 5b COMPLETE. Go-Live NEXT. Family schema, Gmail auto-import, cross-source dedup, self-transfer detection, Paytm/GPay/BOM/BOI parsers. BOM last4 = 8212 confirmed. PNB = manual upload only. BOI Gmail alerts confirmed active. —*
