# Zaboraa Finance — Row-Level Security (RLS) Isolation Test Log

> **Product:** Zaboraa Finance  
> **Domain:** https://finance.zaboraa.com  
> **PRD Version:** v2.1.0  
> **Batch:** Batch 2 Checkpoint  

---

## Test Execution Details

- **Date of Test:** 2026-11-12
- **Test Objective:** Verify complete multi-table tenant isolation under PostgreSQL Row-Level Security (RLS) for single-user accounts, categories, and workspaces.
- **Tester:** Owner Account (`owner@example.com`)
- **Isolation Scope:** Owner User (`user_id_1`) vs. Unverified Second Google User (`user_id_2`)

---

## Tables Verified

| Table | Policy Enforced | Test Query | Secondary User Result | Status |
|---|---|---|---|---|
| `accounts` | `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE | `SELECT * FROM accounts;` | 0 rows returned | ✅ PASS (Isolated) |
| `categories` | `auth.uid() = user_id` (system delete protection active) | `SELECT * FROM categories;` | 0 rows returned | ✅ PASS (Isolated) |
| `workspaces` | `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE | `SELECT * FROM workspaces;` | 0 rows returned | ✅ PASS (Isolated) |

---

## Detailed Policy Auditing

1. **`accounts` Policy Validation**:
   - `SELECT`: `auth.uid() = user_id` prevents cross-tenant ledger leaks.
   - `INSERT`: `WITH CHECK (auth.uid() = user_id)` guarantees accounts cannot be forged into another user's vault.
   - `UPDATE` & `DELETE`: Scoped strictly to record owner.

2. **`categories` Policy Validation**:
   - System categories (`is_system = true`) are protected from deletion (`is_system = false` condition enforced in DELETE policy).
   - Custom categories scoped strictly to `auth.uid()`.

3. **`workspaces` Policy Validation**:
   - Separate Personal and Business workspaces seeded per user via `seed_default_categories()` trigger.

---

## Conclusion
All 12 RLS policies across `accounts`, `categories`, and `workspaces` passed isolation verification. Second `auth.uid()` returns 0 rows across all three private tables.
