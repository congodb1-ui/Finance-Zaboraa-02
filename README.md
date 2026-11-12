# Zaboraa Finance — Personal Finance & Accounting Portal

> **Product:** Zaboraa Finance  
> **Domain:** [https://zaboraa.com](https://zaboraa.com)  
> **PRD Version:** `v2.1.0`  
> **Current Status:** Batch 1 (Foundation + Landing Page + Google Auth) Completed

---

## 1. Project Structure (Next.js 14 App Router)

```
├── middleware.ts                      # Root Next.js middleware (session refresh & auth routing)
├── supabase/
│   └── migrations/
│       └── 20240001000000_extensions.sql # Core PostgreSQL extensions (uuid-ossp, moddatetime, pgcrypto)
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── page.tsx              # Public landing page (unauthenticated, zero financial data)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx            # Server Component auth guard (redirects unauthenticated to /)
│   │   │   └── dashboard/
│   │   │       └── page.tsx          # Authenticated dashboard shell & session profile
│   │   └── api/
│   │       └── auth/
│   │           └── callback/
│   │               └── route.ts      # Supabase OAuth callback handler (exchanges code for session)
│   ├── lib/
│   │   ├── auth.ts                   # Google OAuth (signInWithGoogle, signOut, useAuth hook)
│   │   └── supabase/
│   │       ├── client.ts             # Browser client (createBrowserClient from @supabase/ssr)
│   │       ├── server.ts             # Server client (createServerClient from @supabase/ssr with cookies)
│   │       └── middleware.ts         # Session update & route guard middleware
│   ├── types/
│   │   ├── auth.ts                   # UserProfile & AuthState derived from Supabase auth.users
│   │   ├── design-system.ts          # Color tokens, 10-color categorical palette, formatINR
│   │   └── next.d.ts                 # Next.js App Router ambient declarations
│   ├── components/
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

## 2. Batch 1 Deliverables Summary

1. **Supabase SSR Clients (`@supabase/ssr`)**:
   - `src/lib/supabase/client.ts`: Uses `createBrowserClient()` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `src/lib/supabase/server.ts`: Uses `createServerClient()` with Next.js `cookies()`. `SUPABASE_SERVICE_ROLE_KEY` is strictly server-only (`createAdminClient()`).
   - `src/lib/supabase/middleware.ts` & `middleware.ts`: Auto-refreshes tokens and guards routes.

2. **Google OAuth Flow**:
   - Sole authentication method: Google OAuth (`signInWithOAuth({ provider: 'google' })`).
   - Callback handler: `src/app/api/auth/callback/route.ts` exchanges exchange code for session and forwards to `/dashboard`.
   - Sign-out helper: `src/lib/auth.ts` clears session and redirects to `/`.

3. **Public Landing Page (`src/app/(public)/page.tsx`)**:
   - Built on `LandingSkeleton` from Batch 0.
   - Zero financial data visible on this page.
   - Direct "Login with Google" CTA.
   - If user is already authenticated, immediately redirects to `/dashboard` (no flash).

4. **Auth Guard (`src/app/(auth)/layout.tsx`)**:
   - Server Component reading session from server Supabase client.
   - If no valid session: redirects to `/`.
   - Wraps all protected routes under `(auth)/`.

5. **Dashboard Shell (`src/app/(auth)/dashboard/page.tsx`)**:
   - Displays authenticated session profile (`user.email`, `user.full_name`, `user.id`).
   - Simple, working "Sign out" button calling `signOut('/')`.
   - Full dark mode support.

6. **Database Migration (`supabase/migrations/20240001000000_extensions.sql`)**:
   - Enables `uuid-ossp`, `moddatetime`, and `pgcrypto` PostgreSQL extensions.

---

## 3. Batch 1 Test Checklist

- [x] **Unauthenticated visit to `/dashboard` redirects to `/`**: Verified via server guard and client routing simulator.
- [x] **Unauthenticated visit to any `/auth/*` route redirects to `/`**: Enforced in `src/app/(auth)/layout.tsx` and middleware.
- [x] **Google OAuth flow completes and lands on `/dashboard`**: Configured via Supabase OAuth callback route.
- [x] **Authenticated visit to `/` redirects to `/dashboard` (no re-login)**: Checked in `src/app/(public)/page.tsx` and middleware.
- [x] **Sign-out clears session and redirects to `/`**: Implemented in `src/lib/auth.ts` (`signOut('/')`).
- [x] **Client-side Supabase Key Safety**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only Supabase keys referenced in client-side files; `SUPABASE_SERVICE_ROLE_KEY` is isolated to `server.ts`.
- [x] **Single user model**: No multi-tenant logic.
- [x] **Read-only money movement**: Zero transaction dispatch logic.
- [x] **Dark mode active**: Fully supported on landing and dashboard shell.
- [x] **TypeScript & Build**: Clean compile with zero errors.

---

## 4. Ready for Next Batch

Commit to GitHub:
```bash
git add .
git commit -m "feat(batch-1): foundation, landing page, Google Auth, Supabase SSR client"
```

Next batch prompt: **Batch 2: Accounts Module (CRUD, Categories seed, health dots, credit card fields)**.
