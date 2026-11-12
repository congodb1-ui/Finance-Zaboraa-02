# Zaboraa Finance — Batch 0: Design System & Visual Foundation

> **Product:** Zaboraa Finance  
> **Domain:** [https://zaboraa.com](https://zaboraa.com)  
> **PRD Version:** `v2.1.0`  
> **Batch:** Batch 0 (Design System & Tokens Locked)

---

## 1. Overview of Batch 0 Deliverables

Batch 0 locks the visual language, typography, color semantics, and core UI primitives of Zaboraa Finance before writing any backend or feature logic:

1. **Brand Identity & Typography**:
   - Product Wordmark: **"Zaboraa"** in Manrope 700 + **"Finance"** in Inter 400 with Indigo `#4F46E5` accent and "Z" rounded square emblem.
   - Headings: **Manrope** (Google Fonts, weights 600, 700, 800).
   - UI / Body: **Inter** (Google Fonts, weights 400, 500, 600).
   - Financial Numbers: Strict **Tabular Figures** (`font-variant-numeric: tabular-nums` / `.font-tabular`) across all amounts, dates, and account figures.
   - INR Currency Formatter: Handles Indian number formatting (e.g. `₹1,25,000.00` or `+ ₹1,11,111.11`).

2. **Color Palette & Discipline (PRD §6.2 & §6.3)**:
   - **Brand Primary**: Indigo (`#4F46E5` light / `#6366F1` dark). The only brand color.
   - **Income / Credit**: Green (`#16A34A` light / `#22C55E` dark), strictly paired with `+` sign or download arrow for colorblind safety.
   - **Expense / Debit**: Red (`#DC2626` light / `#F87171` dark), strictly paired with `−` sign or outgoing arrow.
   - **Warning / Review**: Amber (`#D97706` light / `#FBBF24` dark).
   - **Neutral / Transfer**: Slate (`#64748B` light / `#94A3B8` dark).
   - **Fixed 10-Color Categorical Palette**: Deterministic palette for categories and charts (`#6366F1`, `#0EA5E9`, `#14B8A6`, `#22C55E`, `#84CC16`, `#EAB308`, `#F97316`, `#EF4444`, `#EC4899`, `#A855F7`).

3. **Core Base Components**:
   - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`: Single-elevation depth with hairline borders and soft shadow. Zero thick left borders.
   - `Button`: Primary, Secondary, Outline, Ghost, and Destructive variants across `sm`, `md`, and `lg` sizes with loading spinners.
   - `KPICard`: Financial KPI card with tabular numbers, subtitle, and MoM trend indicators.
   - `AccountHealthDot`: Green (<7d), Yellow (7–30d), Red (>30d) with colorblind text labels.
   - `Badge` & `MetadataRow`: Zero-pill metadata discipline using clean, unboxed text with `·` separators.
   - `ThemeToggle`: Light / Dark mode toggle with `localStorage` persistence and `@custom-variant dark` support in Tailwind v4.
   - `Input` & `Select`: Form controls with indigo focus rings and error states.

4. **Interactive Views**:
   - **Public Landing Skeleton**: Demonstrates the public view for `https://zaboraa.com` with zero financial data, soft indigo-teal gradient mesh, and Google Login button.
   - **Design System Playground**: Live testing sandbox for all components, typography, and color tokens.
   - **Dashboard Wireframe Preview**: Shows how the Batch 0 primitives assemble into the personal finance workspace.

---

## 2. Batch 0 Test Checklist

Verify each of the following items:

- [x] **Brand Spelling**: Brand name is **Zaboraa** (double-a), never Zabora, in package.json, code, metadata, and UI.
- [x] **Domain Consistency**: Production domain referenced as `https://zaboraa.com`.
- [x] **Zero Financial Data on Public View**: Landing page skeleton displays no private balances or personal statements.
- [x] **Wordmark Accuracy**: Wordmark renders "Zaboraa" in Manrope 700 and "Finance" in Inter 400.
- [x] **Typography & Tabular Numerals**: Money columns vertically align decimal points using `tabular-nums`.
- [x] **Light & Dark Mode**: Theme toggle smoothly switches between light (`#F8FAFC`) and dark (`#0B1120`) backgrounds without contrast breakage.
- [x] **Colorblind Safety**: All credit/debit indicators include signs (`+`/`−`) or explicit direction icons.
- [x] **Single-Brand Accent**: Indigo is the primary active color; green/red are reserved exclusively for credit/debit semantics.
- [x] **Zero-Pill Discipline**: Metadata uses unboxed typography with typographic dots (`·`) instead of rounded pills.
- [x] **Account Health Logic**: Health dots correctly map to `<7d` (green), `7–30d` (yellow), and `>30d` (red).

---

## 3. Ready for Next Batch

After reviewing Batch 0:
1. Commit to GitHub:
   ```bash
   git add .
   git commit -m "feat(batch-0): design system & visual foundation locked for Zaboraa Finance"
   ```
2. Proceed to **Batch 1**: Foundation + Landing + Google Auth (Supabase OAuth, RLS, Profiles, and Allowlist).
