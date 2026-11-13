# Zaboraa Finance — Personal Finance & Accounting Portal

> **Product:** Zaboraa Finance  
> **Portal Domain:** [https://finance.zaboraa.com](https://finance.zaboraa.com) *(Public website remains on [https://zaboraa.com](https://zaboraa.com))*  
> **Architecture:** Vite + React SPA + Express (`server.ts` / `src/server-app.ts`) + Supabase (Data & RLS)  
> **Current Status:** Batch 11 (Direct Google Identity Services Auth, Debug Banner Removal, `finance.zaboraa.com` Domain Update)

---

## 1. Authentication & Security Flow (`finance.zaboraa.com`)

1. **Direct Google Identity Services (GIS) Login**:
   - Browser loads `https://accounts.google.com/gsi/client` using `VITE_GOOGLE_CLIENT_ID` (`Zaboraa Finance Portal - Web Client`).
   - Authorized JavaScript origins: `http://localhost:3000`, `https://finance.zaboraa.com`, `https://zaboraa.com`.
   - Google consent screen displays **"to continue to finance.zaboraa.com"** (no `supabase.co` OAuth redirect).
2. **Express Token Verification & Allowlist Check (`POST /api/auth/google`)**:
   - Express verifies the signed Google ID Token against Google's public JWKS (`https://www.googleapis.com/oauth2/v3/certs`), checks `aud`, `iss`, `exp`, and `email_verified`.
   - Enforces `ALLOWED_EMAILS` before creating or issuing any session. Unallowlisted emails receive `403 Forbidden`.
3. **Supabase Data & RLS Session**:
   - Express creates/locates the user in Supabase Auth via `SUPABASE_SERVICE_ROLE_KEY` and exchanges a one-time verification token for a standard Supabase session (`access_token` + `refresh_token`).
   - All PostgreSQL tables, storage buckets, and Row-Level Security (`auth.uid() = user_id`) isolate each user's financial vault.

---

## 2. Environment Variables (`.env`)

```bash
ALLOWED_EMAILS=your-email@gmail.com
GEMINI_API_KEY=your-gemini-api-key
VITE_APP_URL=https://finance.zaboraa.com
NEXT_PUBLIC_APP_URL=https://finance.zaboraa.com
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
# SERVER-ONLY — 32+ chars random string, never use VITE_ prefix
ENCRYPTION_KEY=your-32-byte-encryption-key
```

---

## 3. Domain & Deployment Checklist (`finance.zaboraa.com`)

- **Vercel / Hosting**:
  - Custom domain: `finance.zaboraa.com` (HTTPS enforced).
  - Set `VITE_APP_URL=https://finance.zaboraa.com` and `NEXT_PUBLIC_APP_URL=https://finance.zaboraa.com` in production environment variables.
  - Keep `zaboraa.com` pointed to the separate public website.
- **Supabase Auth Settings**:
  - Site URL: `https://finance.zaboraa.com`
  - Redirect URLs: `https://finance.zaboraa.com/**`, `http://localhost:3000/**`
- **Google Cloud Console (Web Client)**:
  - Authorized JavaScript origins: `http://localhost:3000`, `https://finance.zaboraa.com`, `https://zaboraa.com`

---

## 4. Key Project Structure

```text
├── server.ts                         # Express + Vite runtime entrypoint (port 3000)
├── index.html                        # SPA entry + Google Identity Services script
├── .env.example                      # Environment variable template
├── supabase/migrations/              # PostgreSQL schema, triggers, storage & RLS policies
└── src/
    ├── App.tsx                       # SPA router, Auth Guard, Idle Logout, GIS Sign-In Modal
    ├── server-app.ts                 # Express API routes (/api/auth/google, /api/ai/*, /api/upload*, /api/export, /api/backup)
    ├── lib/
    │   ├── auth.ts                   # Direct GIS exchangeGoogleIdToken, signOut, useAuth hook
    │   ├── google-gis.ts             # Browser Google Identity Services loader
    │   ├── google-auth-server.ts     # Server-side Google ID Token JWKS RS256 verifier
    │   ├── api-client.ts             # Authenticated fetch wrapper attaching Supabase Bearer JWT
    │   ├── actions/                  # Supabase CRUD actions (accounts, transactions, invoicing v2, budgets, rules, etc.)
    │   ├── ai/                       # PII masking + Gemini Flash/Pro AI features
    │   └── parsers/                  # CSV, XLSX, HDFC PDF, Generic PDF parsers
    ├── components/                   # AuthNavShell, GoogleSignInModal, Accounts, Invoices v2, Clients, Reports, UI primitives
    └── app/(auth)/                   # Protected pages (Dashboard, Accounts, Transactions, Upload, Rules, Reports, AI, Settings)
```

---

## 5. Build & Verification Commands

```bash
npm install
npm run lint     # tsc --noEmit
npm run build    # vite build
npm run dev      # Express + Vite dev server on http://localhost:3000
```

---

## 6. Testing

Run cross-user Row-Level Security (RLS) isolation verification across all 13 Batch 3–10 tables using two Supabase user access tokens:

```bash
RLS_USER1_TOKEN=eyJ... RLS_USER2_TOKEN=eyJ... npx tsx scripts/rls-verify.ts
```
