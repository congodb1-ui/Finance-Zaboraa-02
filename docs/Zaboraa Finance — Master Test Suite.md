# Zaboraa Finance — Master Test Suite

Nov 15, 2026 · @CongoDB1

Full automated test coverage for every feature on finance.zaboraa.com — create, edit, delete, upload, AI, analytics, settings and security. Hand this document to Antigravity CLI with the kickoff prompt in Section 9.

## 1. Test infrastructure

### Stack

| Tool | Purpose |
| --- | --- |
| Vitest | Unit and integration tests (parsers, dedup logic, formatters, guards) |
| Playwright | End-to-end browser tests (every UI feature) |
| Supabase Admin API | Create and delete QA users without touching Google login |
| `vercel dev` | Local server with real env for happy-path API tests |
| `docs/qa/screenshots/` | One screenshot per test, committed, used as proof |
| `docs/qa/reports/` | JSON and Markdown reports from each run |

### QA user setup

Create two users before every run, delete them after:

```ts
// tests/helpers/qa-users.ts
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function createQAUser(tag: 'a' | 'b') {
  const email = `qa-${tag}-${Date.now()}@zaboraa-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'QA-test-pass-9!',
    email_confirm: true,
    user_metadata: { qa: true },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function deleteQAUser(id: string) {
  // Delete all data rows first (RLS won't apply with service role)
  for (const table of [
    'transactions', 'staged_transactions', 'statement_uploads',
    'recurring', 'budgets', 'rules', 'categories',
    'invoices', 'clients', 'payment_instructions', 'accounts',
    'profiles', 'families', 'family_members',
  ]) {
    await admin.from(table).delete().eq('user_id', id);
  }
  await admin.auth.admin.deleteUser(id);
}
```

### Data rules

- All test rows use the prefix `qa_` in name and description fields.
- Use `.env.local.test` for test env (copy from `.env.local`, add QA emails to ALLOWED\_EMAILS).
- Never point tests at real user data. Never commit secrets.
- Happy-path API tests run against `npx vercel dev`. Negative and smoke tests run against production.

### Folder layout

```
tests/
  helpers/
    qa-users.ts       # createQAUser / deleteQAUser
    auth.ts           # getQASession (admin-minted session token)
    fixtures/
      sample-hdfc.pdf          # unlocked HDFC statement, 20 rows
      sample-hdfc-locked.pdf   # password-protected (must NOT upload)
      sample.csv               # 5-row CSV
      sample.xlsx              # 5-row XLSX
      large-hdfc.pdf           # 1100-row PDF to test pagination
  unit/
    parsers.test.ts
    dedup.test.ts
    formatters.test.ts
    guards.test.ts
  e2e/
    01-auth.spec.ts
    02-accounts.spec.ts
    03-upload.spec.ts
    04-transactions.spec.ts
    05-recurring.spec.ts
    06-budgets.spec.ts
    07-rules.spec.ts
    08-categories.spec.ts
    09-invoices.spec.ts
    10-clients.spec.ts
    11-payment-instructions.spec.ts
    12-ai.spec.ts
    13-analytics.spec.ts
    14-settings.spec.ts
    15-security.spec.ts
docs/qa/
  screenshots/
  reports/
```

### Shared auth helper

```ts
// tests/helpers/auth.ts
export async function getQASession(userId: string, email: string) {
  // Mint a session via admin.auth.admin.generateLink (magic link),
  // then exchange the token for a real access_token.
  const { data } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const token = data?.properties?.hashed_token!;
  const { data: session } = await admin.auth.verifyOtp({
    token_hash: token,
    type: 'magiclink',
  });
  return session?.session?.access_token!;
}
```

Playwright tests inject this token into `localStorage` before each test, bypassing the Google login popup.

### Run commands

```bash
# Unit tests
npx vitest run

# E2E tests (all)
npx playwright test

# E2E tests (one file)
npx playwright test tests/e2e/03-upload.spec.ts

# E2E tests with UI
npx playwright test --ui

# Type check + build
npm run lint && npm run build

# Full CI-style run (run this before every push)
npm run lint && npm run build && npx vitest run && npx playwright test
```

### Exit gate

The suite passes when: `npm run lint` = 0 errors, `npm run build` = success, Vitest = all green, Playwright = all green, `docs/qa/reports/` has a report with 0 open critical or high defects.

## 2. Auth tests

**File:** `tests/e2e/01-auth.spec.ts`

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| A-01 | Sign in with Google (mocked) | Inject QA session token into Supabase, navigate to `/#/dashboard` | Dashboard loads, nav shows user email |
| A-02 | ALLOWED\_EMAILS blocks unknown user | POST `/api/auth/google` with a valid token for a non-allowed email | 403 response, body `{ error: 'Forbidden' }` |
| A-03 | Empty ALLOWED\_EMAILS denies everyone | Set ALLOWED\_EMAILS to empty string in test env | 403 for any authenticated user |
| A-04 | Session persists on page reload | Sign in, reload, navigate to `/#/transactions` | Still authenticated, no redirect to login |
| A-05 | Sign out clears session | Click sign-out button | Redirected to landing page, `/api/auth/google` with old token returns 401 |
| A-06 | Idle logout triggers after timeout | Set idle timeout to 5 s in test, wait 6 s | Warning modal appears, then sign-out |
| A-07 | Unauthenticated call returns 401 | GET `/api/export` with no Authorization header | 401 |
| A-08 | Expired token returns 401 | POST `/api/ai/chat` with an expired JWT | 401 |

```ts
// tests/e2e/01-auth.spec.ts
import { test, expect } from '@playwright/test';
import { createQAUser, deleteQAUser } from '../helpers/qa-users';
import { getQASession } from '../helpers/auth';

let userId: string;
let accessToken: string;

test.beforeAll(async () => {
  const u = await createQAUser('a');
  userId = u.id;
  accessToken = await getQASession(u.id, u.email);
});

test.afterAll(() => deleteQAUser(userId));

test('A-01 dashboard loads after session inject', async ({ page }) => {
  await page.addInitScript((token) => {
    // Inject Supabase session so the app skips Google popup
    localStorage.setItem('sb-yargpwshsycktbcxnpit-auth-token',
      JSON.stringify({ access_token: token, token_type: 'bearer' }));
  }, accessToken);
  await page.goto('/#/dashboard');
  await expect(page.getByRole('heading', { name: /Financial Overview|Dashboard/i })).toBeVisible();
});

test('A-02 unknown email is forbidden', async ({ request }) => {
  // Use a real but non-allowed Google token
  const res = await request.post('/api/auth/google', {
    data: { credential: 'NOT_ALLOWED_TOKEN' },
  });
  expect(res.status()).toBe(400); // bad token shape, not 403, but must not 200
});

test('A-07 unauthenticated export returns 401', async ({ request }) => {
  const res = await request.get('/api/export');
  expect(res.status()).toBe(401);
});
```

## 3. Accounts tests

**File:** `tests/e2e/02-accounts.spec.ts`

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AC-01 | Create account | Fill name `qa_HDFC Savings`, bank `HDFC`, last4 `1234`, type Savings, opening balance ₹10,000 → Save | Card appears in account list with correct values |
| AC-02 | Create duplicate last4 same bank | Same last4 + bank as AC-01 | Error shown, no second card created |
| AC-03 | Edit account | Click Edit on AC-01 card, change name to `qa_HDFC Savings 2` → Save | Card name updates, "Saved" toast shown |
| AC-04 | Edit opening balance | Change opening balance to ₹20,000 → Save | Running balance recalculates on account ledger |
| AC-05 | Toggle account inactive | Toggle active switch on AC-01 | Card shows inactive badge, account excluded from dashboard totals |
| AC-06 | Toggle back active | Toggle active switch again | Card shows active, included in totals again |
| AC-07 | Clear transactions | Click Clear Transactions on AC-01, confirm | Transaction count for account = 0, Upload History count drops, Dashboard totals recalculate |
| AC-08 | Delete account with no transactions | Create a fresh account, delete it immediately | Card removed from list |
| AC-09 | Delete account + transactions | Use AC-01 (after upload in Section 4), type account name to confirm, delete | Account removed, all its transactions removed, no orphan rows |
| AC-10 | RLS isolation | Log in as QA-B, GET accounts via API | QA-B sees zero accounts belonging to QA-A |

```ts
test('AC-01 create account', async ({ page }) => {
  await page.goto('/#/accounts');
  await page.getByRole('button', { name: /Add Account/i }).click();
  await page.getByLabel(/Account Name/i).fill('qa_HDFC Savings');
  await page.getByLabel(/Bank/i).fill('HDFC');
  await page.getByLabel(/Last 4/i).fill('1234');
  await page.getByLabel(/Opening Balance/i).fill('10000');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText('qa_HDFC Savings')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/screenshots/AC-01.png' });
});

test('AC-03 edit account name', async ({ page }) => {
  await page.goto('/#/accounts');
  await page.getByRole('button', { name: /Edit/i }).first().click();
  await page.getByLabel(/Account Name/i).fill('qa_HDFC Savings 2');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText(/Saved/i)).toBeVisible();
  await expect(page.getByText('qa_HDFC Savings 2')).toBeVisible();
});

test('AC-07 clear transactions', async ({ page }) => {
  await page.goto('/#/accounts');
  await page.getByRole('button', { name: /Clear Transactions/i }).first().click();
  await page.getByRole('button', { name: /Confirm/i }).click();
  await expect(page.getByText(/0 transactions/i)).toBeVisible();
});
```

## 4. Statement upload tests

**File:** `tests/e2e/03-upload.spec.ts` + `tests/unit/parsers.test.ts`

### Unit tests (Vitest)

| # | Test | Assert |
| --- | --- | --- |
| UP-U01 | HDFC PDF parser on `sample-hdfc.pdf` | Parses ≥ 20 rows, debit+credit columns identified, no row has both null |
| UP-U02 | CSV parser on `sample.csv` | 5 rows, mapping confidence = high |
| UP-U03 | XLSX parser on `sample.xlsx` | 5 rows, correct amounts |
| UP-U04 | Locked PDF throws exact message | `extractPDFRawData(lockedBuffer)` throws with text starting "This PDF is password-protected" |
| UP-U05 | SHA-256 is deterministic | Hash same buffer twice → identical result |
| UP-U06 | Pagination: `getAllTransactions` with 1100 rows | Function returns all 1100 rows without truncation |
| UP-U07 | HDFC parser classifies Withdrawal as debit, Deposit as credit | No row has debit=0 and credit=0 |
| UP-U08 | `normalizeDate` handles DD/MM/YYYY and YYYY-MM-DD | Returns ISO date in both cases |

### E2E tests (Playwright)

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| UP-01 | Upload CSV happy path | Select qa\_HDFC account, drop `sample.csv`, confirm mapping, click Import | Upload History shows 1 row, status = imported, Transactions count = 5 |
| UP-02 | Upload XLSX happy path | Drop `sample.xlsx` | Same result as UP-01 |
| UP-03 | Upload PDF happy path | Drop `sample-hdfc.pdf` | Upload History shows 1 row, 20 transactions created |
| UP-04 | Locked PDF shows message, no row created | Drop `sample-hdfc-locked.pdf` | Exact message visible: "This PDF is password-protected…", Upload History count unchanged |
| UP-05 | Duplicate file blocked | Upload `sample.csv` again | "DUPLICATE\_FILE" error shown, Upload History count unchanged |
| UP-06 | Delete import removes transactions | Click Delete on the UP-01 import, confirm | Upload History count drops by 1, Transactions count drops by 5, same file uploads again (no duplicate error) |
| UP-07 | Re-upload after delete | After UP-06 delete, drop same `sample.csv` | Uploads successfully, no duplicate block |
| UP-08 | 1100-row PDF uploads and commits fully | Drop `large-hdfc.pdf` | Transaction count = 1100, NOT 1000 (pagination verified) |
| UP-09 | Failed parse leaves no stuck row | Drop a corrupted PDF (truncated bytes) | Error message shown, statement\_uploads row absent OR status=failed, re-upload same file is not blocked |
| UP-10 | Delete Upload + re-upload clears SHA-256 dedup | Covered by UP-06 and UP-07 | No "Duplicate" error on re-upload |
| UP-11 | Inspect shows staged rows | Click Inspect on a completed import | ReviewScreen shows rows with dates, amounts, categories |
| UP-12 | Upload Again button in ReviewScreen | Click Upload Again on completed import | Navigates to Upload tab with same account pre-selected |

```ts
test('UP-04 locked PDF shows message, no DB row', async ({ page, request }) => {
  // Count rows before
  const before = await request.get('/api/uploads', { headers: { Authorization: `Bearer ${token}` } });
  const countBefore = (await before.json()).length;

  await page.goto('/#/upload');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText(/drop|choose/i).click(),
  ]);
  await fileChooser.setFiles('tests/helpers/fixtures/sample-hdfc-locked.pdf');

  await expect(page.getByText(/This PDF is password-protected/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /password/i })).toHaveCount(0); // no password field

  const after = await request.get('/api/uploads', { headers: { Authorization: `Bearer ${token}` } });
  expect((await after.json()).length).toBe(countBefore); // no row created
  await page.screenshot({ path: 'docs/qa/screenshots/UP-04.png' });
});

test('UP-06 delete import, re-upload works', async ({ page }) => {
  await page.goto('/#/upload');
  await page.getByRole('tab', { name: /History/i }).click();
  await page.getByRole('button', { name: /Delete Upload/i }).first().click();
  await page.getByRole('button', { name: /Confirm/i }).click();
  await expect(page.getByText(/0 imports/i)).toBeVisible();
  // Re-upload same file
  await page.getByRole('tab', { name: /Upload/i }).click();
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText(/drop|choose/i).click(),
  ]);
  await fc.setFiles('tests/helpers/fixtures/sample.csv');
  await expect(page.getByText(/DUPLICATE/i)).toHaveCount(0);
});
```

## 5. Transactions tests

**File:** `tests/e2e/04-transactions.spec.ts` + `tests/unit/dedup.test.ts`

### Unit tests (Vitest)

| # | Test | Assert |
| --- | --- | --- |
| TX-U01 | Dedup: same date+description+amount = duplicate | `commitUploadTransactions` marks second row `is_duplicate=true` |
| TX-U02 | Dedup: UPI ref match across accounts | Row with same `upi_ref_no` from a different account = duplicate |
| TX-U03 | Self-transfer pairing | Debit on account A + credit on account B, same amount+date → `is_self_transfer=true` on both, `transfer_pair_id` matches |
| TX-U04 | `balance_after` calculation | Running balance on each row = previous balance\_after ± debit/credit |
| TX-U05 | `getAllTransactions` paginates past 1000 | 1100 rows committed → function returns all 1100 |

### E2E tests (Playwright)

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| TX-01 | Create manual transaction | Transactions page → Add → fill date, description `qa_manual`, amount ₹500 debit, category, account → Save | Row appears at top of list with correct values |
| TX-02 | Edit transaction | Click Edit on TX-01 row, change description to `qa_manual_edited`, change amount to ₹600 → Save | Row updates, "Saved" toast, amount = ₹600 |
| TX-03 | Edit updates balance\_after | After TX-02, check balance\_after on that row and the next row | Both recalculate correctly |
| TX-04 | Delete single transaction | Click Delete on TX-01 row, confirm | Row removed, transaction count drops by 1, Dashboard totals update |
| TX-05 | Bulk edit category | Select 3 rows via checkbox, Bulk Edit → set category = Food → Apply | All 3 rows show Food category |
| TX-06 | Bulk delete | Select 2 rows, Bulk Delete → confirm | Both rows removed |
| TX-07 | Filter by date range | Set date range to last 7 days | Only rows in that range visible |
| TX-08 | Filter by category | Select Food filter | Only Food rows visible |
| TX-09 | Filter by account | Select qa\_HDFC account | Only that account's rows |
| TX-10 | Search description | Type `qa_` in search box | Only qa\_ rows shown |
| TX-11 | Dedup flag visible | Upload same statement twice | Duplicate rows show dedup badge, excluded from totals |
| TX-12 | Self-transfer excluded from P&L | Create self-transfer pair (debit A, credit B same amount) | Dashboard income and expense unchanged, pair tagged `is_self_transfer` |
| TX-13 | Edit blocked on self-transfer amount | Try to edit amount of a self-transfer row | Error shown: "Edit amount or disable self-transfer pairing first" |
| TX-14 | Staged ledger edit | In Upload review, change a staged row's category before importing | Imported row has the edited category |
| TX-15 | Delete All for Account | Filter by account, click Delete All for This Account, confirm | All rows for that account removed, other accounts unaffected |

```ts
test('TX-01 create manual transaction', async ({ page }) => {
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: /Add Transaction/i }).click();
  await page.getByLabel(/Description/i).fill('qa_manual');
  await page.getByLabel(/Amount/i).fill('500');
  await page.getByLabel(/Type/i).selectOption('debit');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText('qa_manual')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/screenshots/TX-01.png' });
});

test('TX-02 edit transaction', async ({ page }) => {
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: /Edit/i }).first().click();
  await page.getByLabel(/Description/i).fill('qa_manual_edited');
  await page.getByLabel(/Amount/i).fill('600');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText(/Saved/i)).toBeVisible();
  await expect(page.getByText('qa_manual_edited')).toBeVisible();
});
```

## 6. Recurring, Budgets, Rules, Categories

**Files:** `tests/e2e/05-recurring.spec.ts`, `06-budgets.spec.ts`, `07-rules.spec.ts`, `08-categories.spec.ts`

### Recurring transactions

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| RC-01 | Create recurring | Name `qa_Rent`, amount ₹30,000, Monthly, next due 2026-12-02, account qa\_HDFC → Save | Card appears with name, amount, frequency, due date |
| RC-02 | Edit recurring | Click Edit on RC-01, change amount to ₹32,000, frequency to Monthly → Save | Card shows ₹32,000, "Saved" toast |
| RC-03 | Toggle inactive | Click toggle on RC-01 | Card shows inactive badge, excluded from Upcoming Recurring widget |
| RC-04 | Toggle active | Toggle again | Card shows active, appears in Upcoming Recurring widget |
| RC-05 | Delete recurring | Click Delete on RC-01, confirm | Card removed |
| RC-06 | Edit button is visible | On any recurring card | `getByRole('button', { name: /Edit/i })` toBeVisible |

### Budgets

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| BU-01 | Create budget | Add Budget → category Food, limit ₹5,000, month Nov 2026 → Save | Budget card shows category, limit, spend bar |
| BU-02 | Edit budget limit | Click Edit on BU-01, change limit to ₹6,000 → Save | Card shows ₹6,000 |
| BU-03 | Budget overspend indicator | Add transactions totalling ₹7,000 in Food | Budget card shows over-limit in red |
| BU-04 | Delete budget | Click Delete on BU-01, confirm | Card removed |

### Rules

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| RU-01 | Create rule | Add Rule → match description contains `SWIGGY`, set category Food → Save | Rule card appears |
| RU-02 | Rule applies on import | Upload statement with a row containing `SWIGGY` | That transaction has category = Food |
| RU-03 | Edit rule | Click Edit on RU-01, change match to `ZOMATO` → Save | Rule card shows updated match text |
| RU-04 | Delete rule | Click Delete on RU-01, confirm | Card removed |
| RU-05 | Priority order | Create two rules matching same transaction | Only the higher-priority rule's category applies |

### Categories

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| CA-01 | Create custom category | Settings → Categories → Add → name `qa_Groceries` → Save | Category appears in list and in transaction category picker |
| CA-02 | Edit category | Click Edit on CA-01, rename to `qa_Groceries 2` → Save | Name updates everywhere it appears |
| CA-03 | Delete unused category | Delete CA-01 (no transactions) | Category removed from list |
| CA-04 | Delete used category blocked | Assign CA-01 to a transaction, then try to delete | Error: "Category is in use" or reassign prompt shown |

```ts
test('RC-01 create recurring', async ({ page }) => {
  await page.goto('/#/recurring');
  await page.getByRole('button', { name: /Add/i }).click();
  await page.getByLabel(/Name/i).fill('qa_Rent');
  await page.getByLabel(/Amount/i).fill('30000');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText('qa_Rent')).toBeVisible();
});

test('RC-06 edit button is visible on recurring card', async ({ page }) => {
  await page.goto('/#/recurring');
  await expect(page.getByRole('button', { name: /Edit/i }).first()).toBeVisible();
  await page.screenshot({ path: 'docs/qa/screenshots/RC-06.png' });
});
```

## 7. Invoices, Clients, Payment Instructions

**Files:** `tests/e2e/09-invoices.spec.ts`, `10-clients.spec.ts`, `11-payment-instructions.spec.ts`

### Clients

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| CL-01 | Create client | Clients → Add → name `qa_Acme Ltd`, email, GST → Save | Client card appears |
| CL-02 | Edit client | Click Edit on CL-01, change name to `qa_Acme Ltd 2` → Save | Card updates, "Saved" toast |
| CL-03 | Delete client with no invoices | Click Delete on CL-01 | Card removed |
| CL-04 | Delete client with invoices blocked | Create invoice for CL-01, then try to delete client | Error shown or reassign prompt |

### Invoices

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| IN-01 | Create invoice | Invoices → New → client qa\_Acme, add line item `qa_Consulting ₹10,000`, due date → Save | Invoice appears in list, status = draft |
| IN-02 | Edit invoice | Click Edit on IN-01, add second line item → Save | Total updates |
| IN-03 | Mark as sent | Click Mark Sent on IN-01 | Status = sent |
| IN-04 | Record partial payment | Click Record Payment → ₹5,000 → Save | Status = partial, amount\_received = ₹5,000 |
| IN-05 | Record full payment | Record remaining ₹5,000 | Status = paid |
| IN-06 | Mark overdue | Set due date to yesterday, status = sent | Dashboard shows overdue badge |
| IN-07 | Delete draft invoice | Click Delete on a draft invoice, confirm | Invoice removed |
| IN-08 | Delete paid invoice blocked or confirmed | Try to delete paid IN-05 | Warning shown with explicit confirmation required |
| IN-09 | PDF export | Click Download PDF on IN-01 | File downloads, filename contains invoice number |
| IN-10 | Invoice number sequential | Create three invoices | Numbers are sequential, no gaps |

### Payment Instructions

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| PI-01 | Create payment instruction | Payment Instructions → Add → bank `qa_HDFC`, account number, IFSC → Save | Instruction appears with masked account number |
| PI-02 | Edit instruction | Click Edit on PI-01, change bank name → Save | Card updates |
| PI-03 | Reveal encrypted field | Click Reveal on account number | Full account number shown for 30 s, then re-masked |
| PI-04 | Reveal is rate-limited | Click Reveal 21 times in 15 min | 21st request returns 429 |
| PI-05 | Delete instruction | Click Delete on PI-01, confirm | Card removed |
| PI-06 | Instruction appears on invoice PDF | Attach PI-01 to IN-01, download PDF | Account details block shown on invoice |

```ts
test('IN-01 create invoice', async ({ page }) => {
  await page.goto('/#/invoices');
  await page.getByRole('button', { name: /New Invoice/i }).click();
  await page.getByLabel(/Client/i).selectOption({ label: 'qa_Acme Ltd' });
  await page.getByRole('button', { name: /Add Line/i }).click();
  await page.getByPlaceholder(/Description/i).fill('qa_Consulting');
  await page.getByPlaceholder(/Amount/i).fill('10000');
  await page.getByRole('button', { name: /Save/i }).click();
  await expect(page.getByText('qa_Consulting')).toBeVisible();
  await page.screenshot({ path: 'docs/qa/screenshots/IN-01.png' });
});

test('PI-03 reveal encrypted field', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Reveal/i }).first().click();
  await expect(page.getByText(/\d{4,}/)).toBeVisible(); // actual number shown
  await page.screenshot({ path: 'docs/qa/screenshots/PI-03.png' });
});
```

## 8. AI features and Analytics

**Files:** `tests/e2e/12-ai.spec.ts`, `13-analytics.spec.ts`

All AI tests use a Gemini mock. Set `GEMINI_API_KEY=mock` and add a request interceptor that returns fixture JSON instead of calling the real API.

### AI Chat

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AI-01 | Send a message | Ask AI page → type "What is my total spending this month?" → Send | Response appears within 10 s, contains ₹ value |
| AI-02 | Context includes real data | Mock returns `{ metricCalculated: 5000 }` | Chat bubble shows ₹5,000 formatted with `en-IN` locale, no crash |
| AI-03 | Empty data does not crash | Render Chat with 0 transactions | Page loads, no TypeError in console |
| AI-04 | Long conversation | Send 20 messages | No scroll overflow, all messages visible |

### Categorization

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AI-05 | Auto-categorize on import | Upload statement with uncategorized rows | Each row has a category after import (or "Uncategorized" if confidence low) |
| AI-06 | Categorize single transaction | Manual transaction with no category → trigger AI categorize | Category assigned, toast shown |

### Monthly Report

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AI-07 | Generate monthly report | Settings → AI → Generate Report for current month | Report panel appears with income, expense, narrative |
| AI-08 | Report renders Markdown safely | Mock returns text with `<script>alert(1)</script>` in narrative | Script tag NOT executed, text shown as literal or escaped |
| AI-09 | Report with empty month | Generate for a month with no transactions | "No transactions" message, no crash |

### Anomaly Detection

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AI-10 | Anomaly banner appears | Add a transaction 5× higher than average | Anomaly banner visible on Dashboard |
| AI-11 | Dismiss anomaly banner | Click Dismiss | Banner hidden, does not reappear on reload |

### Analytics Report

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| AN-01 | Generate analytics report | Analytics → Analyse My Finances | Report renders: health score gauge, income vs expense chart, 8 sections |
| AN-02 | Health score defined | Mock returns `{ overallHealthScore: 7 }` | Gauge shows 7, no TypeError |
| AN-03 | Health score undefined does not crash | Mock returns `{}` (no overallHealthScore) | Page renders with score = 0 or placeholder, no crash |
| AN-04 | Report history shows past reports | Generate 2 reports | History panel shows 2 entries |
| AN-05 | Load historical report | Click second report in history | That report's data displayed |
| AN-06 | Rate limit: one report per hour | Click Analyse twice within 1 minute | Second request blocked with "Limit: 1 per hour" message |
| AN-07 | Export report to PDF | Click Export PDF on AN-01 report | Browser print dialog opens (or PDF file downloads) |
| AN-08 | Analytics with no transactions | Generate for new QA user with 0 transactions | "No data" message, no crash |

```ts
test('AN-03 undefined overallHealthScore does not crash', async ({ page }) => {
  // Mock Gemini to return report with no overallHealthScore
  await page.route('/api/analytics/reports/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ report_json: {}, summary_json: {} }),
    });
  });
  await page.goto('/#/analytics');
  await page.getByRole('button', { name: /Analyse/i }).click();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForTimeout(2000);
  expect(errors.filter((e) => e.includes('overallHealthScore'))).toHaveLength(0);
  await page.screenshot({ path: 'docs/qa/screenshots/AN-03.png' });
});

test('AI-08 XSS in monthly report is escaped', async ({ page }) => {
  await page.route('/api/ai/monthly-report', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ report: '<script>window.__XSS__=1</script>**Bold**' }),
    });
  });
  await page.goto('/#/settings/ai');
  await page.getByRole('button', { name: /Generate Report/i }).click();
  await page.waitForTimeout(1000);
  const xss = await page.evaluate(() => (window as any).__XSS__);
  expect(xss).toBeUndefined();
});
```

## 9. Settings, security sweep and kickoff prompt

**Files:** `tests/e2e/14-settings.spec.ts`, `15-security.spec.ts`

### Profile and Business Profile

| # | Test | Steps | Assert |
| --- | --- | --- | --- |
| ST-01 | Edit personal profile | Settings → Profile → change display name to `qa_Test User` → Save | Name updates in nav, "Saved" toast |
| ST-02 | Edit business profile | Settings → Business → fill GST, PAN, company name → Save | Values persist on reload |
| ST-03 | PAN encrypted at rest | Save PAN → check DB via admin API | `pan_encrypted` column is a ciphertext, not plaintext |
| ST-04 | Edit Gmail sync settings | Settings → Gmail → toggle sync on/off | Setting persists, Edge Function respects it |
| ST-05 | Backup download | Settings → Backup → Download | JSON file downloads, contains transactions array |
| ST-06 | Backup encryption | Download with password | Backup file is encrypted (starts with `zbf:v1:`) |
| ST-07 | Restore backup (dry-run) | Upload backup file | Preview shows row counts, no data written until confirm |
| ST-08 | Theme toggle | Click theme toggle | UI switches between light and dark, preference saved in localStorage |

### Security sweep

**File:** `tests/e2e/15-security.spec.ts`

| # | Test | Assert |
| --- | --- | --- |
| SEC-01 | Secret scan | `grep -r "service_role\|GEMINI_API_KEY\|ENCRYPTION_KEY" dist/` = 0 matches |
| SEC-02 | ALLOWED\_EMAILS empty = deny all | POST `/api/ai/chat` with valid JWT but ALLOWED\_EMAILS='' |
| SEC-03 | RLS: QA-B cannot read QA-A accounts | Supabase query with QA-B token for QA-A user\_id |
| SEC-04 | RLS: QA-B cannot delete QA-A transaction | DELETE via QA-B token |
| SEC-05 | No `/api/*` route answers without auth | Iterate all 23 routes, GET/POST with no token |
| SEC-06 | npm audit | `npm audit --omit=dev` |
| SEC-07 | XSS: monthly report | Covered by AI-08 |
| SEC-08 | CORS: request from disallowed origin | POST `/api/export` with `Origin: https://evil.example.com` |
| SEC-09 | Rate limit on auth endpoint | POST `/api/auth/google` 16 times in 15 min |
| SEC-10 | Reveal rate limit | POST `/api/payment-instructions/:id/reveal` 21 times |

```ts
// tests/e2e/15-security.spec.ts
const ROUTES = [
  { method: 'GET',  path: '/api/export' },
  { method: 'POST', path: '/api/upload' },
  { method: 'POST', path: '/api/ai/chat' },
  { method: 'GET',  path: '/api/gmail/status' },
  { method: 'GET',  path: '/api/analytics/reports' },
  // ... all 23 routes
];

test('SEC-05 all API routes require auth', async ({ request }) => {
  for (const { method, path } of ROUTES) {
    const res = await request.fetch(path, { method });
    expect([401, 403, 405]).toContain(res.status());
  }
});

test('SEC-01 no secrets in dist/', async () => {
  const { execSync } = await import('child_process');
  const result = execSync(
    'grep -r "service_role\\|GEMINI_API_KEY\\|ENCRYPTION_KEY" dist/ 2>/dev/null || echo OK',
    { encoding: 'utf-8' }
  );
  expect(result.trim()).toBe('OK');
});
```

### QA report format

After every full run, write `docs/qa/reports/report-YYYY-MM-DD.md`:

```md
# QA Report — YYYY-MM-DD

## Summary

| Layer | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (Vitest) | X | X | 0 | 0 |
| E2E (Playwright) | X | X | 0 | 0 |
| Security | 10 | 10 | 0 | 0 |

## Defects

(List any failing tests: ID, severity, error message, screenshot path)

## Human-only checks outstanding

(From Section 6 of the Go-Live Runbook)

## Screenshots

`docs/qa/screenshots/` — one per test ID
```

---

## Kickoff prompt to paste into Antigravity CLI

> You are the QA engineer for Zaboraa Finance. Read this test suite from start to finish before you write a single line of code. Then:
>
> 1. Create the folder structure in `tests/` exactly as shown in Section 1.
> 2. Create the fixture files: `sample-hdfc.pdf` (a real 20-row unlocked HDFC PDF), `sample-hdfc-locked.pdf` (locked), `sample.csv` (5 rows), `sample.xlsx` (5 rows), `large-hdfc.pdf` (1100+ rows). Use real parser output — do not fake row counts.
> 3. Install Vitest (`npm i -D vitest`) and Playwright (`npx playwright install`) if not already in package.json.
> 4. Write every test file listed in Section 1 (01-auth through 15-security), implementing each test case in the tables exactly. Use the code snippets as a starting template and expand them.
> 5. Add the QA auth helper (`tests/helpers/qa-users.ts`, `tests/helpers/auth.ts`) exactly as shown.
> 6. Run `npx vitest run` and fix all failures before proceeding.
> 7. Run `npx playwright test` with `npx vercel dev` running in the background (use `vercel env pull` first). Fix all failures.
> 8. Run the security sweep (SEC-01 through SEC-10).
> 9. Write `docs/qa/reports/report-YYYY-MM-DD.md` with the results.
> 10. Commit everything to main with message `test: add master test suite (Vitest + Playwright)`.
>
> Hard stops from the Go-Live Runbook apply here too. Never print secrets. Never touch QA-A data from QA-B. Delete both QA users after every run. If a test fails 3 times and you cannot fix it, mark it BLOCKED in the report and move on.
