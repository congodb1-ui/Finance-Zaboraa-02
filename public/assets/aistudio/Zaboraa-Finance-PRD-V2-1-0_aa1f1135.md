# Zaboraa Finance — Personal Finance & Accounting Portal
## Detailed Requirement (PRD) + Implementation Plan — FINAL MERGED VERSION

> **Document Version:** `v2.1.0`
> **Product Name:** Zaboraa Finance
> **Domain:** https://zaboraa.com
> **Last Updated:** 2026-11-12
> **Changelog:**
> - `v1.0.0` — Original PRD + 7 batches
> - `v1.1.0 (Claude)` — Review: pdfjs-dist, Flash vs Pro split, Storage RLS, multiset dedup, Batch 0 design system, Batch 3 split, Post-build runbook
> - `v2.0.0 (Merged)` — Merged PRD + Claude review into one doc. Added Zabora Finance branding, zaboraa.com domain config, credit-card handling, audit log, idle logout, encrypted backup
> - `v2.1.0 (Current)` — **MAJOR BRANDING CHANGE: Zabora → Zaboraa.** Product renamed to **Zaboraa Finance** everywhere. Domain remains https://zaboraa.com (now matches brand exactly). All prompts, titles, wordmark, SEO, env examples updated to Zaboraa.

> **Version Convention for future editors:**
> This document uses semantic versioning — `vMAJOR.MINOR.PATCH`.
> - **PATCH** (`v2.1.0 → v2.1.1`): typo fixes, minor clarifications, no structural change
> - **MINOR** (`v2.1.0 → v2.2.0`): new section added, existing section meaningfully extended, batch plan updated
> - **MAJOR** (`v2.1.0 → v3.0.0`): PRD-level scope change, architecture decision reversed, entire section replaced
>
> **Every time you update this document, you must:**
> 1. Increment the version number in the header above
> 2. Add a one-line entry to the Changelog above (date + what changed)
> 3. Update "Last Updated" to today's date
>
> Do not submit a modified version without bumping the version.

> **How to use this file with AI Studio:**
> Give THIS entire MD file to AI Studio at the start. Then say: "Start with Batch X" (e.g. "Start with Batch 0"). After each batch, commit to GitHub, then in the next session upload the code from GitHub + paste this MD file again + say "Continue from Batch Y, previous batch is working". Do NOT give the old v1.0 DOCX or Claude v1.1 MD separately — this v2.1.0 file supersedes both.

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
| **Logo / Wordmark** | Text wordmark **"Zaboraa"** in Manrope 700 + **"Finance"** in Inter 400, indigo #4F46E5. No logo image needed in V1. Favicon: **"Z"** in indigo rounded square. |
| **Public Promise** | Public page shows zero financial data. Login only via Google. |

**Domain rules for AI Studio / Claude Code:** All absolute URLs, canonical, OG tags, sitemap, Supabase Auth Redirect URLs, and Vercel domains must use `https://zaboraa.com`. `NEXT_PUBLIC_APP_URL=https://zaboraa.com` in production, `http://localhost:3000` in local dev only. Never hardcode localhost in production build. Brand name in code, UI, titles, package.json name, README, and comments must be **Zaboraa** (double-a), never Zabora.

### Product Vision & Goals

Build a private, online, intelligent personal accounting portal for one user (owner) in India. It replaces manual Excel tracking. It ingests bank / UPI / wallet statements via upload, auto-assigns them to the correct account among 5–10 accounts, de-duplicates, categorizes, and produces ITR-ready reports.

- **Goal 1:** Know where money goes, what is business vs personal, and what is profit for ITR.
- **Goal 2:** Reduce manual entry to near-zero. Upload statement → Review → Confirm.
- **Goal 3:** Use AI only for understanding and insights, never for changing accounting numbers without approval.

**Non-Goals (Explicitly OUT of scope for V1):** Multi-user / team, commercial SaaS, direct bank / GPay / Paytm API fetching, automatic tax filing with IT department, GST filing, payroll, inventory, UPI payment initiation. The app is **READ-ONLY** for money movement. It never moves money.

---

## 2. Users & Access Model

| Role | Who | Access |
|---|---|---|
| **Owner (You)** | Single Google account, allowlisted email | Full access to all data, settings, AI, export, backup |
| **Public Visitor** | Anyone opening URL without login | Only public landing page. Zero financial data. No API calls to private tables. |
| **Other Google User** | Any other Google login | Can login but sees empty state + "Not authorized" message. Cannot see owner data due to RLS. |

**Authentication:** Supabase Auth with Google OAuth ONLY. No email/password signup. No magic link for strangers. Session persisted. Logout clears session. Allowed email list stored in env / config table: `ALLOWED_EMAILS`. If logged-in email not in list, show unauthorized screen and block all queries.

---

## 3. Tech Stack (Locked for Zaboraa Finance)

| Layer | Choice |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript + Tailwind CSS + lucide-react icons |
| Backend / DB | Supabase (PostgreSQL) — Auth, DB, Storage, RLS, Edge Functions if needed |
| Hosting | Vercel — Custom domain zaboraa.com, auto-deploy from GitHub main branch |
| Repo | GitHub Private Repo: `zaboraa-finance` (branches: main, dev, feat/*, fix/*) |
| AI | Google Gemini API — gemini-2.5-flash + gemini-2.5-pro (split, see §6) |
| Parser | pdfjs-dist (PDF with x/y) + papaparse (CSV) + xlsx (Excel). Per-bank modules: parsers/hdfc.ts, sbi.ts, icici.ts, axis.ts, kotak.ts, generic.ts |
| Charts | Recharts, fixed palette, tabular-nums for all money |
| Tests | Playwright E2E + RLS smoke test |
| AI Builder | Google AI Studio (Gemini) in batches |

---

## 4. Functional Requirements

### 4.1 Master Profile (One-time Setup)

- Fields: Full Legal Name (as per PAN), Mobile, Email, PAN, Address, Default FY, Default Currency INR, Timezone Asia/Kolkata
- Profile is linked to `auth.users.id` (user_id). All other tables have `user_id` foreign key.
- Profile edit allowed, but PAN / Name change requires confirmation modal.

### 4.2 Accounts Module — Multi-Account Registry (5–10 Accounts)

User will have 5–10 accounts. Each account must be created once and then auto-matched on every upload.

| Field | Type / Rule | Required |
|---|---|---|
| id | UUID PK | Yes |
| user_id | FK to auth.users | Yes |
| nickname | Text, e.g. HDFC Savings - Main | Yes |
| bank_name | Text, e.g. HDFC, SBI, Paytm, GPay | Yes |
| account_number_full | Text, encrypted at rest, never sent to AI | Yes for bank |
| account_number_last4 | Derived, stored for matching | Yes |
| customer_id / CIF | Text, for matching | Yes if bank provides |
| ifsc | Text | Optional |
| upi_id | Text, for GPay/Paytm statements | Optional |
| account_type | Savings / Current / Wallet / UPI / Cash / Credit Card | Yes |
| purpose | Personal / Business / Mixed | Yes |
| opening_balance | Decimal | Yes |
| opening_date | Date | Yes |
| credit_limit, billing_date, due_date, statement_date | For Credit Card only | If Credit Card |
| is_active | Boolean | Yes |
| color / icon | UI only | No |

**Credit Card Rule (Important):** Card spend = Expense on spend date. Card bill payment from a bank account = Transfer, NOT a second expense. Otherwise expenses will be double-counted.

**Overdraft / Negative:** Balance can go negative. Health dot + charts must handle negative correctly.

**Inactive mid-FY:** If `is_active = false` mid-FY, historical transactions + FY reports STILL include it. List shows "Inactive" badge but data remains.

**Account List Page:** Shows current balance (opening + sum credits - debits), last statement imported date, status dot (Green = updated <7 days, Yellow = 7–30 days, Red = >30 days).
**Account Detail Page:** Ledger table, filters, balance chart, statement history.

### 4.3 Statement Upload & Auto-Matching (Core)

Supported formats: PDF (bank statements), CSV, XLSX. Max file size 25 MB. Supported banks initially: HDFC, SBI, ICICI, Axis, Kotak, Paytm, GPay statement export. Parser must be extensible: add new parser per bank without breaking others.

#### Step-by-Step Upload Flow

1. User selects file → Upload to Supabase Storage (private) → Create upload record with file_hash (SHA-256), file_name, file_size.
2. Server parses header: Extract Customer Name, Account Number (full or masked), Customer ID, Statement Period (from_date, to_date).
3. **Account Matching — Priority Order:** (a) Full Account Number exact match, (b) Last 4 Digits + Customer ID match, (c) Customer ID only, (d) Last 4 + Name fuzzy match. If no match → Show "Select Account Manually" dropdown, do NOT auto-import to wrong account.
4. Parse transactions: date, description/narration, debit, credit, balance, utr/reference, type.
5. Validate: If balance does not reconcile (opening + credits - debits != closing within tolerance), show warning but allow import with flag.
6. Show **Review Screen BEFORE saving:** Account matched, total rows, new rows, duplicates skipped, total credit, total debit, period, sample 10 rows.
7. User clicks **Confirm Import** → Insert transactions in batch, update account last_imported_at. If Cancel → Delete temp parsed data, keep file for retry.

#### Duplicate Detection — 3 Layers (Mandatory, Multiset Fix)

- **Layer 1 — File Hash:** If SHA-256 already exists for same user_id + account_id → Block with message "This exact file was already uploaded on [date]".
- **Layer 2 — Statement Period:** If same account + same from_date + to_date already imported → Warn "Statement for this period already imported. Import only missing transactions?" with option to proceed in "Missing Only" mode.
- **Layer 3 — Transaction Level (Multiset):** Key = account_id + date + amount + UTR (when UTR present). If UTR missing, key = account_id + date + amount + normalized description (lowercase, remove spaces/special chars). **Count occurrences** in existing DB vs new batch. Only the *excess* is duplicate. Example: DB has 1× ₹500 Swiggy, new batch has 2× ₹500 Swiggy → 1 is duplicate, 1 is new. Do NOT collapse all matches. Overlapping statements (e.g. 1–15 Oct then 10–31 Oct) must NOT duplicate 10–15 Oct rows.

**Normalization:** Descriptions must be normalized before comparison: lowercase, trim, remove multiple spaces, remove UPI ref number variations.

**Replace Previous Import:** If bank reissues a corrected statement, user can choose "Replace Previous Import" → deletes old import's transactions for same period (audit logged) + imports new. Requires confirmation modal typing "REPLACE".

**Parser Version:** Store `parser_version` on `statement_uploads`. If parser fixed later, flag old imports as "Parsed with old version — re-import available".

**Generic CSV Mapping Wizard:** If bank unknown, show column-mapping wizard: Map "Txn Date → date", "Withdrawal Amt → debit", etc. Save mapping as template for that bank for next time.

**Storage Path MUST be:** `{auth.uid()}/{YYYY-MM}/{file-hash}-{original-name}`. No other pattern.

### 4.4 Transactions & Categorization

| Field | Description |
|---|---|
| date, amount, type | Debit = money out, Credit = money in |
| description_raw | Original narration from bank |
| description_clean | AI / rule cleaned merchant name |
| category_id | FK to categories |
| workspace | Personal / Business |
| counterparty | Person / shop / client / vendor |
| payment_method | UPI / NEFT / IMPS / Card / Cash / NetBanking |
| utr | Unique transaction ref |
| is_transfer | Boolean — self-transfer between own accounts |
| is_duplicate | Boolean, for audit |
| bill_url | Link to bill in Storage |
| notes | User note |
| ai_suggestion | Gemini suggested category + confidence |
| status | Pending Review / Confirmed / Ignored |
| parser_version, file_hash, statement_period | For audit / dedup |

- **Categories (Seed List):** Income: Client Payment, Salary, Interest, Refund, Other Income. Expense: Food, Groceries, Travel, Fuel, Rent, Utilities, Subscriptions, Shopping, Health, Education, Business - Office, Business - Vendor, Business - Travel, Tax / GST, EMI / Loan. Transfer: Self-Transfer. User can add/edit categories.
- **Rules Engine:** User can create rule: "If description contains SWIGGY → Category Food, Workspace Personal". Rules run before AI.
- **Transfer Detection:** If same amount + date within ±1 day appears as Debit in Account A and Credit in Account B, and counterparty matches own name / own account, auto-mark both as Transfer, not Income/Expense. Show in review: "Possible self-transfer detected".
- **Manual Add:** Form for Cash / missing transactions: Amount, Date, From Account, To (payee), Category, Workspace, Photo of bill, Note.
- **Bulk Edit:** Select multiple transactions → Change Category / Workspace in one go.

### 4.5 Dashboard & Analytics (Non-AI)

- Top Cards: This Month Income, This Month Expense, Net, Total Balance Across Accounts, Pending Client Amount, Tax Provision (running number).
- Filters: FY selector (2024-25, 2025-26, 2026-27), Date Range, Workspace (All / Personal / Business), Account (All / Specific).
- Charts: Expense by Category (Pie), Income vs Expense by Month (Bar), Balance Trend (Line), Net Worth Over Time (Line, rolling sum), Top 10 Merchants / Payees, Top 10 Clients, FY-over-FY comparison.
- Account Health Widget: List of all accounts with last updated date and red/yellow/green dot.
- Recent Transactions Table: Last 20, with search.

### 4.6 Gemini AI Intelligence Layer (Critical)

**PRIVACY RULE — NON-NEGOTIABLE:** NEVER send to Gemini: account_number_full, customer_id, PAN, full name, address, phone, email, file PDF content, UTR full. Only send: anonymized transaction objects {date, amount, cleaned_description, category, workspace}. Mask merchant names if they contain personal names. Remove account numbers from description before sending.

- **Feature A — Smart Categorization:** Input: 50 uncategorized transactions (batched). Prompt: "Categorize each into given category list, return JSON with id, category, confidence, reason". Structured JSON output only (`response_mime_type: application/json`).
- **Feature B — Description Cleaning:** Input: raw narration. Output: clean merchant name + payment method. Example: `UPI/4123.../PAYTM/XYZ PVT` → `XYZ Pvt Ltd`.
- **Feature C — Monthly AI Report:** Input: Monthly aggregates (totals by category, MoM change, top merchants). Output: Markdown report in simple English/Hinglish mix, with Summary, What went up/down, Unusual spending, Tax provision suggestion, 2–3 actionable tips. Must include disclaimer: "AI estimate, not CA advice". **Model: gemini-2.5-pro ONLY for this feature** (once-a-month, quality matters).
- **Feature D — Anomaly Detection:** Input: Last 90 days transactions. Output: List of anomalies: Duplicate charges, unusually high amount vs average, new payee with high amount, repeated small trial charges, missing recurring payment. Each with severity Low/Medium/High. **Model: gemini-2.5-flash.**
- **Feature E — Ask Your Data (Chat):** User types natural language question. Gemini returns a **parameter object only** {date_range, category, workspace, account, amount_range} — never raw SQL. Code validates + builds SQL. Numbers must come from DB query, Gemini only formats answer. Never let Gemini hallucinate numbers. **Model: gemini-2.5-flash.**
- **Feature F — AI Settings Page:** Fields: Gemini API Key (password field, stored in Supabase Secrets / server env only, never exposed to frontend), Model selector (flash default, pro for monthly report), Toggles: Enable Smart Categorization, Enable Monthly Report, Enable Chat, Enable Anomaly. Usage counter: API calls this month.
- **Confidence 3-tier:** `<0.5` → Needs Review (separate list, no suggestion), `0.5–0.7` → Low-confidence suggestion, `>0.7` → Safe to pre-select (still requires user Confirm, per Goal 3).
- **Fallback:** If Gemini API fails / key missing / quota exceeded, app must still work fully with rule engine. Show banner "AI unavailable, using rules". No crash.
- **Logging:** Log model + prompt_template_version + tokens in `ai_logs` for reproducibility and cost tracking.

**Gemini Vision Exception:** Do NOT route PDF parsing through Gemini Vision by default — it conflicts with privacy rule. Only as opt-in fallback for unsupported bank, with redaction + logged consent, never as default path.

### 4.7 ITR & Reports Module

- FY Report: For selected FY: Total Business Income, Total Business Expenses, Net Profit, Total Personal Income, Total Personal Expense, GST collected/paid (if tracked), Advance Tax paid, TDS entries.
- Export: One-click Export to Excel (with sheets: Summary, Transactions, Category-wise, Account-wise) and PDF (CA-ready). Export must respect FY + Workspace filters.
- Tally Format: Export CSV in Tally-compatible format (Date, Ledger, Debit, Credit, Narration) — optional in V1, must-have in V2 if CA uses Tally.
- Client / Vendor Ledger: Per counterparty page: Total Billed, Total Received, Pending. Auto-match invoice to payment if amount + client matches.

### 4.8 Additional Modules (V1.5 — After Core Stable)

- Recurring Tracker: Detect recurring (same payee + similar amount + monthly) → Create recurring rule → Reminder 2 days before due, Flag if missing after due date.
- Budget: Per category per month limit, progress bar, alert at 80% and 100%.
- Document Vault: Upload PAN, Form 16, 26AS, AIS, Invoices, Rent Agreement. Linked to FY, stored private. List + download + delete.
- Invoicing (Light): Create invoice (Client, Amount, GST, Date), Status Paid/Pending/Overdue, Link to transaction when payment arrives.
- Backup: One-click Export All Data (JSON + Excel + PDFs) as **password-protected / encrypted ZIP**.
- Net Worth Over Time, EMI/Loan Amortization Tracker (principal, rate, tenure → remaining principal / interest paid), Generic CSV Wizard, Command Palette / Quick-Add (`Cmd+K`), FY-over-FY comparison view.

---

## 5. Public vs Private Pages — Routing (zaboraa.com)

| Route | Access | What it shows |
|---|---|---|
| `/` | Public | Landing page for Zaboraa Finance, app name, tagline, "Login with Google" button. No data. No Supabase private query. |
| `/login` | Public | Redirect to Supabase Google OAuth |
| `/dashboard` | Private — Auth + Allowlist | Main dashboard |
| `/accounts` | Private | Account list + detail |
| `/upload` | Private | Statement upload + review |
| `/transactions` | Private | All transactions, filters, bulk edit |
| `/reports` | Private | FY / ITR reports |
| `/ai-insights` | Private | Monthly AI report, anomalies, chat |
| `/invoices` | Private | Invoicing (V1.5) |
| `/vault` | Private | Document vault |
| `/settings` | Private | Profile, Accounts, Categories, AI Key, Backup |
| `/unauthorized` | Public | Shown if Google login email not in allowlist |

**Middleware:** Next.js middleware must check Supabase session on every private route. If no session → redirect to `/`. If session but email not allowlisted → redirect to `/unauthorized`. Frontend hiding is NOT enough; RLS must enforce.
**Idle Logout:** 30 min inactivity → auto logout + redirect to `/` with "Session expired for security".

---

## 6. Design System — Zaboraa Finance (Locked)

Rationale: data-dense, numbers-first, privacy-conscious personal tool, often checked quickly on mobile or at night. Design should read as *calm and trustworthy* rather than "fintech-marketing colorful".

### 6.1 Typography

- **UI font: Inter** (Google Fonts, free, excellent at small sizes, first-class Tailwind support). Use for all body text, labels, nav, buttons.
- **Headings: Manrope**, slightly heavier weight (600/700) — gives section titles personality without breaking consistency.
- **Numbers (critical):** enable tabular figures everywhere money/dates are shown:
  ```css
  .font-tabular { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
  ```
  Apply this class to every amount, balance, and date-column cell.
- Scale: 12/14/16/20/24/32px, one weight step per level (400 body → 600 headings → 700 totals/KPI cards).

### 6.2 Color Palette

| Role | Light mode | Dark mode |
|---|---|---|
| Page background | `#F8FAFC` (slate-50) | `#0B1120` (near-black navy, not pure black) |
| Card/surface | `#FFFFFF` | `#111827` (slate-900) |
| Border | `#E2E8F0` | `#1F2937` |
| Primary text | `#0F172A` | `#E5E7EB` |
| Secondary text | `#64748B` | `#94A3B8` |
| **Brand/primary accent** | `#4F46E5` (indigo-600) | `#6366F1` (indigo-500) |
| **Income/credit** | `#16A34A` (green-600) | `#22C55E` |
| **Expense/debit** | `#DC2626` (red-600) | `#F87171` |
| **Warning/pending/review** | `#D97706` (amber-600) | `#FBBF24` |
| **Transfer/neutral** | `#64748B` (slate) | `#94A3B8` |

Rules:
- Indigo is the *only* brand color — used for primary buttons, active nav state, links, focus rings. Nothing else competes with it.
- Green/red are reserved strictly for credit/debit and never reused for anything else (e.g. don't also use red for generic "delete" — use neutral/slate button with confirm step, so red keeps its one meaning).
- Pair every green/red with a `+`/`−` sign or icon, not color alone — colorblind-safe.
- Account health dots keep green/yellow/red from PRD, same hex family.

### 6.3 Category Colors (for charts, tags, icons)

Fixed, desaturated 10-color categorical palette, same order every time so a category is always the same color across dashboard, charts, and tags:
`#6366F1` `#0EA5E9` `#14B8A6` `#22C55E` `#84CC16` `#EAB308` `#F97316` `#EF4444` `#EC4899` `#A855F7`
(indigo → sky → teal → green → lime → yellow → orange → red → pink → purple). Assign in fixed map at category-seed level so "Food" is always same color, not re-randomized.

### 6.4 Backgrounds & Imagery

- **Inside app (authenticated pages):** flat neutral background only, white/dark cards with soft `shadow-sm`, no decorative imagery or gradients. Visual interest comes from charts, not chrome.
- **Public landing page (`/`) only:** single soft gradient mesh in indigo → teal (`#4F46E5` → `#0EA5E9`) at low opacity behind hero text, plus "Login with Google" button. This is the one place polish earns its keep, since it has zero financial data.
- **Icons:** one icon set throughout — `lucide-react` (MIT, tree-shakeable). Icons inherit semantic color only when they carry meaning; otherwise neutral slate.
- **Dark mode is first-class, not afterthought** — toggle in `/settings`, persisted per profile, using Tailwind `dark:` variant.

### 6.5 Chart Colors

Recharts/Chart.js configured once with category palette above (never library defaults). Income vs expense bar charts use semantic green/red; everything else uses 10-color categorical palette in fixed, non-random order.

---

## 7. Database Schema (Supabase PostgreSQL)

All tables have: `id` UUID PK, `user_id` UUID FK to auth.users, `created_at`, `updated_at`. Enable RLS on ALL tables. Policy: `SELECT/INSERT/UPDATE/DELETE` only where `auth.uid() = user_id`.

| Table | Key Columns |
|---|---|
| profiles | user_id, full_name, email, pan_encrypted, phone, address, default_fy, dark_mode |
| accounts | user_id, nickname, bank_name, account_number_encrypted, last4, customer_id_encrypted, ifsc, upi_id, type, purpose, opening_balance, opening_date, credit_limit, billing_date, due_date, last_imported_at, is_active |
| categories | user_id, name, type (income/expense/transfer), color (fixed map), is_system |
| transactions | user_id, account_id, date, description_raw, description_clean, amount, type (debit/credit), category_id, workspace, counterparty, payment_method, utr, is_transfer, bill_url, notes, ai_suggestion, status, file_hash, statement_period, parser_version |
| statement_uploads | user_id, account_id, file_name, file_hash, file_path, period_from, period_to, total_rows, new_rows, duplicates_skipped, parser_version, status |
| rules | user_id, match_text, category_id, workspace, priority |
| budgets | user_id, category_id, month, year, limit_amount |
| invoices | user_id, client_name, invoice_no, date, amount, gst, status, transaction_id |
| documents | user_id, fy, doc_type, file_path, file_name |
| audit_logs | user_id, action, entity, entity_id, before_json, after_json, created_at |
| ai_logs | user_id, feature, model, prompt_template_version, tokens, response_summary, created_at (for cost tracking, no PII) |

Indexes: `transactions (user_id, account_id, date)`, `transactions (user_id, utr)`, `transactions (user_id, category_id)`, `statement_uploads (user_id, file_hash)`.

---

## 8. Security & Privacy Requirements (Must Follow)

- RLS ON for every table. Test RLS by logging in as second Google account and confirming empty data. Test after Batch 1 and again after Batch 2 — not only at end.
- **RLS on Storage, not just tables.** `storage.objects` policies scoped to `auth.uid()`. "Private bucket" alone is not a policy.
- Never store Gemini API key in frontend code or GitHub. Use `.env.local` + Supabase Secrets. Provide `.env.example` with placeholder names only.
- Never log full account numbers, PAN, or PDF content. Logs must mask: account `****1234`.
- Supabase Storage buckets `statements` and `bills` must be PRIVATE. Use signed URLs with 60s expiry for download.
- File uploads: Validate file type, size, scan for executable. Reject `.exe`, `.js`.
- Add `.gitignore`: `.env*`, `node_modules`, `.next`, `uploads/`, `*.pdf` with real data, `supabase/.temp/`.
- Audit: Every import + every category/workspace/manual edit logs who, when, before, after. No delete without confirmation for transactions.
- Service-role key usage: Any API route using service-role key (bypasses RLS) must itself re-check `auth.uid()` + allowlist before running.
- Session/idle timeout: 30 min.
- Backup ZIP encryption: Backup ZIP must be password-protected / encrypted — it contains PAN, account numbers, statements.
- HTTPS only. Vercel + Supabase both HTTPS.
- Never return raw SQL errors to client (wrap in generic error messages).

---

## 9. Domain & Deployment — zaboraa.com Checklist

- **Vercel:** Add custom domain `zaboraa.com` + `www.zaboraa.com`. Set www → redirect to apex (`https://zaboraa.com`). Enable HTTPS auto, set `NEXT_PUBLIC_APP_URL=https://zaboraa.com`.
- **DNS (at registrar for zaboraa.com):** Add Vercel A / CNAME records as shown in Vercel dashboard. Verify with Vercel check. Do NOT point DNS until Vercel project is ready.
- **Supabase Auth:** Dashboard → Auth → URL Configuration → Site URL = `https://zaboraa.com`. Redirect URLs: Add `https://zaboraa.com/**`, `https://zaboraa.com/auth/callback`, `http://localhost:3000/**` (dev only).
- **Google Cloud Console (OAuth):** Authorized JavaScript origins: `https://zaboraa.com`. Authorized redirect URIs: `https://<supabase-ref>.supabase.co/auth/v1/callback`
- **SEO / Public:** Title `Zaboraa Finance — Personal Finance & Accounting`, Meta description `Private personal accounting portal — Zaboraa Finance`, OG image with Zaboraa wordmark, robots: allow `/` only, noindex for `/dashboard` etc via middleware + meta.
- **After domain live:** Test login on zaboraa.com in incognito, test second Google account sees nothing, test idle logout, test upload on production with dummy CSV first (not real statement).

---

## 10. Implementation Plan — Batches for AI Studio + GitHub (Final)

**Rule:** Give THIS v2.1.0 MD file + Batch prompt to AI Studio. After each batch: Test → Commit to GitHub → Push. Next batch: Import from GitHub + paste this MD file + say "Continue from Batch X, previous batch working".

| Batch | Name | Deliverable | Notes |
|---|---|---|---|
| **Batch 0** *(new)* | Design System | Tailwind config + CSS variables for palette/type in §6, base `Card`/`Button`/`Badge`/`KPI` components, light+dark toggle wired (no real data yet), Zaboraa wordmark on landing skeleton | Locks look & feel before any feature UI |
| **Batch 1** | Foundation + Landing + Auth | Next.js + Supabase setup, Public landing for Zaboraa Finance at zaboraa.com design, Google Auth, Middleware, Profiles + RLS, Allowlist, Migration files, RLS test with 2nd Google account | RLS test moved earlier |
| **Batch 2** | Accounts Module | Accounts CRUD + categories seed + fixed colors, Account list balance+health dot, Detail page, RLS test again, Credit-card fields | RLS test repeated |
| **Batch 3a** | Statement Upload (CSV/XLSX) | Upload UI, Private bucket + Storage RLS, CSV/XLSX parsing, Header extraction, Account matching, File-hash dedup, Review screen, Generic CSV mapping wizard | Split from original Batch 3 |
| **Batch 3b** | PDF Parsing | `pdfjs-dist`-based HDFC + generic PDF parser, Reconciled against Batch 3a review screen, `parser_version` column, Replace Previous Import | Split, riskiest piece |
| **Batch 4** | Transactions + Dedup + Categorization Rules | Transactions list/filters/search, Multiset Layer 3 dedup, Rules engine, Manual add, Bulk edit, Transfer detection, Audit log | Dedup hardened |
| **Batch 5** | Dashboard + Reports + Export | Dashboard charts (fixed palette), FY/workspace filters, Net Worth, ITR Report, Excel/PDF/Tally export, Client/Vendor ledger, Tax Provision | Palette locked |
| **Batch 6** | Gemini AI Layer | AI Settings, Server-side Gemini calls with PII masking, Structured JSON, 3-tier confidence, Flash vs Pro split, Monthly Report, Anomaly, Ask-Your-Data allow-list, Fallback if AI fails | AI hardened |
| **Batch 7** | Extras + Hardening | Recurring, Budgets, Vault, Invoicing, Encrypted Backup ZIP, Idle logout, Mobile polish, Playwright E2E, Security audit | Hardening added |

Everything else in Sections 1–9 stands as written.

### Batch Prompts — Copy-Paste for AI Studio (Use v2.1.0)

**How to start:** Paste this entire MD file into AI Studio first, then paste ONE batch prompt below. Wait for that batch to finish + test + commit to GitHub before starting next batch.

```
Batch 0 Prompt:
"Build Batch 0 only for Zaboraa Finance (https://zaboraa.com). Use the Design System in Section 6 of the v2.1.0 MD file I pasted. Create Tailwind config + CSS variables, base Card/Button/Badge/KPI components, dark mode toggle, tabular-nums for money. Brand name is Zaboraa (double-a), never Zabora. No real data yet. Provide README + test checklist."
```

```
Batch 1 Prompt:
"Build Batch 1 only for Zaboraa Finance. Use existing Batch 0 code. Next.js 14 + TypeScript + Tailwind + Supabase. Create public landing page at / for Zaboraa Finance (https://zaboraa.com) with zero financial data, Login with Google via Supabase Auth, middleware protecting /dashboard, /accounts, etc., profiles table with RLS, allowlist check via ALLOWED_EMAILS env. Generate migration files. NEXT_PUBLIC_APP_URL=https://zaboraa.com. Test RLS with second Google account. Provide .env.example, README, test checklist."
```

```
Batch 2 Prompt:
"Build Batch 2 only for Zaboraa Finance. Use existing Batch 1 code. Accounts module. Create accounts + categories tables with RLS. CRUD for accounts, account list with calculated balance + last imported date + health dot, account detail page. Include credit-card fields (credit_limit, billing_date, due_date). Do not build upload yet."
```

```
Batch 3a Prompt:
"Build Batch 3a only for Zaboraa Finance. Statement upload for CSV/XLSX only. Private Storage bucket + Storage RLS, server-side CSV/XLSX parser, header extraction, account matching by full number / last4+customer_id / customer_id, file-hash duplicate block, period duplicate warning, review screen before confirm, generic CSV column-mapping wizard. Do not build PDF yet. Do not build AI yet."
```

```
Batch 3b Prompt:
"Build Batch 3b only for Zaboraa Finance. PDF parsing with pdfjs-dist (x/y position). HDFC + generic parser, reconciled against Batch 3a review screen. Add parser_version column, Replace Previous Import option with REPLACE confirmation. Do not rebuild CSV logic."
```

```
Batch 4 Prompt:
"Build Batch 4 only for Zaboraa Finance. Transactions + rules. Transactions table, list/filters/search, multiset transaction-level dedup (only excess is duplicate), rules engine, manual add, bulk edit, transfer detection, audit log. Balance recalculation must handle negative balances."
```

```
Batch 5 Prompt:
"Build Batch 5 only for Zaboraa Finance. Dashboard + ITR reports. Charts with fixed palette from Section 6, FY + workspace filters, Net Worth, ITR summary, Excel/PDF/Tally export, client/vendor ledger, Tax Provision running number."
```

```
Batch 6 Prompt:
"Build Batch 6 only for Zaboraa Finance. Gemini AI. AI settings page, server-side Gemini calls with PII masking (never send account numbers, PAN, name, address to Gemini), structured JSON output, 3-tier confidence, gemini-2.5-flash for categorization/cleaning/anomaly/chat + gemini-2.5-pro for Monthly Report only, Ask-Your-Data parameter allow-list (never execute Gemini-generated SQL). Fallback if AI fails."
```

```
Batch 7 Prompt:
"Build Batch 7 only for Zaboraa Finance. Extras + hardening. Recurring, budgets, vault, invoicing, encrypted backup ZIP, idle logout 30 min, mobile polish, Playwright E2E, RLS test, security audit."
```

### Post-Build Local Integration Runbook (Claude Code)

After AI Studio has completed all batches (Batch 0 → Batch 7) and you have downloaded the full project ZIP to local machine:

```
AI Studio (batch build)
        │
        ▼
  Download project ZIP
        │
        ▼
  Unzip + open in Claude Code
        │
        ├─► Prerequisites check (Node 20 LTS, npm 10+ / pnpm 9+, Supabase CLI 1.200+, Git 2.40+, Claude Code CLI)
        ├─► Environment variables (.env.local)
        ├─► Supabase: DB migrations (supabase db push)
        ├─► Supabase: RLS policies
        ├─► Supabase: Storage buckets + bucket RLS
        ├─► Supabase: Edge Functions (if any) + secrets
        ├─► GitHub: initial push + branch strategy (main / dev / feat/* / fix/*)
        ├─► Local dev smoke test (npm run dev, 5-min checklist)
        └─► Playwright E2E automated tests
```

**Environment (.env.local) — minimum set:**
```env
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# ⚠️ SERVER-ONLY — never expose in client bundle
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# ── Gemini AI ──
# ⚠️ SERVER-ONLY
GEMINI_API_KEY=AIza...
# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
# In production on Vercel: NEXT_PUBLIC_APP_URL=https://zaboraa.com
ALLOWED_EMAILS=your-email@gmail.com
```

**GitHub — Initial Push + Branch Strategy:**
```bash
cd your-project-folder
git init
git add .
git commit -m "feat: initial build — Zaboraa Finance v1.0 (AI Studio batch build complete)"
git remote add origin https://github.com/YOUR_USERNAME/zaboraa-finance.git
git branch -M main
git push -u origin main
git checkout -b dev
git push -u origin dev
```

**`.gitignore` must include:**
```
.env.local
.env*.local
supabase/.temp/
```

**Local Dev Smoke Test (5 min):**
- [ ] Landing page loads, "Login with Google" button visible, shows "Zaboraa Finance"
- [ ] Google OAuth completes, redirects to dashboard
- [ ] Dashboard renders with empty state (no data yet)
- [ ] Accounts page loads, can add test account
- [ ] Upload page loads, file picker accepts PDF/CSV
- [ ] Settings page loads, dark mode toggle works
- [ ] No console errors, No 500s

**Playwright E2E — Generate with Claude Code:**
```
Prompt to Claude Code:
"This is a Next.js + Supabase personal finance app Zaboraa Finance. Generate a complete Playwright test suite in tests/e2e/ covering: Auth, Accounts, Statement Upload (CSV), Transactions, Dashboard, AI Categorization, Dark mode, RLS isolation. Use page object model, test Supabase project with seeded data — do not run against production. Use data-testid attributes."
```

---

## 11. Testing Checklist — After Each Batch

- [ ] Public `/` shows no data, shows "Zaboraa Finance"
- [ ] Login with owner Google → Sees data. Login with other Google → Sees empty / unauthorized.
- [ ] Logout → Redirect to `/`. Idle 30 min → Auto logout.
- [ ] Upload same PDF twice → Second upload blocked as duplicate.
- [ ] Upload overlapping statements (1–15 Oct + 10–31 Oct) → No duplicate transactions for 10–15 Oct.
- [ ] Upload statement for Account A → Does NOT appear in Account B.
- [ ] Upload statement with masked account number + Customer ID → Still matches correct account.
- [ ] Transfer HDFC → Paytm same amount same day → Marked as Transfer, not Income/Expense.
- [ ] Credit card spend vs bill payment → Not double-counted. Negative balance renders correctly.
- [ ] Turn off Gemini key → App still works with rules, shows "AI unavailable" banner, no crash.
- [ ] Ask-Your-Data → Numbers from DB, not hallucinated.
- [ ] Export ITR Excel → Totals match dashboard totals.
- [ ] Backup ZIP is encrypted. RLS isolation passed.
- [ ] Check GitHub repo → No `.env`, no real PDF, no API key committed.
- [ ] Domain https://zaboraa.com loads with HTTPS, login works.

---

## 12. What to Ask Claude to Review (Next Round)

When you give this v2.1.0 document to Claude, ask: "Review this PRD for missing edge cases, security holes in Supabase RLS, better Gemini prompting, better duplicate logic, and better batch split for AI Studio. Suggest improvements but do NOT change core requirement: single user, Supabase Google Auth only, statement upload only, no direct bank API, brand name is Zaboraa Finance (double-a), domain is zaboraa.com. Return a revised section list."

Also ask Claude: "Is gemini-2.5-flash the right model for categorization or should we use gemini-2.5-pro for monthly report only? Confirm split in §4.6."

---

## 13. Next Actions for Owner

1. Create Supabase project + Google OAuth credentials + Vercel project + Private GitHub repo `zaboraa-finance`.
2. Send this v2.1.0 MD file + Batch 0 prompt to AI Studio.
3. After Batch 0 works, commit to GitHub: `Batch 0 - Design System - Working`, then send Batch 1 prompt with previous code.
4. Send this document to Claude for review in parallel — do not wait for Claude to start Batch 0.
5. Point Vercel to zaboraa.com (DNS after Batch 1).

---

*— End of Zaboraa Finance v2.1.0 — Build in batches. Test after each batch. Commit to GitHub. —*
