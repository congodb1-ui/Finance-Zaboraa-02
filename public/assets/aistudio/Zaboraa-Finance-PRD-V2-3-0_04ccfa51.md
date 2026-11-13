# Zaboraa Finance — Personal Finance & Accounting Portal
## Detailed Requirement (PRD) + Implementation Plan — FINAL MERGED VERSION

> **Document Version:** `v2.3.0`
> **Product Name:** Zaboraa Finance
> **Domain:** https://zaboraa.com
> **Last Updated:** 2026-11-13
> **Changelog:**
> - `v1.0.0` — Original PRD + 7 batches
> - `v1.1.0 (Claude)` — Review: pdfjs-dist, Flash vs Pro split, Storage RLS, multiset dedup, Batch 0 design system, Batch 3 split, Post-build runbook
> - `v2.0.0 (Merged)` — Merged PRD + Claude review. Added Zabora Finance branding, zaboraa.com domain config, credit-card handling, audit log, idle logout, encrypted backup
> - `v2.1.0` — **BRANDING: Zabora → Zaboraa.** Product renamed to Zaboraa Finance everywhere. Domain remains https://zaboraa.com
> - `v2.2.0` — **BUILD COMPLETE THROUGH BATCH 8B.** Added Batch 8A (Backend + Data) + Batch 8B (Frontend + Invoicing + Production) as COMPLETED. **Architecture correction:** Actual build is **Vite + React SPA + Express dev server** (not Next.js). Do NOT convert to Next.js. Updated runtime AI models to Gemini 3.8 Flash / Gemini 4 Carbon. Added AI Studio model-selection guide. Updated package.json scripts, api-client, invoicing status, and Go-Live checklist. All batches 0–8B are now DONE. Only Go-Live remains.
> - `v2.3.0 (Current)` — **PLAN ONLY, no code changed.** Added §4.9 Data Persistence Rules (Batch 9, revised: server-vs-browser write rules, Category A/B/C, drafts, AI settings, dark mode source of truth). Added §4.10 Export Invoicing v2 (multi-country, multi-currency, logo, client + bank details, immutable snapshots). Added §7 tables `business_profiles`, `clients`, `payment_instructions`, `ai_settings` + `invoices` column additions. Batch plan split into small batches 9A–9D and 10A–10H. Added §10 pre-Go-Live risks (Vercel + Express, Vite env prefix). Added 9A/9B prompts.

> **Version Convention:** `vMAJOR.MINOR.PATCH` — PATCH = typo/clarification, MINOR = new section / batch change, MAJOR = scope / architecture change. Every edit must bump version + changelog + date.

> **How to use this file with AI Studio:**
> This file is now the **as-built record + single source of truth**. For any NEW work (Batch 9+, bugfixes, Go-Live), paste this entire MD file + the new prompt + current codebase ZIP into AI Studio. Do NOT give the old v1.0 DOCX or Claude v1.1 MD separately — this v2.3.0 file supersedes both.

> **⚠️ ARCHITECTURE — READ FIRST (Changed from v2.1.0):**
> The actual implemented codebase is **Vite + React SPA + Express dev server** (`server.ts` / `src/server-app.ts`), NOT Next.js App Router. All future prompts must say: "Keep Vite + React SPA + Express architecture — do NOT convert to Next.js." References to Next.js middleware / `src/app/api/...` routes in older sections are historical. The live equivalents are: Express `requireAuth` in `src/server-app.ts`, client `src/lib/api-client.ts`, and Supabase browser client in `src/lib/supabase/client.ts`.

---

## 1. Product Identity — Zaboraa Finance

| Item | Value |
|---|---|
| **Product Name** | **Zaboraa Finance** |
| **Domain (Production)** | **https://zaboraa.com** (also www.zaboraa.com → redirect to apex) |
| **Staging / Preview** | Vercel preview URLs for testing only, never for real data |
| **Tagline** | Your money, clearly accounted. |
| **Owner** | Single user, private use only, India |
| **Currency / FY** | INR, Financial Year April–March, Timezone Asia/Kolkata |
| **Logo / Wordmark** | Text wordmark **"Zaboraa"** in Manrope 700 + **"Finance"** in Inter 400, indigo #4F46E5. Favicon: **"Z"** in indigo rounded square. |
| **Public Promise** | Public page shows zero financial data. Login only via Google. |
| **Build Status (13 Nov 2026)** | **Batch 0 → Batch 8B COMPLETE. Go-Live pending. Batch 9 (persistence) + Batch 10 (export invoicing) PLANNED.** |

**Domain rules:** All absolute URLs, canonical, OG tags, sitemap, Supabase Auth Redirect URLs, Vercel domains must use `https://zaboraa.com`. `NEXT_PUBLIC_APP_URL=https://zaboraa.com` in production, `http://localhost:3000` in local dev only. Brand in code, UI, titles, package.json, README, comments must be **Zaboraa** (double-a), never Zabora. Verified: `grep -rnE "Zabora([^a]|$)"` = 0 mismatches after Batch 8B.

### Product Vision & Goals
Build a private, online, intelligent personal accounting portal for one user in India. Replaces manual Excel. Ingests bank / UPI / wallet statements via upload, auto-assigns to correct account among 5–10 accounts, de-duplicates, categorizes, produces ITR-ready reports.
- **Goal 1:** Know where money goes, business vs personal, profit for ITR.
- **Goal 2:** Near-zero manual entry. Upload → Review → Confirm.
- **Goal 3:** AI only for understanding/insights, never changing accounting numbers without approval.
**Non-Goals (V1):** Multi-user, commercial SaaS, direct bank / GPay / Paytm API fetching, automatic ITR filing, GST filing, payroll, inventory, UPI payment initiation. App is **READ-ONLY** for money movement.

---

## 2. Users & Access Model

| Role | Who | Access |
|---|---|---|
| **Owner (You)** | Single Google account, allowlisted email | Full access |
| **Public Visitor** | Anyone without login | Only public landing page. Zero financial data. |
| **Other Google User** | Any other Google login | Empty state + "Not authorized". Cannot see owner data due to RLS. |

**Auth:** Supabase Auth with Google OAuth ONLY. No password signup. Allowlist `ALLOWED_EMAILS` (comma-separated env). If email not in list → unauthorized. **Enforcement is two-layer:** (1) Express `requireAuth` middleware (server, real enforcement) + (2) Client `useAuth` check via `/api/ai/test` → 403 → `signOut()` + message "Your Google account is not on the allow list for this app." (defence-in-depth, Batch 8B §J). Idle logout 30 min.

---

## 3. Tech Stack — LOCKED (As-Built, v2.2.0)

| Layer | Choice (As-Built) |
|---|---|
| Frontend | **Vite + React SPA + TypeScript + Tailwind CSS + lucide-react** — NOT Next.js. Do NOT convert. |
| Backend / Server | **Express dev server** — `server.ts` entry, `src/server-app.ts` app. `helmet()`, `express-rate-limit`, `requireAuth`. |
| Backend / DB | Supabase (PostgreSQL) — Auth, DB, Storage, RLS. Browser client: `src/lib/supabase/client.ts`. |
| API Client (Frontend) | `src/lib/api-client.ts` — `apiGet`, `apiPost`, `apiPatch`. Attaches `Authorization: Bearer <token>` from `supabase.auth.getSession()`. 401 → `signOut()` + redirect to `/`. All raw `fetch('/api/...')` removed (verified 0 remaining after 8B). |
| Hosting | Vercel — Custom domain zaboraa.com, auto-deploy from GitHub main |
| Repo | GitHub Private Repo: `zaboraa-finance` (branches: main, dev, feat/*, fix/*) |
| AI (Runtime) | Gemini API — **Gemini 3.8 Flash** (categorization/cleaning/anomaly/chat) + **Gemini 4 Carbon** (Monthly Report only). See §4.6 + §9. Supersedes old 2.5 Flash/Pro naming. |
| AI (Builder) | Google AI Studio — see §9 for which model to use per batch |
| Parser | `pdfjs-dist` (PDF with x/y) + `papaparse` (CSV) + `xlsx` (Excel). Per-bank: `parsers/hdfc.ts`, `sbi.ts`, `icici.ts`, `axis.ts`, `kotak.ts`, `generic.ts` |
| Charts | Recharts, fixed palette, tabular-nums |
| Tests | Playwright E2E + RLS smoke test + `tsc --noEmit` + `vite build` |
| Scripts (As-Built) | `"dev": "tsx server.ts"`, `"build": "vite build"`, `"start": "node --import tsx/esm server.ts"`, `"lint": "tsc --noEmit"` |

---

## 4. Functional Requirements

### 4.1 Master Profile
Fields: Full Legal Name (PAN), Mobile, Email, PAN, Address, Default FY, INR, Asia/Kolkata. Linked to `auth.users.id`. All tables have `user_id` FK. PAN/Name change requires confirmation.

### 4.2 Accounts Module (5–10 Accounts)
| Field | Rule |
|---|---|
| nickname, bank_name, account_number_full (encrypted), last4, customer_id/CIF (encrypted), ifsc, upi_id | For matching — see §4.3 |
| account_type | Savings / Current / Wallet / UPI / Cash / Credit Card |
| purpose | Personal / Business / Mixed |
| opening_balance + opening_date, is_active, color/icon | As built |
| Credit Card extra | credit_limit, billing_date, due_date, statement_date. **Rule:** Card spend = Expense on spend date. Card bill payment from bank = Transfer, NOT second expense. |
| Overdraft / Negative | Balance can go negative. Health dot + charts must handle it. |
| Inactive mid-FY | If `is_active=false` mid-FY, historical + FY reports STILL include it. List shows "Inactive" badge. |
**Account List:** Current balance, last statement imported date, health dot Green <7 days, Yellow 7–30 days, Red >30 days. **Detail:** Ledger, filters, balance chart, statement history. **As-Built (8A):** All `local*Store` removed, real Supabase queries, `getUser()` → `Error('Unauthorized')` on writes, signatures unchanged.

### 4.3 Statement Upload & Auto-Matching (Core)
Formats: PDF, CSV, XLSX. Max 20 MB (Express multer memory limit, as-built) / 25 MB app guidance — enforce 20 MB in code. Supported: HDFC, SBI, ICICI, Axis, Kotak, Paytm, GPay export. Extensible per-bank parser.
**Upload Flow (As-Built 8A):** `POST /api/upload` (under `requireAuth`) → multer → extension + MIME validation (csv/xlsx/pdf only) → SHA-256 check → Storage upload → parser dispatch (`src/lib/parsers/`) → stage in Supabase `staged_transactions` → Review Screen → `POST /api/upload/finalize` via `api-client` → `commitUploadTransactions()` → transactions inserted.
**Header extraction:** Customer Name, Account No (full/masked), Customer ID, Period From–To. PDF via `pdfjs-dist` x/y.
**Matching priority:** (1) Full Account No exact, (2) Last4 + Customer ID, (3) Customer ID only, (4) Last4 + Name fuzzy. No match → manual select dropdown, never auto-import to wrong account.
**Review BEFORE confirm:** Account matched, total rows, new rows, duplicates skipped, total credit/debit, period, sample 10 rows, reconciliation warning if balance mismatch.
**Replace Previous Import:** Choose "Replace" → deletes old import's transactions for same period (audit logged) + imports new. Confirm by typing "REPLACE".
**Parser Version:** `parser_version` on `statement_uploads`. Flag old imports if parser fixed.
**Generic CSV Wizard:** Unknown bank → column-mapping wizard, save mapping as template.
**Storage Path MUST be:** `{auth.uid()}/{YYYY-MM}/{file-hash}-{original-name}`.
#### Duplicate Detection — 3 Layers (As-Built, Multiset Fix)
- **Layer 1 File Hash:** SHA-256 exists for same user+account → Block: "This exact file already uploaded on [date]".
- **Layer 2 Period:** Same account + same From–To → Warn + "Missing Only" mode.
- **Layer 3 Transaction (Multiset, 8A):** Key = `account_id + txn_date + amount + utr` (if UTR), else `account_id + txn_date + amount + normalizedDescription` (lowercase, strip spaces/special chars). Query existing for same account + date range. Count DB vs new batch. Only EXCESS is duplicate. Example: DB 1× ₹500 Swiggy, batch 2× ₹500 Swiggy → import 1, skip 1. `commitUploadTransactions(upload_id, replace_previous_id?)` returns `{ imported, duplicates_skipped, replaced }`. If `replace_previous_id` set: delete `upload_id = replace_previous_id` rows first, then import all without dedup against old set.
- **Normalization:** lowercase, trim, remove multiple spaces, UPI ref variations.

### 4.4 Transactions & Categorization
| Field | Description |
|---|---|
| date, amount, type | Debit = out, Credit = in |
| description_raw / description_clean | Original / AI-cleaned merchant |
| category_id, workspace, counterparty, payment_method, utr, is_transfer, bill_url, notes, ai_suggestion, status | As built |
| parser_version, file_hash, statement_period | Audit / dedup |
**Categories (Seed):** Income: Client Payment, Salary, Interest, Refund, Other Income. Expense: Food, Groceries, Travel, Fuel, Rent, Utilities, Subscriptions, Shopping, Health, Education, Business-Office, Business-Vendor, Business-Travel, Tax/GST, EMI/Loan. Transfer: Self-Transfer. Fixed color map per category.
**Rules Engine:** Runs before AI. "If contains SWIGGY → Food, Personal". **Transfer Detection:** Same amount ±1 day, Debit in A + Credit in B, counterparty = own name/account → Transfer. **Manual Add:** Cash/missing form. **Bulk Edit:** Multi-select → Category/Workspace. **As-Built (8A):** `getTransactions()` / `getAllTransactions()` filter server-side with `.eq/.gte/.lte/.ilike/.or/.range`, pagination via `.range`.
**Audit Log:** Log ALL edits: import, category/workspace change, manual add/edit/delete, replace import. Fields: who, when, before, after, reason.

### 4.5 Dashboard & Analytics
Top Cards: Month Income, Month Expense, Net, Total Balance, Pending Client, Tax Provision (running). Filters: FY selector, Date Range, Workspace (All/Personal/Business), Account. Charts: Expense by Category (Pie), Income vs Expense by Month (Bar), Balance Trend, Net Worth Over Time, Top Merchants, Top Clients, FY-over-FY. Account Health widget. Recent Transactions (last 20, search).

### 4.6 Gemini AI Intelligence Layer (Critical)
**PRIVACY — NON-NEGOTIABLE:** NEVER send: account_number_full, customer_id, PAN, full name, address, phone, email, PDF content, full UTR. Only `{date, amount, cleaned_description, category, workspace}`. Redact account numbers from descriptions. PII masking in `pii-mask.ts` — DO NOT CHANGE.
- **Smart Categorization:** Batch 50 uncategorized, structured JSON (`response_mime_type: application/json`), return `{id, category, confidence, reason}`. **Model: Gemini 3.8 Flash.**
- **Description Cleaning:** Raw narration → clean merchant + method. **Model: 3.8 Flash.**
- **Monthly AI Report:** Aggregates only (not raw rows) → Markdown, simple English/Hinglish, Summary, Up/Down, Unusual, Tax provision, 2–3 tips + "AI estimate, not CA advice". **Model: Gemini 4 Carbon ONLY** (once-a-month, quality matters).
- **Anomaly Detection:** Last 90 days → Duplicate charges, high vs average, new payee high amount, trial charges, missing recurring. Severity Low/Medium/High. Anomaly cache scoped per `user_id` via `Map<string, DetectedAnomaly[]>` (8A fix). **Model: 3.8 Flash.**
- **Ask Your Data (Chat):** Gemini returns **parameter object only** `{date_range, category, workspace, account, amount_range}` — never raw SQL. Code validates via `validateAndSanitizeQueryParams` in `chat.ts` — DO NOT CHANGE — then builds SQL. Numbers from DB, Gemini only formats. **Model: 3.8 Flash.**
- **AI Settings:** Key (server-only, Supabase Secrets, never frontend), model selector (Flash default, Carbon for monthly), toggles per feature, usage counter.
- **Confidence 3-tier:** `<0.5` → Needs Review (separate, no suggestion), `0.5–0.7` → Low-confidence suggestion, `>0.7` → Pre-selected (still needs Confirm).
- **Fallback:** If Gemini fails/missing/quota → rules only + banner "AI unavailable". No crash. Startup warning (non-fatal) if `GEMINI_API_KEY` missing (8A).
- **Logging:** `ai_logs`: model + prompt_template_version + tokens. **Flash vs Carbon split** in `gemini-client.ts` — DO NOT CHANGE.
- **Gemini Vision Exception:** Do NOT use for PDF parsing by default. Only opt-in fallback for unsupported bank, with redaction + logged consent.

### 4.7 ITR & Reports
FY Report: Business Income/Expenses, Net Profit, Personal totals, GST, Advance Tax, TDS. Export: Excel (Summary + Transactions + Category + Account), PDF (CA-ready), Tally CSV. Respect FY + Workspace filters. Client/Vendor Ledger: Billed/Received/Pending, auto-match invoice→payment if amount+client matches.

### 4.8 Additional Modules
**Invoicing — NOW BUILT (Batch 8B, Status: COMPLETE):** Table `invoices` (migration `20240008000000_invoicing.sql`): `id, user_id, invoice_number, client_name, client_email, issue_date, due_date, line_items jsonb, subtotal, tax_percent default 18, total, status check ('draft','sent','paid','overdue'), notes, created_at, updated_at`. RLS: 4 standard user policies. Actions `src/lib/actions/invoices.ts`: `getInvoices, createInvoice, updateInvoice, deleteInvoice, markInvoicePaid` — scoped by `user_id` + RLS. UI: `InvoiceList.tsx` (Invoice #, Client, Issue/Due, Total, Status badges, Mark Paid, New Invoice modal, inline banners + inline delete confirm — no `window.alert/confirm`), `InvoiceForm.tsx` (Client Name/Email, Invoice #, Issue/Due, dynamic line items, GST %, Notes, auto subtotal/total), Nav `AuthNavShell.tsx` (FileText, `/invoices`), Routing `App.tsx` (`/invoices` protected, renders `<InvoiceList/>` inside `<AuthNavShell>`).
**Other V1.5:** Recurring Tracker, Budgets (80%/100%), Document Vault, Backup (encrypted ZIP, AES-256-GCM in `BackupSection.tsx` — DO NOT CHANGE), Net Worth, EMI/Loan Amortization, Generic CSV Wizard, Cmd+K Palette, FY-over-FY.

### 4.9 Data Persistence Rules (Batch 9 — Revised v2.3.0)
**Goal:** Everything the user creates, edits or adds lives in Supabase. Nothing important lives only in `localStorage`, `sessionStorage`, `IndexedDB`, cookies, `useState`, `useRef` or a module-level variable.
1. **Browser-side writes** (`createClient()` from `src/lib/supabase/client.ts`): call `supabase.auth.getUser()` first → `throw new Error('Unauthorized')` if no user → write with `user_id` set → RLS enforces.
2. **Server-side writes** (Express, `/api/*`): only behind `requireAuth`. `user_id` ALWAYS comes from the verified token, NEVER from the request body. The service role bypasses RLS, so EVERY server query must carry `.eq('user_id', user.id)`. Do NOT move server writes (upload finalize, backup, export, `transactions/:id`) into the browser client.
3. **`audit_logs`** is written by the server only (SELECT-only RLS for users). Never add a client-side insert. Confirm the real table name (`audit_log` vs `audit_logs` appears in both migrations and this doc) and use one name everywhere.
4. **Category A — MUST be in Supabase:** Accounts, Transactions, Categories, Workspaces, Rules, Budgets, Recurring, Invoices (+ clients, business profile, payment instructions), Uploads/staged rows, Profile/Settings, AI Settings, Documents/Bills, Audit Logs.
5. **Category B — UI-only, may stay local** (must carry `// UI-ONLY, safe to keep local — not synced` and be listed in README): sidebar collapsed, last-open tab, table sort order, column visibility, idle-logout last-activity timestamp, dark-mode **cache** (see 7).
6. **Category C — derived/server cache, OK:** e.g. anomaly cache `Map<user_id, …>` on the server. Must be rebuildable from Supabase and keyed by `user_id`.
7. **Dark mode:** source of truth = `profiles.dark_mode` (§6 says "persisted per profile"). `localStorage` may only cache it to avoid a theme flash on load.
8. **AI Settings:** `GEMINI_API_KEY` stays server-only (env / Supabase Secrets), never in browser storage, never returned by any API. Toggles (AI enabled, per-feature switches) + model choice are stored in Supabase table `ai_settings`. The server validates `model_choice` against an allow-list; the Flash vs Carbon split in `gemini-client.ts` is NOT changed (Monthly Report stays Carbon).
9. **Profile:** writes go to `profiles`. PAN is stored only as `pan_encrypted` using the existing encryption helper, never plain text.
10. **"Saved" means saved:** show success only AFTER the awaited Supabase call resolves; on error show the error and keep the form open. No optimistic "Saved" without rollback.
11. **Drafts:** Invoices → `status='draft'` row in Supabase. Upload review → already `staged_transactions` (Supabase). Transaction edit → no draft; show an "Unsaved changes" warning on leave. Do not create a generic drafts table.
12. **Excluded from the audit:** `sb-*` keys that `supabase-js` manages itself (session, PKCE verifier).
13. **Extra grep targets:** `indexedDB`, `document.cookie`, `caches.`, `window.name`, module-level `let`/`Map` holding user data, and every "Saved"/"success" toast that has no awaited insert/update.
14. **RLS verification (real):** the allowlist blocks a second Google account in the UI, so also run a script that signs in as user 2 with the anon key and tries to `select`/`insert`/`update` user 1 rows on EVERY table (must return 0 rows / error).

### 4.10 Export Invoicing v2 (Planned — Batch 10)
**Context:** Owner is in India, invoices go mostly to customers abroad, especially Middle East (Kuwait, Qatar, UAE, Saudi Arabia, Bahrain, Oman). Existing 8B invoicing (INR-style, GST 18% default, client name/email only) stays working; v2 extends it.
- **Countries:** searchable ISO-3166 country picker. Middle East countries pinned at top. Country is stored per client and per invoice; invoice list has a multi-select country filter.
- **Currencies:** per-invoice `currency` (ISO-4217). Default suggested from country (KW→KWD, QA→QAR, AE→AED, SA→SAR, BH→BHD, OM→OMR, US→USD, GB→GBP, EU→EUR), always editable. Decimals follow the currency (KWD/BHD/OMR = 3, most others = 2). Money columns `numeric`, never float. Totals computed SERVER-side with currency-aware rounding; the UI preview is display only.
- **Exchange rate:** manual `exchange_rate` (to INR) per invoice at issue date + `inr_equivalent`. On payment: actual `amount_received`, `inr_received`, `paid_at`, bank charges. No external FX API in v1.
- **Seller identity (`business_profiles`):** company name, logo, address, country, email/phone/website, GSTIN, IEC, LUT number/date, default currency, invoice prefix + next number, default terms/footer. PAN is NOT printed on invoices.
- **Logo:** upload to private Storage bucket `logos`, path `{auth.uid()}/logo-{hash}.{ext}`, PNG/JPG/WebP only, max 1 MB, NO SVG (script risk). Storage RLS like `statements`.
- **Clients (`clients`):** name, company name, country, address, city, email, phone, tax/VAT/CR number, default currency, payment-terms days, notes.
- **Bank details (`payment_instructions`):** label, beneficiary name, bank name + address, account number (encrypted, `last4`), IBAN (encrypted), SWIFT/BIC, IFSC, optional intermediary bank, currency, `is_default`. This is separate from the tracked `accounts` table. Reuse the existing encryption helper.
- **Immutable snapshots:** on issue (status leaves `draft`) the invoice stores `seller_snapshot`, `client_snapshot`, `bank_snapshot` (jsonb, encrypted fields copied as-is, decrypted only server-side to render). Editing a client/bank/business profile later must NEVER change an issued invoice.
- **Numbering:** unique `(user_id, invoice_number)`. Numbers are allocated server-side atomically (RPC / `UPDATE … RETURNING`) from the business profile counter. Issued invoices cannot be deleted: use `cancelled`. Only `draft` can be deleted.
- **Status:** `draft, sent, partial, paid, overdue, cancelled` (extends the 8B check constraint; existing rows untouched, back-filled `currency='INR'`).
- **Line items:** description, SAC/HSN code, quantity, unit, unit price, discount. Tax label + percent per invoice, default **0** for export. Optional "Supply meant for export under LUT without payment of IGST" note. Client VAT/Tax ID shown when present. **Tax treatment is the owner's CA's decision — the app only stores and prints what is entered. Not tax advice.**
- **Output:** print-optimized invoice page + browser "Save as PDF" first (handles Arabic names/addresses and RTL correctly). Server-side PDF library only later, and only with an Arabic-capable font.
- **Reconcile:** link a paid invoice to the INR credit `transaction` (manual confirm; match by client + date window + INR received). Feeds Pending Client + Client Ledger (§4.7).
- **Out of scope for v1:** emailing invoices, payment links, auto FX rates, e-invoicing portals, bilingual templates.
- **Do NOT touch:** `pii-mask.ts`, Ask-Your-Data allow-list (`chat.ts`) — invoice/client/bank data is NEVER sent to Gemini and NOT added to the allow-list. Backup: later batch may only extend the TABLE LIST of `/api/backup`; the AES-256-GCM code stays untouched.

---

## 5. Public vs Private Pages — Routing (zaboraa.com)
| Route | Access | Shows |
|---|---|---|
| `/` | Public | Zaboraa Finance landing, tagline, Login with Google. No data. |
| `/login` | Public | Redirect to Supabase Google OAuth |
| `/dashboard`, `/accounts`, `/upload`, `/transactions`, `/reports`, `/ai-insights`, `/invoices`, `/vault`, `/settings` | Private — Auth + Allowlist | App pages |
| `/unauthorized` | Public | Non-allowlisted Google login |
**As-Built Routing:** Hash / SPA routing in `src/App.tsx` with `navigateTo` guard + `AuthNavShell`. Express does NOT handle `/api/auth/callback` — OAuth callback is client-side via Supabase JS PKCE. Redirect is `window.location.origin + '/#dashboard'` (fixed in 8A, documented in `src/server-app.ts`). **Middleware equivalent:** Express `requireAuth` + client `useAuth` + `api-client` 401 handling. Idle logout 30 min via `useIdleLogout.ts` + `IdleWarningModal.tsx` — DO NOT CHANGE.

---

## 6. Design System — Zaboraa Finance (Locked)
Inter for UI, Manrope 600/700 for headings, tabular-nums for ALL money/dates (`.font-tabular { font-variant-numeric: tabular-nums; }`). Dark mode first-class, toggle in Settings, persisted per profile.
| Role | Light | Dark |
|---|---|---|
| Page BG | #F8FAFC | #0B1120 |
| Card | #FFFFFF | #111827 |
| Border | #E2E8F0 | #1F2937 |
| Primary Text | #0F172A | #E5E7EB |
| Secondary | #64748B | #94A3B8 |
| Brand | #4F46E5 indigo-600 | #6366F1 indigo-500 |
| Income | #16A34A | #22C55E |
| Expense | #DC2626 | #F87171 |
| Warning | #D97706 | #FBBF24 |
| Transfer | #64748B | #94A3B8 |
Rules: Indigo ONLY for brand. Green/red ONLY for credit/debit, always with +/− or icon. Never red for generic Delete — neutral + confirm. Category palette fixed order: `#6366F1 #0EA5E9 #14B8A6 #22C55E #84CC16 #EAB308 #F97316 #EF4444 #EC4899 #A855F7`. Inside app: flat neutral, `shadow-sm`, no gradients. Landing only: soft gradient indigo→teal low opacity. Icons: `lucide-react` only. Charts: Recharts with fixed palette, never library defaults.

---

## 7. Database Schema (Supabase PostgreSQL)
All tables: `id UUID PK, user_id UUID FK auth.users, created_at, updated_at`. RLS ON every table. Policy: `auth.uid() = user_id`.
| Table | Key Columns |
|---|---|
| profiles | user_id, full_name, email, pan_encrypted, phone, address, default_fy, dark_mode |
| accounts | user_id, nickname, bank_name, account_number_encrypted, last4, customer_id_encrypted, ifsc, upi_id, type, purpose, opening_balance, opening_date, credit_limit, billing_date, due_date, last_imported_at, is_active |
| categories | user_id, name, type, color (fixed), is_system |
| transactions | user_id, account_id, date, description_raw, description_clean, amount, type, category_id, workspace, counterparty, payment_method, utr, is_transfer, bill_url, notes, ai_suggestion, status, file_hash, statement_period, parser_version |
| statement_uploads / staged_transactions | user_id, account_id, file_name, file_hash, file_path, period_from/to, total_rows, new_rows, duplicates_skipped, parser_version, status |
| rules | user_id, match_text, category_id, workspace, priority |
| budgets, invoices, documents | As in §4.8. Invoices migration: `20240008000000_invoicing.sql` |
| business_profiles | user_id (unique), company_name, logo_path, address, country, email, phone, website, gstin, iec, lut_number, lut_date, default_currency, invoice_prefix, next_invoice_no, default_terms |
| clients | user_id, name, company_name, country (ISO2), address, city, email, phone, tax_id, default_currency, payment_terms_days, notes |
| payment_instructions | user_id, label, beneficiary_name, bank_name, bank_address, account_number_encrypted, last4, iban_encrypted, swift_bic, ifsc, intermediary_bank, currency, is_default |
| invoices (v2 additions) | currency char(3), exchange_rate numeric(18,6), inr_equivalent, client_id, country, invoice_type, tax_label, tax_percent (default 0 for new export invoices), seller_snapshot / client_snapshot / bank_snapshot jsonb, amount_received, inr_received, paid_at, linked_transaction_id; status check adds `partial`, `cancelled`; unique (user_id, invoice_number) |
| ai_settings | user_id (unique), ai_enabled, feature_toggles jsonb, model_choice (allow-listed server-side), updated_at. NO API key column. |
| audit_logs | user_id, action, entity, entity_id, before_json, after_json, created_at |
| ai_logs | user_id, feature, model, prompt_template_version, tokens, response_summary, created_at (no PII) |
Indexes: `transactions(user_id, account_id, date)`, `transactions(user_id, utr)`, `transactions(user_id, category_id)`, `statement_uploads(user_id, file_hash)`.
**Migrations (As-Built, 8A):** `20240002000006_rls_categories.sql`, `20240002000007_rls_workspaces.sql`, `20240004000004_rls_rules.sql`, `20240004000005_rls_audit_log.sql` (SELECT-only, inserts via service role only), `20240008000000_invoicing.sql`. All must be applied via `supabase db push`.

---

## 8. Security & Privacy (Must Follow)
- RLS ON every table + `storage.objects`. Storage path `{auth.uid()}/{YYYY-MM}/{hash}-{name}`. Private buckets `statements`, `bills`, signed URLs 60s expiry.
- Never store Gemini key in frontend/GitHub. `.env.local` + Supabase Secrets. `.env.example` must have `ALLOWED_EMAILS=` + `GEMINI_API_KEY=` (verified 8A).
- Never log full account numbers, PAN, PDF content. Mask `****1234`.
- File uploads: validate type/size, reject `.exe/.js`. Express: multer 20 MB, csv/xlsx/pdf only.
- `.gitignore`: `.env*`, `node_modules`, `.next`, `uploads/`, `*.pdf` real data, `supabase/.temp/`.
- Audit every import + category/workspace/manual edit. No delete without confirm.
- Service-role key: server-only, must re-check `auth.uid()` + allowlist in code.
- Session/idle timeout 30 min. Backup ZIP password-protected/encrypted (AES-256-GCM).
- HTTPS only. Never return raw SQL errors / raw `err.message` on 500 — generic message + server-side log only (8A).
- Express: `helmet()`, rate-limit 100 req/15 min on `/api/*`, 10 req/15 min on `/api/ai/*` (8A).
- Express `requireAuth`: `Authorization: Bearer <token>` → `supabase.auth.getUser(token)` → 401 if invalid, 403 if email not in `ALLOWED_EMAILS`. Applied to ALL Express routes: `/api/ai/test`, `/api/ai/anomalies`, `/api/ai/chat`, `/api/ai/monthly-report`, `/api/ai/categorize`, `/api/export`, `/api/upload/finalize`, `/api/transactions/:id`, `/api/upload`, `/api/backup`. No unprotected Express route.

---

## 9. AI Studio Model Selection + Runtime Models (New in v2.2.0)

### 9.1 Two Different Gemini Uses — Do Not Confuse Them
1. **AI Studio Chat Model (Builder)** — The model that *writes* code for Zaboraa Finance. Selected in AI Studio Chat settings dropdown. Does NOT change website design/features directly — changes how well AI Studio understands PRD and writes code.
2. **Gemini API in App (Runtime)** — The model your *finished website* calls (categorization, reports). Set in code via `GEMINI_API_KEY` + `gemini-client.ts`, NOT in AI Studio dropdown.

### 9.2 AI Studio Builder Model — Which to Use
| AI Studio Model | Use For Zaboraa? |
|---|---|
| **Default (Gemini 3.8 Flash)** | **YES — Default for all batches.** Balanced, good reasoning, large context. |
| **Gemini 4 Carbon — New / Paid** | **Best for Batch 3b, 4, 6, 8A** (hardest logic). Use if Paid available. |
| **Gemini 4 Argon — Paid** | Good alternative to Carbon. |
| **Gemini 3.8 Flash** | Same as Default, safe. |
| **Gemini 3.6 Flash** | OK for Batch 0 only. |
| **Gemini 3.5 Flash Lite / 3.1 Flash Lite** | **DO NOT USE for Zaboraa.** Weaker reasoning → will miss RLS, multiset dedup, PII masking, SQL allow-list. |
**Impact by batch:** Batch 0 (Design) 10–20% if Lite used. Batch 1/2/5 (Auth/Accounts/Dashboard) 40–50% — looks done but security holes. Batch 3a/3b/4/6/8A (Upload/PDF/Dedup/AI/Backend) 70–80% — code runs but accounting numbers wrong. **Rule:** Never use Lite for logic-heavy batches.

### 9.3 Runtime Models (In-App, As-Built)
- **Categorization / Cleaning / Anomaly / Chat:** `gemini-3.8-flash` (or latest Flash)
- **Monthly Report only:** `gemini-4-carbon` (or latest Pro-class)
- Supersedes old `gemini-2.5-flash / gemini-2.5-pro` naming in v2.1.0. If model names change again, update `gemini-client.ts` + `ai_logs.model` only — do not re-architect.

---

## 10. Domain & Deployment — zaboraa.com Checklist
- **Vercel:** Custom domain `zaboraa.com` + `www.zaboraa.com` → redirect www → apex (`https://zaboraa.com`). HTTPS auto, `NEXT_PUBLIC_APP_URL=https://zaboraa.com`.
- **DNS:** Vercel A/CNAME as shown in Vercel dashboard. Do NOT point DNS until Vercel project ready.
- **Supabase Auth:** Site URL = `https://zaboraa.com`. Redirect URLs: `https://zaboraa.com/**`, `https://zaboraa.com/auth/callback`, `http://localhost:3000/**` (dev). **SPA note:** Actual OAuth redirect in code is `window.location.origin + '/#dashboard'` via Supabase JS PKCE — ensure this is allowlisted.
- **Google Cloud OAuth:** JS origins `https://zaboraa.com`. Redirect URIs: `https://<supabase-ref>.supabase.co/auth/v1/callback`.
- **SEO:** Title `Zaboraa Finance — Personal Finance & Accounting`, Meta `Private personal accounting portal — Zaboraa Finance`, OG with Zaboraa wordmark, robots allow `/` only, noindex private routes.
- **After domain live:** Incognito login test, 2nd account empty test, idle logout, upload dummy CSV first (not real statement).
- **⚠️ Pre-Go-Live risks to verify (added v2.3.0):**
  1. **Vercel + Express:** The app is a long-running Express server (`server.ts`). Vercel runs serverless functions, not a persistent Express process, and serverless request bodies are small (about 4.5 MB), while uploads allow 20 MB. Decide before Go-Live: (a) adapt `src/server-app.ts` into Vercel serverless functions and move statement uploads to direct-to-Supabase-Storage signed uploads, or (b) host the Express app on a Node host (Render / Railway / Fly.io) and keep the SPA wherever you like.
  2. **Env prefix:** Vite exposes only `VITE_*` variables to the browser by default. The `.env` block in §11 uses `NEXT_PUBLIC_*`. Confirm `vite.config.ts` maps them, otherwise rename to `VITE_*`. Service-role key and `GEMINI_API_KEY` must never be prefixed for the client.

---

## 11. Implementation Plan — Batches (FINAL STATUS, v2.2.0)

**Rule for future work:** Give THIS v2.3.0 MD + new prompt + codebase ZIP to AI Studio. After each batch: Test → Commit → Push. Next batch: Import from GitHub + paste MD + "Continue from Batch X, previous batch working". **Always include:** "Keep Vite + React SPA + Express architecture — do NOT convert to Next.js. Brand is Zaboraa Finance (double-a)."

| Batch | Name | Deliverable | Status |
|---|---|---|---|
| **Batch 0** | Design System | Tailwind + CSS vars, Card/Button/Badge/KPI, dark toggle, Zaboraa wordmark | ✅ DONE |
| **Batch 1** | Foundation + Landing + Auth | Vite + Supabase, Landing, Google Auth, Profiles + RLS, Allowlist, Migrations, RLS test | ✅ DONE |
| **Batch 2** | Accounts | CRUD + categories seed + fixed colors, List + health dot, Detail, RLS re-test, Credit-card fields | ✅ DONE |
| **Batch 3a** | Upload CSV/XLSX | Upload UI, Private bucket + Storage RLS, CSV/XLSX parser, Header, Matching, File-hash dedup, Review, CSV wizard | ✅ DONE |
| **Batch 3b** | PDF Parsing | `pdfjs-dist` HDFC + generic, Reconciliation, `parser_version`, Replace Previous Import | ✅ DONE |
| **Batch 4** | Transactions + Rules | List/filters/search, Multiset dedup, Rules, Manual add, Bulk edit, Transfer detection, Audit log | ✅ DONE |
| **Batch 5** | Dashboard + ITR | Charts (fixed palette), FY/workspace filters, Net Worth, ITR Report, Excel/PDF/Tally export, Ledger, Tax Provision | ✅ DONE |
| **Batch 6** | Gemini AI | AI Settings, Server Gemini with masking, Structured JSON, 3-tier confidence, Flash/Carbon split, Monthly Report, Anomaly, Ask-Your-Data allow-list, Fallback | ✅ DONE |
| **Batch 7** | Extras + Hardening | Recurring, Budgets, Vault, Invoicing (UI part deferred to 8B), Encrypted Backup ZIP, Idle logout, Mobile polish, Playwright, Security audit | ✅ DONE |
| **Batch 8A** | Backend + Data (NEW) | Real Supabase wiring (all `local*Store` removed), Express `requireAuth` + helmet + rate-limit, `POST /api/upload` + `GET /api/backup`, Migrations (categories/workspaces/rules/audit_log/invoices), Multiset dedup + `replace_previous_id`, FY utils, PII-safe 500s, PKCE fix. **Verification:** `vite build` ✅, `tsc --noEmit` ✅, unauth `/api/backup,/api/upload,/api/ai/test,/api/export` → 401 ✅ | ✅ DONE |
| **Batch 8B** | Frontend + Invoicing + Production (NEW) | `src/lib/api-client.ts` (`apiGet/apiPost/apiPatch`, Bearer token, 401→signOut), Replace all raw `fetch('/api/...')` (0 remaining), Invoicing UI (`invoices.ts`, `InvoiceList`, `InvoiceForm`, Nav, App routing), `package.json` scripts fix, README Running Locally, Client allowlist check. **Verification:** `vite build` ✅, `tsc --noEmit` ✅ 0 errors, `node --import tsx/esm server.ts` production boots ✅, `GET /` → 200 ✅, `GET /api/backup` unauth → 401 ✅, brand grep 0 mismatches ✅ | ✅ DONE |
| **Batch 9A** | Persistence AUDIT only (NEW) | Report only, NO code changes. Table of every local save + A/B/C classification + list of "Saved" with no write | 🔜 NEXT |
| **Batch 9B** | Settings/Profile + AI Settings + dark mode (NEW) | `profiles` writes, `ai_settings` migration + RLS + UI, server allow-list for model choice, dark mode DB source of truth | 🔜 PLANNED |
| **Batch 9C** | Remaining Category A fixes + drafts (NEW) | Fix leftover hits from 9A, "Saved only after await", Unsaved-changes warning, invoice draft = `status='draft'` | 🔜 PLANNED |
| **Batch 9D** | Verify (NEW) | grep checks, two-user RLS script on every table, Playwright persistence test, logout/login other browser | 🔜 PLANNED |
| **Batch 10A** | Invoicing DB only (NEW) | Migration: `business_profiles`, `clients`, `payment_instructions`, `invoices` additions, RLS, indexes, numbering RPC. No UI | 🔜 PLANNED |
| **Batch 10B** | Business profile + logo (NEW) | Settings → "Business & Invoicing", logo upload to private `logos` bucket | 🔜 PLANNED |
| **Batch 10C** | Clients + countries + currencies (NEW) | Clients CRUD, country picker (Middle East pinned), default currency | 🔜 PLANNED |
| **Batch 10D** | Bank / payment instructions (NEW) | Encrypted bank details CRUD, default per currency | 🔜 PLANNED |
| **Batch 10E** | Invoice form v2 (NEW) | Client picker, currency, rate, line items, SAC, tax label, server-side totals + numbering, snapshots on issue | 🔜 PLANNED |
| **Batch 10F** | Invoice view / print / PDF (NEW) | Print-optimized invoice with logo, details, bank block, Arabic-safe | 🔜 PLANNED |
| **Batch 10G** | Payment received in foreign currency (NEW) | `amount_received`, `inr_received`, bank charges, partial, link to transaction | 🔜 PLANNED |
| **Batch 10H** | Filters + reports (NEW) | Multi-country filter, per-currency pending, INR totals on Dashboard/ITR | 🔜 PLANNED |
| **Go-Live** | Post-Build / Deploy | Supabase `db push`, `.env.local`, GitHub main+dev, Smoke + Playwright, Vercel → zaboraa.com, Live domain tests | 🔨 PENDING — Recommended AFTER Batch 9D (and 10A–10F if you want invoicing live on day one). See §12 |

### Batch 8A Prompt (For Record — Already Completed, Do Not Re-run)
> Build Batch 8A only... Backend + Data Only... Replace `local*Store`... `requireAuth`... `POST /api/upload`... Migrations... Multiset dedup... FY utils... DO NOT create `api-client.ts`, DO NOT build invoicing UI, DO NOT change `package.json` scripts.

### Batch 8B Prompt (For Record — Already Completed, Do Not Re-run)
> Build Batch 8B only... Batch 8A already complete... Frontend + UI + Production Build Only... Create `src/lib/api-client.ts`... Invoicing UI... `package.json` scripts... Client allowlist check... DO NOT rewrite 8A backend files...

### Batch 9A Prompt (Audit Only — Next)
> Build Batch 9A only for Zaboraa Finance. Batches 0–8B are complete. Keep Vite + React SPA + Express architecture — do NOT convert to Next.js. Brand is "Zaboraa Finance" (double-a). **AUDIT ONLY — change NO code.** Search the entire codebase for: `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `caches.`, `window.name`, module-level `let`/`Map` holding user data, `local*Store`, `useState` holding user data never sent to Supabase, and every "Saved"/success message with no awaited Supabase insert/update or API call. Ignore `sb-*` keys managed by supabase-js. Also list every `.from(` in server files (`src/server-app.ts`, `src/lib/actions/*`) that lacks `.eq('user_id', …)`. Output ONE table: `File | Line | What is stored | Category (A must move / B UI-only / C derived cache) | Target Supabase table or reason to keep`. Then list: (1) all Category B items, (2) all fake-"Saved" spots, (3) the real audit table name (`audit_log` vs `audit_logs`). Follow §4.9 rules. Do NOT fix anything yet.

### Batch 9B Prompt (Settings + AI Settings + Dark mode)
> Build Batch 9B only. 9A audit is done (paste its table). Same architecture and brand rules. Scope: (1) Settings/Profile saves to `profiles` (PAN only as `pan_encrypted` via existing helper). (2) Create `ai_settings` migration (+ RLS 4 policies, no API key column) and wire AI Settings UI to it; server validates `model_choice` against an allow-list; `GEMINI_API_KEY` stays server-only and is never returned by any API. (3) Dark mode: `profiles.dark_mode` is the source of truth; `localStorage` only as a flash-prevention cache with the comment `// UI-ONLY, safe to keep local — not synced`. Browser writes: `getUser()` → `throw new Error('Unauthorized')` → write with `user_id`. Success message only after the awaited call resolves. DO NOT change: design system, `pii-mask.ts`, `chat.ts` allow-list, Flash vs Carbon split in `gemini-client.ts`, idle logout, amount immutability, backup encryption, PDF worker, 8A/8B backend files.

### Post-Build Local Integration Runbook (Claude Code)
After all batches, download ZIP → Claude Code → `.env.local` → `supabase db push` → RLS policies → Storage buckets + RLS → Edge Functions secrets → GitHub push (main + dev) → `npm run dev` smoke test → Playwright E2E.
**Env (.env.local):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# ⚠️ SERVER-ONLY
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# ⚠️ SERVER-ONLY
GEMINI_API_KEY=AIza...
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Production on Vercel: NEXT_PUBLIC_APP_URL=https://zaboraa.com
ALLOWED_EMAILS=your-email@gmail.com
```
**GitHub:**
```bash
git init
git add .
git commit -m "feat: initial build — Zaboraa Finance v1.0 (AI Studio batch build complete)"
git remote add origin https://github.com/YOUR_USERNAME/zaboraa-finance.git
git branch -M main
git push -u origin main
git checkout -b dev
git push -u origin dev
```
**`.gitignore`:** `.env.local`, `.env*.local`, `supabase/.temp/`
**Running Locally (README, as-built 8B):**
```
1. cp .env.example .env.local   # fill in all values
2. npm install
3. supabase db push             # apply all migrations
4. npm run dev                  # starts at http://localhost:3000
```

---

## 12. Testing Checklist + Go-Live Checklist

### After Each Batch (General)
- [ ] Public `/` shows no data, shows "Zaboraa Finance"
- [ ] Owner login → sees data. Other Google → empty / unauthorized. Logout → `/`. Idle 30 min → auto logout.
- [ ] Same PDF twice → blocked. Overlapping statements → no duplicates (multiset). Account A upload → not in B.
- [ ] Masked account + Customer ID → matches. Transfer HDFC→Paytm → Transfer, not Income/Expense.
- [ ] Credit card spend vs bill payment → not double-counted. Negative balance renders.
- [ ] Gemini key removed → rules + banner, no crash. Ask-Your-Data → numbers from DB.
- [ ] ITR Excel totals == Dashboard totals. Backup ZIP encrypted. RLS isolation passed.
- [ ] GitHub has no `.env`, no real PDF, no API key. `https://zaboraa.com` loads HTTPS.

### Go-Live Checklist (Remaining — Do Now)
**Supabase**
- [ ] All migrations applied (`supabase db push`, `supabase db diff` = no diff)
- [ ] RLS enabled on every table + Storage RLS (no public read)
- [ ] Storage buckets created with MIME restrictions
- [ ] Edge functions deployed + secrets set (if any)
- [ ] RLS isolation smoke test passed (2nd account sees nothing)
**Environment**
- [ ] `.env.local` populated, not committed. `.gitignore` excludes `.env*`. Service-role key not in client bundle.
**GitHub**
- [ ] Batch 8A committed: `Batch 8A - Backend Wiring - Working`
- [ ] Batch 8B committed: `Batch 8B - Frontend + Invoicing - Working`
- [ ] Repo is private, `main` + `dev` pushed
**Testing (Manual E2E, Logged In)**
- [ ] Login → dashboard shows real Supabase data
- [ ] Upload CSV → transactions appear. Upload same CSV twice → `duplicates_skipped > 0`
- [ ] Replace import works. Export Excel → downloads. Backup → `.zab` downloads.
- [ ] Invoice create/list/Mark Paid works. Gemini test → ok. Idle logout 30 min.
- [ ] Playwright suite 0 failures (`npx playwright test`)
**Deployment**
- [ ] Vercel → zaboraa.com + www → apex redirect, HTTPS
- [ ] Supabase Auth Redirect URLs = `https://zaboraa.com`
- [ ] Live domain incognito login test, dummy CSV upload test (not real statement first)

---

## 13. Next Actions for Owner
1. Commit 8A + 8B to GitHub (messages above).
2. Run **Batch 9A (audit only)** → review the table → 9B → 9C → 9D. One batch at a time: Test → Commit → Push.
3. Then Batch 10A → 10F (core export invoicing), then 10G, 10H.
4. Resolve the §10 pre-Go-Live risks, then run Go-Live Checklist §12 and deploy to zaboraa.com.
5. For any future feature, create the next small batch — paste this v2.3.0 MD + new prompt + codebase, always with "Keep Vite + React SPA + Express — do NOT convert to Next.js. Brand is Zaboraa Finance."

---

*— End of Zaboraa Finance v2.3.0 — Batches 0–8B complete. Batch 9 (persistence) and Batch 10 (export invoicing) planned in small batches. Go-Live pending. Test after each batch. Commit to GitHub. —*
