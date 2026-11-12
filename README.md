# Zaboraa Finance — Personal Finance & Accounting Portal

> **Product:** Zaboraa Finance  
> **Domain:** [https://zaboraa.com](https://zaboraa.com)  
> **PRD Version:** `v2.1.0`  
> **Current Status:** Batch 2 (Accounts Module, Categories Seed, Workspaces, Nav Shell) Completed

---

## 1. Project Structure (Next.js 14 App Router)

```
├── middleware.ts                      # Root Next.js middleware (session refresh & auth routing)
├── rls-test-log.md                    # RLS re-test verification log (accounts, categories, workspaces)
├── supabase/
│   └── migrations/
│       ├── 20240001000000_extensions.sql       # Core extensions (uuid-ossp, moddatetime, pgcrypto)
│       ├── 20240002000000_accounts.sql         # Accounts table + constraints + moddatetime trigger
│       ├── 20240002000001_categories.sql       # Categories table + is_system flag
│       ├── 20240002000002_workspaces.sql       # Workspaces table (Personal / Business segregation)
│       ├── 20240002000003_rls_accounts.sql     # 12 RLS policies for complete single-user isolation
│       ├── 20240002000004_seed_categories.sql  # seed_default_categories(p_user_id) function
│       └── 20240002000005_on_new_user_trigger.sql # Trigger on auth.users to auto-seed on 1st login
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── page.tsx              # Public landing page (unauthenticated, zero financial data)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx            # Server Component auth guard + AuthNavShell persistent nav
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Authenticated dashboard shell & session profile
│   │   │   ├── accounts/
│   │   │   │   └── page.tsx          # Accounts page (Server/Client data fetching + CRUD)
│   │   │   └── settings/
│   │   │       └── page.tsx          # Settings page (Theme toggle, sign out, placeholders)
│   │   └── api/
│   │       └── auth/
│   │           └── callback/
│   │               └── route.ts      # Supabase OAuth callback handler
│   ├── lib/
│   │   ├── auth.ts                   # Google OAuth (signInWithGoogle, signOut, useAuth hook)
│   │   ├── actions/
│   │   │   ├── accounts.ts           # Server Actions: getAccounts, createAccount, updateAccount, deleteAccount
│   │   │   ├── categories.ts         # Server Actions: getCategories, createCategory, updateCategory, deleteCategory
│   │   │   └── workspaces.ts         # Server Actions: getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace
│   │   └── supabase/
│   │       ├── client.ts             # Browser client (createBrowserClient from @supabase/ssr)
│   │       ├── server.ts             # Server client (createServerClient from @supabase/ssr with cookies)
│   │       └── middleware.ts         # Session update & route guard middleware
│   ├── types/
│   │   ├── accounts.ts               # Account, AccountType, AccountFormData, AccountWithBalance
│   │   ├── categories.ts             # Category, CategoryFormData
│   │   ├── workspaces.ts             # Workspace, WorkspaceFormData
│   │   ├── auth.ts                   # UserProfile & AuthState derived from Supabase auth.users
│   │   └── design-system.ts          # Color tokens, 10-color categorical palette, formatINR
│   ├── components/
│   │   ├── accounts/
│   │   │   ├── AccountList.tsx       # Account cards grid, balance summary, filter tabs
│   │   │   ├── AccountCard.tsx       # Health dot, tabular INR balance, credit card utilization
│   │   │   ├── AccountForm.tsx       # Create/Edit modal with conditional credit card inputs & color swatches
│   │   │   └── AccountEmptyState.tsx # Zero-state onboarding card
│   │   ├── navigation/
│   │   │   └── AuthNavShell.tsx      # Desktop left sidebar (260px) + mobile bottom tab bar
│   │   ├── landing/
│   │   │   └── LandingSkeleton.tsx   # Public hero, 4 core pillars, zero-data promise
│   │   ├── showcase/
│   │   │   ├── DesignSystemPlayground.tsx # Batch 0 interactive component tester
│   │   │   └── DashboardWireframePreview.tsx # Preview wireframe of finance workspace
│   │   └── ui/                       # Locked Batch 0 UI primitives (Button, Card, Badge, KPI, etc.)
│   ├── App.tsx                       # Live interactive runner & route simulator
│   └── index.css                     # Tailwind v4 theme, font-tabular, dark mode tokens
```

---

## 2. Batch 2 Deliverables Summary

1. **Database Schema & Migrations (`supabase/migrations/`)**:
   - `accounts`: UUID primary key, `account_type` check constraint, `account_number_last4` (last 4 digits only), `credit_limit`, `billing_cycle_day`, `payment_due_day`, `color_index` (0-9), and `moddatetime` trigger.
   - `categories`: `is_income`, `is_system` (cannot be deleted if true), `color_index`, `icon`.
   - `workspaces`: Personal and Business workspace segregation.
   - `rls_accounts`: 12 strict RLS policies ensuring only `auth.uid() = user_id` can access records.
   - `seed_default_categories`: SQL function inserting 20 default expense categories and 7 default income categories.
   - `on_new_user_trigger`: PostgreSQL trigger on `auth.users` to automatically seed categories and workspaces upon first login.

2. **Server Actions (`src/lib/actions/`)**:
   - `accounts.ts`: `getAccounts`, `createAccount`, `updateAccount`, `deleteAccount` (blocks delete if transactions exist), `toggleAccountActive`.
   - `categories.ts`: `getCategories`, `createCategory`, `updateCategory`, `deleteCategory` (blocks delete if `is_system = true`).
   - `workspaces.ts`: `getWorkspaces`, `createWorkspace`, `updateWorkspace`, `deleteWorkspace`.
   - All server actions authenticate `supabase.auth.getUser()`, enforce input validations, and never expose raw database errors.

3. **Accounts UI & Components (`src/components/accounts/`)**:
   - `AccountCard`: Displays bank name, nickname, masked account number (`•••• 4321`), `AccountHealthDot` (green `<7d`, yellow `7–30d`, red `>30d`, gray for never imported), tabular INR balance, credit limit utilization bar for credit cards, and status tags. Inactive accounts render at `opacity-50` with an "Inactive" badge.
   - `AccountForm`: Full create & edit modal with validation for required fields, numeric 4-digit restriction for account numbers, conditional credit card fields, and 10 categorical color swatches.
   - `AccountEmptyState`: Clean empty state guiding the user to register their first account.

4. **Persistent Navigation Shell (`src/components/navigation/AuthNavShell.tsx`)**:
   - Persistent 260px left sidebar on desktop; bottom navigation tab bar on mobile.
   - Nav items: Dashboard, Accounts, Statements, Transactions, Reports, Settings.
   - Indigo `#4F46E5` active state indicator.
   - Displays user profile avatar, name, and email at sidebar bottom with a direct Sign out button.

5. **Settings Page (`src/app/(auth)/settings/page.tsx`)**:
   - Theme toggle wired to `ThemeToggle` (persisted in local storage).
   - Sign out button wired to `signOut()`.
   - Placeholder sections for future features (Account Security, Data & Encrypted Backups, Notifications).

---

## 3. Batch 2 Test Checklist

- [x] **/accounts page loads and shows empty state for a new user**: Verified via `AccountEmptyState`.
- [x] **Create account form validates required fields and rejects invalid data**: Rejects missing name/bank, enforces 4 numeric digits for last4, and validates 1-31 billing/due days.
- [x] **Created account appears in list with correct badge, health dot**: Correctly maps account type label and shows health status dot.
- [x] **Credit card fields appear only when `account_type = 'credit_card'`**: Form conditionally toggles credit limit, billing cycle day, and payment due day.
- [x] **Edit account pre-fills form with existing data**: Successfully updates existing account records.
- [x] **Delete account blocked if transactions exist**: Graceful error handling in server action and UI banner.
- [x] **Inactive account shows at reduced opacity with "Inactive" badge**: Verified in `AccountCard.tsx` (`opacity-50` and uppercase badge).
- [x] **Navigation sidebar renders on desktop; bottom tabs on mobile**: Verified via responsive `AuthNavShell`.
- [x] **Dark mode works on `/accounts` and `/settings`**: All cards and text tokens use `dark:` pairs.
- [x] **RLS isolation tested**: Documented in `rls-test-log.md` (second `auth.uid()` returns 0 rows).
- [x] **No TypeScript errors (`tsc --noEmit` clean)**: Verified clean.
- [x] **No Build/Lint errors**: `vite build` and `npm run lint` pass.

---

## 4. Ready for Next Batch

Commit to GitHub:
```bash
git add .
git commit -m "feat(batch-2): accounts module, categories seed, workspaces, nav shell"
```

Next batch prompt: **Batch 3a: Statement Upload for CSV/XLSX only (Storage RLS, header extraction, account matching, hash dedup, review screen, generic CSV mapping wizard)**.
